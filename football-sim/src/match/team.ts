/** TeamManager: the eleven on the pitch, formation anchors, substitutions and per-team match stats. */
import { HL, HW, clamp } from '../core/math';
import { FORMATIONS, Slot } from '../data/formations';
import { fitAt } from '../data/database';
import type { Kit, PlayerData, TeamData } from '../data/types';
import { Player } from './player';

export interface AIParams {
  decide: number; noise: number; passErr: number; shotErr: number; tackleRate: number; gkReact: number; speed: number;
  mark: number; press2: boolean; pressRange: number; intercept: number; skill: number; shootBias: number;
}
/** Difficulty noticeably changes thinking speed, accuracy, pressing, marking and goalkeeping. */
export const AI_LEVELS: AIParams[] = [
  { decide: 1.0, noise: 0.6, passErr: 2.4, shotErr: 2.3, tackleRate: 0.35, gkReact: 0.46, speed: 0.86, mark: 0.3, press2: false, pressRange: 9, intercept: 0.35, skill: 0, shootBias: -0.12 },
  { decide: 0.7, noise: 0.4, passErr: 1.7, shotErr: 1.7, tackleRate: 0.7, gkReact: 0.36, speed: 0.93, mark: 0.5, press2: false, pressRange: 14, intercept: 0.55, skill: 0.1, shootBias: -0.05 },
  { decide: 0.45, noise: 0.22, passErr: 1.15, shotErr: 1.2, tackleRate: 1.2, gkReact: 0.27, speed: 1.0, mark: 0.7, press2: false, pressRange: 22, intercept: 0.8, skill: 0.3, shootBias: 0 },
  { decide: 0.3, noise: 0.12, passErr: 0.9, shotErr: 0.95, tackleRate: 1.8, gkReact: 0.2, speed: 1.02, mark: 0.85, press2: true, pressRange: 32, intercept: 0.92, skill: 0.5, shootBias: 0.04 },
  { decide: 0.18, noise: 0.05, passErr: 0.7, shotErr: 0.75, tackleRate: 2.6, gkReact: 0.14, speed: 1.05, mark: 0.95, press2: true, pressRange: 45, intercept: 1, skill: 0.7, shootBias: 0.08 },
];
export interface TeamStats { shots: number; onTarget: number; possession: number; passes: number; passesOk: number; fouls: number; corners: number; offsides: number; yellow: number; red: number; tackles: number; saves: number }
export type Control = 'ai' | 'p1' | 'p2';

export class MatchTeam {
  players: Player[] = [];
  bench: PlayerData[] = [];
  subsLeft = 5;
  dir = 1;
  score = 0;
  shootout = 0;
  kit: Kit; gkKit: Kit;
  slots: Slot[];
  mentality: number;
  formation: string;
  selected: Player | null = null;
  /** In Player Career the human only ever controls this one player. */
  locked: Player | null = null;
  inputIdx = -1;
  stats: TeamStats = { shots: 0, onTarget: 0, possession: 0, passes: 0, passesOk: 0, fouls: 0, corners: 0, offsides: 0, yellow: 0, red: 0, tackles: 0, saves: 0 };
  /** Opponents attacking this team are offside beyond this line (team-relative depth, own goal = -HL). */
  offsideLine = 0;
  /** Shot/cross power being charged by the human (0..1), shown on the HUD. */
  charge = 0;
  bestT = 1e9; chaser: Player | null = null;
  pressing = false; // human "team press" request
  subbedOff = new Set<string>();

  constructor(public data: TeamData, public idx: number, public control: Control, public params: AIParams, kitIdx: number, private uidBase: number) {
    this.kit = data.kits[kitIdx]; this.gkKit = data.gkKit;
    this.formation = FORMATIONS[data.formation] ? data.formation : '4-3-3';
    this.slots = FORMATIONS[this.formation];
    this.mentality = data.mentality;
    this.inputIdx = control === 'p1' ? 0 : control === 'p2' ? 1 : -1;
    const byId = (id: string) => data.players.find((p) => p.id === id)!;
    data.lineup.slice(0, 11).forEach((id, i) => { const pd = byId(id); if (pd) this.players.push(new Player(pd, this, this.slots[i], uidBase + i)); });
    this.bench = data.bench.map(byId).filter(Boolean);
    this.dir = idx === 0 ? 1 : -1;
  }
  get human() { return this.control !== 'ai'; }
  get gk() { return this.players.find((p) => p.isGK && p.active) ?? this.players[0]; }
  get onPitch() { return this.players.filter((p) => p.active); }
  /** Team-relative depth of a world x (positive = towards the opponent goal). */
  u(x: number) { return x * this.dir; }
  get goalX() { return this.dir * HL; } // goal this team attacks
  get ownGoalX() { return -this.dir * HL; }

  setFormation(name: string) {
    if (!FORMATIONS[name]) return;
    this.formation = name; this.slots = FORMATIONS[name];
    // Reassign slots greedily by best positional fit, keeping the goalkeeper.
    const outfield = this.players.filter((p) => !p.isGK);
    const free = this.slots.slice(1);
    const taken = new Set<Slot>();
    for (const p of [...outfield].sort((a, b) => b.data.overall - a.data.overall)) {
      let best = free[0], bs = -1e9;
      for (const s of free) { if (taken.has(s)) continue; const f = fitAt(p.data, s.pos) - Math.abs(s.w - p.slot.w) * 6; if (f > bs) { bs = f; best = s; } }
      taken.add(best); p.slot = best; p.role = best.pos;
    }
  }
  /** Home position for a slot given where the ball is. */
  anchor(slot: Slot, ballX: number, ballZ: number, attacking: boolean, out: { x: number; z: number }) {
    const bu = this.u(ballX);
    const push = this.mentality * 3.5 + (attacking ? 5 : -5);
    let u = slot.u * 30 + bu * 0.58 + push;
    const isDef = slot.pos === 'CB' || slot.pos === 'LB' || slot.pos === 'RB';
    if (isDef) u = Math.min(u, bu + (attacking ? -6 : -3)); // defenders stay behind the ball
    if (slot.pos === 'ST' && !attacking) u = Math.max(u, -8);
    u = clamp(u, -HL + (isDef ? 9 : 14), HL - 6);
    const spread = attacking ? 0.9 : 0.66;
    const w = slot.w * HW * spread + this.dir * ballZ * 0.22 * (attacking ? 0.6 : 1);
    out.x = u * this.dir; out.z = clamp(w * this.dir, -HW + 1.5, HW - 1.5);
    return out;
  }
  substitute(off: Player, onData: PlayerData): boolean {
    if (this.subsLeft <= 0 || off.sentOff) return false;
    const bi = this.bench.indexOf(onData);
    if (bi < 0) return false;
    this.bench.splice(bi, 1);
    this.subbedOff.add(off.data.id);
    const np = new Player(onData, this, off.slot, off.uid);
    np.x = off.x; np.z = off.z; np.facing = off.facing; np.stamina = 1;
    const i = this.players.indexOf(off);
    this.players[i] = np;
    if (this.selected === off) this.selected = np;
    if (this.locked === off) this.locked = np;
    off.onPitch = false;
    this.subsLeft--;
    return true;
  }
}

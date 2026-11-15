/** A footballer on the pitch: movement, stamina and action state. Rendering lives in engine/. */
import { HL, HW, angleTo, clamp, damp } from '../core/math';
import type { PlayerData, Position } from '../data/types';
import type { Slot } from '../data/formations';
import type { MatchTeam } from './team';
import type { Vector3 } from 'three';

export type PState = 'play' | 'idle' | 'kick' | 'tackle' | 'slide' | 'down' | 'getup' | 'stun' | 'skill' | 'jump' | 'dive' | 'celebrate' | 'throw';
export type KickType = 'pass' | 'through' | 'loft' | 'cross' | 'shot' | 'finesse' | 'clear' | 'header' | 'volley' | 'throw' | 'gkthrow' | 'penalty' | 'freekick';
export type ShotStyle = 'power' | 'finesse' | 'chip' | 'driven' | 'knuckle' | 'trivela';
export const SHOT_STYLES: ShotStyle[] = ['power', 'finesse', 'chip', 'driven', 'knuckle', 'trivela'];
export const SHOT_STYLE_NAME: Record<ShotStyle, string> = { power: 'Power Shot', finesse: 'Finesse Curler', chip: 'Chip Shot', driven: 'Low Driven', knuckle: 'Knuckleball', trivela: 'Trivela' };
export interface KickPlan { type: KickType; vel: Vector3; spin: Vector3; target: Player | null; at: number; power: number; style?: ShotStyle }
export interface PlayerStats { goals: number; assists: number; shots: number; passes: number; passesOk: number; tackles: number; saves: number; fouls: number; dist: number; touches: number; keyPasses: number; lost: number }

export class Player {
  x = 0; z = 0; y = 0;
  vx = 0; vz = 0;
  facing = 0;
  /** Desired movement (unit-ish vector scaled 0..1) and sprint intent, set by AI or the human controller. */
  mvX = 0; mvZ = 0; sprint = false;
  /** Point to look at when standing still. */
  lookX = 0; lookZ = 0;
  stamina = 1; fatigue = 0;
  state: PState = 'play'; stateT = 0; stateDur = 0;
  kick: KickPlan | null = null; kickDone = false; kickLeg = 1; kickType: KickType = 'pass';
  kickCd = 0; tackleCd = 0; ctlCd = 0;
  tackleHit = false;
  /** Fixed motion used by tackles, slides and dives. */
  actVx = 0; actVz = 0;
  diveH = 0; diveSide = 0;
  jumpV = 0;
  skill = 0; // 1 stepover, 2 feint, 3 roulette, 4 dragback
  skillDir = 1;
  shield = false; jockey = false;
  holding = false; holdT = 0; // goalkeeper has the ball in hands
  celeb = 0;
  yellow = 0; sentOff = false; onPitch = true;
  stride = 0; // locomotion phase (radians)
  lean = 0; turnLean = 0; // animation helpers
  isGK: boolean;
  role: Position;
  // AI scratch
  aiT = 0; runT = 0; runX = 0; runZ = 0; mark: Player | null = null; reactT = 0; anchorX = 0; anchorZ = 0; offsideFlag = false;
  run = false; markT = 0; threat = false;
  /** Buffered first-time action, executed the moment the ball arrives. */
  intent: { kind: 'pass' | 'shot'; t: number; target?: Player | null; make(): KickPlan | null } | null = null;
  callT = 0; // "wants the ball" timer (player career call for pass)
  stats: PlayerStats = { goals: 0, assists: 0, shots: 0, passes: 0, passesOk: 0, tackles: 0, saves: 0, fouls: 0, dist: 0, touches: 0, keyPasses: 0, lost: 0 };
  ratingBonus = 0;

  constructor(public data: PlayerData, public team: MatchTeam, public slot: Slot, public uid: number) {
    this.role = slot.pos; this.isGK = slot.pos === 'GK';
  }
  get a() { return this.data.attrs; }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get dirX() { return Math.cos(this.facing); }
  get dirZ() { return Math.sin(this.facing); }
  get active() { return this.onPitch && !this.sentOff; }
  /** Player can run, receive and kick. */
  get free() { return this.state === 'play' || this.state === 'skill'; }
  get grounded() { return this.state === 'down' || this.state === 'getup' || this.state === 'slide' || this.state === 'dive'; }
  topSpeed() {
    return (5.9 + 3.3 * this.a.pac / 100) * (0.84 + 0.16 * this.stamina) * this.team.params.speed;
  }
  setState(s: PState, dur = 0) { this.state = s; this.stateT = 0; this.stateDur = dur; if (s !== 'kick') this.kick = null; }
  distTo(x: number, z: number) { return Math.hypot(this.x - x, this.z - z); }
  /** Convenience for AI: head to a point, slowing on arrival. */
  moveTo(x: number, z: number, sprint = false, arrive = 1.2) {
    const dx = x - this.x, dz = z - this.z, d = Math.hypot(dx, dz);
    if (d < 0.15) { this.mvX = this.mvZ = 0; this.sprint = false; return d; }
    const s = Math.min(1, d / arrive);
    this.mvX = (dx / d) * s; this.mvZ = (dz / d) * s; this.sprint = sprint && d > 2.5;
    return d;
  }
  stop() { this.mvX = this.mvZ = 0; this.sprint = false; }
  look(x: number, z: number) { this.lookX = x; this.lookZ = z; }

  update(dt: number, hasBall: boolean) {
    this.stateT += dt;
    this.kickCd = Math.max(0, this.kickCd - dt); this.tackleCd = Math.max(0, this.tackleCd - dt); this.ctlCd = Math.max(0, this.ctlCd - dt);
    this.callT = Math.max(0, this.callT - dt);
    if (this.intent) { this.intent.t -= dt; if (this.intent.t <= 0) this.intent = null; }
    const top = this.topSpeed();
    let wantX = 0, wantZ = 0, accel = 7.5 + 6 * this.a.pac / 100;
    const st = this.state;
    if (st === 'play' || st === 'skill' || st === 'kick' || st === 'celebrate' || st === 'jump') {
      let max = this.sprint && this.stamina > 0.04 ? top : top * 0.66;
      if (hasBall) max *= this.sprint ? 0.9 + 0.07 * this.a.dri / 100 : 0.97;
      if (this.shield) max *= 0.5;
      if (this.jockey) max *= 0.6;
      if (st === 'kick') max *= 0.45;
      if (st === 'jump') max *= 0.5;
      if (st === 'skill') max = top * 1.08;
      if (st === 'celebrate') max = top * 0.7;
      wantX = this.mvX * max; wantZ = this.mvZ * max;
      const moving = this.sprint && (this.mvX !== 0 || this.mvZ !== 0) && st === 'play';
      if (moving) this.stamina = Math.max(0, this.stamina - dt * 0.03 * (1.25 - 0.5 * this.a.phy / 100));
      else this.stamina = Math.min(1 - this.fatigue, this.stamina + dt * 0.022);
      if (st === 'jump') {
        this.y += this.jumpV * dt; this.jumpV -= 9.81 * dt;
        if (this.y <= 0) { this.y = 0; this.setState('play'); }
      }
    } else if (st === 'tackle' || st === 'slide' || st === 'dive') {
      const k = st === 'slide' ? Math.max(0, 1 - this.stateT / this.stateDur) : st === 'dive' ? (this.stateT < 0.55 ? 1 : 0.15) : (this.stateT < 0.28 ? 1 : 0.2);
      wantX = this.actVx * k; wantZ = this.actVz * k; accel = 60;
      if (st === 'dive') {
        const t = this.stateT;
        this.y = Math.max(0, this.diveH * Math.sin(Math.min(1, t / 0.6) * Math.PI) * 0.9);
      }
    } else {
      accel = 22; // idle, down, getup, stun, throw: come to a stop
      this.stamina = Math.min(1 - this.fatigue, this.stamina + dt * 0.03);
    }
    // Acceleration-limited steering gives momentum and natural turning arcs.
    let ax = wantX - this.vx, az = wantZ - this.vz;
    const al = Math.hypot(ax, az);
    const speedingUp = wantX * wantX + wantZ * wantZ > this.vx * this.vx + this.vz * this.vz;
    const lim = (speedingUp ? accel : accel * 1.7) * dt;
    if (al > lim) { ax = (ax / al) * lim; az = (az / al) * lim; }
    const pvx = this.vx, pvz = this.vz;
    this.vx += ax; this.vz += az;
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.x = clamp(this.x, -HL - 4.5, HL + 4.5); this.z = clamp(this.z, -HW - 3.5, HW + 3.5);
    const sp = this.speed;
    this.stats.dist += sp * dt;
    // Facing follows velocity when running, otherwise the look target.
    if (st !== 'tackle' && st !== 'slide' && st !== 'dive' && st !== 'down' && st !== 'getup') {
      let want = this.facing;
      if (this.shield || this.jockey || st === 'idle' || st === 'throw' || (sp < 1.2 && st !== 'celebrate')) want = Math.atan2(this.lookZ - this.z, this.lookX - this.x);
      else if (sp >= 1.2) want = Math.atan2(this.vz, this.vx);
      if (st === 'skill' && this.skill === 3) this.facing += dt * 14 * this.skillDir;
      else this.facing = angleTo(this.facing, want, dt * (sp > 5 ? 7 : 11));
    }
    // Animation helpers: stride phase advances with distance covered (no foot sliding).
    const strideLen = 0.9 + sp * 0.2;
    this.stride += (sp * dt / strideLen) * Math.PI;
    const fwdAcc = ((this.vx - pvx) * this.dirX + (this.vz - pvz) * this.dirZ) / Math.max(dt, 1e-4);
    const latAcc = ((this.vx - pvx) * -this.dirZ + (this.vz - pvz) * this.dirX) / Math.max(dt, 1e-4);
    this.lean = damp(this.lean, clamp(fwdAcc * 0.022, -0.35, 0.4), 8, dt);
    this.turnLean = damp(this.turnLean, clamp(latAcc * 0.02, -0.35, 0.35), 8, dt);
    // Timed state exits
    if (this.stateDur > 0 && this.stateT >= this.stateDur) {
      if (st === 'slide') this.setState('getup', 0.5);
      else if (st === 'down') this.setState('getup', 0.55);
      else if (st === 'dive') { this.y = 0; this.setState('getup', 0.6); }
      else if (st !== 'idle' && st !== 'throw' && st !== 'celebrate' && st !== 'jump') { this.setState('play'); this.skill = 0; }
    }
  }
}

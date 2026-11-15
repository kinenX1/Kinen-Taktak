/** MatchManager: owns the simulation, the rules of the game, the clock and the commentary-ready event stream. */
import { BALL_R, BOX_DEPTH, BOX_HW, GOAL_H, GOAL_HW, HL, HW, PEN_SPOT, clamp, damp, dist } from '../core/math';
import { EventBus } from '../core/events';
import { RNG } from '../core/rng';
import type { PlayerInput } from '../core/input';
import type { Difficulty } from '../core/settings';
import type { PlayerData, TeamData } from '../data/types';
import type { Weather } from '../data/stadiums';
import { fitAt } from '../data/database';
import { Ball, BallEvent, PREDICT_N } from './ball';
import { KickPlan, KickType, Player } from './player';
import { AI_LEVELS, Control, MatchTeam } from './team';
import { planAerial, performKick, resolveTackle, startKick } from './actions';
import { aiSetPiece, updateAI } from './ai';
import { gkContest, gkPenalty } from './gk';
import { humanSetPiece, updateHuman } from './controller';

export type Phase = 'intro' | 'setpiece' | 'play' | 'dead' | 'goal' | 'replay' | 'halftime' | 'fulltime' | 'pk' | 'done';
export type SetPieceType = 'kickoff' | 'throwin' | 'corner' | 'goalkick' | 'freekick' | 'penalty';
export interface SetPiece { type: SetPieceType; x: number; z: number; team: MatchTeam; taker: Player; t: number; aiDelay: number; shootout: boolean; direct: boolean; kicked: boolean; aim: number; power: number }
export interface MatchConfig {
  home: TeamData; away: TeamData; stadium: string; weather: Weather; minutes: number; difficulty: Difficulty;
  control: [Control, Control]; knockout?: boolean; lockPlayerId?: string; seed?: number; title?: string; auto?: boolean; skipIntro?: boolean; drill?: boolean;
}
export interface LogEntry { minute: number; type: 'goal' | 'yellow' | 'red' | 'sub' | 'pen'; team: number; text: string }
export interface MatchEvents extends Record<string, unknown> {
  kick: { player: Player; type: KickType; power: number; style?: string };
  bounce: { speed: number }; post: { speed: number }; net: Record<string, never>;
  whistle: { kind: 'short' | 'long' | 'half' | 'full' };
  goal: { team: MatchTeam; scorer: Player; assist: Player | null; own: boolean; minute: number };
  shot: { player: Player; onTarget: boolean };
  save: { gk: Player; held: boolean };
  nearmiss: Record<string, never>;
  foul: { by: Player; on: Player; card: number; penalty: boolean };
  offside: { player: Player };
  setpiece: { type: SetPieceType; team: MatchTeam };
  phase: { phase: Phase };
  sub: { team: MatchTeam; on: PlayerData; off: Player };
  tackle: { player: Player; on: Player; clean: boolean };
  tackleStart: { player: Player; slide: boolean };
  skill: { player: Player; type: number };
  possession: { player: Player };
  commentary: { text: string; tone: number };
  shootout: { team: MatchTeam; scored: boolean };
  restart: Record<string, never>;
}
const SHOT_TYPES: KickType[] = ['shot', 'finesse', 'penalty', 'freekick'];
const STEP = 1 / 60;

export class MatchManager {
  events = new EventBus<MatchEvents>();
  rng: RNG;
  ball = new Ball();
  teams: [MatchTeam, MatchTeam];
  phase: Phase = 'intro'; phaseT = 0; time = 0;
  half = 1; clock = 0; stoppage = [0, 0];
  sp: SetPiece | null = null;
  pending: { type: SetPieceType; x: number; z: number; team: MatchTeam } | null = null;
  deadT = 0;
  passer: Player | null = null; passTarget: Player | null = null; passAware = [true, true];
  shotLive: { by: Player; onTarget: boolean; t: number } | null = null;
  lastPoss = 0; attacking = -1;
  restartImmune = false;
  kickoffTeam = 0;
  log: LogEntry[] = [];
  inputs: (PlayerInput | null)[] = [null, null];
  /** Maps stick/keys to world axes; set by the camera so "up" is always away from the camera. */
  basis = { rx: 1, rz: 0, ux: 0, uz: -1 };
  useReplays = false;
  /** Online guest: this match is a mirror driven by snapshots from the host and never simulates. */
  remote = false;
  winner = -1;
  lastGoal: MatchEvents['goal'] | null = null;
  so: { kicks: boolean[][]; turn: number; order: Player[][]; active: boolean; resolveT: number; resolved: boolean } | null = null;
  lockPending: string | null = null;
  /** Training drills hook into dead-ball handling instead of normal restarts. */
  drill: { onDead(kind: 'goal' | 'out' | 'save' | 'stop', info?: any): void; tick?(dt: number): void } | null = null;
  private acc = 0; private predictTick = 0;
  private halfReal: number;

  constructor(public cfg: MatchConfig) {
    this.rng = new RNG(cfg.seed ?? (Date.now() & 0xffffff));
    const clash = colorDist(cfg.home.kits[0].primary, cfg.away.kits[0].primary) < 120;
    const lvl = AI_LEVELS[cfg.difficulty];
    const mate = { ...AI_LEVELS[2], tackleRate: 0.45 };
    const bothAI = cfg.control[0] === 'ai' && cfg.control[1] === 'ai';
    this.teams = [
      new MatchTeam(cfg.home, 0, cfg.control[0], cfg.control[0] === 'ai' ? (bothAI ? AI_LEVELS[Math.max(2, cfg.difficulty)] : lvl) : mate, 0, 0),
      new MatchTeam(cfg.away, 1, cfg.control[1], cfg.control[1] === 'ai' ? (bothAI ? AI_LEVELS[Math.max(2, cfg.difficulty)] : lvl) : mate, clash ? 1 : 0, 100),
    ];
    this.ball.wet = cfg.weather === 'rainy' ? 1 : 0;
    this.halfReal = Math.max(20, cfg.minutes * 30);
    this.stoppage = [60 * this.rng.int(1, 2), 60 * this.rng.int(2, 4)];
    if (cfg.lockPlayerId) {
      for (const t of this.teams) {
        if (t.control === 'ai') continue;
        const p = t.players.find((q) => q.data.id === cfg.lockPlayerId);
        if (p) { t.locked = p; t.selected = p; } else if (t.bench.some((b) => b.id === cfg.lockPlayerId)) { this.lockPending = cfg.lockPlayerId; t.benched = true; }
      }
    }
    if (!cfg.drill) {
      this.arrangeKickoff(0);
      if (cfg.skipIntro) this.begin();
    }
  }

  // ---------- public API ----------
  get all(): Player[] { return [...this.teams[0].players, ...this.teams[1].players]; }
  get minute() { return Math.min(this.half === 1 ? 45 : 90, Math.floor(this.clock / 60)) ; }
  get clockText() {
    const base = this.half === 1 ? 2700 : 5400;
    const c = Math.min(this.clock, base), mm = Math.floor(c / 60), ss = Math.floor(c % 60);
    const extra = this.clock > base ? ` +${Math.floor((this.clock - base) / 60) + 1}` : '';
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}${extra}`;
  }
  get wet() { return this.ball.wet; }
  opp(t: MatchTeam) { return this.teams[1 - t.idx]; }
  say(text: string, tone = 0) { this.events.emit('commentary', { text, tone }); }
  setPhase(p: Phase) { this.phase = p; this.phaseT = 0; this.events.emit('phase', { phase: p }); }

  begin() { if (this.remote) return; if (this.phase === 'intro') { this.say(`Welcome to ${this.cfg.title ?? 'today\'s match'}: ${this.teams[0].data.name} against ${this.teams[1].data.name}.`); this.setupSetPiece('kickoff', 0, 0, this.teams[0]); } }
  resume() { if (!this.remote && this.phase === 'halftime') this.startSecondHalf(); }
  endReplay() { if (!this.remote && this.phase === 'replay') this.setupSetPiece('kickoff', 0, 0, this.teams[this.kickoffTeam]); }

  update(dt: number) {
    if (this.remote) return;
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= STEP && n < 6) { this.tick(STEP); this.acc -= STEP; n++; }
    if (n === 6) this.acc = 0;
  }

  substitute(team: MatchTeam, off: Player, on: PlayerData) {
    if (this.ball.owner === off) return false;
    if (!team.substitute(off, on)) return false;
    this.events.emit('sub', { team, on, off });
    this.log.push({ minute: this.minute, type: 'sub', team: team.idx, text: `${on.short} for ${off.data.short}` });
    this.say(`Substitution for ${team.data.name}: ${on.name} replaces ${off.data.name}.`);
    return true;
  }

  // ---------- main tick ----------
  tick(dt: number) {
    this.time += dt; this.phaseT += dt;
    switch (this.phase) {
      case 'play': this.tickPlay(dt); break;
      case 'setpiece': this.tickSetPiece(dt); break;
      case 'dead': this.tickDead(dt); break;
      case 'goal': this.tickGoal(dt); break;
      case 'pk': this.tickPk(dt); break;
      case 'halftime': case 'fulltime':
        if (this.cfg.auto && this.phaseT > 5) { if (this.phase === 'halftime') this.resume(); }
        this.idlePlayers(dt); break;
      case 'replay': if (!this.useReplays || this.phaseT > 30) this.endReplay(); this.idlePlayers(dt); break;
      case 'intro': if (this.cfg.auto && this.phaseT > 1) this.begin(); this.idlePlayers(dt); break;
      default: this.idlePlayers(dt);
    }
  }

  private idlePlayers(dt: number) {
    for (const p of this.all) { if (!p.active) continue; if (p.state !== 'celebrate') { p.stop(); p.look(this.ball.pos.x, this.ball.pos.z); } p.update(dt, false); }
    this.moveBall(dt, false);
  }

  private context() {
    const ball = this.ball;
    if (ball.owner) this.lastPoss = ball.owner.team.idx;
    this.attacking = ball.owner ? ball.owner.team.idx : (this.passer ? this.passer.team.idx : -1);
    if (!ball.owner && (!ball.pathValid || (this.predictTick++ & 1) === 0)) ball.predict();
    let rx = ball.pos.x, rz = ball.pos.z;
    if (!ball.owner && ball.pathValid) { rx = ball.path[36]; rz = ball.path[38]; }
    const a = { x: 0, z: 0 };
    for (const t of this.teams) {
      const o = this.opp(t);
      let d1 = -1e9, d2 = -1e9;
      for (const p of t.players) { if (!p.active) continue; const u = o.u(p.x); if (u > d1) { d2 = d1; d1 = u; } else if (u > d2) d2 = u; }
      t.offsideLine = Math.max(0, d2 < -1e8 ? HL : d2, o.u(ball.pos.x));
      const att = this.attacking === t.idx || (this.attacking < 0 && this.lastPoss === t.idx);
      for (const p of t.players) { if (!p.active) continue; t.anchor(p.slot, rx, rz, att, a); p.anchorX = a.x; p.anchorZ = a.z; }
    }
  }

  private tickPlay(dt: number) {
    this.context();
    updateAI(this, dt);
    for (const t of this.teams) if (t.human && this.inputs[t.inputIdx]) updateHuman(this, t, this.inputs[t.inputIdx]!, dt);
    this.stepPlayers(dt);
    this.moveBall(dt, true);
    if (this.phase !== 'play') return;
    if (this.ball.owner) this.teams[this.ball.owner.team.idx].stats.possession += dt;
    if (this.shotLive) { this.shotLive.t += dt; if (this.shotLive.t > 4) this.shotLive = null; }
    if (this.drill) { this.drill.tick?.(dt); return; }
    // Clock
    this.clock += dt * (2700 / this.halfReal);
    const end = 2700 * this.half + this.stoppage[this.half - 1];
    if (this.clock >= end && (Math.abs(this.ball.pos.x) < 28 || this.clock >= end + 100)) this.endHalf();
  }

  private stepPlayers(dt: number) {
    const total = this.cfg.minutes * 60;
    const all = this.all;
    for (const p of all) {
      if (!p.active) continue;
      p.fatigue = Math.min(0.45, p.fatigue + dt * (0.2 + (p.sprint ? 0.3 : 0)) / total);
      p.update(dt, this.ball.owner === p);
      if (p.state === 'kick' && p.kick && !p.kickDone && p.stateT >= p.kick.at) performKick(this, p);
      if (p.state === 'tackle' || p.state === 'slide') resolveTackle(this, p);
    }
    // Body separation
    for (let i = 0; i < all.length; i++) {
      const a = all[i]; if (!a.active) continue;
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j]; if (!b.active) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.3 && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (0.55 - d) * 0.5;
          const wa = b.a.phy / (a.a.phy + b.a.phy), wb = 1 - wa;
          a.x -= (dx / d) * push * 2 * wa; a.z -= (dz / d) * push * 2 * wa;
          b.x += (dx / d) * push * 2 * wb; b.z += (dz / d) * push * 2 * wb;
        }
      }
    }
  }

  /** Moves the ball: glued to the dribbler's feet with touches, or free flight with collisions. */
  moveBall(dt: number, live: boolean) {
    const ball = this.ball, o = ball.owner;
    if (o) {
      if (!o.active || (!o.holding && (o.state === 'down' || o.state === 'getup' || o.state === 'stun'))) { ball.owner = null; ball.vel.set(o.vx, 0, o.vz); return; }
      let tx: number, tz: number, ty = BALL_R;
      if (o.state === 'throw') { tx = o.x + o.dirX * 0.1; tz = o.z + o.dirZ * 0.1; ty = 2.0 * (o.data.look.height / 1.82); }
      else if (o.holding) { tx = o.x + o.dirX * 0.32; tz = o.z + o.dirZ * 0.32; ty = 1.12; }
      else {
        const sp = o.speed;
        const reach = 0.45 + 0.32 * (sp / 9) * (1.35 - o.a.dri / 100) + 0.16 * (0.5 + 0.5 * Math.sin(o.stride * 2)) * (sp / 8);
        let dx = o.dirX, dz = o.dirZ;
        if (o.shield) {
          const n = this.nearestOpp(o);
          if (n && dist(n.x, n.z, o.x, o.z) < 5) { const l = dist(n.x, n.z, o.x, o.z) || 1; dx = (o.x - n.x) / l; dz = (o.z - n.z) / l; }
        }
        tx = o.x + dx * reach; tz = o.z + dz * reach;
      }
      const r = o.state === 'throw' || o.holding ? 30 : 20;
      ball.pos.x = damp(ball.pos.x, tx, r, dt); ball.pos.z = damp(ball.pos.z, tz, r, dt); ball.pos.y = damp(ball.pos.y, ty, 16, dt);
      ball.vel.set(o.vx, 0, o.vz);
      // A dribbler running the ball over a line concedes the restart.
      if (live && !o.holding && o.state !== 'throw') {
        if (Math.abs(ball.pos.z) > HW + BALL_R) this.handleOut({ type: 'touch', x: ball.pos.x, z: ball.pos.z });
        else if (Math.abs(ball.pos.x) > HL + BALL_R) {
          const side = Math.sign(ball.pos.x);
          if (Math.abs(ball.pos.z) < GOAL_HW - 0.1) this.handleOut({ type: 'goal', side }); else this.handleOut({ type: 'end', side, z: ball.pos.z });
        }
      }
      return;
    }
    if (ball.knuckle > 0) { ball.knuckle -= dt; if (ball.pos.y > 0.25) { ball.vel.z += this.rng.gauss(0, 9) * dt * 6; ball.vel.y += this.rng.gauss(0, 5) * dt * 6; ball.pathValid = false; } }
    for (let i = 0; i < 2; i++) {
      const ev = ball.step(dt / 2);
      if (!ev) continue;
      if (ev.type === 'bounce') this.events.emit('bounce', { speed: ev.speed });
      else if (ev.type === 'post') { this.events.emit('post', { speed: ev.speed }); if (live && ev.speed > 6) this.say(this.rng.pick(['Off the woodwork!', 'It strikes the frame of the goal!', 'Denied by the post!']), 2); }
      else if (ev.type === 'net') this.events.emit('net', {});
      else if (live) { this.handleOut(ev); return; }
    }
    if (live) this.contest();
  }

  nearestOpp(p: Player) {
    let best: Player | null = null, bd = 1e9;
    for (const o of this.opp(p.team).players) { if (!o.active) continue; const d = dist(o.x, o.z, p.x, p.z); if (d < bd) { bd = d; best = o; } }
    return best;
  }

  /** Free ball: who controls, heads or deflects it. */
  private contest() {
    const ball = this.ball, b = ball.pos;
    if (gkContest(this)) return;
    if (b.y > 2.7) return;
    let best: Player | null = null, bd = 1e9, second: Player | null = null;
    for (const p of this.all) {
      if (!p.active || p.ctlCd > 0 || !p.free || p.holding) continue;
      const d = dist(p.x, p.z, b.x, b.z);
      const reach = b.y > 1.0 ? 0.85 : 0.72 + 0.12 * p.a.dri / 100;
      if (d < reach) { if (d < bd) { second = best; bd = d; best = p; } else if (!second) second = p; }
    }
    if (!best) return;
    let p = best;
    const sp = ball.speed;
    if (b.y > 1.45) {
      // Aerial duel: strength and height decide who gets their head to it.
      if (second && second.team !== p.team) {
        const sa = p.a.phy + p.data.look.height * 40 + this.rng.range(0, 40), sb = second.a.phy + second.data.look.height * 40 + this.rng.range(0, 40);
        if (sb > sa) p = second;
      }
      this.aerial(p); return;
    }
    const rel = Math.hypot(ball.vel.x - p.vx, ball.vel.z - p.vz);
    const intent = p.intent;
    if (intent && intent.t > 0) { this.firstTime(p); return; }
    const limit = 10 + 14 * p.a.dri / 100;
    if (rel > limit && !p.isGK) {
      // Heavy first touch: the ball bounces off the player.
      const k = 0.22 + this.rng.range(0, 0.15);
      ball.vel.set(-ball.vel.x * k + p.vx + this.rng.gauss(0, 1.2), Math.abs(ball.vel.y) * 0.3 + 1, -ball.vel.z * k + p.vz + this.rng.gauss(0, 1.2));
      ball.touch(p); ball.pathValid = false; p.ctlCd = 0.25; p.stats.touches++;
      this.onLooseTouch(p);
      return;
    }
    this.gainControl(p);
  }

  private aerial(p: Player) {
    const t = p.team, u = t.u(p.x);
    const intent = p.intent && p.intent.t > 0 ? p.intent : null;
    let mode: 'shot' | 'pass' | 'clear' = 'pass';
    let target: Player | null = intent?.target ?? null;
    if (intent?.kind === 'shot' || (!intent && u > HL - 17 && Math.abs(p.z) < 15)) mode = 'shot';
    else if (!intent && u < -HL + 26) mode = 'clear';
    if (mode === 'pass' && !target) {
      let bs = -1e9;
      for (const q of t.players) {
        if (q === p || !q.active || q.isGK) continue;
        const d = dist(q.x, q.z, p.x, p.z); if (d > 22 || d < 3) continue;
        const s = t.u(q.x) - u - d * 0.4 + (this.nearestOpp(q) ? dist(this.nearestOpp(q)!.x, this.nearestOpp(q)!.z, q.x, q.z) : 5);
        if (s > bs) { bs = s; target = q; }
      }
      if (!target) mode = 'clear';
    }
    p.intent = null;
    if (!this.touchCheck(p)) return;
    const err = t.human ? 1 : t.params.passErr;
    const k = planAerial(this, p, mode, target, err);
    if (this.ball.pos.y > 1.3 && p.state === 'play') { p.setState('jump'); p.jumpV = 2.9; }
    else p.setState('kick', 0.3);
    p.kick = k; p.kickDone = false; p.kickType = k.type; p.kickLeg = 1;
    performKick(this, p);
  }

  private firstTime(p: Player) {
    const it = p.intent!; p.intent = null;
    if (!this.touchCheck(p)) return;
    this.ball.owner = p;
    const k = it.make();
    this.ball.owner = null;
    if (!k) { this.gainControl(p); return; }
    k.at = 0;
    startKick(this, p, k);
  }

  /** Offside is judged when a flagged attacker becomes involved. Returns false if play was stopped. */
  private touchCheck(p: Player) {
    if (p.offsideFlag && this.passer && this.passer.team === p.team && this.passer !== p) { this.offside(p); return false; }
    for (const q of this.all) q.offsideFlag = false;
    return true;
  }

  gainControl(p: Player) {
    if (!this.touchCheck(p)) return false;
    const ball = this.ball;
    if (this.passer) {
      if (this.passer.team === p.team && this.passer !== p) { this.passer.stats.passesOk++; p.team.stats.passesOk++; }
      else if (this.passer.team !== p.team && this.rng.chance(0.35)) this.say(`${this.rng.pick(['Intercepted by', 'Read well by', 'Cut out by'])} ${p.data.short}.`);
    }
    this.passer = null; this.passTarget = null; this.shotLive = null;
    ball.owner = p; ball.touch(p); p.stats.touches++;
    if (p.team.human && !p.team.locked) p.team.selected = p;
    p.aiT = Math.max(0.25, p.team.params.decide * 0.6); p.runX = p.x + p.team.dir * 8; p.runZ = p.z; p.run = false;
    this.events.emit('possession', { player: p });
    return true;
  }
  onLooseTouch(p: Player) {
    if (p.offsideFlag && this.passer && this.passer.team === p.team && this.passer !== p) { this.offside(p); return; }
    if (this.passer && this.passer.team !== p.team) { for (const q of this.all) q.offsideFlag = false; this.passer = null; this.passTarget = null; }
  }

  onKick(p: Player, k: KickPlan) {
    this.events.emit('kick', { player: p, type: k.type, power: k.power, style: k.style });
    p.stats.touches++;
    const t = p.team;
    let from: SetPieceType | null = null;
    if (this.sp && this.phase === 'setpiece') {
      from = this.sp.type; const so = this.sp.shootout; this.sp = null;
      for (const q of this.all) if (q.state === 'idle' || q.state === 'throw') q.setState('play');
      if (so) { this.setPhase('pk'); this.so!.resolveT = 0; this.so!.resolved = false; } else this.setPhase('play');
    }
    this.restartImmune = from === 'throwin' || from === 'corner' || from === 'goalkick';
    this.ball.touch(p);
    this.passer = p; this.passTarget = k.target;
    if (k.target) { p.stats.passes++; t.stats.passes++; }
    const isShot = SHOT_TYPES.includes(k.type) || ((k.type === 'header' || k.type === 'volley') && !k.target && t.u(p.x) > HL - 30);
    if (isShot) {
      this.ball.predict();
      const side = Math.sign(t.goalX), path = this.ball.path;
      let on = false;
      for (let i = 1; i < PREDICT_N; i++) {
        if (side * path[i * 3] >= HL) { on = Math.abs(path[i * 3 + 2]) < GOAL_HW && path[i * 3 + 1] < GOAL_H; break; }
      }
      p.stats.shots++; t.stats.shots++; if (on) t.stats.onTarget++;
      this.shotLive = { by: p, onTarget: on, t: 0 };
      this.events.emit('shot', { player: p, onTarget: on });
    }
    // Offside snapshot at the moment the ball is played.
    const o = this.opp(t);
    for (const q of this.all) q.offsideFlag = false;
    if (!this.restartImmune && !isShot) {
      const bu = t.u(this.ball.pos.x);
      for (const q of t.players) {
        if (q === p || !q.active) continue;
        const u = t.u(q.x);
        q.offsideFlag = u > 0.5 && u > o.offsideLine + 0.4 && u > bu + 0.4;
      }
    }
    this.passAware[o.idx] = this.rng.chance(o.params.intercept);
    this.passAware[t.idx] = true;
    if (t.human && !t.locked && k.target) t.selected = k.target;
    if (k.type === 'penalty') gkPenalty(this, o.gk, p);
  }

  // ---------- rules ----------
  private handleOut(ev: BallEvent) {
    if (this.phase === 'pk') { if (ev.type === 'goal') this.resolvePk(true); else this.resolvePk(false); return; }
    if (this.phase !== 'play') return;
    const ball = this.ball;
    const last = ball.owner ?? ball.lastTouch;
    if (ev.type === 'goal') { this.goal(ev.side); return; }
    ball.owner = null;
    if (this.drill) { this.drill.onDead('out', ev); return; }
    const lastTeam = last ? last.team : this.teams[0];
    if (ev.type === 'touch') {
      this.pending = { type: 'throwin', x: clamp(ev.x, -HL + 1, HL - 1), z: Math.sign(ev.z) * HW, team: this.opp(lastTeam) };
      this.deadT = 0.9;
    } else if (ev.type === 'end') {
      const defending = this.teams.find((t) => Math.sign(t.ownGoalX) === ev.side)!;
      if (this.shotLive && Math.abs(ev.z) < GOAL_HW + 3) { this.events.emit('nearmiss', {}); this.say(this.rng.pick(['Just wide!', 'Inches away!', 'So close to the opener there.', 'That flashed past the post!']), 1); }
      if (lastTeam === defending) {
        this.pending = { type: 'corner', x: ev.side * HL, z: Math.sign(ev.z || 1) * HW, team: this.opp(defending) };
        this.opp(defending).stats.corners++;
      } else this.pending = { type: 'goalkick', x: ev.side * (HL - 5.5), z: Math.sign(ev.z || 1) * 5, team: defending };
      this.deadT = 1.3;
    }
    this.shotLive = null; this.passer = null; this.passTarget = null;
    this.setPhase('dead');
  }

  private goal(side: number) {
    const team = this.teams.find((t) => Math.sign(t.goalX) === side)!;
    const ball = this.ball;
    const last = ball.owner ?? ball.lastTouch;
    ball.owner = null;
    if (this.drill) { this.drill.onDead('goal', last); return; }
    team.score++;
    const own = !!last && last.team !== team;
    let scorer = last ?? team.players[9];
    let assist: Player | null = null;
    if (!own) {
      scorer.stats.goals++;
      if (ball.prevTouch && ball.prevTouch.team === team && ball.prevTouch !== scorer) { assist = ball.prevTouch; assist.stats.assists++; }
    }
    const minute = Math.max(1, Math.ceil(this.clock / 60));
    this.lastGoal = { team, scorer, assist, own, minute };
    this.log.push({ minute, type: 'goal', team: team.idx, text: `${scorer.data.short}${own ? ' (OG)' : ''}` });
    this.events.emit('goal', this.lastGoal);
    this.say(own ? `Own goal! ${scorer.data.name} turns it into his own net. ${team.data.name} benefit.`
      : `${this.rng.pick(['GOAL!', 'GOOOAL!', 'It\'s in!', 'What a finish!'])} ${scorer.data.name} scores for ${team.data.name}!${assist ? ` Assist by ${assist.data.short}.` : ''}`, 3);
    this.kickoffTeam = 1 - team.idx;
    this.shotLive = null; this.passer = null; this.passTarget = null;
    // Celebration: scorer wheels away, team-mates chase to join in.
    const cel = own ? team.players.find((p) => !p.isGK && p.active)! : scorer;
    for (const p of this.all) {
      if (!p.active) continue;
      if (p.team === team && (p === cel || !p.isGK)) { p.setState('celebrate'); p.celeb = p === cel ? 1 + (hash(p.data.id) % 3) : 4; }
      else if (p.state !== 'getup' && p.state !== 'down' && p.state !== 'dive') p.setState('idle');
    }
    this.celebrant = cel;
    this.celX = side * (HL - 7); this.celZ = Math.sign(cel.z || 1) * (HW - 5);
    this.setPhase('goal');
  }
  celebrant: Player | null = null; private celX = 0; private celZ = 0;

  private tickGoal(dt: number) {
    const c = this.celebrant;
    for (const p of this.all) {
      if (!p.active) continue;
      if (p.state === 'celebrate' && c) {
        if (p === c) { const d = p.moveTo(this.celX, this.celZ, true, 3); if (d < 2 || this.phaseT > 2.4) p.stop(); p.look(this.celX * 2, this.celZ * 2); }
        else { const d = p.distTo(c.x, c.z); if (d > 2.2) p.moveTo(c.x, c.z, true, 2.5); else p.stop(); p.look(c.x, c.z); }
      } else { p.stop(); p.look(this.ball.pos.x, this.ball.pos.z); }
      p.update(dt, false);
    }
    this.moveBall(dt, false);
    if (this.phaseT > 4.2) {
      for (const p of this.all) if (p.state === 'celebrate' || p.state === 'idle') p.setState('play');
      if (this.useReplays) this.setPhase('replay'); else this.setupSetPiece('kickoff', 0, 0, this.teams[this.kickoffTeam]);
    }
  }

  foul(by: Player, on: Player, harsh: boolean) {
    if (this.phase !== 'play' || this.drill) return;
    const t = by.team;
    by.stats.fouls++; t.stats.fouls++;
    on.setState('down', 1.4);
    this.ball.owner = null; this.ball.vel.multiplyScalar(0.3);
    const inBox = t.u(on.x) < -HL + BOX_DEPTH && Math.abs(on.z) < BOX_HW;
    const hot = by.data.personality === 'Hothead' ? 1.4 : 1;
    let card = 0;
    const r = this.rng.next();
    if (harsh) card = r < 0.1 * hot ? 2 : r < 0.75 ? 1 : 0; else card = r < 0.16 * hot ? 1 : 0;
    if (card === 1) { by.yellow++; t.stats.yellow++; if (by.yellow >= 2) card = 2; else this.log.push({ minute: this.minute, type: 'yellow', team: t.idx, text: by.data.short }); }
    if (card === 2) { t.stats.red++; this.log.push({ minute: this.minute, type: 'red', team: t.idx, text: by.data.short }); this.sendOff(by); }
    this.events.emit('whistle', { kind: 'short' });
    this.events.emit('foul', { by, on, card, penalty: inBox });
    this.say(inBox ? `Penalty! ${by.data.short} brings down ${on.data.short} in the box!` : `Foul by ${by.data.short} on ${on.data.short}.${card === 1 ? ' Yellow card.' : card === 2 ? ' He\'s been sent off!' : ''}`, inBox || card === 2 ? 3 : 1);
    this.pending = { type: inBox ? 'penalty' : 'freekick', x: on.x, z: on.z, team: on.team };
    this.deadT = 1.8; this.shotLive = null; this.passer = null; this.passTarget = null;
    this.setPhase('dead');
  }
  private sendOff(p: Player) {
    p.sentOff = true;
    if (p.isGK) {
      const t = p.team;
      const q = t.players.filter((x) => x.active && !x.isGK && x !== t.locked).sort((a, b) => a.data.overall - b.data.overall)[0];
      if (q) { q.isGK = true; q.role = 'GK'; q.slot = t.slots[0]; }
    }
    if (p.team.selected === p) p.team.selected = null;
  }
  private offside(p: Player) {
    for (const q of this.all) q.offsideFlag = false;
    p.team.stats.offsides++;
    this.events.emit('whistle', { kind: 'short' });
    this.events.emit('offside', { player: p });
    this.say(`${p.data.short} is flagged offside.`, 1);
    this.ball.owner = null; this.ball.vel.multiplyScalar(0.3);
    this.pending = { type: 'freekick', x: p.x, z: p.z, team: this.opp(p.team) };
    this.deadT = 1.1; this.passer = null; this.passTarget = null;
    this.setPhase('dead');
  }

  private tickDead(dt: number) {
    for (const p of this.all) { if (!p.active) continue; p.stop(); p.look(this.ball.pos.x, this.ball.pos.z); p.update(dt, false); }
    this.moveBall(dt, false);
    if (this.phaseT < this.deadT) return;
    const end = 2700 * this.half + this.stoppage[this.half - 1];
    if (this.clock >= end && this.pending?.type !== 'penalty') { this.endHalf(); return; }
    const pd = this.pending!; this.pending = null;
    this.setupSetPiece(pd.type, pd.x, pd.z, pd.team);
  }

  private endHalf() {
    this.ball.owner = null;
    if (this.half === 1) {
      this.events.emit('whistle', { kind: 'half' });
      this.say(`Half-time: ${this.teams[0].data.name} ${this.teams[0].score}, ${this.teams[1].data.name} ${this.teams[1].score}.`, 1);
      this.setPhase('halftime');
    } else {
      this.events.emit('whistle', { kind: 'full' });
      if (this.cfg.knockout && this.teams[0].score === this.teams[1].score) { this.say('All square after ninety minutes. We go to a penalty shoot-out!', 2); this.startShootout(); }
      else this.finish();
    }
  }
  private startSecondHalf() {
    this.half = 2; this.clock = 2700;
    for (const t of this.teams) { t.dir = -t.dir; for (const p of t.players) p.stamina = Math.min(1 - p.fatigue, p.stamina + 0.3); }
    this.say('The second half is under way.');
    this.setupSetPiece('kickoff', 0, 0, this.teams[1]);
  }
  private finish() {
    const [a, b] = this.teams;
    this.winner = a.score > b.score ? 0 : b.score > a.score ? 1 : this.so ? (a.shootout > b.shootout ? 0 : 1) : -1;
    this.say(this.winner < 0 ? `Full-time, and it finishes level: ${a.score}-${b.score}.` : `Full-time! ${this.teams[this.winner].data.name} win it${this.so ? ' on penalties' : ''}.`, 2);
    for (const p of this.all) {
      if (!p.active) continue;
      if (this.winner >= 0 && p.team.idx === this.winner) { p.setState('celebrate'); p.celeb = 1 + (hash(p.data.id) % 3); } else p.setState('idle');
    }
    this.setPhase('fulltime');
  }
  /** Called by the game once the full-time presentation has been shown. */
  complete() { if (!this.remote) this.setPhase('done'); }

  /** Match rating out of 10 for a player, used by careers. */
  rating(p: Player) {
    const s = p.stats;
    const win = this.winner === p.team.idx ? 0.4 : this.winner < 0 ? 0 : -0.2;
    const conceded = this.opp(p.team).score;
    const def = p.isGK || p.role === 'CB' || p.role === 'LB' || p.role === 'RB' ? (conceded === 0 ? 0.8 : -0.15 * conceded) : 0;
    return clamp(6 + s.goals * 1.1 + s.assists * 0.7 + s.passesOk * 0.02 - (s.passes - s.passesOk) * 0.03 + s.tackles * 0.14 + s.saves * 0.3 - s.lost * 0.03 - s.fouls * 0.12 + s.shots * 0.05 + win + def, 3, 10);
  }

  // ---------- penalty shoot-out ----------
  private startShootout() {
    const order = this.teams.map((t) => t.players.filter((p) => p.active && !p.isGK).sort((a, b) => b.a.sho - a.a.sho).concat(t.players.filter((p) => p.active && p.isGK)));
    this.so = { kicks: [[], []], turn: 0, order, active: true, resolveT: 0, resolved: false };
    this.nextPenalty();
  }
  private nextPenalty() {
    const so = this.so!;
    const t = this.teams[so.turn];
    t.dir = 1; this.opp(t).dir = -1;
    const taker = so.order[so.turn][so.kicks[so.turn].length % so.order[so.turn].length];
    this.setupSetPiece('penalty', HL - PEN_SPOT, 0, t, taker, true);
  }
  private tickPk(dt: number) {
    const so = this.so!;
    this.context();
    updateAI(this, dt, true);
    for (const p of this.all) { if (!p.active) continue; if (!p.isGK && p.state === 'play') p.stop(); p.update(dt, this.ball.owner === p); }
    if (!so.resolved) {
      this.moveBall(dt, true);
      so.resolveT += dt;
      if (!so.resolved && (so.resolveT > 3.2 || (so.resolveT > 0.8 && this.ball.speed < 0.6) || this.ball.owner)) this.resolvePk(false);
    } else {
      this.moveBall(dt, false);
      so.resolveT += dt;
      if (so.resolveT > 2.2) {
        const [a, b] = so.kicks, sa = a.filter(Boolean).length, sb = b.filter(Boolean).length;
        const done = (a.length <= 5 || b.length <= 5) && Math.max(a.length, b.length) <= 5
          ? sa > sb + (5 - b.length) || sb > sa + (5 - a.length)
          : a.length === b.length && sa !== sb;
        this.teams[0].shootout = sa; this.teams[1].shootout = sb;
        if (done) this.finish(); else { so.turn = 1 - so.turn; this.nextPenalty(); }
      }
    }
  }
  resolvePk(scored: boolean) {
    const so = this.so!; if (so.resolved) return;
    so.resolved = true; so.resolveT = 0;
    so.kicks[so.turn].push(scored);
    const t = this.teams[so.turn];
    this.teams[0].shootout = so.kicks[0].filter(Boolean).length; this.teams[1].shootout = so.kicks[1].filter(Boolean).length;
    this.events.emit('shootout', { team: t, scored });
    this.log.push({ minute: 90, type: 'pen', team: t.idx, text: scored ? 'scored' : 'missed' });
    this.say(scored ? `${this.rng.pick(['Scores!', 'Buried!', 'No mistake.'])} ${t.data.name} convert.` : `${this.rng.pick(['Saved!', 'Missed!', 'He\'s failed to score!'])}`, scored ? 2 : 3);
    this.ball.owner = null;
  }

  // ---------- set pieces ----------
  private arrangeKickoff(taking: number) {
    for (const t of this.teams) {
      for (const p of t.players) {
        if (!p.active) continue;
        const k = clamp((p.slot.u + 0.96) / 1.36, 0, 1);
        let u = -48 + 45 * Math.pow(k, 0.8), w = p.slot.w * HW * 0.85;
        if (t.idx !== taking && Math.hypot(u, w) < 10.5) u = -10.5;
        this.put(p, u * t.dir, w * t.dir);
      }
    }
    this.ball.place(0, 0); this.ball.owner = null;
  }
  private put(p: Player, x: number, z: number) {
    p.x = x; p.z = z; p.vx = p.vz = 0; p.y = 0; p.holding = false; p.shield = p.jockey = false; p.intent = null;
    p.setState('idle'); p.stop();
    p.facing = Math.atan2(this.ball.pos.z - z, this.ball.pos.x - x);
    p.look(this.ball.pos.x, this.ball.pos.z);
  }

  setupSetPiece(type: SetPieceType, x: number, z: number, team: MatchTeam, forcedTaker: Player | null = null, shootout = false) {
    const ball = this.ball, opp = this.opp(team), rng = this.rng;
    ball.owner = null; ball.lastTouch = null; ball.prevTouch = null;
    this.passer = null; this.passTarget = null; this.shotLive = null;
    for (const p of this.all) p.offsideFlag = false;
    if (!shootout) this.autoSubs();
    const act = (t: MatchTeam) => t.players.filter((p) => p.active);
    const out = (t: MatchTeam) => act(t).filter((p) => !p.isGK);
    let taker: Player; let direct = false;
    const anchorAll = (bx: number, bz: number) => {
      const a = { x: 0, z: 0 };
      for (const t of this.teams) for (const p of act(t)) {
        if (p.isGK) { this.put(p, t.ownGoalX + t.dir * 1.2, 0); continue; }
        t.anchor(p.slot, bx, bz, t === team, a); this.put(p, a.x, a.z);
      }
    };
    const nearest = (list: Player[], px: number, pz: number) => list.reduce((b, p) => (p.distTo(px, pz) < b.distTo(px, pz) ? p : b), list[0]);
    const best = (list: Player[], f: (p: Player) => number) => list.reduce((b, p) => (f(p) > f(b) ? p : b), list[0]);
    if (type === 'kickoff') {
      this.arrangeKickoff(team.idx);
      const fw = out(team).sort((a, b) => b.slot.u - a.slot.u);
      taker = fw[0]; this.put(taker, -0.35 * team.dir, 0.2);
      if (fw[1]) this.put(fw[1], -1.2 * team.dir, 4.5 * team.dir);
      x = 0; z = 0;
    } else if (type === 'throwin') {
      ball.place(x, z);
      anchorAll(x, z * 0.8);
      taker = forcedTaker ?? nearest(out(team).filter((p) => p.role !== 'ST' && p.role !== 'CB').concat(out(team)).slice(0, 8), x, z);
      const others = out(team).filter((p) => p !== taker).sort((a, b) => a.distTo(x, z) - b.distTo(x, z));
      if (others[0]) this.put(others[0], clamp(x + team.dir * 7, -HL + 2, HL - 2), z - Math.sign(z) * 6);
      if (others[1]) this.put(others[1], clamp(x - team.dir * 6, -HL + 2, HL - 2), z - Math.sign(z) * 9);
      this.put(taker, x, z + Math.sign(z) * 0.5);
      taker.facing = Math.atan2(-z, 0); taker.look(x, 0);
      taker.setState('throw'); ball.owner = taker; ball.pos.set(x, 2, z);
    } else if (type === 'corner') {
      const side = Math.sign(x), zs = Math.sign(z);
      x = side * (HL - 0.4); z = zs * (HW - 0.4);
      ball.place(x, z);
      anchorAll(side * (HL - 22), 0);
      taker = forcedTaker ?? best(out(team), (p) => p.a.pas + (p.role === 'CB' || p.role === 'ST' ? -30 : 0));
      const atk = out(team).filter((p) => p !== taker).sort((a, b) => b.a.phy + b.data.look.height * 30 - (a.a.phy + a.data.look.height * 30));
      const spots = [[6, -2.5 * zs], [8.5, 2], [10.5, -1], [5.5, 5 * -zs], [13.5, 3 * zs]];
      spots.forEach((s, i) => { if (atk[i]) this.put(atk[i], side * (HL - s[0]) + rng.range(-0.6, 0.6), s[1] + rng.range(-0.6, 0.6)); });
      if (atk[5]) this.put(atk[5], side * (HL - 6), zs * (HW - 11));
      const defs = out(opp).sort((a, b) => b.a.def - a.a.def);
      spots.forEach((s, i) => { if (defs[i] && atk[i]) this.put(defs[i], atk[i].x + side * 1.1, atk[i].z - Math.sign(atk[i].z || 1) * 0.3); });
      if (defs[5]) this.put(defs[5], side * (HL - 0.8), zs * 3.2);
      if (defs[6]) this.put(defs[6], side * (HL - 9), zs * (HW - 13));
      this.put(opp.gk, side * (HL - 0.6), -zs * 0.8);
      this.put(taker, x + side * 0.6, z + zs * 0.6);
    } else if (type === 'goalkick') {
      ball.place(x, z);
      anchorAll(team.ownGoalX + team.dir * 34, 0);
      taker = team.gk;
      for (const p of out(opp)) if (opp.u(p.x) > HL - BOX_DEPTH - 2) this.put(p, opp.dir * (HL - BOX_DEPTH - 4), p.z);
      this.put(taker, x - team.dir * 1.2, z);
    } else if (type === 'penalty') {
      const gx = team.goalX; x = gx - team.dir * PEN_SPOT; z = 0;
      ball.place(x, 0);
      anchorAll(x, 0);
      taker = forcedTaker ?? best(out(team), (p) => p.a.sho);
      let i = 0;
      for (const t of this.teams) for (const p of out(t)) {
        if (p === taker) continue;
        if (shootout) { this.put(p, (t.idx === 0 ? -1 : 1) * 2 - 5 + (i % 10) * 1.1, (t.idx === 0 ? -1 : 1) * (2 + Math.floor(i / 10))); i++; continue; }
        if (t.u(p.x) * (t === team ? 1 : -1) > HL - BOX_DEPTH - 1.5 || Math.abs(p.x - gx) < 20) {
          const ang = (i++ / 20) * Math.PI - Math.PI / 2;
          this.put(p, gx - team.dir * (PEN_SPOT + 9.5 * Math.cos(ang) + 1), 11 * Math.sin(ang) * 1.6);
        }
      }
      if (shootout) this.put(team.gk, HL - 20, 14);
      this.put(opp.gk, gx - team.dir * 0.3, 0);
      this.put(taker, x - team.dir * 2.2, 0.4);
      direct = true;
    } else {
      x = clamp(x, -HL + 1, HL - 1); z = clamp(z, -HW + 1, HW - 1);
      ball.place(x, z);
      anchorAll(x, z);
      const gx = team.goalX, dGoal = dist(x, z, gx, 0);
      direct = dGoal < 31 && Math.abs(z) < 24;
      taker = forcedTaker ?? (direct ? best(out(team), (p) => p.a.sho * 0.6 + p.a.pas * 0.4) : nearest(out(team), x, z));
      const ux = (gx - x) / dGoal, uz = (0 - z) / dGoal;
      if (direct) {
        const wall = out(opp).sort((a, b) => b.data.look.height - a.data.look.height).slice(0, dGoal < 22 ? 4 : 3);
        wall.forEach((p, i) => { const off = (i - (wall.length - 1) / 2) * 0.62 + 0.5 * Math.sign(z || 1); this.put(p, x + ux * 9.15 - uz * off, z + uz * 9.15 + ux * off); });
        const box = out(team).filter((p) => p !== taker).sort((a, b) => b.slot.u - a.slot.u).slice(0, 3);
        box.forEach((p, i) => this.put(p, gx - team.dir * (11 + i * 2), (i - 1) * 7 - Math.sign(z || 1) * 3));
      }
      for (const p of act(opp)) if (!p.isGK && p.distTo(x, z) < 9.15) { const d = p.distTo(x, z) || 1; this.put(p, x + ((p.x - x) / d) * 9.3 + (d < 0.5 ? ux * 9.3 : 0), z + ((p.z - z) / d) * 9.3); }
      for (const p of act(team)) if (p !== taker && p.distTo(x, z) < 3) this.put(p, p.x - team.dir * 3, p.z + 3);
      this.put(taker, x - ux * 1.6 + uz * 0.5, z - uz * 1.6 - ux * 0.5);
    }
    for (const p of this.all) { if (p.active && p !== taker) { p.facing = Math.atan2(ball.pos.z - p.z, ball.pos.x - p.x); } }
    if (type !== 'throwin') { taker.facing = Math.atan2(ball.pos.z - taker.z, ball.pos.x - taker.x); }
    this.sp = { type, x, z, team, taker, t: 0, aiDelay: rng.range(1.3, 2.2) + (type === 'penalty' ? 0.8 : 0), shootout, direct, kicked: false, aim: 0, power: 0 };
    if (team.human && !team.locked) team.selected = taker;
    const o = this.opp(team);
    if (o.human && !o.locked) o.selected = nearest(out(o), x, z);
    this.setPhase('setpiece');
    this.events.emit('setpiece', { type, team });
    if (type === 'kickoff') this.events.emit('whistle', { kind: 'long' });
    else if (type === 'corner') this.say(`Corner to ${team.data.name}.`);
    else if (type === 'penalty' && !shootout) this.say(`${taker.data.name} steps up to take the penalty...`, 2);
    else if (type === 'penalty') this.say(`${taker.data.short} to take for ${team.data.name}.`, 1);
  }

  private tickSetPiece(dt: number) {
    const sp = this.sp!;
    sp.t += dt;
    for (const p of this.all) { if (!p.active) continue; if (p !== sp.taker) { p.stop(); p.look(this.ball.pos.x, this.ball.pos.z); } }
    const t = sp.team, inp = t.human ? this.inputs[t.inputIdx] : null;
    const humanTakes = !!inp && (!t.locked || t.locked === sp.taker);
    if (!sp.kicked) {
      if (humanTakes && sp.t < 14) humanSetPiece(this, sp, inp!, dt);
      else if (sp.t > sp.aiDelay) aiSetPiece(this, sp);
    }
    if (sp.kicked && sp.taker.state === 'kick') sp.taker.moveTo(this.ball.pos.x, this.ball.pos.z, false, 0.3);
    else if (sp.kicked && sp.taker.state !== 'kick') sp.kicked = false; // kick failed to start, try again
    for (const p of this.all) {
      if (!p.active) continue;
      p.update(dt, this.ball.owner === p);
      if (p.state === 'kick' && p.kick && !p.kickDone && p.stateT >= p.kick.at) { performKick(this, p); if (this.phase !== 'setpiece') return; }
    }
    this.moveBall(dt, false);
  }

  /** AI managers replace tired players at stoppages late in the game. */
  private autoSubs() {
    if (this.minute < 58) return;
    for (const t of this.teams) {
      if (this.lockPending && t.benched && this.minute >= 60) {
        const on = t.bench.find((b) => b.id === this.lockPending);
        if (on) {
          const off = t.players.filter((p) => p.active && !p.isGK).sort((a, b) => fitAt(on, b.role) - fitAt(on, a.role))[0];
          if (off && this.substitute(t, off, on)) { t.benched = false; t.locked = t.players.find((p) => p.data === on)!; t.selected = t.locked; }
        }
        this.lockPending = null;
      }
      if (t.human && !t.locked) continue;
      if (t.benched && t.subsLeft <= 1) continue;
      if (t.subsLeft <= 0 || t.subsLeft < 5 - Math.floor((this.minute - 50) / 9)) continue;
      const tired = t.players.filter((p) => p.active && !p.isGK && p !== t.locked && p.fatigue > 0.2).sort((a, b) => b.fatigue - a.fatigue)[0];
      if (!tired) continue;
      const on = t.bench.filter((b) => b.position !== 'GK').sort((a, b) => fitAt(b, tired.role) - fitAt(a, tired.role))[0];
      if (on) this.substitute(t, tired, on);
    }
  }
}

function colorDist(a: string, b: string) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  return Math.hypot((x >> 16) - (y >> 16), ((x >> 8) & 255) - ((y >> 8) & 255), (x & 255) - (y & 255));
}
function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

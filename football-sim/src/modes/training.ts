/** Training drills built on the real match engine: shooting, passing, dribbling, free kicks and penalties. */
import { HL, PEN_SPOT, clamp } from '../core/math';
import type { MatchManager } from '../match/match';
import type { Player } from '../match/player';

export type DrillKind = 'shooting' | 'passing' | 'dribbling' | 'freekicks' | 'penalties';
export const DRILLS: { id: DrillKind; name: string; desc: string }[] = [
  { id: 'shooting', name: 'Shooting Practice', desc: 'Ten chances from the edge of the box against a goalkeeper. Hold Shoot for power, steer with the stick, add Modifier for finesse.' },
  { id: 'passing', name: 'Passing Practice', desc: 'Find the highlighted team-mate with ground passes, through balls and lofted passes. Sixty seconds on the clock.' },
  { id: 'dribbling', name: 'Dribbling Challenge', desc: 'Weave the ball through every gate as quickly as you can. Sprint on the straights, use skill moves to cut.' },
  { id: 'freekicks', name: 'Free Kicks', desc: 'Eight direct free kicks over a wall. Aim with the stick, hold Shoot for power; curl is applied automatically.' },
  { id: 'penalties', name: 'Penalties', desc: 'Five penalties against the keeper. Aim, hold Shoot for power, and keep your nerve.' },
];

export class TrainingManager {
  score = 0; attempt = 0; total = 10; timer = 0; finished = false; message = '';
  cones: { x: number; z: number; done: boolean }[] = [];
  target: Player | null = null;
  best: number | null = null;
  private user: Player; private mates: Player[] = []; private waitT = 0; private live = false; private attemptT = 0; private gate = 0;

  constructor(public m: MatchManager, public kind: DrillKind) {
    const [a, b] = m.teams;
    a.dir = 1; b.dir = -1;
    this.user = a.players.filter((p) => !p.isGK).sort((x, y) => y.a.sho + y.a.pas + y.a.dri - (x.a.sho + x.a.pas + x.a.dri))[0];
    const keep = new Set<Player>([this.user]);
    const gk = b.gk;
    if (kind === 'shooting' || kind === 'freekicks' || kind === 'penalties') keep.add(gk);
    if (kind === 'freekicks') b.players.filter((p) => !p.isGK).slice(0, 3).forEach((p) => keep.add(p));
    if (kind === 'passing') { this.mates = a.players.filter((p) => !p.isGK && p !== this.user).slice(0, 4); this.mates.forEach((p) => keep.add(p)); }
    for (const p of m.all) if (!keep.has(p)) p.onPitch = false;
    a.selected = this.user;
    this.total = kind === 'shooting' ? 10 : kind === 'freekicks' ? 8 : kind === 'penalties' ? 5 : 0;
    if (kind === 'passing') this.timer = 60;
    try { const b0 = localStorage.getItem(`ufs.best.${kind}`); this.best = b0 ? Number(b0) : null; } catch { /* ignore */ }
    m.drill = { onDead: (k) => this.dead(k), tick: (dt) => this.tick(dt) };
    m.events.on('save', () => { if (this.live && kind !== 'passing' && kind !== 'dribbling') this.end(false, 'Saved!'); });
    m.events.on('possession', (e) => this.onPossession(e.player));
    this.next();
  }
  get title() { return DRILLS.find((d) => d.id === this.kind)!.name; }
  get status() {
    if (this.kind === 'passing') return `Passes ${this.score}   Time ${Math.ceil(this.timer)}s`;
    if (this.kind === 'dribbling') return `Gates ${this.gate}/${this.cones.length}   Time ${this.timer.toFixed(1)}s`;
    return `Scored ${this.score}   Attempt ${Math.min(this.attempt, this.total)}/${this.total}`;
  }
  private place(p: Player, x: number, z: number, face = 0) { p.x = x; p.z = z; p.vx = p.vz = 0; p.y = 0; p.facing = face; p.holding = false; p.setState('play'); p.stop(); p.kickCd = 0; p.ctlCd = 0; p.intent = null; }
  private giveBall() { const m = this.m; m.ball.place(this.user.x + this.user.dirX * 0.5, this.user.z + this.user.dirZ * 0.5); m.ball.owner = this.user; m.ball.lastTouch = this.user; m.passer = null; m.passTarget = null; m.shotLive = null; }

  private next() {
    const m = this.m, rng = m.rng, gk = m.teams[1].gk;
    if (this.finished) return;
    this.live = true; this.attemptT = 0; this.message = '';
    if (this.kind === 'shooting') {
      if (this.attempt >= this.total) return this.finish();
      this.attempt++;
      this.place(gk, HL - 1, 0, Math.PI);
      this.place(this.user, HL - rng.range(19, 27), rng.range(-14, 14)); this.giveBall(); m.setPhase('play');
    } else if (this.kind === 'freekicks') {
      if (this.attempt >= this.total) return this.finish();
      this.attempt++;
      m.setupSetPiece('freekick', HL - rng.range(19, 27), rng.range(-11, 11), m.teams[0], this.user);
    } else if (this.kind === 'penalties') {
      if (this.attempt >= this.total) return this.finish();
      this.attempt++;
      m.setupSetPiece('penalty', HL - PEN_SPOT, 0, m.teams[0], this.user);
    } else if (this.kind === 'passing') {
      const spots = [[18, -16], [26, 4], [12, 18], [-4, -6]];
      this.mates.forEach((p, i) => this.place(p, spots[i][0], spots[i][1], Math.PI));
      this.place(this.user, 0, 0); this.giveBall(); this.pickTarget(); m.setPhase('play');
    } else {
      this.cones = []; this.gate = 0; this.timer = 0;
      for (let i = 0; i < 9; i++) this.cones.push({ x: -34 + i * 8.5, z: (i % 2 ? 1 : -1) * (5 + (i % 3) * 2.5), done: false });
      this.place(this.user, -44, 0); this.giveBall(); m.setPhase('play');
    }
  }
  private pickTarget() { const o = this.mates.filter((p) => p !== this.target); this.target = this.m.rng.pick(o.length ? o : this.mates); this.target.callT = 99; for (const p of this.mates) if (p !== this.target) p.callT = 0; }
  private onPossession(p: Player) {
    if (this.kind !== 'passing' || this.finished || p === this.user) return;
    if (p === this.target) { this.score++; this.message = 'Good pass!'; } else this.message = 'Wrong team-mate';
    this.waitT = 0.7; this.live = false;
  }
  private dead(kind: 'goal' | 'out' | 'save' | 'stop') {
    if (!this.live) return;
    if (this.kind === 'passing' || this.kind === 'dribbling') { this.message = 'Out of play'; this.waitT = 0.8; this.live = false; return; }
    this.end(kind === 'goal', kind === 'goal' ? 'GOAL!' : 'Missed');
  }
  private end(scored: boolean, msg: string) { if (!this.live) return; this.live = false; if (scored) this.score++; this.message = msg; this.waitT = 1.8; }
  private finish() {
    this.finished = true; this.live = false;
    const value = this.kind === 'dribbling' ? -this.timer : this.score;
    if (this.best === null || value > this.best) { this.best = value; try { localStorage.setItem(`ufs.best.${this.kind}`, String(value)); } catch { /* ignore */ } }
    this.message = this.kind === 'dribbling' ? `Course complete in ${this.timer.toFixed(1)}s` : `Drill complete: ${this.score}${this.total ? `/${this.total}` : ''}`;
    this.m.setPhase('fulltime');
  }
  get bestText() { return this.best === null ? 'no record yet' : this.kind === 'dribbling' ? `${(-this.best).toFixed(1)}s` : String(this.best); }

  /** Called every simulation tick while the ball is live. */
  private tick(dt: number) {
    const m = this.m, b = m.ball;
    if (this.finished) return;
    if (!this.live) {
      this.waitT -= dt;
      if (this.waitT <= 0) { if (this.kind === 'passing') { this.place(this.user, clamp(this.user.x, -20, 10), clamp(this.user.z, -15, 15)); this.giveBall(); this.pickTarget(); this.live = true; } else if (this.kind === 'dribbling') { this.next(); } else this.next(); }
      return;
    }
    if (this.kind === 'passing') { this.timer -= dt; if (this.timer <= 0) { this.timer = 0; this.finish(); } return; }
    if (this.kind === 'dribbling') {
      this.timer += dt;
      const c = this.cones[this.gate];
      if (c && Math.hypot(b.pos.x - c.x, b.pos.z - c.z) < 1.9) { c.done = true; this.gate++; if (this.gate >= this.cones.length) this.finish(); }
      if (this.timer > 90) this.finish();
      return;
    }
    // Shot drills: the attempt ends when the ball stops, a defender gathers it, or time runs out.
    if (b.owner !== this.user) {
      this.attemptT += dt;
      if (b.owner) this.end(false, 'Saved!');
      else if (this.attemptT > 1.2 && b.speed < 0.7) this.end(false, 'Missed');
      else if (this.attemptT > 6) this.end(false, 'Missed');
    }
  }
}

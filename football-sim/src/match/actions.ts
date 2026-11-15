/** Ball-striking and challenge actions shared by human controllers and the AI. */
import { Vector3 } from 'three';
import { BALL_R, GOAL_HW, HL, HW, clamp, dist } from '../core/math';
import { groundPassSpeed, lobVelocity, strikeVelocity } from './ball';
import type { MatchManager } from './match';
import type { KickPlan, KickType, Player } from './player';

const V = () => new Vector3();
const plan = (type: KickType, vel: Vector3, spin: Vector3, target: Player | null, at: number, power: number): KickPlan => ({ type, vel, spin, target, at, power });

export function nearestOpponent(m: MatchManager, p: Player, x = p.x, z = p.z) {
  let best: Player | null = null, bd = 1e9;
  for (const o of m.teams[1 - p.team.idx].players) {
    if (!o.active) continue;
    const d = dist(o.x, o.z, x, z);
    if (d < bd) { bd = d; best = o; }
  }
  return { p: best, d: bd };
}

/** Plans a pass. kind: pass (ground), through (into space), loft (aerial), cross (whipped into the box). */
export function planPass(m: MatchManager, p: Player, target: Player, kind: 'pass' | 'through' | 'loft' | 'cross', err = 1, power = 0.5): KickPlan {
  const b = m.ball.pos, rng = m.rng;
  const dir = p.team.dir;
  let tx = target.x, tz = target.z;
  const d0 = dist(b.x, b.z, tx, tz);
  if (kind === 'pass') { const t = d0 / 15; tx += target.vx * t * 0.8; tz += target.vz * t * 0.8; }
  else if (kind === 'through') {
    const lead = 5 + d0 * 0.22 + power * 4;
    tx += target.vx * 0.8 + dir * lead; tz += target.vz * 0.8 + (Math.abs(target.z) > 20 ? 0 : -Math.sign(target.z) * 0.8);
  } else { const T = 0.8 + d0 / 24; tx += target.vx * T * 0.7; tz += target.vz * T * 0.7; }
  tx = clamp(tx, -HL + 2.5, HL - 2.5); tz = clamp(tz, -HW + 1.5, HW - 1.5);
  // Execution error grows with weaker passing, pace and difficulty scaling.
  const sigma = (0.012 + (1 - p.a.pas / 100) * 0.085) * err * (kind === 'pass' ? 1 : 1.45) * (1 + p.speed / 16);
  const ang = rng.gauss(0, sigma), ca = Math.cos(ang), sa = Math.sin(ang);
  const dx = tx - b.x, dz = tz - b.z, scale = 1 + rng.gauss(0, sigma * 0.7);
  tx = b.x + (dx * ca - dz * sa) * scale; tz = b.z + (dx * sa + dz * ca) * scale;
  const d = Math.max(1, dist(b.x, b.z, tx, tz));
  const ux = (tx - b.x) / d, uz = (tz - b.z) / d;
  if (kind === 'pass' || kind === 'through') {
    const sp = clamp(groundPassSpeed(d, kind === 'pass' ? 6.8 : 5.2, m.ball.wet), 6, 27);
    return plan(kind, V().set(ux * sp, d > 28 ? 1.5 : 0, uz * sp), V(), target, 0.12, d / 40);
  }
  const vel = V();
  if (kind === 'loft') {
    lobVelocity(b.x, b.y, b.z, tx, 0.2, tz, clamp(0.85 + d / 24, 1.1, 3.4), vel);
    return plan('loft', vel, V().set(-uz * -18, 0, ux * -18), target, 0.2, d / 60);
  }
  lobVelocity(b.x, b.y, b.z, tx, 1.3, tz, clamp(0.65 + d / 30, 0.9, 2.3), vel);
  // Whipped cross curls towards goal.
  const curl = Math.sign(-b.z * dir) * 30 * dir;
  return plan('cross', vel, V().set(0, curl, 0), target, 0.2, d / 50);
}

/** Lofted ball to a point on the pitch (clearances, long free kicks, corners). */
export function planLobTo(m: MatchManager, tx: number, tz: number, T: number, type: KickType, target: Player | null = null, ty = 0.3): KickPlan {
  const b = m.ball.pos, vel = V();
  lobVelocity(b.x, b.y, b.z, clamp(tx, -HL + 1, HL - 1), ty, clamp(tz, -HW + 1, HW - 1), T, vel);
  return plan(type, vel, V(), target, 0.2, 0.8);
}

/** Plans a shot. aimZ in -1..1 picks a side of the goal (null = automatic), power 0..1 sets speed and height. */
export function planShot(m: MatchManager, p: Player, aimZ: number | null, power: number, finesse: boolean, err = 1, type: KickType = finesse ? 'finesse' : 'shot'): KickPlan {
  const b = m.ball.pos, rng = m.rng;
  const gx = p.team.goalX;
  const gk = m.teams[1 - p.team.idx].gk;
  let tz: number;
  if (aimZ !== null) tz = aimZ * (GOAL_HW - 0.45);
  else {
    const side = Math.abs(gk.z) > 0.4 ? -Math.sign(gk.z) : (Math.abs(b.z) > 3 ? -Math.sign(b.z) : rng.chance(0.5) ? 1 : -1);
    tz = side * (GOAL_HW - 0.75);
  }
  const d = dist(b.x, b.z, gx, tz);
  let ty = 0.22 + 2.35 * Math.pow(power, 2.2);
  const press = nearestOpponent(m, p).d < 1.6 ? 1.3 : 1;
  const sigma = (0.022 + (1 - p.a.sho / 100) * 0.11) * err * (finesse ? 0.6 : 1) * (1 + p.speed / 15) * press * (0.75 + power * 0.5) * (b.y > 0.5 ? 1.5 : 1);
  tz += rng.gauss(0, sigma) * d;
  ty = Math.max(0.15, ty + rng.gauss(0, sigma) * d * 0.55);
  const speed = (15 + 17 * power) * (0.86 + 0.14 * p.a.sho / 100) * (finesse ? 0.84 : 1);
  const vel = V(), spin = V();
  if (finesse) {
    // Aim outside the target and curl it back in.
    const out = Math.sign(tz || 1);
    const bend = clamp(d * 0.045, 0.3, 1.4);
    strikeVelocity(b.x, b.y, b.z, gx, ty, tz + out * bend, speed, vel);
    spin.set(0, out * Math.sign(vel.x) * (26 + p.a.sho * 0.12), 0);
  } else {
    strikeVelocity(b.x, b.y, b.z, gx, ty, tz, speed, vel);
    spin.set(0, rng.gauss(0, 4), 0);
  }
  return plan(type, vel, spin, null, finesse ? 0.22 : 0.19, power);
}

/** A header or volley towards goal, a team-mate or simply away from danger. */
export function planAerial(m: MatchManager, p: Player, mode: 'shot' | 'pass' | 'clear', target: Player | null, err = 1): KickPlan {
  const b = m.ball.pos, rng = m.rng, vel = V();
  const head = b.y > 1.0;
  const type: KickType = head ? 'header' : 'volley';
  if (mode === 'shot') {
    const gk = m.teams[1 - p.team.idx].gk;
    const side = Math.abs(gk.z) > 0.3 ? -Math.sign(gk.z) : rng.chance(0.5) ? 1 : -1;
    const gx = p.team.goalX, d = dist(b.x, b.z, gx, 0);
    const sigma = (0.045 + (1 - p.a.sho / 100) * 0.14) * err * (head ? 1.3 : 1.6);
    const tz = side * (GOAL_HW - 0.9) + rng.gauss(0, sigma) * d;
    const ty = Math.max(0.2, (head ? 0.5 : 1.0) + rng.gauss(0, sigma) * d * 0.5);
    const speed = head ? 11 + 6 * p.a.phy / 100 : 19 + 8 * p.a.sho / 100;
    strikeVelocity(b.x, b.y, b.z, gx, ty, tz, speed, vel);
    return plan(type, vel, V(), null, 0, 0.6);
  }
  if (mode === 'pass' && target) {
    const d = dist(b.x, b.z, target.x, target.z);
    const sigma = (0.04 + (1 - p.a.pas / 100) * 0.1) * err;
    strikeVelocity(b.x, b.y, b.z, target.x + target.vx * 0.5 + rng.gauss(0, sigma) * d, 0.3, target.z + target.vz * 0.5 + rng.gauss(0, sigma) * d, clamp(7 + d * 0.45, 8, 16), vel);
    return plan(type, vel, V(), target, 0, 0.4);
  }
  const dir = p.team.dir;
  const tz = clamp(b.z + Math.sign(b.z || 1) * 14 + rng.gauss(0, 4), -HW + 2, HW - 2);
  lobVelocity(b.x, b.y, b.z, clamp(b.x + dir * (head ? 16 : 30), -HL + 2, HL - 2), 0.2, tz, head ? 1.3 : 2.1, vel);
  return plan('clear', vel, V(), null, 0, 0.6);
}

export function startKick(m: MatchManager, p: Player, k: KickPlan) {
  if (p.state === 'kick' && !p.kickDone) return;
  p.setState('kick', k.at + 0.3);
  p.kick = k; p.kickDone = false; p.kickType = k.type;
  // Strike with the foot on the far side of the ball's lateral offset.
  const lx = m.ball.pos.x - p.x, lz = m.ball.pos.z - p.z;
  p.kickLeg = (lx * -p.dirZ + lz * p.dirX) >= 0 ? 1 : -1;
  if (k.at <= 0) performKick(m, p);
}

export function performKick(m: MatchManager, p: Player) {
  const k = p.kick; if (!k || p.kickDone) return;
  p.kickDone = true;
  const ball = m.ball;
  if (ball.owner !== p && dist(p.x, p.z, ball.pos.x, ball.pos.z) > (m.phase === 'setpiece' ? 4 : 1.6)) return; // lost the ball during the wind-up
  if (p.holding) { p.holding = false; ball.pos.y = k.type === 'gkthrow' ? 1.4 : 0.5; }
  if (p.state === 'throw') ball.pos.y = 2.05;
  ball.owner = null;
  ball.vel.copy(k.vel); ball.spin.copy(k.spin);
  ball.pathValid = false;
  p.kickCd = 0.3; p.ctlCd = 0.5;
  p.facing = Math.atan2(k.vel.z, k.vel.x);
  m.onKick(p, k);
}

export function startTackle(m: MatchManager, p: Player, slide: boolean) {
  if (!p.free || p.tackleCd > 0 || p.holding) return false;
  const b = m.ball.pos;
  let dx = b.x - p.x, dz = b.z - p.z;
  const d = Math.hypot(dx, dz);
  if (d > (slide ? 7 : 3.5) || d < 0.01) { dx = p.dirX; dz = p.dirZ; } else {
    const o = m.ball.owner; const lead = slide && o ? 0.25 : 0.1;
    dx += (o ? o.vx : m.ball.vel.x) * lead; dz += (o ? o.vz : m.ball.vel.z) * lead;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  }
  const sp = slide ? Math.max(7.5, p.speed + 1.5) : Math.max(4.8, p.speed * 0.9);
  p.setState(slide ? 'slide' : 'tackle', slide ? 0.85 : 0.42);
  p.actVx = dx * sp; p.actVz = dz * sp; p.facing = Math.atan2(dz, dx);
  p.tackleCd = slide ? 1.7 : 0.85; p.tackleHit = false;
  m.events.emit('tackleStart', { player: p, slide });
  return true;
}

/** Called every tick while a player is lunging or sliding. */
export function resolveTackle(m: MatchManager, p: Player) {
  if (p.tackleHit) return;
  const slide = p.state === 'slide';
  if (p.stateT < 0.05 || p.stateT > (slide ? 0.6 : 0.3)) return;
  const ball = m.ball, rng = m.rng;
  const fx = p.x + p.dirX * (slide ? 0.85 : 0.5), fz = p.z + p.dirZ * (slide ? 0.85 : 0.5);
  const dBall = dist(fx, fz, ball.pos.x, ball.pos.z);
  const o = ball.owner;
  if (!o) {
    if (dBall < 0.85 && ball.pos.y < 0.7 && p.ctlCd <= 0) {
      p.tackleHit = true;
      ball.vel.set(p.dirX * 7 + rng.gauss(0, 1), 1.5, p.dirZ * 7 + rng.gauss(0, 1));
      ball.touch(p); ball.pathValid = false; m.onLooseTouch(p);
    }
    return;
  }
  if (o.team === p.team) return;
  if (dBall > (slide ? 1.25 : 0.95)) return;
  p.tackleHit = true;
  if (o.holding) { m.foul(p, o, false); return; }
  const ax = o.x - p.x, az = o.z - p.z, al = Math.hypot(ax, az) || 1;
  const behind = (ax / al) * o.dirX + (az / al) * o.dirZ > 0.45 && o.speed > 2;
  const hot = (p.data.personality === 'Hothead' ? 1.3 : 1) * (p.data.style === 'Destroyer' ? 1.12 : 1);
  let win = (slide ? 0.7 : 0.56) + (p.a.def - o.a.dri) / 140 - (behind ? 0.25 : 0) - (o.shield ? 0.28 : 0) - (o.state === 'skill' ? 0.4 : 0) + (o.sprint ? 0.07 : 0);
  win = clamp(win, 0.08, 0.95);
  const contact = al < 1.15;
  if (rng.chance(win)) {
    const foulP = (slide ? (behind ? 0.6 : 0.1) : behind ? 0.12 : 0.02) * hot;
    if (contact && rng.chance(foulP)) { m.foul(p, o, slide && behind); return; }
    ball.owner = null; ball.touch(p); ball.pathValid = false;
    o.stats.lost++; o.ctlCd = 0.6;
    if (slide) {
      ball.vel.set(p.dirX * 7.5 + rng.gauss(0, 1.5), 1, p.dirZ * 7.5 + rng.gauss(0, 1.5));
      if (contact && rng.chance(0.5)) o.setState('down', 0.8); else o.setState('stun', 0.4);
    } else {
      ball.vel.set(p.dirX * 2.5 + o.vx * 0.3, 0, p.dirZ * 2.5 + o.vz * 0.3);
      o.setState('stun', 0.45);
      p.ctlCd = 0; p.setState('play');
    }
    p.stats.tackles++; p.team.stats.tackles++;
    m.events.emit('tackle', { player: p, on: o, clean: true });
    m.onLooseTouch(p);
  } else {
    const foulP = (slide ? (behind ? 0.9 : 0.5) : behind ? 0.4 : 0.15) * hot;
    if (contact && rng.chance(foulP)) { m.foul(p, o, slide); return; }
    if (!slide) p.setState('stun', 0.5);
  }
}

/** Skill moves: 1 step-over burst, 2 body feint, 3 roulette, 4 drag-back. */
export function startSkill(m: MatchManager, p: Player, wx: number, wz: number) {
  if (m.ball.owner !== p || p.state !== 'play' || p.holding) return false;
  const l = Math.hypot(wx, wz);
  let type = 1, dx = p.dirX, dz = p.dirZ;
  if (l > 0.3) {
    const fwd = (wx * p.dirX + wz * p.dirZ) / l, lat = (wx * -p.dirZ + wz * p.dirX) / l;
    if (fwd < -0.5) { type = 4; dx = -p.dirX; dz = -p.dirZ; }
    else if (Math.abs(lat) > 0.5) { type = 2; p.skillDir = Math.sign(lat); dx = wx / l; dz = wz / l; }
    else if (p.sprint) { type = 3; p.skillDir = m.rng.chance(0.5) ? 1 : -1; }
  } else if (p.sprint) { type = 3; p.skillDir = 1; }
  p.setState('skill', type === 3 ? 0.55 : 0.42);
  p.skill = type;
  if (type !== 3) { p.vx = dx * p.topSpeed() * 0.9; p.vz = dz * p.topSpeed() * 0.9; p.facing = Math.atan2(dz, dx); }
  p.mvX = dx; p.mvZ = dz;
  for (const o of m.teams[1 - p.team.idx].players) {
    if (!o.active || !o.free || o.isGK) continue;
    if (dist(o.x, o.z, p.x, p.z) < 3 && m.rng.chance(clamp(0.5 + (p.a.dri - o.a.def) / 110, 0.15, 0.9))) { o.setState('stun', 0.55); o.tackleCd = 0.9; }
  }
  m.events.emit('skill', { player: p, type });
  return true;
}

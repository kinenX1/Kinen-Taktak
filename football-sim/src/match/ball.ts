/** BallPhysics: gravity, drag, Magnus curve, bounce, rolling friction, post and net collisions. */
import { Vector3 } from 'three';
import { BALL_R, G, GOAL_H, GOAL_HW, HL, HW } from '../core/math';
import type { Player } from './player';

export interface BallState { x: number; y: number; z: number; vx: number; vy: number; vz: number; sx: number; sy: number; sz: number }
export type BallEvent =
  | { type: 'goal'; side: number }
  | { type: 'touch'; x: number; z: number }
  | { type: 'end'; side: number; z: number }
  | { type: 'post'; speed: number }
  | { type: 'bounce'; speed: number }
  | { type: 'net' };

const DRAG = 0.0125;
const MAGNUS = 0.0042;
const POST_R = 0.06;
const NET_DEPTH = 2.0;

function collideSegment(s: BallState, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const nx = s.x - (ax + dx * t), ny = s.y - (ay + dy * t), nz = s.z - (az + dz * t);
  const d = Math.hypot(nx, ny, nz);
  const min = BALL_R + POST_R;
  if (d >= min || d < 1e-6) return 0;
  const ux = nx / d, uy = ny / d, uz = nz / d;
  s.x += ux * (min - d); s.y += uy * (min - d); s.z += uz * (min - d);
  const vn = s.vx * ux + s.vy * uy + s.vz * uz;
  if (vn >= 0) return 0;
  const e = 0.55;
  s.vx -= (1 + e) * vn * ux; s.vy -= (1 + e) * vn * uy; s.vz -= (1 + e) * vn * uz;
  s.sx *= 0.5; s.sy *= 0.5; s.sz *= 0.5;
  return -vn;
}

/** Advances a ball state by dt. Returns an event (or null). `wet` 0..1 changes bounce and roll. */
export function stepBall(s: BallState, dt: number, wet: number, emit: boolean): BallEvent | null {
  let ev: BallEvent | null = null;
  const px = s.x, pz = s.z, py = s.y;
  const sp = Math.hypot(s.vx, s.vy, s.vz);
  const airborne = s.y > BALL_R + 0.005 || s.vy > 0.2;
  // Aerodynamics
  if (sp > 0.01) {
    const k = DRAG * sp * dt;
    s.vx -= s.vx * k; s.vy -= s.vy * k; s.vz -= s.vz * k;
    if (airborne) {
      // Magnus: a = S * (spin x v)
      s.vx += MAGNUS * (s.sy * s.vz - s.sz * s.vy) * dt;
      s.vy += MAGNUS * (s.sz * s.vx - s.sx * s.vz) * dt;
      s.vz += MAGNUS * (s.sx * s.vy - s.sy * s.vx) * dt;
    }
  }
  const sd = Math.exp(-(airborne ? 0.4 : 2.5) * dt);
  s.sx *= sd; s.sy *= sd; s.sz *= sd;
  if (airborne) s.vy -= G * dt;
  s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
  // Ground interaction
  if (s.y <= BALL_R) {
    s.y = BALL_R;
    if (s.vy < -0.9) {
      const impact = -s.vy;
      s.vy = impact * (0.6 - 0.08 * wet);
      const f = 0.78 + 0.14 * wet;
      s.vx *= f; s.vz *= f;
      // Side spin grips the turf and kicks the ball sideways a little.
      const h = Math.hypot(s.vx, s.vz);
      if (h > 0.5) { const k = s.sy * 0.006, nx = s.vz / h, nz = -s.vx / h; s.vx += nx * k; s.vz += nz * k; }
      s.sx *= 0.6; s.sy *= 0.6; s.sz *= 0.6;
      if (emit && impact > 2) ev = { type: 'bounce', speed: impact };
    } else {
      s.vy = 0;
      const h = Math.hypot(s.vx, s.vz);
      if (h > 0) {
        const dec = (2.0 - 0.6 * wet) * dt;
        if (h <= dec) { s.vx = 0; s.vz = 0; } else { const f = (h - dec) / h; s.vx *= f; s.vz *= f; }
      }
    }
  }
  // Goal frames and nets
  for (let side = -1; side <= 1; side += 2) {
    const gx = side * HL;
    if (Math.abs(s.x - gx) < 1 && Math.abs(s.z) < GOAL_HW + 1 && s.y < GOAL_H + 1) {
      const a = collideSegment(s, gx, 0, -GOAL_HW, gx, GOAL_H, -GOAL_HW) + collideSegment(s, gx, 0, GOAL_HW, gx, GOAL_H, GOAL_HW)
        + collideSegment(s, gx, GOAL_H, -GOAL_HW, gx, GOAL_H, GOAL_HW);
      if (a > 0 && emit) ev = { type: 'post', speed: a };
    }
    const depth = side * s.x - HL, pDepth = side * px - HL;
    if (depth > 0 && depth < NET_DEPTH + 1) {
      const wasIn = pDepth > -0.3 && Math.abs(pz) < GOAL_HW && py < GOAL_H;
      const nowIn = Math.abs(s.z) < GOAL_HW && s.y < GOAL_H && depth < NET_DEPTH;
      let hit = false;
      if (wasIn) {
        if (depth > NET_DEPTH - BALL_R) { s.x = side * (HL + NET_DEPTH - BALL_R); s.vx *= -0.08; s.vy *= 0.5; s.vz *= 0.5; hit = true; }
        if (Math.abs(s.z) > GOAL_HW - BALL_R) { s.z = Math.sign(s.z) * (GOAL_HW - BALL_R); s.vz *= -0.08; s.vx *= 0.5; hit = true; }
        if (s.y > GOAL_H - BALL_R) { s.y = GOAL_H - BALL_R; s.vy *= -0.08; s.vx *= 0.5; hit = true; }
        const d = Math.exp(-2.2 * dt); s.vx *= d; s.vz *= d;
      } else if (nowIn && pDepth > 0) {
        // Hitting the outside of the net: push the ball back out.
        if (Math.abs(pz) >= GOAL_HW) { s.z = Math.sign(pz) * (GOAL_HW + BALL_R); s.vz *= -0.2; }
        else if (py >= GOAL_H) { s.y = GOAL_H + BALL_R; s.vy *= -0.2; }
        else { s.x = side * (HL + NET_DEPTH + BALL_R); s.vx *= -0.2; }
        hit = true;
      }
      if (hit && emit && sp > 3 && !ev) ev = { type: 'net' };
    }
  }
  if (emit) {
    for (let side = -1; side <= 1; side += 2) {
      if (side * s.x > HL + BALL_R) {
        if (Math.abs(s.z) < GOAL_HW && s.y < GOAL_H) return { type: 'goal', side };
        if (side * px <= HL + BALL_R || Math.abs(s.z) >= GOAL_HW) return { type: 'end', side, z: s.z };
      }
    }
    if (Math.abs(s.z) > HW + BALL_R && Math.abs(s.x) <= HL + BALL_R) return { type: 'touch', x: s.x, z: s.z };
  }
  // Perimeter boards keep the ball inside the arena.
  if (Math.abs(s.x) > HL + 5.5) { s.x = Math.sign(s.x) * (HL + 5.5); s.vx *= -0.3; }
  if (Math.abs(s.z) > HW + 4.5) { s.z = Math.sign(s.z) * (HW + 4.5); s.vz *= -0.3; }
  return ev;
}

export const PREDICT_N = 45;
export const PREDICT_DT = 0.1;

export class Ball {
  pos = new Vector3(0, BALL_R, 0);
  vel = new Vector3();
  spin = new Vector3();
  owner: Player | null = null;
  lastTouch: Player | null = null;
  /** Second to last toucher (for assists). */
  prevTouch: Player | null = null;
  wet = 0;
  /** Predicted trajectory: PREDICT_N points of (x,y,z) at PREDICT_DT spacing. */
  path = new Float32Array(PREDICT_N * 3);
  pathValid = false;
  private st: BallState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0 };

  toState(s: BallState = this.st) {
    s.x = this.pos.x; s.y = this.pos.y; s.z = this.pos.z; s.vx = this.vel.x; s.vy = this.vel.y; s.vz = this.vel.z;
    s.sx = this.spin.x; s.sy = this.spin.y; s.sz = this.spin.z;
    return s;
  }
  fromState(s: BallState) { this.pos.set(s.x, s.y, s.z); this.vel.set(s.vx, s.vy, s.vz); this.spin.set(s.sx, s.sy, s.sz); }
  step(dt: number): BallEvent | null {
    const s = this.toState();
    const ev = stepBall(s, dt, this.wet, true);
    this.fromState(s);
    return ev;
  }
  place(x: number, z: number, y = BALL_R) { this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.spin.set(0, 0, 0); this.pathValid = false; }
  get speed() { return this.vel.length(); }
  get hSpeed() { return Math.hypot(this.vel.x, this.vel.z); }
  touch(p: Player) { if (this.lastTouch !== p) { this.prevTouch = this.lastTouch; this.lastTouch = p; } }
  predict() {
    const s: BallState = { ...this.toState() };
    const sub = 1 / 60;
    for (let i = 0; i < PREDICT_N; i++) {
      this.path[i * 3] = s.x; this.path[i * 3 + 1] = s.y; this.path[i * 3 + 2] = s.z;
      for (let k = 0; k < 6; k++) stepBall(s, sub, this.wet, false);
    }
    this.pathValid = true;
  }
}

/** Initial speed for a ground pass that arrives at `arrive` m/s after `d` metres. */
export function groundPassSpeed(d: number, arrive: number, wet: number) {
  const a = 2.0 - 0.6 * wet;
  return Math.sqrt(arrive * arrive + 2 * a * d) * (1 + 0.006 * d);
}
const tmp: BallState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0 };
/** Velocity for a lofted ball from A that lands on B after roughly T seconds (drag compensated). */
export function lobVelocity(ax: number, ay: number, az: number, bx: number, by: number, bz: number, T: number, out: Vector3) {
  const dx = bx - ax, dz = bz - az;
  const d = Math.max(0.5, Math.hypot(dx, dz));
  const ux = dx / d, uz = dz / d;
  let h = d / T;
  const vy = 0.5 * G * T + (by - ay) / T;
  for (let it = 0; it < 4; it++) {
    tmp.x = 0; tmp.y = ay; tmp.z = 0; tmp.vx = h; tmp.vy = vy; tmp.vz = 0; tmp.sx = tmp.sy = tmp.sz = 0;
    let reached = 0;
    for (let i = 0; i < 400; i++) {
      // Advance without ground logic so the landing point is where it comes back down to target height.
      const sp = Math.hypot(tmp.vx, tmp.vy);
      const k = DRAG * sp * (1 / 60);
      tmp.vx -= tmp.vx * k; tmp.vy -= tmp.vy * k; tmp.vy -= G / 60;
      tmp.x += tmp.vx / 60; tmp.y += tmp.vy / 60;
      if (tmp.vy < 0 && tmp.y <= by) { reached = tmp.x; break; }
    }
    if (reached <= 0) break;
    h *= d / reached;
  }
  return out.set(ux * h, vy, uz * h);
}
/** Velocity for a struck ball of given speed that passes through a target point (drag compensated). */
export function strikeVelocity(ax: number, ay: number, az: number, bx: number, by: number, bz: number, speed: number, out: Vector3) {
  const dx = bx - ax, dz = bz - az;
  const d = Math.max(0.5, Math.hypot(dx, dz));
  const ux = dx / d, uz = dz / d;
  let vy = ((by - ay) + 0.5 * G * (d / speed) * (d / speed)) / (d / speed);
  for (let it = 0; it < 3; it++) {
    const h = Math.sqrt(Math.max(1, speed * speed - vy * vy));
    let x = 0, y = ay, vx = h, v2 = vy, t = 0;
    for (let i = 0; i < 300 && x < d; i++) {
      const sp = Math.hypot(vx, v2), k = DRAG * sp / 120;
      vx -= vx * k; v2 -= v2 * k; v2 -= G / 120; x += vx / 120; y += v2 / 120; t += 1 / 120;
      if (y < BALL_R) { y = BALL_R; if (v2 < 0) v2 = 0; }
    }
    if (t > 0) vy += (by - y) / t * 0.9;
  }
  vy = Math.min(vy, speed * 0.8);
  const h = Math.sqrt(Math.max(1, speed * speed - vy * vy));
  return out.set(ux * h, vy, uz * h);
}

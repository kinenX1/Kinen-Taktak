/** CameraManager: broadcast-style match cameras plus cinematic shots for intros, set pieces, celebrations and replays. */
import * as THREE from 'three';
import { HL, HW, clamp, damp } from '../core/math';
import type { CameraMode } from '../core/settings';

export type Shot = { kind: 'match' } | { kind: 'orbit'; radius: number; height: number; speed: number; look: THREE.Vector3 } | { kind: 'intro' }
  | { kind: 'follow'; target: () => THREE.Vector3; facing: () => number; dist: number; height: number; fov: number }
  | { kind: 'behind'; from: THREE.Vector3; to: THREE.Vector3; dist: number; height: number; fov: number }
  | { kind: 'replay'; variant: number };

export class CameraManager {
  mode: CameraMode = 'broadcast';
  zoom = 1;
  /** Height multiplier for the match cameras (user adjustable). */
  height = 1;
  shot: Shot = { kind: 'match' };
  shotT = 0;
  /** Direction (+1/-1) the end-to-end camera looks along. */
  dir = 1;
  basis = { rx: 1, rz: 0, ux: 0, uz: -1 };
  private pos = new THREE.Vector3(0, 30, 70);
  private look = new THREE.Vector3();
  private fov = 32;
  private snap = true;
  private shake = 0;

  constructor(public camera: THREE.PerspectiveCamera) {}
  setShot(s: Shot, cut = true) { this.shot = s; this.shotT = 0; if (cut) this.snap = true; }
  kick(amount: number) { this.shake = Math.max(this.shake, amount); }

  update(dt: number, ball: THREE.Vector3, time: number) {
    this.shotT += dt;
    const tp = new THREE.Vector3(), tl = new THREE.Vector3();
    let fov = 32, rate = 4;
    const s = this.shot;
    this.basis = { rx: 1, rz: 0, ux: 0, uz: -1 };
    if (s.kind === 'match') {
      const z = this.zoom, hk = this.height, bx = ball.x, bz = ball.z;
      const nearGoal = clamp((Math.abs(bx) - 30) / 22, 0, 1);
      switch (this.mode) {
        case 'tele': tp.set(clamp(bx * 0.94, -46, 46), 9.5 * z * hk, 34 * z + bz * 0.3); tl.set(bx, 0.6, bz * 0.8 - 0.5); fov = 27; break;
        case 'tactical': tp.set(clamp(bx * 0.55, -30, 30), 66 * z * hk, 56 * z); tl.set(bx * 0.75, 0, bz * 0.4 - 3); fov = 36; break;
        case 'endtoend': {
          const d = this.dir;
          tp.set(clamp(bx - d * 22 * z, -HL - 20, HL + 20), 11 * z * hk, bz * 0.7); tl.set(bx + d * 10, 0, bz * 0.9); fov = 42;
          this.basis = { rx: 0, rz: d, ux: d, uz: 0 };
          break;
        }
        case 'dynamic': tp.set(clamp(bx * 0.86, -42, 42), (17 - 5 * nearGoal) * z * hk, (40 - 7 * nearGoal) * z + bz * 0.25); tl.set(bx, 0.3, bz * 0.75 - 1.5); fov = 30 - 3 * nearGoal; break;
        default: tp.set(clamp(bx * 0.88, -44, 44), 18 * z * hk, 42 * z + bz * 0.28); tl.set(bx, 0, bz * 0.78 - 1.5); fov = 30;
      }
      rate = 3.2;
    } else if (s.kind === 'orbit') {
      const a = time * s.speed;
      tp.set(Math.cos(a) * s.radius * 1.25, s.height + Math.sin(a * 0.7) * 4, Math.sin(a) * s.radius); tl.copy(s.look); fov = 38; rate = 50;
    } else if (s.kind === 'intro') {
      const k = clamp(this.shotT / 7, 0, 1), e = k * k * (3 - 2 * k);
      const a = -1.9 + e * 2.4;
      tp.set(Math.cos(a) * (150 - 78 * e), 95 - 68 * e, Math.sin(a) * (120 - 54 * e) + 8); tl.set(0, 6 - 6 * e, 0); fov = 40 - 8 * e; rate = 50;
    } else if (s.kind === 'follow') {
      const t = s.target(), f = s.facing();
      tp.set(t.x + Math.cos(f) * s.dist, s.height, t.z + Math.sin(f) * s.dist); tl.set(t.x, 1.25, t.z); fov = s.fov; rate = 2.2;
    } else if (s.kind === 'behind') {
      const d = new THREE.Vector3().subVectors(s.to, s.from).setY(0).normalize();
      tp.copy(s.from).addScaledVector(d, -s.dist).setY(s.height); tl.copy(s.from).lerp(s.to, 0.55).setY(1.2); fov = s.fov; rate = 5;
      this.basis = Math.abs(d.x) > 0.5 ? { rx: 0, rz: Math.sign(d.x), ux: Math.sign(d.x), uz: 0 } : this.basis;
    } else {
      // Replay angles follow the recorded ball.
      if (s.variant === 0) { const sx = Math.sign(ball.x || 1); tp.set(sx * (HL + 9), 5.5, clamp(ball.z * 0.3, -8, 8) + 9); tl.set(ball.x, ball.y * 0.6 + 0.8, ball.z); fov = 30; }
      else if (s.variant === 1) { tp.set(clamp(ball.x * 0.85, -46, 46) - Math.sign(ball.x || 1) * 6, 2.2, HW + 6); tl.set(ball.x, ball.y * 0.5 + 1, ball.z); fov = 24; }
      else { tp.set(ball.x - Math.sign(ball.x || 1) * 16, 9, ball.z * 0.4 - 14); tl.set(ball.x, 1, ball.z); fov = 34; }
      rate = 6;
    }
    if (this.snap) { this.pos.copy(tp); this.look.copy(tl); this.fov = fov; this.snap = false; }
    else {
      this.pos.x = damp(this.pos.x, tp.x, rate, dt); this.pos.y = damp(this.pos.y, tp.y, rate, dt); this.pos.z = damp(this.pos.z, tp.z, rate, dt);
      const lr = rate * 1.6;
      this.look.x = damp(this.look.x, tl.x, lr, dt); this.look.y = damp(this.look.y, tl.y, lr, dt); this.look.z = damp(this.look.z, tl.z, lr, dt);
      this.fov = damp(this.fov, fov, 3, dt);
    }
    this.shake = Math.max(0, this.shake - dt * 1.4);
    const sh = this.shake * this.shake * 0.5;
    this.camera.position.set(this.pos.x + Math.sin(time * 47) * sh, Math.max(1.2, this.pos.y + Math.sin(time * 53) * sh), this.pos.z);
    this.camera.lookAt(this.look);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
  }
}

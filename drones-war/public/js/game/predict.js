// Client-side prediction for the player's own unit (contract §7).
// The unit is stepped with the shared physics at a fixed 60 Hz using exactly the input that was sent
// for each seq. Every tick's resulting state is recorded with its seq; when a snapshot acknowledges a
// seq, the server state is compared with the last state predicted under that seq. Real divergences are
// corrected in the simulation state at once (and in the stored history so the next ack does not count
// them twice) while a visual offset absorbs the jump and decays over ~150 ms, so the screen never
// snaps. Tiny differences from tick phase (the server applies each input for one or two ticks) fall in
// a speed-scaled dead band and are ignored, which keeps fast units (jets) free of correction jitter.
import { U, UNITS, UNIT_TYPES } from '../shared/units.js';
import { newUnitState, stepUnit, aimAngles, slewAim, angleDiff, wrapAngle } from '../shared/physics.js';

export const TICK = 1 / 60;
const HISTORY = 120; // 2 s of ticks
const SNAP_DIST = 4;
const KEYS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'pitch', 'roll', 'spd', 'throttle', 'aimYaw', 'aimPitch'];

function copyState(dst, s) {
  for (const k of KEYS) dst[k] = s[k];
  dst.onGround = s.onGround;
  dst.crouch = s.crouch;
  dst.sprint = s.sprint;
  dst.ads = s.ads;
  dst.out = s.out;
  return dst;
}

export class Predictor {
  constructor(index) {
    this.index = index;
    this.type = null;
    this.def = null;
    this.s = null;
    this.prev = null;
    this.history = [];
    this.offset = { x: 0, y: 0, z: 0, yaw: 0 };
    this.render = {};
    this.corrections = 0;
    this.snaps = 0;
    this.lastResult = { impact: 0, crashed: false };
  }

  get active() {
    return !!this.s;
  }

  // Hard reset from a server row (spawn, respawn, type change, big error).
  reset(row) {
    const type = UNIT_TYPES[row[U.TYPE]];
    this.type = type;
    this.def = UNITS[type];
    const s = newUnitState(type);
    this.applyRow(s, row);
    this.s = s;
    this.prev = copyState({}, s);
    this.history.length = 0;
    this.offset.x = this.offset.y = this.offset.z = this.offset.yaw = 0;
    this.snaps++;
  }

  clear() {
    this.s = null;
    this.history.length = 0;
  }

  applyRow(s, row) {
    s.x = row[U.X]; s.y = row[U.Y]; s.z = row[U.Z];
    s.vx = row[U.VX]; s.vy = row[U.VY]; s.vz = row[U.VZ];
    s.yaw = row[U.YAW]; s.pitch = row[U.PITCH]; s.roll = row[U.ROLL];
    s.aimYaw = row[U.AIMYAW]; s.aimPitch = row[U.AIMPITCH];
    s.spd = row[U.SPD]; s.throttle = row[U.THROTTLE];
    const f = row[U.FLAGS];
    s.onGround = !!(f & 2); s.crouch = !!(f & 4); s.sprint = !!(f & 8); s.ads = !!(f & 16); s.out = !!(f & 32);
  }

  // One fixed tick with the input sent under `seq`. aimPoint drives the local turret slew (visual).
  step(input, seq, aimPoint) {
    const s = this.s;
    if (!s) return this.lastResult;
    copyState(this.prev, s);
    const res = stepUnit(s, input, TICK, this.def, this.index);
    if (this.def.kind !== 'soldier' && this.def.kind !== 'jet' && aimPoint) {
      const [wy, wp] = aimAngles(s, this.def, aimPoint);
      slewAim(s, this.def, wy, wp, TICK);
    }
    const h = copyState({ seq }, s);
    this.history.push(h);
    if (this.history.length > HISTORY) this.history.shift();
    this.lastResult = res;
    return res;
  }

  // Compare the server's state at `ack` with what we predicted for it.
  reconcile(row) {
    const s = this.s;
    if (!s) return;
    const ack = row[U.ACK];
    const hist = this.history;
    let i = -1;
    for (let j = hist.length - 1; j >= 0; j--) {
      if (hist[j].seq === ack) { i = j; break; }
      if (hist[j].seq < ack) break;
    }
    if (i < 0) {
      // Nothing recorded for that seq (just spawned, or a long stall): trust the server if far off.
      if (Math.hypot(row[U.X] - s.x, row[U.Z] - s.z) > SNAP_DIST) this.reset(row);
      return;
    }
    const h = hist[i];
    hist.splice(0, i); // older entries can never be acknowledged again
    const ex = row[U.X] - h.x;
    const ey = row[U.Y] - h.y;
    const ez = row[U.Z] - h.z;
    const err = Math.hypot(ex, ey, ez);
    if (err > SNAP_DIST) {
      this.reset(row);
      return;
    }
    const kind = this.def.kind;
    const speed = Math.hypot(h.vx, h.vy, h.vz);
    // Dead band ≈ one and a half ticks of travel plus server rounding.
    const band = 0.03 + speed * TICK * 1.5;
    const c = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, spd: 0, vx: 0, vy: 0, vz: 0, throttle: 0 };
    let any = false;
    if (err > band) {
      // Correct the part beyond the band fully when large, gently when small (filters noise).
      const f = err > 1 ? 1 : 0.5;
      const k = ((err - band) / err) * f;
      c.x = ex * k; c.y = ey * k; c.z = ez * k;
      any = true;
    }
    if (kind === 'ground' || kind === 'jet') {
      const eyaw = angleDiff(h.yaw, row[U.YAW]);
      if (Math.abs(eyaw) > 0.02 + Math.abs(h.spd) * 0.0006) { c.yaw = eyaw * 0.5; any = true; }
      const espd = row[U.SPD] - h.spd;
      if (Math.abs(espd) > 0.5) { c.spd = espd * 0.5; any = true; }
    }
    if (kind === 'jet') {
      const ep = row[U.PITCH] - h.pitch;
      if (Math.abs(ep) > 0.03) { c.pitch = ep * 0.5; any = true; }
      const et = row[U.THROTTLE] - h.throttle;
      if (Math.abs(et) > 0.04) { c.throttle = et; any = true; }
    }
    if (kind === 'air' || kind === 'soldier') {
      const evx = row[U.VX] - h.vx;
      const evy = row[U.VY] - h.vy;
      const evz = row[U.VZ] - h.vz;
      if (Math.hypot(evx, evy, evz) > 1.5) { c.vx = evx * 0.5; c.vy = evy * 0.5; c.vz = evz * 0.5; any = true; }
    }
    if (!any) return;
    this.corrections++;
    // Shift the present and every not-yet-acknowledged prediction by the same correction.
    for (let j = 0; j < hist.length; j++) this._shift(hist[j], c);
    this._shift(s, c);
    this._shift(this.prev, c);
    this.offset.x -= c.x;
    this.offset.y -= c.y;
    this.offset.z -= c.z;
    if (kind !== 'soldier') this.offset.yaw -= c.yaw;
  }

  _shift(o, c) {
    o.x += c.x; o.y += c.y; o.z += c.z;
    o.vx += c.vx; o.vy += c.vy; o.vz += c.vz;
    o.yaw = wrapAngle(o.yaw + c.yaw);
    o.pitch += c.pitch;
    o.spd += c.spd;
    o.throttle = Math.min(1, Math.max(0, o.throttle + c.throttle));
    if (o.y < 0) o.y = 0;
  }

  // State to draw: blend of the last two ticks (alpha = accumulator / TICK) plus the decaying offset.
  renderState(alpha, dt) {
    const s = this.s;
    const p = this.prev;
    const r = this.render;
    if (!s) return null;
    const decay = Math.exp(-dt / 0.05); // ≈ 150 ms to fade out 95 %
    const o = this.offset;
    o.x *= decay; o.y *= decay; o.z *= decay; o.yaw *= decay;
    const l = (k) => p[k] + (s[k] - p[k]) * alpha;
    const la = (k) => p[k] + angleDiff(p[k], s[k]) * alpha;
    r.x = l('x') + o.x;
    r.y = Math.max(0, l('y') + o.y);
    r.z = l('z') + o.z;
    r.vx = s.vx; r.vy = s.vy; r.vz = s.vz;
    r.yaw = wrapAngle(la('yaw') + o.yaw);
    r.pitch = l('pitch');
    r.roll = l('roll');
    r.aimYaw = la('aimYaw');
    r.aimPitch = l('aimPitch');
    r.spd = l('spd');
    r.throttle = s.throttle;
    r.onGround = s.onGround;
    r.crouch = s.crouch;
    r.sprint = s.sprint;
    r.ads = s.ads;
    r.out = s.out;
    return r;
  }
}

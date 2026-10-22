// Snapshot buffer: keeps ~1.5 s of server states, estimates the server clock and samples any unit or
// projectile at a render time 100 ms in the past, interpolating between the two snapshots around it.
import { U, P } from '../shared/units.js';
import { angleDiff } from '../shared/physics.js';

export const INTERP_MS = 100;
const KEEP = 32;

export class SnapBuffer {
  constructor() {
    this.snaps = [];
    this.offset = null; // server time − performance.now()
    this.rt = 0; // smoothed render time (server ms)
  }

  push(msg, now) {
    const units = new Map();
    for (const row of msg.units) units.set(row[U.ID], row);
    const proj = new Map();
    for (const row of msg.proj || []) proj.set(row[P.ID], row);
    const snap = { time: msg.time, units, proj };
    const last = this.snaps[this.snaps.length - 1];
    if (last && msg.time <= last.time) {
      // Out of order or duplicate time (should not happen over TCP): replace the newest.
      if (msg.time === last.time) this.snaps[this.snaps.length - 1] = snap;
      else return snap;
    } else this.snaps.push(snap);
    if (this.snaps.length > KEEP) this.snaps.shift();
    // Clock: follow early arrivals quickly and late ones slowly, so the estimate hugs the
    // least-delayed packets and network jitter does not shake the render time.
    const sample = msg.time - now;
    if (this.offset === null || Math.abs(sample - this.offset) > 1000) this.offset = sample;
    else this.offset += (sample - this.offset) * (sample > this.offset ? 0.25 : 0.02);
    return snap;
  }

  get latest() {
    return this.snaps[this.snaps.length - 1] || null;
  }

  // Advances the smoothed render time by real time and nudges it toward the target.
  advance(now, dt) {
    if (this.offset === null) return this.rt;
    const target = now + this.offset - INTERP_MS;
    this.rt += dt * 1000;
    const err = target - this.rt;
    if (Math.abs(err) > 250) this.rt = target;
    else this.rt += err * Math.min(1, dt * 3);
    return this.rt;
  }

  // Finds the snapshots around time t: { a, b, k } (b may be null when t is past the newest).
  bracket(t) {
    const s = this.snaps;
    if (!s.length) return null;
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i].time <= t) {
        const b = s[i + 1] || null;
        return { a: s[i], b, k: b ? (t - s[i].time) / (b.time - s[i].time) : (t - s[i].time) / 1000 };
      }
    }
    return { a: s[0], b: null, k: 0 };
  }
}

// Interpolated unit state into `out` (plain object), or false when the unit is not in the window.
export function sampleUnit(br, id, out) {
  if (!br) return false;
  const ra = br.a.units.get(id);
  const rb = br.b ? br.b.units.get(id) : null;
  if (!ra && !rb) return false;
  let a = ra || rb;
  let b = rb || ra;
  let k = ra && rb ? br.k : 0;
  // Respawn / death: never blend across an alive flip or a teleport.
  if (ra && rb && ((ra[U.FLAGS] ^ rb[U.FLAGS]) & 1 || Math.abs(ra[U.X] - rb[U.X]) + Math.abs(ra[U.Z] - rb[U.Z]) > 60)) {
    a = b = k > 0.5 ? rb : ra;
    k = 0;
  }
  const lerp = (i) => a[i] + (b[i] - a[i]) * k;
  const alerp = (i) => a[i] + angleDiff(a[i], b[i]) * k;
  out.row = b;
  if (!br.b && ra) {
    // Past the newest snapshot: extrapolate a little along the velocity (≤ 120 ms).
    const ex = Math.min(br.k, 0.12);
    out.x = a[U.X] + a[U.VX] * ex;
    out.y = Math.max(0, a[U.Y] + a[U.VY] * ex);
    out.z = a[U.Z] + a[U.VZ] * ex;
  } else {
    out.x = lerp(U.X);
    out.y = lerp(U.Y);
    out.z = lerp(U.Z);
  }
  out.yaw = alerp(U.YAW);
  out.pitch = alerp(U.PITCH);
  out.roll = alerp(U.ROLL);
  out.aimYaw = alerp(U.AIMYAW);
  out.aimPitch = alerp(U.AIMPITCH);
  out.spd = lerp(U.SPD);
  out.vx = lerp(U.VX);
  out.vy = lerp(U.VY);
  out.vz = lerp(U.VZ);
  out.throttle = lerp(U.THROTTLE);
  const f = b[U.FLAGS];
  out.flags = f;
  out.alive = !!(f & 1);
  out.onGround = !!(f & 2);
  out.crouch = !!(f & 4);
  out.sprint = !!(f & 8);
  out.ads = !!(f & 16);
  out.firing = !!(f & 256);
  out.weapon = b[U.WEAPON];
  return true;
}

// Interpolated projectile position/velocity; projectiles first seen in the newer snapshot are
// placed back along their velocity so they appear at the muzzle instead of popping in mid-flight.
export function sampleProj(br, id, out) {
  if (!br) return false;
  const a = br.a.proj.get(id);
  const b = br.b ? br.b.proj.get(id) : null;
  if (!a && !b) return false;
  if (a && b) {
    const k = br.k;
    out.x = a[P.X] + (b[P.X] - a[P.X]) * k;
    out.y = a[P.Y] + (b[P.Y] - a[P.Y]) * k;
    out.z = a[P.Z] + (b[P.Z] - a[P.Z]) * k;
    out.vx = a[P.VX] + (b[P.VX] - a[P.VX]) * k;
    out.vy = a[P.VY] + (b[P.VY] - a[P.VY]) * k;
    out.vz = a[P.VZ] + (b[P.VZ] - a[P.VZ]) * k;
    out.row = b;
    return true;
  }
  const r = a || b;
  // Seconds from the row's snapshot to the render time (negative for the newer one).
  const dt = a ? Math.min(br.k * (br.b ? (br.b.time - br.a.time) / 1000 : 1), 0.15) : (br.k - 1) * ((br.b.time - br.a.time) / 1000);
  if (!a && dt < -0.06) return false; // not launched yet at render time
  out.x = r[P.X] + r[P.VX] * dt;
  out.y = r[P.Y] + r[P.VY] * dt;
  out.z = r[P.Z] + r[P.VZ] * dt;
  out.vx = r[P.VX];
  out.vy = r[P.VY];
  out.vz = r[P.VZ];
  out.row = r;
  return true;
}

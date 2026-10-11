// Camera rig for Drones War 3D: mouse-look angles, chase / first-person / gunner / cockpit views,
// building collision, smooth FOV (ADS, zoom, jet speed kick), trauma shake and the death cam.
//
// Look angles follow the shared convention: yaw 0 looks along +X, increasing yaw turns right,
// positive pitch looks up. Rotation is never smoothed (mouse look must stay 1:1); only the
// positions, distances and FOV ease, which is what keeps it comfortable.
import * as THREE from 'three';
import { VIEW_MODES } from './shared/units.js';

// Per unit and view: chase distance / pivot height / shoulder offset, how tightly the pivot
// follows the unit (lag, 1/s), the eye height used when a model has no anchor, and pitch limits.
export const CAMERA_PRESETS = {
  soldier: {
    third: { dist: 2.35, height: 1.58, side: 0.62, lag: 40, pitch: [-1.4, 1.35] },
    first: { eye: 1.62, pitch: [-1.45, 1.45] },
  },
  jeep: {
    third: { dist: 8.2, height: 3.1, side: 0, lag: 14, pitch: [-1.2, 0.75] },
    first: { eye: 1.55, pitch: [-0.75, 0.9] },
  },
  tank: {
    third: { dist: 12, height: 4.8, side: 0, lag: 12, pitch: [-1.2, 0.7] },
    first: { eye: 2.1, pitch: [-0.6, 0.8] },
    gunner: { eye: 2.55, pitch: [-0.15, 0.35] },
  },
  mlrs: {
    third: { dist: 13, height: 5.4, side: 0, lag: 12, pitch: [-1.2, 0.75] },
    first: { eye: 2.3, pitch: [-0.7, 0.9] },
  },
  drone: {
    third: { dist: 4.4, height: 1.25, side: 0, lag: 16, pitch: [-1.45, 0.9] },
    first: { eye: -0.05, pitch: [-1.5, 0.5] },
  },
  heli: {
    third: { dist: 19, height: 6.2, side: 0, lag: 10, pitch: [-1.3, 0.8] },
    first: { eye: 2.0, pitch: [-1.2, 0.6] },
  },
  jet: {
    third: { dist: 23, height: 5.6, side: 0, lag: 18, pitch: [-1.2, 1.2], roll: 0.12 },
    first: { eye: 1.9, pitch: [-1.2, 1.2] },
  },
};

const TWO_PI = Math.PI * 2;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.8;
const COLLIDE_MARGIN = 0.28; // keep the near plane off the walls
const PROBE = 0.18; // half-size of the 4 extra collision rays around the centre ray
const JET_FOV_KICK = 12; // degrees at full speed
const SPRINT_FOV_KICK = 5;

const wrap = (a) => {
  a = (a + Math.PI) % TWO_PI;
  return (a < 0 ? a + TWO_PI : a) - Math.PI;
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// Frame-rate independent exponential approach factor.
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);

// Smooth pseudo-noise in [-1, 1] for the shake (sum of incommensurate sines, cheap and continuous).
const wobble = (t, s) => (Math.sin(t * 13.1 + s) * 0.55 + Math.sin(t * 27.7 + s * 2.3) * 0.3 + Math.sin(t * 51.3 + s * 4.1) * 0.15);

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _o = new THREE.Vector3();
const _want = new THREE.Vector3();
const _c = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0;
    this.mode = 'third';
    this.type = 'soldier';
    this.zoom = 1; // third-person distance multiplier (mouse wheel)
    this.trauma = 0;
    this.time = 0;
    this._pivot = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this._dist = -1; // current (collision-limited, eased) chase distance; < 0 = snap next frame
    this._snap = true;
    this._ads = 0; // 0..1 third-person aim blend (closer over-the-shoulder camera)
    this._kickP = 0; // visual recoil punch, recovers by itself
    this._kickY = 0;
    this._fov = camera.fov;
    this._raycast = null;
    this._death = null; // { angle, radius }
    this._limits = CAMERA_PRESETS.soldier.first.pitch;
  }

  // Switch to a unit type; mode resets to its default view unless keepMode and still valid.
  setUnit(type, { keepMode = false } = {}) {
    const modes = VIEW_MODES[type] || ['third'];
    this.type = CAMERA_PRESETS[type] ? type : 'soldier';
    if (!keepMode || !modes.includes(this.mode)) this.mode = modes[0];
    this._applyLimits();
    this._snap = true;
  }

  addLook(dx, dy) {
    this.yaw = wrap(this.yaw + dx);
    this.pitch = clamp(this.pitch + dy, this._limits[0], this._limits[1]);
  }

  cycleMode() {
    const modes = VIEW_MODES[this.type] || ['third'];
    this.mode = modes[(modes.indexOf(this.mode) + 1) % modes.length];
    this._applyLimits();
    this._snap = true;
    return this.mode;
  }

  zoomDistance(delta) {
    // Wheel delta in pixels (≈ ±100 per notch): multiplicative so it feels even at any distance.
    this.zoom = clamp(this.zoom * Math.exp(delta * 0.0012), ZOOM_MIN, ZOOM_MAX);
  }

  // Trauma-based shake: amount 0..1 adds trauma, the visible shake is trauma² so small hits stay subtle.
  shake(amount) {
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount));
  }

  // Visual-only recoil punch (radians); recovers on its own and never changes the look angles.
  kick(pitch, yaw = 0) {
    this._kickP = Math.min(0.08, this._kickP + pitch);
    this._kickY = clamp(this._kickY + yaw, -0.04, 0.04);
  }

  forward(out = new THREE.Vector3()) {
    const c = Math.cos(this.pitch);
    return out.set(c * Math.cos(this.yaw), Math.sin(this.pitch), c * Math.sin(this.yaw));
  }

  // target = { position, yaw, pitch, roll, type, anchor, alive, spd, crouch?, sprint? }
  // opts = { raycast(origin, dir, maxDist) → dist, zoomFov, baseFov, dt }
  update(dt, target, opts = {}) {
    dt = Math.min(Math.max(dt || opts.dt || 0, 0), 0.1);
    this.time += dt;
    if (opts.raycast) this._raycast = opts.raycast;
    if (target.type && target.type !== this.type && CAMERA_PRESETS[target.type]) this.setUnit(target.type, { keepMode: true });
    if (this._death) {
      this._death = null;
      this._snap = true;
    }
    const preset = CAMERA_PRESETS[this.type];
    const cam = this.camera;
    const zoomed = opts.zoomFov != null;
    let roll = 0;

    if (this.mode === 'third' || !preset[this.mode]) {
      const p = preset.third;
      this._ads += ((zoomed ? 1 : 0) - this._ads) * ease(10, dt);
      const crouchDrop = target.crouch && this.type === 'soldier' ? 0.45 : 0;
      _want.copy(target.position);
      _want.y += p.height - crouchDrop;
      if (this._snap || this._pivot.distanceToSquared(_want) > 400) this._pivot.copy(_want);
      else {
        // Horizontal and vertical follow separately: vertical is softer so jumps and bumps don't jolt.
        const k = ease(p.lag, dt);
        this._pivot.x += (_want.x - this._pivot.x) * k;
        this._pivot.z += (_want.z - this._pivot.z) * k;
        this._pivot.y += (_want.y - this._pivot.y) * ease(p.lag * 0.6, dt);
      }
      // Over-the-shoulder ADS: tighter and slightly closer to the shoulder line.
      const dist = p.dist * this.zoom * (1 - 0.42 * this._ads);
      const side = p.side * (1 - 0.15 * this._ads);
      this.forward(_dir);
      _right.set(-Math.sin(this.yaw), 0, Math.cos(this.yaw));
      // Offset from the pivot to the wanted camera spot.
      _v.copy(_dir).multiplyScalar(-dist).addScaledVector(_right, side);
      let len = _v.length();
      const allowed = this._collide(this._pivot, _v, len);
      if (this._snap || this._dist < 0 || allowed < this._dist) this._dist = allowed; // pull in instantly
      else this._dist += (allowed - this._dist) * ease(3.5, dt); // ease back out slowly
      len = Math.max(len, 1e-6);
      cam.position.copy(this._pivot).addScaledVector(_v, this._dist / len);
      if (cam.position.y < 0.3) cam.position.y = 0.3;
      if (p.roll) roll = (target.roll || 0) * p.roll;
    } else {
      const p = preset[this.mode];
      this._ads = 0;
      if (target.anchor) {
        target.anchor.updateWorldMatrix(true, false);
        target.anchor.getWorldPosition(_want);
      } else {
        _want.copy(target.position);
        _want.y += target.crouch && this.type === 'soldier' ? CAMERA_PRESETS.soldier.first.eye * 0.69 : p.eye;
      }
      if (this.type === 'soldier' && !this._snap && Math.abs(_want.y - this._eye.y) < 3) {
        // Ease only the height: softens crouch transitions and landings, never lags the aim.
        this._eye.set(_want.x, this._eye.y + (_want.y - this._eye.y) * ease(22, dt), _want.z);
      } else this._eye.copy(_want);
      cam.position.copy(this._eye);
      this._pivot.copy(_want);
      this._dist = -1;
      // Cockpits bank with the aircraft so the horizon tilts like the real thing.
      if (this.type === 'heli' || this.type === 'jet') roll = target.roll || 0;
    }
    this._snap = false;

    // FOV: ADS/zoom target, plus a speed kick for jets and a small sprint kick on foot.
    const base = opts.baseFov || 78;
    let fov = zoomed ? opts.zoomFov : base;
    if (!zoomed && this.type === 'jet') {
      const s = clamp(((target.spd || 0) - 45) / 70, 0, 1);
      fov += JET_FOV_KICK * s * s;
    } else if (!zoomed && this.type === 'soldier' && target.sprint) fov += SPRINT_FOV_KICK;
    this._fov += (fov - this._fov) * ease(zoomed ? 14 : 9, dt);
    if (Math.abs(cam.fov - this._fov) > 0.01) {
      cam.fov = this._fov;
      cam.updateProjectionMatrix();
    }

    this._orient(dt, this.pitch, this.yaw, roll);
  }

  // Slow orbit around the killer or your wreck; eases in from wherever the camera was.
  deathCam(center, dt) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    this.time += dt;
    const cam = this.camera;
    if (!this._death) {
      const a = Math.atan2(cam.position.z - center.z, cam.position.x - center.x);
      this._death = { angle: Number.isFinite(a) ? a : 0 };
    }
    this._death.angle += 0.28 * dt;
    _c.copy(center);
    _c.y += 1.6;
    const radius = 11;
    _v.set(Math.cos(this._death.angle) * radius, 4.5, Math.sin(this._death.angle) * radius);
    const len = _v.length();
    const allowed = this._collide(_c, _v, len);
    _want.copy(_c).addScaledVector(_v, allowed / len);
    if (_want.y < 0.5) _want.y = 0.5;
    if (cam.position.distanceToSquared(_want) > 250000) cam.position.copy(_want);
    else cam.position.lerp(_want, ease(2.5, dt));
    cam.lookAt(_c);
    this._fov += (70 - this._fov) * ease(3, dt);
    if (Math.abs(cam.fov - this._fov) > 0.01) {
      cam.fov = this._fov;
      cam.updateProjectionMatrix();
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.2);
  }

  // How far (≤ len) the camera can go from origin along offset before hitting the world.
  _collide(origin, offset, len) {
    const ray = this._raycast;
    if (!ray || len < 1e-4) return len;
    _dir.copy(offset).divideScalar(len);
    // Centre ray plus four parallel rays around it approximate the near-plane's footprint.
    _up.set(0, 1, 0);
    _right.crossVectors(_dir, _up);
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
    _right.normalize();
    _up.crossVectors(_right, _dir).normalize();
    let best = len + COLLIDE_MARGIN;
    for (let i = 0; i < 5; i++) {
      const sx = i === 1 ? 1 : i === 2 ? -1 : 0;
      const sy = i === 3 ? 1 : i === 4 ? -1 : 0;
      _o.copy(origin).addScaledVector(_right, sx * PROBE).addScaledVector(_up, sy * PROBE);
      const d = ray(_o, _dir, len + COLLIDE_MARGIN);
      if (d != null && Number.isFinite(d) && d < best) best = d;
    }
    return clamp(best - COLLIDE_MARGIN, 0.05, len);
  }

  _orient(dt, pitch, yaw, roll) {
    this.trauma = Math.max(0, this.trauma - dt * 1.25);
    this._kickP *= Math.exp(-14 * dt);
    this._kickY *= Math.exp(-14 * dt);
    const s = this.trauma * this.trauma;
    const t = this.time;
    const sp = s * 0.045 * wobble(t, 1.7) + this._kickP;
    const sy = s * 0.045 * wobble(t, 5.3) + this._kickY;
    const sr = s * 0.06 * wobble(t, 9.1);
    this.camera.rotation.set(pitch + sp, -(yaw + sy) - Math.PI / 2, -roll + sr, 'YXZ');
  }

  _applyLimits() {
    const preset = CAMERA_PRESETS[this.type];
    this._limits = (preset[this.mode] || preset.third).pitch;
    this.pitch = clamp(this.pitch, this._limits[0], this._limits[1]);
  }
}

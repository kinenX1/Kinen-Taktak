// Base classes of the unit models: UnitModel (shared plumbing) and VehicleModel (kinematics helpers).
//
// A unit model is a THREE.Group (`object`) holding one skinned rig instance. Rigs are built once per
// (type, team, quality, paint) as a *template* (kit.js Rig: parts on bones, merged per material) and every
// unit only owns its bones and skeleton, so many tanks cost a few draw calls each.
//
// ------------------------------------------------------------------------------------------------
// Public interface (all models, including the soldier adapter in models.js):
//
//   object                THREE.Group, root at the unit root (wheel base / track base / skids / feet)
//   anchors               { first, gunner|null, muzzle[], nameplate, center, eject[], dust[], exhaust[], ... }
//                         Object3Ds; muzzle[i] is weapon slot i and fires along its local +X
//   update(st, dt, time)  pose from the decoded state (net.js decodeRow keys + hp01); also places `object`
//   flash(slot, shot)     a trigger pull: muzzle flash mesh + per-weapon recoil
//   muzzleWorld(slot, outPos, outDir, shot)   world muzzle position and unit direction (Vector3, array or {x,y,z})
//   setView('third'|'first'|'gunner')         hide parts that would clip the camera
//   setWrecked(on)        burnt look + wreck pose (also automatic when st.alive === false)
//   setFlashFactory(make) make(size) -> Object3D firing along +X (kit.createMuzzleFlash)
//   dispose()             detach and free per-instance resources (templates stay cached, see releaseModels)
//
// Orientation: local +X forward, +Y up, +Z right. update() sets object.position = (x, y, z) and
// object.rotation = (roll, -yaw, pitch, 'YZX'), so callers only pass state. Turrets and guns are driven from
// the ABSOLUTE aim angles of the physics state: turret.rotation.y = -wrapAngle(aimYaw - yaw),
// gun.rotation.z = aimPitch (verified against physics.muzzlePosition, see test/models.test.mjs).
//
// ------------------------------------------------------------------------------------------------
// Writing a model (M2: aircraft). Subclass VehicleModel (or UnitModel) and fill in four hooks:
//
//   class HeliModel extends VehicleModel {
//     constructor(opts) { super('heli', opts); }
//     // 1. TEMPLATE: runs once per template key with kit detail already set. The rig already has the bone
//     //    'root'. Add bones/geometry and return a plain data object (stored as tpl.info):
//     static buildRig(rig, ctx) {
//       // ctx = { type, team, suit, quality, q (0..3), hi (q>=2), mid (q>=1), paint (body finish),
//       //         teamHex, teamGlow, decals { roundel, stripe, mat }, def (UNITS[type]) }
//       rig.bone('fuselage', 'root'); rig.add('fuselage', loft(...), ctx.paint); ...
//       return {
//         margin: 2,                                   // extra bounding radius for moving parts
//         anchors: {                                   // { bone?: name (default: object), p: [x,y,z], r?: [x,y,z] }
//           first: {...}, gunner: null, nameplate: {...}, center: {...},
//           muzzle: [{ bone: 'chin', p: [..], flash: 0.8, tubes: [[0,0,0],...] }, ...],   // per weapon slot
//           eject: [...], dust: [...], exhaust: [...], wingtips: [...]                    // any extra list works
//         },
//         hide: { first: ['bone', ...], gunner: [...] }, // LEAF bones scaled to 0 in that view (never anchor parents)
//         ...anything else your animation needs (wheel radius, rotor bones, ...)
//       };
//     }
//     // 2. INSTANCE: after the bones and anchors exist. Set per-instance state here. Do NOT use class fields
//     //    for state that _init sets (they would be initialised after super() returns and overwrite it).
//     _init() { super._init(); this.rotor = 0; }
//     // 3. POSE every frame. `this.k` has the derived kinematics (spd, yawRate, accel, vf, vr), `this.kickT[slot]`
//     //    the seconds since the last flash(slot), this.info = tpl.info, this.b = bones by name. Set EVERY bone
//     //    you animate on every call (the base class restores the bind pose when a wreck is revived).
//     _animate(st, dt, time) { ... }
//     // 4. OPTIONAL: _wreckPose(t, dt, st) (t eases 0..1 after the wreck swap), _onFlash(slot, shot),
//     //    _onView(mode), _onWreck(on), _dispose().
//   }
//   registerUnitModel('heli', HeliModel);   // bottom of vehicle-air.js; models.js must import './vehicle-air.js'
//
// Never allocate in update/_animate (use module-level scratch vectors). All incoming numbers must go through
// num() so garbage state (NaN, undefined, strings) cannot throw or poison the transforms.
import * as THREE from 'three';
import {
  Rig, instantiateRig, setDetail, getDetail, qlevel, QUALITY_LEVEL, burntMaterial, uber, glow, decal, decalMaterial, DECAL,
  clamp, damp,
} from './kit.js';
import { vehiclePaint, TEAM_HEX } from '../suit.js';
import { sanitizeSuit } from '../shared/suit-options.js';
import { UNITS } from '../shared/units.js';
import { wrapAngle } from '../shared/physics.js';

export const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const TAU = Math.PI * 2;
const EMPTY = Object.freeze({});

// ---------- registries (kept here, not in models.js, so sibling modules can register without import cycles) ----------

const unitClasses = new Map();
const factories = { projectile: null, hq: null };

export function registerUnitModel(type, ctor) {
  if (!Object.hasOwn(UNITS, type)) throw new Error(`registerUnitModel: unknown unit type "${type}"`);
  if (typeof ctor !== 'function') throw new TypeError(`registerUnitModel: constructor for "${type}" must be a class`);
  unitClasses.set(type, ctor);
}
export const unitModelClass = (type) => unitClasses.get(type) || null;
export const registeredUnitTypes = () => [...unitClasses.keys()];
export function registerProjectileFactory(fn) { factories.projectile = fn; }
export function registerHQFactory(fn) { factories.hq = fn; }
export const projectileFactory = () => factories.projectile;
export const hqFactory = () => factories.hq;

// ---------- template cache ----------

const MAX_TEMPLATES = 24;
const templates = new Map(); // key -> { tpl, refs, used }
let useClock = 0;

function disposeTemplate(tpl) {
  for (const m of tpl.meshes) m.geometry.dispose();
}

function acquireTemplate(key, make) {
  let e = templates.get(key);
  if (!e) {
    e = { tpl: make(), refs: 0, used: 0 };
    templates.set(key, e);
    // Evict least recently used templates nobody is using (rare: a match has at most 7 types x 2 teams).
    while (templates.size > MAX_TEMPLATES) {
      let victim = null;
      for (const [k, v] of templates) if (v.refs === 0 && v !== e && (!victim || v.used < victim[1].used)) victim = [k, v];
      if (!victim) break;
      disposeTemplate(victim[1].tpl);
      templates.delete(victim[0]);
    }
  }
  e.refs++;
  e.used = ++useClock;
  return e;
}

/** Build a template without instantiating it (lobby preload). Returns true when it had to be built. */
export function preloadTemplate(key, make) {
  const fresh = !templates.has(key);
  acquireTemplate(key, make).refs--;
  return fresh;
}

/** Free every cached vehicle template (geometry). Live models keep drawing (three re-uploads on demand). */
export function disposeTemplates() {
  for (const e of templates.values()) disposeTemplate(e.tpl);
  templates.clear();
}
export const templateCount = () => templates.size;
export const hasTemplate = (key) => templates.has(key);

// ---------- helpers ----------

/** Key of the body paint: team colours, or the player's camo when the suit asks for painted vehicles. */
export function paintKey(suit, team) {
  const s = suit ? sanitizeSuit(suit) : null;
  if (s && s.paintVehicles) return `camo|${s.camo}|${s.c1},${s.c2},${s.c3},${s.c4}`;
  return 'team|' + (team === 'atk' ? 'atk' : 'def');
}

// Writes x,y,z into a Vector3, an array or a plain {x,y,z}.
export function put(out, x, y, z) {
  if (!out) return out;
  if (typeof out.set === 'function') out.set(x, y, z);
  else if (Array.isArray(out)) { out[0] = x; out[1] = y; out[2] = z; } else { out.x = x; out.y = y; out.z = z; }
  return out;
}

// Deterministic cosmetic randomness (flash roll), independent of Math.random so screenshots repeat.
let rndState = 0x9e3779b9;
function rnd() {
  rndState = (Math.imul(rndState, 1664525) + 1013904223) >>> 0;
  return rndState / 4294967296;
}

/** Recoil curve: kicks back fast (0.06 s) then returns smoothly over `T` seconds. 1 at the peak. */
export function recoilCurve(t, T = 0.6) {
  if (!(t >= 0)) return 0;
  if (t < 0.06) return t / 0.06;
  const u = clamp((t - 0.06) / T, 0, 1);
  return (1 - u) * (1 - u) * (1 - u);
}

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _bind = new THREE.Vector3();

// ---------- UnitModel ----------

export class UnitModel {
  /** Rig options for the template (override as a static property in a subclass). */
  static RIG = { ground: 0.35, ao: 1 };

  /** Kit detail level is set while this runs; returns the info object (see the header). */
  static buildRig() { throw new Error(`${this.name}.buildRig is not implemented`); }

  /** Build (or fetch) the template for these options. */
  static template(type, opts) {
    const o = normalizeOpts(opts);
    const key = templateKey(type, o);
    return acquireTemplate(key, () => this.buildTemplate(type, o)).tpl;
  }

  static buildTemplate(type, { team, suit, quality }) {
    const q = qlevel(quality);
    const prev = getDetail();
    setDetail(q);
    try {
      const rig = new Rig(this.RIG);
      rig.bone('root');
      const def = UNITS[type];
      const teamHex = TEAM_HEX[team];
      const ctx = {
        type, team, suit, quality, q, hi: q >= 2, mid: q >= 1, def, teamHex,
        paint: { mat: uber(vehiclePaint(suit, team)), c: 0xffffff, r: 0.7, m: 0.12 },
        teamGlow: glow(teamHex, 1.2),
        decals: { roundel: DECAL.roundel[team], stripe: DECAL.stripe[team], mat: decalMaterial(), DECAL, decal },
      };
      const info = this.buildRig(rig, ctx) || {};
      const tpl = rig.build({ margin: info.margin ?? 1 });
      tpl.info = info;
      return tpl;
    } finally {
      setDetail(prev);
    }
  }

  /** Lobby preload: build the template only. Returns true when something was built. */
  static preload(type, opts) {
    const o = normalizeOpts(opts);
    return preloadTemplate(templateKey(type, o), () => this.buildTemplate(type, o));
  }

  constructor(type, opts) {
    const o = normalizeOpts(opts);
    this.type = type;
    this.def = UNITS[type];
    this.team = o.team;
    this.quality = o.quality;
    this.key = templateKey(type, o);
    const Ctor = new.target;
    this._entry = acquireTemplate(this.key, () => Ctor.buildTemplate(type, o));
    const tpl = (this.tpl = this._entry.tpl);
    this.info = tpl.info;
    this.inst = instantiateRig(tpl);
    this.b = this.inst.bones;
    this.object = new THREE.Group();
    this.object.name = type;
    this.object.add(this.inst.root);

    this.time = 0;
    this.hp01 = 1;
    this.view = 'third';
    this.wrecked = false;
    this.wreckT = 0;
    this.wreckSeed = 0;
    this.disposed = false;
    this._forced = false;
    this._hidden = [];
    this._own = []; // per-instance materials to dispose
    this.kickT = [99, 99];
    this.flashes = [];
    this.muzzles = [];
    this.anchors = this._makeAnchors(tpl.info.anchors || {});
    this._init();
  }

  // ----- hooks -----

  _init() {}
  _prepare() {} // before _animate/_wreckPose (VehicleModel computes the kinematics here)
  _animate() {}
  _wreckPose() {}
  _onFlash() {}
  _onView() {}
  _onWreck() {}
  _dispose() {}

  // ----- anchors -----

  _makeAnchors(d) {
    const def = this.def;
    const mk = (a) => {
      const o = new THREE.Object3D();
      o.position.fromArray(a.p || [0, 0, 0]);
      if (a.r) o.rotation.set(a.r[0], a.r[1], a.r[2]);
      (a.bone && this.b[a.bone] ? this.b[a.bone] : this.object).add(o);
      return o;
    };
    const out = {};
    for (const k of Object.keys(d)) {
      const v = d[k];
      out[k] = Array.isArray(v) ? v.map(mk) : v ? mk(v) : null;
    }
    out.first = out.first || mk({ p: [0, def.aim ? def.aim.height : def.height, 0] });
    if (out.gunner === undefined) out.gunner = null;
    out.nameplate = out.nameplate || mk({ p: [0, def.height + 0.9, 0] });
    out.center = out.center || mk({ p: [0, def.height * 0.5, 0] });
    out.muzzle = out.muzzle || [];
    for (let i = 0; i < def.weapons.length; i++) {
      if (!out.muzzle[i]) out.muzzle[i] = mk({ p: [def.weapons[i].muzzle || 0, def.aim ? def.aim.height : 0, 0] });
    }
    for (const k of ['eject', 'dust', 'exhaust']) out[k] = out[k] || [];
    // Per-slot muzzle data: tube offsets for salvos and flash settings.
    const md = d.muzzle || [];
    for (let i = 0; i < out.muzzle.length; i++) this.muzzles[i] = md[i] || {};
    return out;
  }

  // ----- flashes -----

  /** make(size) -> Object3D that fires along +X (kit.createMuzzleFlash). Replaces any earlier flashes. */
  setFlashFactory(make) {
    for (const f of this.flashes) if (f) for (const e of f.list) e.obj.removeFromParent();
    this.flashes = [];
    if (typeof make !== 'function') return;
    for (let i = 0; i < this.anchors.muzzle.length; i++) {
      const md = this.muzzles[i];
      const list = [];
      for (let k = 0; k < (md.pool || 1); k++) {
        const obj = make(md.flash || 1);
        obj.visible = false;
        this.anchors.muzzle[i].add(obj);
        list.push({ obj, t: 0 });
      }
      this.flashes[i] = { list, next: 0, dur: md.dur || 0.06 };
    }
  }

  flash(slot, shot = 0) {
    slot = slot === 1 ? 1 : 0;
    if (this.disposed || this.wrecked) return;
    this.kickT[slot] = 0;
    const f = this.flashes[slot];
    if (f) {
      const e = f.list[f.next];
      f.next = (f.next + 1) % f.list.length;
      e.t = f.dur;
      e.obj.visible = true;
      e.obj.rotation.x = rnd() * Math.PI;
      const tubes = this.muzzles[slot] && this.muzzles[slot].tubes;
      if (tubes) e.obj.position.fromArray(tubes[Math.abs(shot | 0) % tubes.length]);
    }
    this._onFlash(slot, shot | 0);
  }

  /** World position and unit direction of a weapon slot's muzzle. `shot` selects the tube of a salvo. */
  muzzleWorld(slot, outPos, outDir, shot = 0) {
    slot = this.anchors.muzzle[slot] ? slot : 0;
    const a = this.anchors.muzzle[slot];
    if (!a) return outPos;
    a.updateWorldMatrix(true, false);
    const tubes = this.muzzles[slot] && this.muzzles[slot].tubes;
    if (tubes) _v.fromArray(tubes[Math.abs(shot | 0) % tubes.length]); else _v.set(0, 0, 0);
    _v.applyMatrix4(a.matrixWorld);
    put(outPos, _v.x, _v.y, _v.z);
    if (outDir) {
      _d.set(1, 0, 0).transformDirection(a.matrixWorld);
      put(outDir, _d.x, _d.y, _d.z);
    }
    return outPos;
  }

  // ----- views -----

  setView(mode) {
    mode = mode === 'first' || mode === 'gunner' ? mode : 'third';
    if (mode === this.view) return;
    this.view = mode;
    this._applyView();
    this._onView(mode);
  }

  _applyView() {
    for (const n of this._hidden) if (this.b[n]) this.b[n].scale.setScalar(1);
    const hide = this.info.hide && this.info.hide[this.view];
    this._hidden = hide ? hide.slice() : [];
    for (const n of this._hidden) if (this.b[n]) this.b[n].scale.setScalar(0);
  }

  // ----- wrecks -----

  setWrecked(on) {
    this._forced = !!on;
    this._syncWreck(false);
  }

  _syncWreck(dead) {
    const want = this._forced || dead;
    if (want === this.wrecked) return;
    this.wrecked = want;
    this.wreckT = 0;
    const burnt = want ? burntMaterial() : null;
    for (const m of this.inst.meshes) {
      const base = m.userData.baseMaterial;
      const u = base.userData;
      if (want) {
        if (u.glow || u.noShadow || base.transparent) m.visible = false; // lights, glass, decals
        else m.material = burnt;
      } else {
        m.visible = true;
        m.material = base;
      }
    }
    if (!want) this.resetPose();
    this._onWreck(want);
  }

  /** Restore the bind pose of every bone (then re-apply the hidden view parts). */
  resetPose() {
    for (const k of Object.keys(this.b)) {
      const bone = this.b[k];
      bone.position.copy(bone.userData.bindP);
      bone.quaternion.copy(bone.userData.bindQ);
      bone.scale.set(1, 1, 1);
    }
    for (const n of this._hidden) if (this.b[n]) this.b[n].scale.setScalar(0);
  }

  /** Swap a template mesh's material for a per-instance clone (scrolling tracks, tinted lights...). */
  ownMaterial(mesh, material) {
    mesh.material = material;
    mesh.userData.baseMaterial = material;
    this._own.push(material);
    return material;
  }

  // ----- frame -----

  update(st, dt = 1 / 60, time = 0) {
    if (this.disposed) return;
    if (!st || typeof st !== 'object') st = EMPTY;
    dt = clamp(num(dt, 1 / 60), 0, 0.1);
    this.time += dt;
    const o = this.object;
    const yaw = num(st.yaw);
    o.position.set(num(st.x), num(st.y), num(st.z));
    o.rotation.set(num(st.roll), -yaw, num(st.pitch), 'YZX');
    this.hp01 = clamp(num(st.hp01, 1), 0, 1);
    this._syncWreck(st.alive === false);
    this.kickT[0] += dt;
    this.kickT[1] += dt;
    this._prepare(st, dt);
    if (this.wrecked) {
      this.wreckT = damp(this.wreckT, 1, 4, dt);
      this._wreckPose(this.wreckT, dt, st);
    } else {
      this._animate(st, dt, num(time, this.time) || this.time);
    }
    for (const f of this.flashes) {
      if (!f) continue;
      for (const e of f.list) {
        if (e.t > 0) {
          e.t -= dt;
          if (e.t <= 0) e.obj.visible = false;
        }
      }
    }
  }

  // ----- stats -----

  get triangles() { return this.tpl.tris; }
  get drawCalls() { return this.inst.meshes.length; }

  // ----- lifetime -----

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._dispose();
    this.setFlashFactory(null);
    this.inst.skeleton.dispose();
    for (const m of this._own) {
      if (m.map && m.map.userData && m.map.userData.own) m.map.dispose();
      m.dispose();
    }
    this._own.length = 0;
    this.object.removeFromParent();
    this._entry.refs = Math.max(0, this._entry.refs - 1);
  }
}

function normalizeOpts(opts) {
  const o = opts && typeof opts === 'object' ? opts : EMPTY;
  return {
    team: o.team === 'atk' ? 'atk' : 'def',
    suit: o.suit || null,
    quality: Object.hasOwn(QUALITY_LEVEL, o.quality) ? o.quality : 'high',
  };
}

function templateKey(type, o) {
  return `${type}|${o.team}|${o.quality}|${paintKey(o.suit, o.team)}`;
}

// ---------- VehicleModel ----------

/**
 * Adds the derived kinematics every vehicle animation needs. `this.k`:
 *   spd      signed forward speed (m/s)        yawRate  smoothed turn rate (rad/s, + = right)
 *   accel    smoothed forward acceleration     vf, vr   world velocity in the body frame (forward, right)
 * and wheel/turret drive helpers.
 */
export class VehicleModel extends UnitModel {
  _init() {
    this.k = { spd: 0, yawRate: 0, accel: 0, vf: 0, vr: 0, yaw: 0, x: 0, z: 0, fresh: true };
  }

  /** Forget the motion history (call after teleporting a model, e.g. when it is reused for a respawn). */
  reset() { this.k.fresh = true; }

  _prepare(st, dt) {
    const k = this.k;
    const yaw = num(st.yaw), x = num(st.x), z = num(st.z);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    if (k.fresh || Math.hypot(x - k.x, z - k.z) > 30) {
      k.fresh = false;
      k.yaw = yaw;
      k.yawRate = 0;
      k.accel = 0;
      k.spd = num(st.spd);
    }
    let vx = st.vx, vz = st.vz;
    if (!Number.isFinite(vx) || !Number.isFinite(vz)) {
      vx = dt > 1e-4 ? (x - k.x) / dt : 0;
      vz = dt > 1e-4 ? (z - k.z) / dt : 0;
    }
    const spd = Number.isFinite(st.spd) ? st.spd : vx * c + vz * s;
    if (dt > 1e-4) {
      const rate = clamp(wrapAngle(yaw - k.yaw) / dt, -6, 6);
      const acc = clamp((spd - k.spd) / dt, -40, 40);
      k.yawRate = damp(k.yawRate, rate, 14, dt);
      k.accel = damp(k.accel, acc, 8, dt);
    }
    k.vf = vx * c + vz * s;
    k.vr = -vx * s + vz * c;
    k.spd = spd;
    k.yaw = yaw;
    k.x = x;
    k.z = z;
  }

  /** Relative turret angle for a bone that rotates about +Y: -(aimYaw - yaw), wrapped. */
  turretAngle(st) {
    const yaw = num(st.yaw);
    return -wrapAngle(num(st.aimYaw, yaw) - yaw);
  }

  /** Spin a wheel bone (axis +Z) as if it rolled `dist` metres forward (radius r). */
  spin(bone, dist, r) {
    bone.rotation.z = (bone.rotation.z - dist / r) % TAU;
  }

  /** Bone position at rest (bind pose) into a scratch vector. */
  bindPos(bone) { return _bind.copy(bone.userData.bindP); }
}

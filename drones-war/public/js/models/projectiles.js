// Projectile meshes (rocket, shell, artillery, bomb, missile, grenade) and a pool that follows the
// snapshot rows.
//
// Every mesh is oriented along +X (its nose), so `quaternion.setFromUnitVectors(+X, velocityDir)` points
// it along its flight path, and a roll about the local X axis spins it. Geometry is built once per
// (kind, team, quality) with the kit's Rig (one bone), converted to plain static Meshes and shared by every
// instance; only the little Group wrapper is per projectile. The exhaust parts (glowing nozzle, additive
// plume) are separate children so they can flicker without moving the body.
//
// Trail kinds for effects.trail(id, pos, kind) are in PROJECTILE_INFO[kind].trail (the bomb has none:
// Effects has no 'bomb' case, so the caller should skip the trail for it).
//
//   const pool = new ProjectilePool({ parent: scene, quality });
//   // every frame, with the interpolated projectile rows:
//   pool.beginFrame();
//   for (const p of rows) pool.set(p.id, p.kind, p.team, p.x, p.y, p.z, p.vx, p.vy, p.vz, dt);
//   pool.endFrame();               // releases (hides + recycles) every id that was not set this frame
//   // onRelease(id, entry) fires for each release so the caller can effects.endTrail(id) / spawn effects.
//   pool.dispose();                // when the match ends; releaseProjectileMeshes() frees the geometry caches
import * as THREE from 'three';
import {
  Rig, setDetail, getDetail, qlevel, segs, F, fin, glow, cylX, latheX, extrude, sph, box,
  additiveMaterial, flameTexture,
} from './kit.js';
import { buildGrenade } from './weapons.js';
import { PROJ_KINDS, TEAMS, UNITS } from '../shared/units.js';
import { TEAM_HEX } from '../suit.js';

// ---------- per-kind data ----------

/**
 * trail: effects.trail kind (null = none), length/radius: model size in metres, spin: roll rate rad/s about
 * the flight axis, orient: how the mesh follows the velocity ('velocity' snaps to it, 'settle' eases to it
 * after a wobble, 'tumble' ignores it and tumbles about a fixed random axis).
 */
export const PROJECTILE_INFO = {
  rocket: { trail: 'rocket', length: 1.13, radius: 0.05, spin: 11, orient: 'velocity' },
  shell: { trail: 'shell', length: 0.9, radius: 0.06, spin: 0, orient: 'velocity' },
  artillery: { trail: 'artillery', length: 2.4, radius: 0.1, spin: 3, orient: 'velocity' },
  bomb: { trail: null, length: 0.9, radius: 0.14, spin: 0, orient: 'settle' },
  missile: { trail: 'missile', length: 3, radius: 0.09, spin: 8, orient: 'velocity' },
  grenade: { trail: 'grenade', length: 0.1, radius: 0.048, spin: 0, orient: 'tumble' },
};

const GRENADE_SCALE = 1.5; // real grenades are 6.4 cm: bigger so they can be followed in flight
const FUSE = (UNITS.soldier.grenade && UNITS.soldier.grenade.fuse) || 2.4;
const TAU = Math.PI * 2;

/** 'rocket' | 3 | garbage -> a valid kind name (garbage becomes 'rocket'). */
export function kindName(kind) {
  if (typeof kind === 'number') return PROJ_KINDS[kind | 0] || 'rocket';
  return Object.hasOwn(PROJECTILE_INFO, kind) ? kind : 'rocket';
}
const teamName = (t) => (t === 'atk' || t === 1 ? 'atk' : 'def');

// ---------- geometry ----------

const olive = fin(0x4d5438, 0.62, 0.25);
const yellow = fin(0xd9b21e, 0.55, 0.05);
const ogiveGrey = fin(0x6f7478, 0.42, 0.6);
const white = fin(0xd8d9d4, 0.38, 0.15);

// Fins: `count` flat plates around the X axis. `pts` is the outline in (x along the body, y radial) coordinates.
function fins(rig, count, pts, thick, x, r0, finish, phase = 0) {
  for (let k = 0; k < count; k++) {
    const g = extrude(pts, thick);
    g.translate(0, r0, 0);
    rig.add('root', g, finish, [x, 0, 0], [phase + (k * TAU) / count, 0, 0]);
  }
}

// A plume is a tapered cone behind the nozzle: bright at x = 0 (the nozzle), transparent at x = -len.
function plume(rig, len, r, color, opacity) {
  const m = additiveMaterial(color, opacity, flameTexture());
  rig.add('root', cylX(r, len, 10, 0.0001), m, [-len / 2, 0, 0]);
}

// Open tube (no end caps) along X: bands and rings that sit flush on a body, half the triangles of cylX.
const tubeX = (r, h, n = 12) => new THREE.CylinderGeometry(r, r, h, segs(n), 1, true).rotateZ(-Math.PI / 2);

// Lathe profiles are [radius, x] and MUST ascend in x (tail to nose): descending order flips the faces.
function buildBody(kind, b, g, p, team, hi) {
  const tc = { c: TEAM_HEX[team] || TEAM_HEX.def, r: 0.5, m: 0.1 };
  switch (kind) {
    case 'rocket': { // RPG-7 / pod rocket: HEAT head, sustainer tube, six fins
      b.add('root', latheX([[0, -0.14], [0.03, -0.14], [0.039, -0.08], [0.049, 0.0], [0.049, 0.17], [0.042, 0.3],
        [0.025, 0.43], [0.008, 0.54], [0, 0.57]], 12), olive);
      b.add('root', cylX(0.026, 0.4, 8), F.darkSteel, [-0.34, 0, 0]);
      b.add('root', latheX([[0, -0.56], [0.034, -0.56], [0.03, -0.54], [0.026, -0.52]], 8), F.heat);
      b.add('root', tubeX(0.0515, 0.034, 12), tc, [0.07, 0, 0]);
      b.add('root', tubeX(0.0505, 0.012, 12), F.darkSteel, [0.2, 0, 0]);
      fins(b, hi ? 6 : 4, [[0, 0], [0.24, 0], [0.24, 0.05], [0.14, 0.085], [0, 0.085]], 0.006, -0.54, 0.024, F.steel);
      g.add('root', cylX(0.024, 0.02, 8), glow(0xffb060, 3.4));
      p.add('root', cylX(0.03, 0.9, 8, 0.0001), additiveMaterial(0xffa347, 0.8, flameTexture()), [-0.45, 0, 0]);
      p.add('root', cylX(0.014, 0.5, 6, 0.0001), additiveMaterial(0xfff0d0, 0.9, flameTexture()), [-0.25, 0, 0]);
      return { glowAt: -0.57, plumeAt: -0.57 };
    }
    case 'shell': { // 120 mm APFSDS dart: dark penetrator, finned tail, a long tracer streak
      b.add('root', latheX([[0, -0.45], [0.058, -0.44], [0.058, -0.3], [0.055, -0.28], [0.03, -0.26], [0.03, 0.22], [0.027, 0.3],
        [0.014, 0.4], [0, 0.45]], 10), F.gunmetal);
      b.add('root', tubeX(0.0595, 0.03, 10), tc, [-0.2, 0, 0]);
      b.add('root', tubeX(0.0595, 0.02, 10), F.darkSteel, [-0.36, 0, 0]);
      fins(b, 4, [[0, 0], [0.2, 0], [0.2, 0.045], [0, 0.075]], 0.008, -0.45, 0.04, F.darkSteel, Math.PI / 4);
      g.add('root', cylX(0.05, 0.012, 8), glow(0xff9a40, 4));
      p.add('root', cylX(0.07, 3, 8, 0.0001), additiveMaterial(0xff8a30, 0.55, flameTexture()), [-1.5, 0, 0]);
      p.add('root', cylX(0.03, 1.6, 6, 0.0001), additiveMaterial(0xfff0cc, 0.8, flameTexture()), [-0.8, 0, 0]);
      return { glowAt: -0.46, plumeAt: -0.46 };
    }
    case 'artillery': { // MLRS rocket: grey warhead, olive motor, four big fins
      b.add('root', latheX([[0, 0.42], [0.1, 0.42], [0.1, 0.5], [0.086, 0.75], [0.062, 0.95], [0.03, 1.12], [0, 1.2]], 12), ogiveGrey);
      b.add('root', cylX(0.1, 1.42, 12), olive, [-0.29, 0, 0]);
      b.add('root', latheX([[0, -1.18], [0.108, -1.18], [0.092, -1.06], [0.1, -1.0]], 12), F.heat);
      b.add('root', tubeX(0.1025, 0.08, 12), yellow, [0.46, 0, 0]);
      b.add('root', tubeX(0.1025, 0.07, 12), tc, [0.24, 0, 0]);
      b.add('root', tubeX(0.1035, 0.02, 12), F.soot, [0.66, 0, 0]);
      fins(b, 4, [[0, 0], [0.62, 0], [0.62, 0.02], [0.46, 0.24], [0.12, 0.26], [0, 0.12]], 0.016, -1.18, 0.09, F.steel, Math.PI / 4);
      g.add('root', cylX(0.075, 0.03, 10), glow(0xffb060, 3.6));
      p.add('root', cylX(0.1, 2.6, 8, 0.0001), additiveMaterial(0xffa040, 0.75, flameTexture()), [-1.3, 0, 0]);
      p.add('root', cylX(0.045, 1.4, 6, 0.0001), additiveMaterial(0xfff2d6, 0.9, flameTexture()), [-0.7, 0, 0]);
      return { glowAt: -1.2, plumeAt: -1.2 };
    }
    case 'bomb': { // drone bomb: olive teardrop with a yellow band and a finned tail ring
      b.add('root', latheX([[0, -0.4], [0.05, -0.38], [0.085, -0.32], [0.125, -0.22], [0.14, -0.1], [0.14, 0.15], [0.128, 0.28],
        [0.09, 0.38], [0.04, 0.43], [0, 0.45]], 12), olive);
      b.add('root', tubeX(0.1425, 0.07, 12), yellow, [0.02, 0, 0]);
      b.add('root', tubeX(0.1385, 0.03, 12), tc, [0.22, 0, 0]);
      b.add('root', cylX(0.016, 0.05, 6), F.steel, [0.46, 0, 0]);
      b.add('root', box(0.06, 0.03, 0.03), F.darkSteel, [0.0, 0.145, 0]);
      // Tail shroud: outer wall plus an inner wall (descending profile = faces turned inward).
      b.add('root', latheX([[0.204, -0.45], [0.204, -0.3]], 12), F.steel);
      b.add('root', latheX([[0.198, -0.3], [0.198, -0.45]], 12), F.darkSteel);
      fins(b, 4, [[0, 0], [0.26, 0], [0.26, 0.2], [0, 0.2]], 0.014, -0.45, 0.04, F.steel, Math.PI / 4);
      return { glowAt: 0, plumeAt: 0 };
    }
    case 'missile': { // AIM-9 style heat seeker: dark seeker dome, white body, canards, four tail fins
      b.add('root', latheX([[0, 1.25], [0.09, 1.25], [0.078, 1.34], [0.058, 1.42], [0.03, 1.48], [0, 1.5]], 12), F.lens);
      b.add('root', cylX(0.09, 2.6, 12), white, [-0.05, 0, 0]);
      b.add('root', tubeX(0.0925, 0.03, 12), F.steel, [1.235, 0, 0]);
      b.add('root', tubeX(0.0915, 0.07, 12), yellow, [0.55, 0, 0]);
      b.add('root', tubeX(0.0925, 0.1, 12), tc, [0.2, 0, 0]);
      b.add('root', tubeX(0.0925, 0.12, 12), F.darkSteel, [-1.2, 0, 0]);
      b.add('root', latheX([[0, -1.5], [0.097, -1.5], [0.082, -1.42], [0.09, -1.35]], 12), F.heat);
      fins(b, 4, [[0, 0], [0.22, 0], [0.15, 0.12], [0.08, 0.12]], 0.008, 0.85, 0.085, F.steel);
      fins(b, 4, [[0, 0], [0.5, 0], [0.5, 0.02], [0.36, 0.2], [0.12, 0.2], [0, 0.1]], 0.01, -1.38, 0.085, white);
      g.add('root', cylX(0.066, 0.02, 10), glow(0xffa850, 4));
      p.add('root', cylX(0.085, 3.4, 8, 0.0001), additiveMaterial(0xffa347, 0.7, flameTexture()), [-1.7, 0, 0]);
      p.add('root', cylX(0.04, 1.8, 6, 0.0001), additiveMaterial(0xfff2d6, 0.9, flameTexture()), [-0.9, 0, 0]);
      return { glowAt: -1.51, plumeAt: -1.51 };
    }
    default: { // grenade: the M67 from the weapon kit, scaled up (see GRENADE_SCALE), with a team LED on top
      buildGrenade(b, 'root', { hi });
      g.add('root', sph(0.008, 6, 4), glow(TEAM_HEX[team] || TEAM_HEX.def, 3.5));
      return { glowAt: 0, plumeAt: 0, ledAt: [0.0, 0.058, 0.0], scale: GRENADE_SCALE };
    }
  }
}

// ---------- templates ("protos"): geometry shared by every instance ----------

const protos = new Map();

function bake(rig, role, at, out, stats) {
  const tpl = rig.build({ margin: 0 });
  for (const m of tpl.meshes) {
    // Static meshes: the skinning attributes of the rig are dead weight.
    m.geometry.deleteAttribute('skinIndex');
    m.geometry.deleteAttribute('skinWeight');
    out.push({ role, geometry: m.geometry, material: m.material, at });
  }
  stats.tris += tpl.tris;
}

function buildProto(kind, team, quality) {
  const key = kind + '|' + team + '|' + qlevel(quality);
  let proto = protos.get(key);
  if (proto) return proto;
  const prev = getDetail();
  const lvl = qlevel(quality);
  setDetail(lvl);
  try {
    const body = new Rig({ ao: 0.7 }), glw = new Rig({ ao: 0 }), plm = new Rig({ ao: 0 });
    body.bone('root'); glw.bone('root'); plm.bone('root');
    const info = buildBody(kind, body, glw, plm, team, lvl >= 2);
    const stats = { tris: 0 };
    const parts = [];
    bake(body, 'body', [0, 0, 0], parts, stats);
    if (glw.buckets.size) bake(glw, 'glow', [info.glowAt, 0, 0], parts, stats);
    if (plm.buckets.size) bake(plm, 'plume', [info.plumeAt, 0, 0], parts, stats);
    if (info.ledAt) {
      // The LED was added to the glow rig at the origin: move it to the top of the grenade.
      for (const part of parts) {
        if (part.role !== 'glow') continue;
        part.at = [info.ledAt[0] * (info.scale || 1), info.ledAt[1] * (info.scale || 1), info.ledAt[2] * (info.scale || 1)];
        part.role = 'led';
      }
    }
    proto = { kind, team, key, parts, tris: Math.round(stats.tris), scale: info.scale || 1 };
    protos.set(key, proto);
  } finally {
    setDetail(prev);
  }
  return proto;
}

/** Triangle count of one projectile mesh (the plume included). */
export function projectileTriangles(kind, team = 'def', quality = 'high') {
  return buildProto(kindName(kind), teamName(team), quality).tris;
}

/** Dispose the cached projectile geometry (kit materials are shared and stay). Call when a match ends. */
export function releaseProjectileMeshes() {
  for (const proto of protos.values()) {
    const seen = new Set();
    for (const part of proto.parts) {
      if (!seen.has(part.geometry)) { seen.add(part.geometry); part.geometry.dispose(); }
    }
  }
  protos.clear();
}

/**
 * One projectile mesh (a fresh THREE.Group sharing cached geometry), nose along +X, centred on its middle.
 * kind: a PROJ_KINDS name or index; team 'def' | 'atk' | 0 | 1; quality 'low'..'ultra'.
 * userData: { kind, team, info, flick: Mesh[] (exhaust parts), led: Mesh|null, tris }.
 */
export function createProjectileMesh(kind, team = 'def', quality = 'high') {
  const k = kindName(kind), t = teamName(team);
  const proto = buildProto(k, t, quality);
  const group = new THREE.Group();
  group.name = 'projectile-' + k;
  const flick = [];
  let led = null;
  for (const part of proto.parts) {
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.position.fromArray(part.at);
    mesh.castShadow = false; // tiny and fast: a shadow pass entry would cost more than it shows
    mesh.receiveShadow = false;
    if (part.role === 'body') {
      if (proto.scale !== 1) mesh.scale.setScalar(proto.scale);
      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false; // static
    } else if (part.role === 'led') {
      led = mesh;
      mesh.scale.setScalar(proto.scale);
    } else {
      flick.push(mesh); // exhaust parts flicker (scale), see ProjectilePool
    }
    group.add(mesh);
  }
  group.userData = { kind: k, team: t, info: PROJECTILE_INFO[k], flick, led, tris: proto.tris };
  return group;
}

// ---------- orientation ----------

const _X = new THREE.Vector3(1, 0, 0), _Z = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _qw = new THREE.Quaternion();

/** Point `obj` (nose +X) along velocity (vx, vy, vz) and roll it by `roll` rad. false if the velocity is ~0. */
export function orientAlongVelocity(obj, vx, vy, vz, roll = 0) {
  const l2 = vx * vx + vy * vy + vz * vz;
  if (!(l2 > 1e-6) || !Number.isFinite(l2)) return false;
  const inv = 1 / Math.sqrt(l2);
  _v.set(vx * inv, vy * inv, vz * inv);
  obj.quaternion.setFromUnitVectors(_X, _v);
  if (roll) obj.quaternion.multiply(_qr.setFromAxisAngle(_X, roll));
  return true;
}

// Cheap deterministic hash -> [0, 1).
function hash01(n) {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------- pool ----------

class Entry {
  constructor() {
    this.id = 0; this.kind = 'rocket'; this.team = 'def'; this.object = null; this.key = '';
    this.age = 0; this.roll = 0; this.seen = 0; this.phase = 0; this.tumble = 0; this.omega = 0;
    this.fresh = true; this.axis = new THREE.Vector3(0, 1, 0);
  }
}

/**
 * Meshes for projectile rows keyed by id. No allocation per frame: wrappers, entries and scratch objects are
 * created once and recycled; hidden meshes stay in `parent` with visible = false.
 */
export class ProjectilePool {
  constructor({ parent = null, quality = 'high', max = 128, onRelease = null } = {}) {
    this.parent = parent;
    this.quality = quality;
    this.max = max;
    this.onRelease = onRelease;
    this.active = []; // dense list of live entries
    this.byId = new Map();
    this.free = new Map(); // key -> Group[]
    this.spare = []; // recycled Entry objects
    this.frame = 1;
    this.all = new Set(); // every Group ever created (for dispose)
  }

  get size() { return this.active.length; }
  has(id) { return this.byId.has(id); }
  get(id) { return this.byId.get(id) || null; }

  /** Entry for `id`, created if needed (null when the pool is full). A changed kind/team swaps the mesh. */
  acquire(id, kind, team) {
    const k = kindName(kind), t = teamName(team);
    let e = this.byId.get(id);
    if (e && (e.kind !== k || e.team !== t)) { this.release(id); e = null; }
    if (e) return e;
    if (this.active.length >= this.max) return null;
    e = this.spare.pop() || new Entry();
    const key = k + '|' + t;
    const list = this.free.get(key);
    let obj = list && list.length ? list.pop() : null;
    if (!obj) {
      obj = createProjectileMesh(k, t, this.quality);
      this.all.add(obj);
      if (this.parent) this.parent.add(obj);
    } else if (this.parent && obj.parent !== this.parent) this.parent.add(obj);
    obj.visible = true;
    e.id = id; e.kind = k; e.team = t; e.object = obj; e.key = key;
    e.age = 0; e.roll = 0; e.seen = this.frame; e.fresh = true;
    e.phase = hash01(id) * TAU;
    e.tumble = hash01(id * 31 + 7) * TAU;
    e.omega = 7 + hash01(id * 17 + 3) * 6;
    e.axis.set(hash01(id * 5 + 1) - 0.5, hash01(id * 11 + 2) - 0.5, hash01(id * 13 + 9) - 0.5);
    if (e.axis.lengthSq() < 1e-4) e.axis.set(0, 0, 1);
    e.axis.normalize();
    this.byId.set(id, e);
    this.active.push(e);
    return e;
  }

  /** Move and orient the mesh of `id` (no-op for unknown ids). Non-finite inputs keep the previous pose. */
  update(id, x, y, z, vx, vy, vz, dt) {
    const e = this.byId.get(id);
    if (!e) return null;
    this._pose(e, x, y, z, vx, vy, vz, dt);
    return e;
  }

  /** acquire + update + mark seen, for snapshot-driven callers (use between beginFrame and endFrame). */
  set(id, kind, team, x, y, z, vx, vy, vz, dt) {
    const e = this.acquire(id, kind, team);
    if (!e) return null;
    e.seen = this.frame;
    this._pose(e, x, y, z, vx, vy, vz, dt);
    return e;
  }

  beginFrame() { this.frame++; }

  /** Release every entry not set() since beginFrame(). Returns how many were released. */
  endFrame() {
    let n = 0;
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.active[i].seen !== this.frame) { this._free(i); n++; }
    }
    return n;
  }

  release(id) {
    const e = this.byId.get(id);
    if (!e) return false;
    this._free(this.active.indexOf(e));
    return true;
  }

  releaseAll() {
    for (let i = this.active.length - 1; i >= 0; i--) this._free(i);
  }

  _free(i) {
    const e = this.active[i];
    const last = this.active.pop();
    if (last !== e) this.active[i] = last;
    this.byId.delete(e.id);
    e.object.visible = false;
    let list = this.free.get(e.key);
    if (!list) this.free.set(e.key, (list = []));
    list.push(e.object);
    if (this.onRelease) this.onRelease(e.id, e);
    e.object = null;
    this.spare.push(e);
  }

  _pose(e, x, y, z, vx, vy, vz, dt) {
    dt = dt > 0 ? Math.min(dt, 0.1) : 0;
    const o = e.object;
    const info = PROJECTILE_INFO[e.kind];
    e.age += dt;
    if (Number.isFinite(x + y + z)) o.position.set(x, y, z);
    const speed2 = vx * vx + vy * vy + vz * vz;
    const moving = speed2 > 0.25 && Number.isFinite(speed2);
    if (info.orient === 'tumble') {
      // Grenade: tumbles about a fixed axis; the spin dies away once it rolls slowly (settled on the ground).
      const w = moving ? e.omega * Math.min(1, Math.sqrt(speed2) / 4) : 0;
      e.tumble += w * dt;
      o.quaternion.setFromAxisAngle(e.axis, e.tumble);
      const led = o.userData.led;
      if (led) {
        const left = FUSE - e.age;
        const rate = left < 0.7 ? 14 : 3;
        led.visible = ((e.age * rate + e.phase) % 1) < 0.5;
      }
    } else if (info.orient === 'settle') {
      // Bomb: leaves the bay at an angle, wobbles, then falls nose-down along its velocity.
      e.roll += 2.5 * dt;
      if (e.fresh) {
        // Start nose-forward-down regardless of velocity, then let the velocity take over.
        _v.set(Math.cos(e.phase) * 0.6, -0.8, Math.sin(e.phase) * 0.6).normalize();
        o.quaternion.setFromUnitVectors(_X, _v);
        e.fresh = false;
      }
      if (moving) {
        const inv = 1 / Math.sqrt(speed2);
        _v.set(vx * inv, vy * inv, vz * inv);
        _q.setFromUnitVectors(_X, _v);
        o.quaternion.slerp(_q, 1 - Math.exp(-5 * dt));
      }
      const wob = 0.28 * Math.exp(-1.6 * e.age) * Math.sin(9 * e.age + e.phase);
      _qw.setFromAxisAngle(_Z, wob);
      o.quaternion.multiply(_qw);
    } else if (moving) {
      e.roll += info.spin * dt;
      orientAlongVelocity(o, vx, vy, vz, e.roll);
    }
    // Exhaust flicker: deterministic in the projectile's own age, so replays look the same.
    const flick = o.userData.flick;
    for (let i = 0; i < flick.length; i++) {
      const m = flick[i];
      const n = 0.5 + 0.5 * Math.sin(e.age * 61 + e.phase + i * 1.7) * Math.sin(e.age * 37 + e.phase * 1.3);
      m.scale.set(0.82 + 0.4 * n, 0.9 + 0.2 * n, 0.9 + 0.2 * n);
    }
  }

  /** Free the wrappers. Geometry lives in the shared cache (releaseProjectileMeshes). */
  dispose() {
    this.releaseAll();
    for (const obj of this.all) obj.removeFromParent();
    this.all.clear();
    this.free.clear();
    this.spare.length = 0;
    this.parent = null;
  }
}

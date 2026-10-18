// Modeling kit shared by the unit models and the viewmodels.
//
// Every unit is built once per (type, team, suit, quality) as a *rig template*: rigid parts are attached
// to bones, baked into model space and merged per material into a few skinned meshes. Instances share
// the geometry and materials and only own their bones, so a whole soldier is ~3 draw calls and a tank ~6
// no matter how many parts it has. Colors, roughness and metalness of the individual parts live in
// vertex attributes (`color`, `rm`) read by a patched MeshStandardMaterial ("uber" material), which is
// what lets so many different finishes share one material. Hiding a part = scaling its bone to zero.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeCanvas, TEAM_HEX, makeFbm, mulberry32 } from '../suit.js';

export const QUALITY_LEVEL = { low: 0, medium: 1, high: 2, ultra: 3 };
export const qlevel = (q) => QUALITY_LEVEL[q] ?? 2;

// Current detail level while a template is being built (0 low … 3 ultra). Segment counts scale with it.
let detail = 2;
export function setDetail(level) { detail = level; }
export function getDetail() { return detail; }
export const segs = (n, min = 3) => Math.max(min, Math.round(n * [0.5, 0.75, 1, 1.25][detail]));

// ---------- primitives (all centered at the origin, y-up) ----------

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// Chamfered box (44 triangles): the cheap stand-in for a rounded box. Edges catch light like a real bevel.
export function bevelBox(w, h, d, r = 0.02) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  r = Math.min(r, hx * 0.9, hy * 0.9, hz * 0.9);
  const H = [hx, hy, hz];
  const pos = [];
  // Corner vertex (signs) displaced for the face along axis fa: that coordinate stays full, the others are inset.
  const P = (sg, fa) => [0, 1, 2].map((i) => sg[i] * (i === fa ? H[i] : H[i] - r));
  const emit = (pts) => { // fan of pts, winding fixed so the normal points away from the box center
    const [a, b, c] = pts;
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const m = [0, 1, 2].map((i) => pts.reduce((t, p) => t + p[i], 0));
    const out = nx * m[0] + ny * m[1] + nz * m[2] >= 0;
    const q = out ? pts : pts.slice().reverse();
    for (let i = 1; i < q.length - 1; i++) pos.push(...q[0], ...q[i], ...q[i + 1]);
  };
  const S = [-1, 1];
  for (let a = 0; a < 3; a++) {
    const o = [(a + 1) % 3, (a + 2) % 3];
    for (const sa of S) {
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const sg = [0, 0, 0]; sg[a] = sa; sg[o[0]] = u; sg[o[1]] = v; return P(sg, a); });
      emit(corners);
    }
  }
  for (let a = 0; a < 3; a++) {
    for (let b = a + 1; b < 3; b++) {
      const c = 3 - a - b;
      for (const sa of S) for (const sb of S) {
        const mk = (sc, fa) => { const sg = [0, 0, 0]; sg[a] = sa; sg[b] = sb; sg[c] = sc; return P(sg, fa); };
        emit([mk(-1, a), mk(1, a), mk(1, b), mk(-1, b)]);
      }
    }
  }
  for (const sx of S) for (const sy of S) for (const sz of S) emit([P([sx, sy, sz], 0), P([sx, sy, sz], 1), P([sx, sy, sz], 2)]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
export function rbox(w, h, d, r = 0.02, s = 2) {
  if (detail <= 1) return new THREE.BoxGeometry(w, h, d);
  if (detail === 2) return bevelBox(w, h, d, r);
  return new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
}
export const cyl = (rt, rb, h, n = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, segs(n), 1, open);
export const cylArc = (rt, rb, h, n, start, len, open = false) => new THREE.CylinderGeometry(rt, rb, h, segs(n), 1, open, start, len);
// Cylinder lying along an axis ('x' or 'z').
export const cylX = (r, h, n = 12, rb = r) => new THREE.CylinderGeometry(r, rb, h, segs(n)).rotateZ(-Math.PI / 2);
export const cylZ = (r, h, n = 12, rb = r) => new THREE.CylinderGeometry(r, rb, h, segs(n)).rotateX(Math.PI / 2);
export const sph = (r, w = 12, h = 8, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) =>
  new THREE.SphereGeometry(r, segs(w), segs(h, 2), ps, pl, ts, tl);
export const capsule = (r, len, n = 8) => new THREE.CapsuleGeometry(r, len, segs(3, 2), segs(n));
export const torus = (R, r, n = 8, m = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, segs(n), segs(m), arc);
// Lathe from [[radius, y], ...] around the y axis.
export const lathe = (pts, n = 12) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), segs(n));
// Lathe around the x axis (y of the profile becomes +x).
export const latheX = (pts, n = 12) => lathe(pts, n).rotateZ(-Math.PI / 2);
// Extrude a 2D outline (x, y) along z by depth (centered on z).
export function extrude(pts, depth, bevel = 0) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0 && detail > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: segs(6),
  });
  g.translate(0, 0, -depth / 2);
  return g;
}
export function tube(points, r, n = 6, m = 16, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed);
  return new THREE.TubeGeometry(curve, segs(m), r, segs(n), closed);
}
export const plane = (w, h) => new THREE.PlaneGeometry(w, h);

// Lofted body along +x through cross-sections: [{ x, y, w (half width), t (height above y), b (depth below y), p }].
// Each section is a superellipse (p = 2 ellipse, p = 4+ boxy) so the same tool makes fuselages, noses,
// tanks, pods and missiles. Ends are capped.
export function loft(stations, n = 16, { capStart = true, capEnd = true } = {}) {
  n = segs(n, 6);
  const pos = [], idx = [];
  const ring = (st) => {
    const p = st.p || 2.5, e = 2 / p;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const z = Math.sign(c) * Math.pow(Math.abs(c), e) * st.w;
      const y = Math.sign(s) * Math.pow(Math.abs(s), e) * (s >= 0 ? st.t : st.b);
      pos.push(st.x, (st.y || 0) + y, z);
    }
  };
  stations.forEach(ring);
  for (let k = 0; k < stations.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const a = k * n + i, b = k * n + ((i + 1) % n), c = a + n, d = b + n;
      idx.push(a, c, b, b, c, d);
    }
  }
  const capAt = (k, flip) => {
    const st = stations[k];
    const ci = pos.length / 3;
    pos.push(st.x, st.y || 0, 0);
    for (let i = 0; i < n; i++) {
      const a = k * n + i, b = k * n + ((i + 1) % n);
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  if (capStart && stations[0].w > 1e-4) capAt(0, true);
  if (capEnd && stations[stations.length - 1].w > 1e-4) capAt(stations.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed(); // flat-ish shading where sections change abruptly, smooth enough with many segments
  ng.computeVertexNormals();
  g.dispose();
  return smoothNormals(ng);
}

// Average normals of coincident vertices (non-indexed geometry → smooth shading without merging).
export function smoothNormals(g, angle = 0.9) {
  const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count;
  const map = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < n; i++) {
    const k = key(i);
    let l = map.get(k);
    if (!l) map.set(k, (l = []));
    l.push(i);
  }
  const out = new Float32Array(n * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), acc = new THREE.Vector3();
  for (const list of map.values()) {
    for (const i of list) {
      a.fromBufferAttribute(nor, i);
      acc.set(0, 0, 0);
      for (const j of list) {
        b.fromBufferAttribute(nor, j);
        if (a.dot(b) > angle) acc.add(b);
      }
      acc.normalize();
      out[i * 3] = acc.x; out[i * 3 + 1] = acc.y; out[i * 3 + 2] = acc.z;
    }
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
// Bake a transform into a geometry. r = Euler [x, y, z] (XYZ), s = number or [x, y, z].
export function xf(g, p = null, r = null, s = null) {
  if (!p && !r && !s) return g;
  _e.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0);
  _q.setFromEuler(_e);
  _v.set(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0);
  if (s == null) _s.set(1, 1, 1);
  else if (typeof s === 'number') _s.set(s, s, s);
  else _s.set(s[0], s[1], s[2]);
  _m.compose(_v, _q, _s);
  g.applyMatrix4(_m);
  return g;
}

// ---------- materials ----------

const mats = new Map();
export function cached(key, make) {
  let m = mats.get(key);
  if (!m) mats.set(key, (m = make()));
  return m;
}

// Patch a MeshStandardMaterial so per-vertex `rm` = (roughness, metalness, emission) multiplies the material's
// values (uber materials use roughness = metalness = 1, so `rm` is absolute).
function patchRM(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 rm;\nvarying vec3 vRM;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = rm;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vRM;')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= vRM.x;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vRM.y;')
    // vRM.z = self-illumination: that share of the albedo is emitted (keeps cabs readable inside roof shadow).
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vRM.z;');
}

const uberCache = new WeakMap();
// Vertex-colored clone of a standard material reading roughness/metalness from the `rm` attribute.
export function uber(base, { vertexColors = true } = {}) {
  let byVc = uberCache.get(base);
  if (!byVc) uberCache.set(base, (byVc = {}));
  const k = vertexColors ? 'vc' : 'novc';
  if (byVc[k]) return byVc[k];
  const m = base.clone();
  m.vertexColors = vertexColors;
  m.roughness = 1;
  m.metalness = 1;
  m.onBeforeCompile = patchRM;
  m.customProgramCacheKey = () => 'uber-rm';
  m.userData = { ...base.userData, uber: true };
  m.name = (base.name || 'm') + '+uber';
  byVc[k] = m;
  return m;
}

// Per-instance copy of a (uber) material, e.g. to scroll a texture on one vehicle without touching the others.
export function cloneUber(m) {
  const c = m.clone();
  c.onBeforeCompile = m.onBeforeCompile;
  c.customProgramCacheKey = m.customProgramCacheKey;
  return c;
}

// The one material for every untextured part (colors/roughness/metalness come from vertex attributes).
export const solidMaterial = () => cached('solid', () => uber(new THREE.MeshStandardMaterial({ name: 'solid' })));

// Unlit lights (head/tail lights, nav lights, LEDs). Vertex colors above 1 drive the bloom.
export const glowMaterial = () => cached('glow', () => {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, name: 'glow' });
  m.userData.glow = true;
  return m;
});

export const glassMaterial = () => cached('glass', () => {
  const m = new THREE.MeshStandardMaterial({ color: 0x2a3a3e, metalness: 0.2, roughness: 0.05, transparent: true,
    opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, name: 'glass', envMapIntensity: 1.6 });
  m.userData.noShadow = true;
  return m;
});
export const canopyMaterial = () => cached('canopy', () => {
  const m = new THREE.MeshStandardMaterial({ color: 0x4a4430, metalness: 0.35, roughness: 0.04, transparent: true,
    opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, name: 'canopy', envMapIntensity: 1.8 });
  m.userData.noShadow = true;
  return m;
});

// Charred-metal texture for wrecks (soot, rust, a few bare-metal scratches).
export const burntMaterial = () => cached('burnt', () => {
  const S = 256, c = makeCanvas(S, S), x = c.getContext('2d');
  const rand = mulberry32(4242), fbm = makeFbm(rand, 4, 4), fine = makeFbm(rand, 16, 2);
  const img = x.createImageData(S, S);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const u = i / S, v = j / S, n = fbm(u, v), f = fine(u, v);
      const rust = Math.max(0, n - 0.52) * 3;
      const k = (i + j * S) * 4;
      const base = 22 + f * 26;
      img.data[k] = base + rust * 70; img.data[k + 1] = base * 0.9 + rust * 30; img.data[k + 2] = base * 0.8 + rust * 10;
      img.data[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const base = new THREE.MeshStandardMaterial({ map: tex, name: 'burnt' });
  base.userData.boxUV = 1.6;
  return uber(base, { vertexColors: false });
});

// Finishes for solid parts: color (sRGB hex), roughness, metalness.
export const F = {
  steel: { c: 0x4a4c4f, r: 0.45, m: 0.8 },
  darkSteel: { c: 0x2a2c2e, r: 0.5, m: 0.75 },
  gunmetal: { c: 0x1f2022, r: 0.34, m: 0.7 },
  parkerized: { c: 0x2b2c2b, r: 0.55, m: 0.55 },
  blackPoly: { c: 0x1a1b1c, r: 0.62, m: 0.05 },
  fde: { c: 0x8b7556, r: 0.7, m: 0.02 }, // flat dark earth polymer
  rubber: { c: 0x161616, r: 0.92, m: 0 },
  tire: { c: 0x1c1c1d, r: 0.88, m: 0 },
  track: { c: 0x3a3632, r: 0.72, m: 0.6 },
  trackPad: { c: 0x1b1b1b, r: 0.9, m: 0 },
  canvas: { c: 0x5f5d47, r: 0.95, m: 0 },
  webbing: { c: 0x3c3a2e, r: 0.95, m: 0 },
  wood: { c: 0x6b4527, r: 0.7, m: 0 },
  brass: { c: 0xb8913e, r: 0.3, m: 0.95 },
  copper: { c: 0x8a5a3a, r: 0.4, m: 0.85 },
  chrome: { c: 0xc8cacc, r: 0.15, m: 1 },
  alu: { c: 0x8e9296, r: 0.35, m: 0.85 },
  white: { c: 0xd9d9d4, r: 0.6, m: 0 },
  grey: { c: 0x6d7173, r: 0.62, m: 0.2 },
  heat: { c: 0x5b5249, r: 0.38, m: 0.85 }, // heat-tinted exhaust metal
  soot: { c: 0x151312, r: 0.95, m: 0.1 },
  interior: { c: 0xbfc2b4, r: 0.72, m: 0.05, e: 0.35 }, // off-white crew compartment paint
  interiorGreen: { c: 0x56604a, r: 0.75, m: 0.08, e: 0.4 },
  interiorDark: { c: 0x3a3e3a, r: 0.8, m: 0.1, e: 0.55 },
  seat: { c: 0x3c3e32, r: 0.95, m: 0, e: 0.5 },
  panel: { c: 0x2c3032, r: 0.7, m: 0.2, e: 0.55 },
  carbon: { c: 0x1d1f21, r: 0.38, m: 0.25 },
  lens: { c: 0x0a1418, r: 0.04, m: 0.6 },
  mirror: { c: 0x9aa3a6, r: 0.06, m: 1 },
  olive: { c: 0x4a4f36, r: 0.7, m: 0.1 },
  sand: { c: 0xa8916a, r: 0.85, m: 0 },
  jerry: { c: 0x3f4a2f, r: 0.6, m: 0.3 },
};
export const fin = (c, r = 0.7, m = 0, mat = null) => ({ c, r, m, mat });
export const glow = (c, i = 3) => ({ glow: true, c, i });

// ---------- Rig builder ----------

const _col = new THREE.Color();
const IDENT = new THREE.Matrix4();

export class Rig {
  // ground: darken vertices near y = 0 (contact shadow) within this height, or 0 to disable.
  constructor({ ground = 0, ao = 1 } = {}) {
    this.ground = ground;
    this.ao = ao;
    this.boneDefs = [];
    this.byName = new Map();
    this.buckets = new Map();
  }

  // Bind-pose bone, local to its parent (or the model root). Returns the bone name for chaining.
  bone(name, parent = null, p = [0, 0, 0], r = null) {
    const pi = parent == null ? -1 : this.byName.get(parent);
    if (pi === undefined) throw new Error('Rig.bone: unknown parent ' + parent);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r || [0, 0, 0])));
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...p), q, new THREE.Vector3(1, 1, 1));
    const world = pi < 0 ? local.clone() : this.boneDefs[pi].world.clone().multiply(local);
    this.byName.set(name, this.boneDefs.length);
    this.boneDefs.push({ name, parent: pi, p: [...p], q, world });
    return name;
  }

  has(name) { return this.byName.has(name); }

  // Add a geometry to a bone. p/r/s place it in the bone's local frame. f = finish ({ c, r, m, mat? }),
  // a glow ({ glow, c, i }) or a material (textured parts: decals, screens, glass).
  add(boneName, g, f, p = null, r = null, s = null) {
    const bi = this.byName.get(boneName);
    if (bi === undefined) throw new Error('Rig.add: unknown bone ' + boneName);
    let mat, c = 0xffffff, rough = 1, metal = 0, intensity = 1, isGlow = false, emit = 0;
    if (f && f.isMaterial) mat = f;
    else if (f && f.glow) { mat = glowMaterial(); c = f.c; intensity = f.i; isGlow = true; }
    else { mat = f.mat || solidMaterial(); c = f.c ?? 0xffffff; rough = f.r ?? 0.7; metal = f.m ?? 0; emit = f.e ?? 0; }
    xf(g, p, r, s);
    g.applyMatrix4(this.boneDefs[bi].world);
    if (g.index) { const ng = g.toNonIndexed(); g.dispose(); g = ng; }
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    const pos = g.attributes.position, nor = g.attributes.normal;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const uv = g.attributes.uv;
    const scale = mat.userData && mat.userData.boxUV;
    if (scale) {
      // Box-projected UVs in meters: same texel density everywhere, camo/paint never stretches.
      for (let i = 0; i < n; i++) {
        const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (ay >= ax && ay >= az) uv.setXY(i, x / scale, z / scale);
        else if (ax >= az) uv.setXY(i, z / scale, y / scale);
        else uv.setXY(i, x / scale, y / scale);
      }
    }
    _col.set(c);
    const col = new Float32Array(n * 3), rm = new Float32Array(n * 3);
    const skI = new Uint16Array(n * 4), skW = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      let ao = 1;
      if (!isGlow && this.ao) {
        // Cheap baked ambient occlusion: undersides darker, and a contact shadow near the ground.
        const ny = nor.getY(i);
        ao = 1 - 0.36 * Math.max(0, -ny) - 0.06 * (1 - Math.abs(ny));
        if (this.ground > 0) {
          const t = Math.min(1, Math.max(0, pos.getY(i) / this.ground));
          ao *= 0.5 + 0.5 * t * t * (3 - 2 * t);
        }
        ao = 1 - (1 - ao) * this.ao;
      }
      col[i * 3] = _col.r * ao * intensity; col[i * 3 + 1] = _col.g * ao * intensity; col[i * 3 + 2] = _col.b * ao * intensity;
      rm[i * 3] = rough; rm[i * 3 + 1] = metal; rm[i * 3 + 2] = emit;
      skI[i * 4] = bi; skW[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('rm', new THREE.BufferAttribute(rm, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skI, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(skW, 4));
    let list = this.buckets.get(mat);
    if (!list) this.buckets.set(mat, (list = []));
    list.push(g);
    return this;
  }

  // margin: extra bounding radius for moving parts (turrets, limbs) so frustum culling never pops.
  build({ margin = 0.5 } = {}) {
    const meshes = [];
    let tris = 0;
    const box3 = new THREE.Box3();
    for (const [mat, list] of this.buckets) {
      const geometry = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (list.length > 1) for (const g of list) g.dispose();
      geometry.computeBoundingBox();
      box3.union(geometry.boundingBox);
      tris += geometry.attributes.position.count / 3;
      meshes.push({ geometry, material: mat });
    }
    const bounds = new THREE.Sphere();
    box3.getBoundingSphere(bounds);
    bounds.radius += margin;
    for (const m of meshes) m.geometry.boundingSphere = bounds.clone();
    const boneInv = this.boneDefs.map((d) => d.world.clone().invert());
    return { boneDefs: this.boneDefs.map(({ name, parent, p, q }) => ({ name, parent, p, q })), boneInv, meshes, bounds, tris: Math.round(tris) };
  }
}

// Create an instance of a rig template: fresh bones + skinned meshes sharing geometry and materials.
export function instantiateRig(tpl, { cast = true, receive = true } = {}) {
  const root = new THREE.Group();
  const bones = [], byName = {};
  for (const d of tpl.boneDefs) {
    const b = new THREE.Bone();
    b.name = d.name;
    b.position.fromArray(d.p);
    b.quaternion.copy(d.q);
    b.userData.bindP = b.position.clone();
    b.userData.bindQ = b.quaternion.clone();
    (d.parent < 0 ? root : bones[d.parent]).add(b);
    bones.push(b);
    byName[d.name] = b;
  }
  const skeleton = new THREE.Skeleton(bones, tpl.boneInv);
  const meshes = [];
  for (const m of tpl.meshes) {
    const mesh = new THREE.SkinnedMesh(m.geometry, m.material);
    mesh.bind(skeleton, IDENT);
    mesh.boundingSphere = tpl.bounds.clone();
    mesh.castShadow = cast && !m.material.transparent && !m.material.userData.noShadow && !m.material.userData.glow;
    mesh.receiveShadow = receive && !m.material.userData.glow;
    mesh.userData.baseMaterial = m.material;
    root.add(mesh);
    meshes.push(mesh);
  }
  return { root, bones: byName, skeleton, meshes };
}

// ---------- textures: screens, decals, glows, flashes ----------

// Screen textures for cockpit displays: canvas → emissive map (bloom).
export function screenMaterial(kind) {
  return cached('screen' + kind, () => {
    const c = makeCanvas(128, 96);
    const x = c.getContext('2d');
    x.fillStyle = '#020604'; x.fillRect(0, 0, 128, 96);
    const green = '#5dff8a', amber = '#ffb347';
    x.lineWidth = 2;
    if (kind === 'map') {
      x.fillStyle = '#0a1a10'; x.fillRect(0, 0, 128, 96);
      x.strokeStyle = '#1f6b3a';
      for (let i = 0; i < 128; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 96); x.stroke(); }
      for (let i = 0; i < 96; i += 16) { x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
      x.fillStyle = '#2c5a3a'; x.fillRect(20, 10, 22, 30); x.fillRect(70, 50, 30, 20); x.fillRect(50, 18, 14, 14);
      x.strokeStyle = green; x.beginPath(); x.moveTo(64, 70); x.lineTo(58, 82); x.lineTo(70, 82); x.closePath(); x.stroke();
      x.fillStyle = '#ff5544'; x.fillRect(30, 26, 6, 6); x.fillRect(90, 40, 6, 6);
    } else if (kind === 'attitude') {
      x.fillStyle = '#1d5a8c'; x.fillRect(0, 0, 128, 46);
      x.fillStyle = '#6b4520'; x.fillRect(0, 46, 128, 50);
      x.strokeStyle = '#fff';
      for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(48, 46 + i * 12); x.lineTo(80, 46 + i * 12); x.stroke(); }
      x.strokeStyle = amber; x.lineWidth = 3;
      x.beginPath(); x.moveTo(36, 48); x.lineTo(58, 48); x.lineTo(64, 54); x.lineTo(70, 48); x.lineTo(92, 48); x.stroke();
    } else if (kind === 'engine') {
      x.strokeStyle = green; x.fillStyle = green; x.font = '10px monospace';
      for (let i = 0; i < 4; i++) {
        x.strokeRect(10 + i * 29, 14, 18, 60);
        x.fillRect(10 + i * 29, 14 + 60 - (20 + i * 9), 18, 20 + i * 9);
      }
      x.fillText('ENG  TQ  NR  OIL', 8, 88);
    } else if (kind === 'radar') {
      x.strokeStyle = green;
      for (let r = 14; r < 48; r += 14) { x.beginPath(); x.arc(64, 90, r * 1.6, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); }
      x.beginPath(); x.moveTo(64, 90); x.lineTo(30, 20); x.moveTo(64, 90); x.lineTo(98, 20); x.stroke();
      x.fillStyle = amber; x.fillRect(50, 34, 5, 5); x.fillRect(80, 52, 5, 5);
    } else if (kind === 'thermal') {
      // Thermal camera picture: grey world with hot white blobs.
      const g = x.createLinearGradient(0, 0, 0, 96);
      g.addColorStop(0, '#3a3a3a'); g.addColorStop(0.55, '#5a5a5a'); g.addColorStop(1, '#2a2a2a');
      x.fillStyle = g; x.fillRect(0, 0, 128, 96);
      x.fillStyle = '#202020'; x.fillRect(10, 30, 30, 40); x.fillRect(80, 20, 36, 52);
      x.fillStyle = '#f0f0f0'; x.beginPath(); x.ellipse(60, 64, 8, 5, 0, 0, 7); x.fill();
      x.strokeStyle = '#9dff9d'; x.lineWidth = 1;
      x.strokeRect(52, 56, 16, 16); x.beginPath(); x.moveTo(64, 30); x.lineTo(64, 50); x.moveTo(64, 78); x.lineTo(64, 92); x.stroke();
    } else { // generic status page
      x.fillStyle = green; x.font = 'bold 11px monospace';
      ['SYS  OK', 'FUEL 82%', 'AMMO RDY', 'COMM  2', 'NAV  GPS'].forEach((t, i) => x.fillText(t, 10, 18 + i * 16));
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.0,
      roughness: 0.25, metalness: 0, name: 'screen-' + kind });
    m.userData.glow = true;
    return m;
  });
}

// Texture atlas for decals so all decals of a unit share one material (one draw call).
// Cells (4×4): 0 roundel def, 1 roundel atk, 2 stripe def, 3 stripe atk, 4 hazard, 5 'NO STEP', 6 grille,
// 7 vent, 8..15 hull numbers.
const ATLAS_N = 4;
let atlasMat = null;
export function decalMaterial() {
  if (atlasMat) return atlasMat;
  const S = 128, c = makeCanvas(S * ATLAS_N, S * ATLAS_N), x = c.getContext('2d');
  const cell = (i, draw) => {
    x.save();
    x.translate((i % ATLAS_N) * S, Math.floor(i / ATLAS_N) * S);
    x.beginPath(); x.rect(0, 0, S, S); x.clip();
    draw(S);
    x.restore();
  };
  const roundel = (team) => (S) => {
    const hex = TEAM_HEX[team], m = S / 2;
    x.fillStyle = '#e8e6df'; x.beginPath(); x.arc(m, m, S * 0.47, 0, Math.PI * 2); x.fill();
    x.fillStyle = hex; x.beginPath(); x.arc(m, m, S * 0.41, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f2f0ea'; x.beginPath();
    if (team === 'atk') {
      x.moveTo(m - S * 0.24, m - S * 0.12); x.lineTo(m, m + S * 0.14); x.lineTo(m + S * 0.24, m - S * 0.12);
      x.lineTo(m + S * 0.24, m + S * 0.04); x.lineTo(m, m + S * 0.3); x.lineTo(m - S * 0.24, m + S * 0.04);
    } else {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? S * 0.12 : S * 0.3;
        x.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
      }
    }
    x.closePath(); x.fill();
  };
  const stripe = (team) => (S) => {
    x.fillStyle = TEAM_HEX[team]; x.fillRect(0, S * 0.18, S, S * 0.64);
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(0, S * 0.18, S, S * 0.06); x.fillRect(0, S * 0.76, S, S * 0.06);
  };
  cell(0, roundel('def'));
  cell(1, roundel('atk'));
  cell(2, stripe('def'));
  cell(3, stripe('atk'));
  cell(4, (S) => {
    x.fillStyle = '#d8b21c'; x.fillRect(0, S * 0.3, S, S * 0.4);
    x.fillStyle = '#151515';
    for (let i = -S; i < S * 2; i += S / 4) { x.beginPath(); x.moveTo(i, S * 0.3); x.lineTo(i + S / 8, S * 0.3); x.lineTo(i + S / 8 + S * 0.4, S * 0.7); x.lineTo(i + S * 0.4, S * 0.7); x.fill(); }
  });
  cell(5, (S) => {
    x.fillStyle = '#d9d6c8'; x.font = `bold ${S * 0.2}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('NO STEP', S / 2, S / 2);
    x.fillRect(S * 0.1, S * 0.36, S * 0.8, S * 0.03); x.fillRect(S * 0.1, S * 0.62, S * 0.8, S * 0.03);
  });
  cell(6, (S) => { // grille slots
    x.fillStyle = '#0d0d0d';
    for (let i = 0; i < 8; i++) x.fillRect(S * 0.08, S * 0.08 + i * S * 0.11, S * 0.84, S * 0.06);
  });
  cell(7, (S) => { // round vent
    x.fillStyle = '#121212'; x.beginPath(); x.arc(S / 2, S / 2, S * 0.4, 0, 7); x.fill();
    x.strokeStyle = '#3a3a3a'; x.lineWidth = S * 0.04;
    for (let i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(S * 0.15, S / 2 + i * S * 0.1); x.lineTo(S * 0.85, S / 2 + i * S * 0.1); x.stroke(); }
  });
  const nums = ['11', '24', '31', '42', '57', '63', '78', '85'];
  nums.forEach((t, i) => cell(8 + i, (S) => {
    x.fillStyle = '#e4e0d0'; x.font = `bold ${S * 0.5}px monospace`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(t, S / 2, S / 2);
  }));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const base = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2,
    polygonOffsetUnits: -2, name: 'decals' });
  atlasMat = uber(base);
  atlasMat.userData.noShadow = true;
  return atlasMat;
}
export const DECAL = { roundel: { def: 0, atk: 1 }, stripe: { def: 2, atk: 3 }, hazard: 4, nostep: 5, grille: 6, vent: 7, number: 8 };
// A decal quad (facing +z by default) sampling atlas cell i.
export function decal(i, w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  const cx = i % ATLAS_N, cy = Math.floor(i / ATLAS_N);
  for (let k = 0; k < uv.count; k++) {
    uv.setXY(k, (cx + uv.getX(k)) / ATLAS_N, 1 - (cy + 1 - uv.getY(k)) / ATLAS_N);
  }
  return g;
}

let radialTex = null;
export function radialTexture() {
  if (radialTex) return radialTex;
  const S = 64, c = makeCanvas(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  radialTex = new THREE.CanvasTexture(c);
  return radialTex;
}

export function glowSpriteMaterial(hex, opacity = 1) {
  return cached('sprite' + hex + opacity, () => new THREE.SpriteMaterial({ map: radialTexture(), color: hex, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
}

export function additiveMaterial(hex, opacity = 1, map = null) {
  return cached('add' + hex + opacity + (map ? map.uuid : ''), () => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity,
    map, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
}

// Soft vertical gradient used for exhaust/afterburner cones (bright at the nozzle, fading out).
let flameTex = null;
export function flameTexture() {
  if (flameTex) return flameTex;
  const W = 16, H = 128, c = makeCanvas(W, H), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  flameTex = new THREE.CanvasTexture(c);
  return flameTex;
}

let flashTex = null;
function flashTexture() {
  if (flashTex) return flashTex;
  const S = 128, c = makeCanvas(S, S), x = c.getContext('2d');
  x.translate(S / 2, S / 2);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.2, 'rgba(255,210,120,0.95)');
  g.addColorStop(0.5, 'rgba(255,140,40,0.45)');
  g.addColorStop(1, 'rgba(255,90,20,0)');
  x.fillStyle = g;
  // Star-shaped petals like a flash hider burst.
  for (let i = 0; i < 6; i++) {
    x.rotate(Math.PI / 3);
    x.beginPath(); x.moveTo(0, -S * 0.07); x.quadraticCurveTo(S * 0.5, 0, 0, S * 0.07); x.fill();
  }
  x.beginPath(); x.arc(0, 0, S * 0.2, 0, Math.PI * 2); x.fill();
  flashTex = new THREE.CanvasTexture(c);
  flashTex.colorSpace = THREE.SRGBColorSpace;
  return flashTex;
}

let flashSideTex = null;
function flashSideTexture() {
  if (flashSideTex) return flashSideTex;
  const W = 128, H = 64, c = makeCanvas(W, H), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(255,245,210,1)');
  g.addColorStop(0.35, 'rgba(255,190,90,0.8)');
  g.addColorStop(1, 'rgba(255,100,20,0)');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(0, H * 0.35); x.quadraticCurveTo(W * 0.4, 0, W, H / 2); x.quadraticCurveTo(W * 0.4, H, 0, H * 0.65); x.fill();
  flashSideTex = new THREE.CanvasTexture(c);
  flashSideTex.colorSpace = THREE.SRGBColorSpace;
  return flashSideTex;
}

// Muzzle flash along +X: a front-facing star plus two crossed side petals. Shared geometry/materials;
// instances only toggle visibility, scale and roll.
let flashGeom = null;
export function createMuzzleFlash(size = 1) {
  if (!flashGeom) {
    const front = new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2);
    const s1 = new THREE.PlaneGeometry(1.6, 0.7).translate(0.8, 0, 0);
    const s2 = s1.clone().rotateX(Math.PI / 2);
    flashGeom = { front, side: mergeGeometries([s1, s2]) };
  }
  const mFront = cached('flashFront', () => new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false, color: new THREE.Color(2.2, 2.0, 1.7) }));
  const mSide = cached('flashSide', () => new THREE.MeshBasicMaterial({ map: flashSideTexture(), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false, color: new THREE.Color(2.2, 2.0, 1.7) }));
  const g = new THREE.Group();
  const a = new THREE.Mesh(flashGeom.front, mFront);
  const b = new THREE.Mesh(flashGeom.side, mSide);
  a.renderOrder = b.renderOrder = 10;
  a.frustumCulled = b.frustumCulled = false;
  g.add(a, b);
  g.scale.setScalar(size);
  g.visible = false;
  g.userData.size = size;
  return g;
}

// ---------- IK helpers ----------

// Two-bone IK in a common parent space. Returns the elbow/knee position. Inputs are Vector3 (not modified).
const _u = new THREE.Vector3(), _p = new THREE.Vector3();
export function solveTwoBone(root, target, lenA, lenB, pole, outMid) {
  _u.subVectors(target, root);
  let d = _u.length();
  if (d < 1e-5) { _u.set(0, -1, 0); d = 1e-5; } else _u.divideScalar(d);
  d = Math.min(lenA + lenB - 1e-4, Math.max(Math.abs(lenA - lenB) + 1e-4, d));
  const cosA = (lenA * lenA + d * d - lenB * lenB) / (2 * lenA * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _p.copy(pole).addScaledVector(_u, -pole.dot(_u));
  if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1).addScaledVector(_u, -_u.z);
  _p.normalize();
  return outMid.copy(root).addScaledVector(_u, lenA * cosA).addScaledVector(_p, lenA * sinA);
}

// Orient a limb bone so its local -Y axis points from `from` to `to` and local +X leans toward `front`.
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _mm = new THREE.Matrix4();
export function orientLimb(node, from, to, front) {
  _y.subVectors(from, to).normalize();
  _x.copy(front).addScaledVector(_y, -front.dot(_y));
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0).addScaledVector(_y, -_y.x);
  _x.normalize();
  _z.crossVectors(_x, _y);
  _mm.makeBasis(_x, _y, _z);
  node.quaternion.setFromRotationMatrix(_mm);
  node.position.copy(from);
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
// Frame-rate independent exponential approach.
export const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);

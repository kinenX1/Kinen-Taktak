// Modeling kit: primitive factories, a "Part" builder that bakes transforms and merges geometry per
// material (few draw calls per rigid part), shared PBR materials, glow sprites and decal textures.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeCanvas, TEAM_HEX } from '../suit.js';

export const QUALITY_LEVEL = { low: 0, medium: 1, high: 2, ultra: 3 };
export const qlevel = (q) => QUALITY_LEVEL[q] ?? 2;

// Current detail level while a template is being built (0 low … 3 ultra). Segment counts scale with it.
let detail = 2;
export function setDetail(level) { detail = level; }
export function getDetail() { return detail; }
const segs = (n, min = 3) => Math.max(min, Math.round(n * [0.5, 0.75, 1, 1.2][detail]));

// ---------- primitives (all centered at the origin, y-up) ----------

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export function rbox(w, h, d, r = 0.02, s = 2) {
  if (detail === 0) return new THREE.BoxGeometry(w, h, d);
  return new RoundedBoxGeometry(w, h, d, detail >= 2 ? s : 1, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
}
export const cyl = (rt, rb, h, n = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, segs(n), 1, open);
export const cylArc = (rt, rb, h, n, start, len, open = false) => new THREE.CylinderGeometry(rt, rb, h, segs(n), 1, open, start, len);
export const sph = (r, w = 12, h = 8, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) =>
  new THREE.SphereGeometry(r, segs(w), segs(h, 2), ps, pl, ts, tl);
export const capsule = (r, len, n = 8) => new THREE.CapsuleGeometry(r, len, segs(3, 2), segs(n));
export const torus = (R, r, n = 8, m = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, segs(n), segs(m), arc);
// Lathe from [[radius, y], ...] around the y axis.
export const lathe = (pts, n = 12) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs(n));
// Extrude a 2D outline (x, y) along +z by depth (centered on z).
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

// ---------- Part builder ----------

const KEEP = new Set(['position', 'normal', 'uv']);

function prepare(g, mat, ground) {
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  for (const k of Object.keys(g.attributes)) if (!KEEP.has(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  const uv = g.attributes.uv;
  const scale = mat.userData && mat.userData.boxUV;
  // Box-projected UVs in meters give every part the same texel density (camo/paint never stretches).
  if (scale) {
    for (let i = 0; i < n; i++) {
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (ay >= ax && ay >= az) uv.setXY(i, x / scale, z / scale);
      else if (ax >= az) uv.setXY(i, z / scale, y / scale);
      else uv.setXY(i, x / scale, y / scale);
    }
  }
  // Cheap baked ambient occlusion in vertex colors: undersides and parts close to the ground get darker.
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const ny = nor.getY(i);
    let ao = 1 - 0.38 * Math.max(0, -ny) - 0.07 * (1 - Math.abs(ny));
    if (ground != null) {
      const wy = pos.getY(i) + ground;
      const t = Math.min(1, Math.max(0, wy / 0.9));
      ao *= 0.55 + 0.45 * t * t * (3 - 2 * t);
    }
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class Part {
  // ground: height of this part's origin above the ground (enables contact darkening), or null.
  constructor(ground = null) {
    this.ground = ground;
    this.buckets = new Map();
  }

  add(g, mat, p, r, s) {
    if (!mat) throw new Error('Part.add: missing material');
    xf(g, p, r, s);
    let list = this.buckets.get(mat);
    if (!list) this.buckets.set(mat, (list = []));
    list.push(g);
    return this;
  }

  // Returns a Group of meshes (one per material). Shadow flags apply to all meshes.
  build(name = '', { cast = true, receive = true } = {}) {
    const group = new THREE.Group();
    group.name = name;
    for (const [mat, list] of this.buckets) {
      const geoms = list.map((g) => prepare(g, mat, this.ground));
      const merged = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
      for (const g of geoms) if (g !== merged) g.dispose();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast && !mat.transparent && !mat.userData.noShadow;
      mesh.receiveShadow = receive && !mat.userData.glow;
      mesh.name = name + ':' + (mat.name || 'm');
      group.add(mesh);
    }
    return group;
  }
}

// ---------- shared materials ----------

const mats = new Map();
function cached(key, make) {
  let m = mats.get(key);
  if (!m) mats.set(key, (m = make()));
  return m;
}
const std = (p) => new THREE.MeshStandardMaterial({ vertexColors: true, ...p });

export const M = {
  steel: () => cached('steel', () => std({ color: 0x45474a, metalness: 0.75, roughness: 0.48, name: 'steel' })),
  darkSteel: () => cached('darkSteel', () => std({ color: 0x26282a, metalness: 0.7, roughness: 0.5, name: 'darkSteel' })),
  gunmetal: () => cached('gunmetal', () => std({ color: 0x1d1e20, metalness: 0.65, roughness: 0.36, name: 'gunmetal' })),
  blackPoly: () => cached('blackPoly', () => std({ color: 0x18191a, metalness: 0.05, roughness: 0.6, name: 'blackPoly' })),
  rubber: () => cached('rubber', () => std({ color: 0x151515, roughness: 0.94, name: 'rubber' })),
  tire: () => cached('tire', () => std({ color: 0x1b1b1c, roughness: 0.9, name: 'tire' })),
  track: () => cached('track', () => std({ color: 0x2f2e2c, metalness: 0.55, roughness: 0.75, name: 'track' })),
  canvas: () => cached('canvas', () => std({ color: 0x5b5a44, roughness: 0.95, name: 'canvas' })),
  wood: () => cached('wood', () => std({ color: 0x6b4527, roughness: 0.7, name: 'wood' })),
  olive: () => cached('olive', () => std({ color: 0x4a4f36, roughness: 0.7, metalness: 0.1, name: 'olive' })),
  brass: () => cached('brass', () => std({ color: 0xb08a3e, metalness: 0.9, roughness: 0.32, name: 'brass' })),
  copper: () => cached('copper', () => std({ color: 0x8a5a3a, metalness: 0.85, roughness: 0.4, name: 'copper' })),
  white: () => cached('white', () => std({ color: 0xd9d9d4, roughness: 0.6, name: 'white' })),
  greyPaint: () => cached('greyPaint', () => std({ color: 0x6d7173, roughness: 0.65, metalness: 0.2, name: 'greyPaint' })),
  heatMetal: () => cached('heatMetal', () => std({ color: 0x5b5249, metalness: 0.85, roughness: 0.38, name: 'heatMetal' })),
  interior: () => cached('interior', () => std({ color: 0xc9cbbf, roughness: 0.75, metalness: 0.05, name: 'interior' })),
  interiorDark: () => cached('interiorDark', () => std({ color: 0x2b2e2a, roughness: 0.8, name: 'interiorDark' })),
  seat: () => cached('seat', () => std({ color: 0x2f3127, roughness: 0.95, name: 'seat' })),
  glass: () => cached('glass', () => {
    const m = new THREE.MeshStandardMaterial({ color: 0x1a2a2e, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.38, depthWrite: false, name: 'glass' });
    m.userData.noShadow = true;
    return m;
  }),
  canopy: () => cached('canopy', () => {
    const m = new THREE.MeshStandardMaterial({ color: 0x3a3424, metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.32, depthWrite: false, name: 'canopy' });
    m.userData.noShadow = true;
    return m;
  }),
  periscope: () => cached('periscope', () => {
    const m = new THREE.MeshStandardMaterial({ color: 0x5b8a7a, metalness: 0.2, roughness: 0.02, transparent: true, opacity: 0.16, depthWrite: false, name: 'periscope' });
    m.userData.noShadow = true;
    return m;
  }),
  lens: () => cached('lens', () => std({ color: 0x0b1316, metalness: 0.4, roughness: 0.05, name: 'lens' })),
  // Emissive "lights": bright enough to trigger bloom.
  glow: (hex, intensity = 2.5) => cached('glow' + hex + intensity, () => {
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: hex, emissiveIntensity: intensity, roughness: 0.4, name: 'glow' });
    m.userData.glow = true;
    return m;
  }),
  team: (team) => cached('team' + team, () => std({ color: TEAM_HEX[team] || TEAM_HEX.def, roughness: 0.6, metalness: 0.1, name: 'team' })),
  teamGlow: (team) => cached('teamGlow' + team, () => {
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: TEAM_HEX[team] || TEAM_HEX.def, emissiveIntensity: 2.2, name: 'teamGlow' });
    m.userData.glow = true;
    return m;
  }),
  // Dark charred material used when a unit is wrecked.
  burnt: () => cached('burnt', () => std({ color: 0x1c1a18, roughness: 0.95, metalness: 0.2, name: 'burnt' })),
  burntMetal: () => cached('burntMetal', () => std({ color: 0x2e2621, roughness: 0.85, metalness: 0.5, name: 'burntMetal' })),
};

// Screen textures for cockpit displays and the drone camera: canvas → emissive map.
export function screenMaterial(kind) {
  return cached('screen' + kind, () => {
    const c = makeCanvas(128, 96);
    const x = c.getContext('2d');
    x.fillStyle = '#020604'; x.fillRect(0, 0, 128, 96);
    const green = '#5dff8a', amber = '#ffb347';
    x.lineWidth = 2;
    if (kind === 'map') {
      x.strokeStyle = '#1f6b3a';
      for (let i = 0; i < 128; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 96); x.stroke(); }
      for (let i = 0; i < 96; i += 16) { x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
      x.strokeStyle = green; x.beginPath(); x.moveTo(64, 70); x.lineTo(58, 82); x.lineTo(70, 82); x.closePath(); x.stroke();
      x.fillStyle = '#ff5544'; x.fillRect(30, 26, 6, 6); x.fillRect(90, 40, 6, 6);
    } else if (kind === 'attitude') {
      x.fillStyle = '#123a5c'; x.fillRect(0, 0, 128, 46);
      x.fillStyle = '#4a2f12'; x.fillRect(0, 46, 128, 50);
      x.strokeStyle = '#fff';
      for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(48, 46 + i * 12); x.lineTo(80, 46 + i * 12); x.stroke(); }
      x.strokeStyle = amber; x.beginPath(); x.moveTo(36, 48); x.lineTo(58, 48); x.lineTo(64, 54); x.lineTo(70, 48); x.lineTo(92, 48); x.stroke();
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
    } else { // generic status text page
      x.fillStyle = green; x.font = 'bold 11px monospace';
      ['SYS  OK', 'FUEL 82%', 'AMMO RDY', 'COMM  2', 'NAV  GPS'].forEach((t, i) => x.fillText(t, 10, 18 + i * 16));
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.6, roughness: 0.3, name: 'screen-' + kind });
    m.userData.glow = true;
    return m;
  });
}

// ---------- decals ----------

function decalMaterial(key, draw, size = 128) {
  return cached('decal' + key, () => {
    const c = makeCanvas(size, size);
    draw(c.getContext('2d'), size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.7, metalness: 0.05,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, name: 'decal-' + key });
    m.userData.noShadow = true;
    return m;
  });
}

// Team roundel: Defenders = blue disc with a white star, Attackers = red disc with a white chevron.
export function roundelMaterial(team) {
  const hex = TEAM_HEX[team] || TEAM_HEX.def;
  return decalMaterial('roundel' + team, (x, S) => {
    const c = S / 2;
    x.fillStyle = '#e8e6df'; x.beginPath(); x.arc(c, c, S * 0.48, 0, Math.PI * 2); x.fill();
    x.fillStyle = hex; x.beginPath(); x.arc(c, c, S * 0.42, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f2f0ea';
    x.beginPath();
    if (team === 'atk') {
      x.moveTo(c - S * 0.24, c - S * 0.12); x.lineTo(c, c + S * 0.14); x.lineTo(c + S * 0.24, c - S * 0.12);
      x.lineTo(c + S * 0.24, c + S * 0.04); x.lineTo(c, c + S * 0.3); x.lineTo(c - S * 0.24, c + S * 0.04);
    } else {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? S * 0.12 : S * 0.3;
        x.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
    }
    x.closePath(); x.fill();
  });
}

// Team identification stripe (chevron band) for hull sides / tails.
export function stripeMaterial(team) {
  const hex = TEAM_HEX[team] || TEAM_HEX.def;
  return decalMaterial('stripe' + team, (x, S) => {
    x.fillStyle = hex; x.fillRect(0, S * 0.2, S, S * 0.6);
    x.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < S; i += 6) x.fillRect(i, S * 0.2, 1, S * 0.6);
  });
}

// Stenciled hull number.
export function numberMaterial(text) {
  return decalMaterial('num' + text, (x, S) => {
    x.fillStyle = 'rgba(0,0,0,0)'; x.clearRect(0, 0, S, S);
    x.fillStyle = '#e4e0d0'; x.font = `bold ${S * 0.42}px monospace`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, S / 2, S / 2);
  });
}

// ---------- glow sprites & muzzle flash ----------

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

export function additiveMaterial(hex, opacity = 1, side = THREE.DoubleSide) {
  return cached('add' + hex + opacity + side, () => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, side, toneMapped: false }));
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
  // Star-shaped petals like a real flash hider burst.
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

// Muzzle flash: a front-facing star plus two crossed side "cones" along +X. Shared geometry/materials;
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
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const mSide = cached('flashSide', () => new THREE.MeshBasicMaterial({ map: flashSideTexture(), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const g = new THREE.Group();
  const a = new THREE.Mesh(flashGeom.front, mFront);
  const b = new THREE.Mesh(flashGeom.side, mSide);
  a.renderOrder = b.renderOrder = 10;
  g.add(a, b);
  g.scale.setScalar(size);
  g.visible = false;
  g.userData.size = size;
  return g;
}

// ---------- instancing helpers ----------

// Clone a cached template: geometry and materials stay shared. Returns the clone and a name → node map.
export function instantiate(template) {
  const obj = template.clone(true);
  const nodes = {};
  obj.traverse((o) => { if (o.name && !o.isMesh) nodes[o.name] = o; });
  return { obj, nodes };
}

export function countTriangles(obj) {
  let t = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    t += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
  });
  return Math.round(t);
}

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

// Orient a limb node so its local -Y axis points from `from` to `to`, local +X toward `front` (twist).
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

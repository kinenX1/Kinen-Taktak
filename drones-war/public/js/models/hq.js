// The defenders' HQ: a 16-sided concrete command bunker inside the physics cylinder (radius 9, height 12).
//
//   const hq = createHQModel(world.hq, { quality, timeOfDay });  // hq = { x, z, r, h, hp }
//   scene.add(hq.object);                                        // placed at (x, 0, z), door facing west
//   hq.setHp(hp / world.hq.hp);   // on every snapshot; returns true when the damage state changed
//   hq.update(dt, time);          // every frame (flag, beacon, fire glow, window flicker)
//   effects.burning('hq', hq.anchors.center.getWorldPosition(v), hq.fire);   // fire/smoke per state
//   hq.dispose();
//
// Contract with the physics (shared/physics.js): ground units collide with a vertical cylinder r 9, h 12 and
// aircraft land on its roof at exactly y = 12 within (r + aircraft radius) of the centre. So:
//  * nothing below y = 12 reaches past r = 9 (corners of the 16-gon are at r 8.72, the plinth at 8.97);
//  * the roof deck is flat at exactly y = 12.000 (the helipad paint is a texture, not geometry) and only a
//    0.42 m parapet stands on its rim; everything else on the roof is below 1.1 m and beyond r 6.5;
//  * the one tall prop, the comms mast with the flag, stands on the east rim (the side away from the door)
//    and is the only thing above 12.45 m. Its top section is thin and clears a landed helicopter's rotor.
//  * the door faces west (-x), toward the compound gate; blast walls from the world surround it.
//
// Damage states (hysteresis 0.03): 0 intact > 0.66, 1 damaged 0.33-0.66, 2 critical 0-0.33, 3 destroyed
// (rubble mound). `hq.fire` is the intensity to feed Effects.burning for the current state (it pulses a
// little every update); `hq.smoke` is the matching smoke density 0..1 for anything else that wants it.
// The physics cylinder never changes: in states 1-2 the roof stays at 12 m so aircraft can still land.
//
// Everything is built per instance (one HQ per match) and owned by it: geometry, textures and the few
// materials that are animated; only the kit's shared solid material is borrowed. `hq.materials` lists the
// owned materials so the world can patch them (e.g. its fog scale).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  box, cyl, cylX, cylZ, sph, torus, extrude, plane, xf, F, uber, solidMaterial, qlevel, setDetail, getDetail,
  clamp, smooth,
} from './kit.js';
import { makeCanvas, makeFbm, mulberry32, TEAM_HEX } from '../suit.js';

// ---------- public constants ----------

export const HQ_THRESHOLDS = [0.66, 0.33, 0.001]; // entering state i+1 needs hp fraction below [i]
export const HQ_HYSTERESIS = 0.03;
/** Effects.burning intensity and smoke density per damage state. */
export const HQ_FIRE = [0, 0.3, 0.8, 1];
export const HQ_SMOKE = [0, 0.35, 0.8, 1];
export const HQ_STATE_NAMES = ['intact', 'damaged', 'critical', 'destroyed'];
export const HQ_ROOF_Y = 12;

// ---------- layout (HQ-local metres, y up, ground at 0, door toward -x) ----------

const N = 16, STEP = (Math.PI * 2) / N;
const RC = 8.72; // circumradius of the wall polygon
const AP = RC * Math.cos(Math.PI / N); // apothem 8.552
const R_PLINTH = 8.97;
const Y0 = 0.55; // wall base
const Y_STRING = 4.95, Y_BAND = 10.0, Y_CORNICE = 11.1;
const PAD = 7.5; // clear landing radius on the roof (nothing above 1.1 m inside it except the parapet)
const TILE = 2.4; // metres per concrete texture tile
const TEAM_PAINT = '#2f6fd6'; // team blue as painted (the HQ_HEX blue is too light on a wall)

const hashN = (x, y, z) => {
  let h = Math.imul(Math.round(x * 997) ^ 0x1b873593, 0x85ebca6b) ^ Math.imul(Math.round(y * 991) ^ 0x5bd1e995, 0xc2b2ae35)
    ^ Math.imul(Math.round(z * 983) ^ 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};
// Smooth 2D value noise (not tileable), for stains.
function vnoise(u, v) {
  const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
  const a = hashN(iu, iv, 1), b = hashN(iu + 1, iv, 1), c = hashN(iu, iv + 1, 1), d = hashN(iu + 1, iv + 1, 1);
  const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

// Facet k (0 = the door facet, facing -x): outward normal n, local +x direction ("right" seen from outside).
const FR = Array.from({ length: N }, (_, k) => {
  const c = Math.PI + k * STEP;
  return { c, nx: Math.cos(c), nz: Math.sin(c), tx: Math.sin(c), tz: -Math.cos(c), rotY: Math.PI / 2 - c };
});
const corner = (j, R, y, out = [0, 0, 0]) => {
  const b = Math.PI + (j - 0.5) * STEP; // corner j sits between facet j-1 and facet j
  out[0] = Math.cos(b) * R; out[1] = y; out[2] = Math.sin(b) * R;
  return out;
};

// ---------- concrete shading baked into vertex colors ----------

function wallShade(x, y, z, nx, ny) {
  let k = 1 - 0.36 * Math.max(0, -ny) - 0.06 * (1 - Math.abs(ny));
  k *= 1 - 0.42 * smooth(1 - y / 1.8); // splash dirt at the base
  k *= 1 - 0.11 * smooth((y - 9.6) / 0.9) * (1 - smooth((y - 11.0) / 0.9)); // soot under the cornice
  const a = Math.atan2(z, x);
  k *= 0.93 + 0.12 * vnoise(a * 9, y * 0.2); // long rain streaks
  k *= 0.97 + 0.06 * hashN(x, y, z);
  return k;
}
const flatShade = (x, y, z, nx, ny) => 1 - 0.36 * Math.max(0, -ny) - 0.06 * (1 - Math.abs(ny));

// ---------- static geometry collector ----------

const _col = new THREE.Color();

class Mesher {
  constructor(solid) {
    this.solid = solid;
    this.buckets = new Map();
    this.shade = wallShade;
    this.tris = 0;
  }

  // Finish: { c, r, m, mat?, keepUV? }, an unlit emitter { mat, c, i, unlit: true }, or a Material (decals).
  add(g, f, p = null, r = null, s = null, shade = this.shade) {
    let mat, c = 0xffffff, rough = 0.8, metal = 0, inten = 1, unlit = false, keepUV = false;
    if (f.isMaterial) { mat = f; unlit = true; } else {
      mat = f.mat || this.solid;
      c = f.c ?? 0xffffff; rough = f.r ?? 0.8; metal = f.m ?? 0; unlit = !!f.unlit; inten = f.i ?? 1; keepUV = !!f.keepUV;
    }
    xf(g, p, r, s);
    if (g.index) { const ng = g.toNonIndexed(); g.dispose(); g = ng; }
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    const n = g.attributes.position.count;
    const pos = g.attributes.position, nor = g.attributes.normal;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const scale = !keepUV && mat.userData && mat.userData.boxUV;
    if (scale) {
      const uv = g.attributes.uv;
      for (let i = 0; i < n; i++) {
        const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (ay >= ax && ay >= az) uv.setXY(i, x / scale, z / scale);
        else if (ax >= az) uv.setXY(i, z / scale, y / scale);
        else uv.setXY(i, x / scale, y / scale);
      }
    }
    _col.set(c);
    const col = new Float32Array(n * 3), rm = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const k = unlit ? inten : shade(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i));
      col[i * 3] = _col.r * k; col[i * 3 + 1] = _col.g * k; col[i * 3 + 2] = _col.b * k;
      rm[i * 2] = rough; rm[i * 2 + 1] = metal;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('rm', new THREE.BufferAttribute(rm, 2));
    let list = this.buckets.get(mat);
    if (!list) this.buckets.set(mat, (list = []));
    list.push(g);
    return this;
  }

  // Add geometry on facet k: tx = offset along the facet, y = height, rd = distance of the geometry's centre
  // from the wall plane (a box of depth d lying on the wall has rd = d / 2). Local +z is the outward normal.
  on(k, g, f, tx, y, rd, rotZ = 0, shade) {
    const fr = FR[((k % N) + N) % N];
    if (rotZ) g.rotateZ(rotZ);
    return this.add(g, f, [fr.nx * (AP + rd) + fr.tx * tx, y, fr.nz * (AP + rd) + fr.tz * tx], [0, fr.rotY, 0], null, shade);
  }

  build() {
    const out = [];
    for (const [material, list] of this.buckets) {
      const geometry = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (list.length > 1) for (const g of list) g.dispose();
      this.tris += geometry.attributes.position.count / 3;
      geometry.computeBoundingSphere();
      out.push({ geometry, material });
    }
    this.buckets.clear();
    return out;
  }
}

// ---------- raw geometry helpers ----------

// Flat-shaded 16-gon frustum from (R0, y0) to (R1, y1); optional top cap. UVs in texture tiles (metres / TILE).
function prism(R0, R1, y0, y1, { cap = false, inward = false } = {}) {
  const pos = [], uv = [];
  const side = (R0 * Math.sin(Math.PI / N) * 2);
  const A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0], D = [0, 0, 0];
  const push = (p, u, v) => { pos.push(p[0], p[1], p[2]); uv.push(u, v); };
  for (let k = 0; k < N; k++) {
    corner(k, R0, y0, A); corner(k + 1, R0, y0, B); corner(k, R1, y1, C); corner(k + 1, R1, y1, D);
    // Seen from outside: A is bottom-right, B bottom-left, C top-right, D top-left. CCW = (B, A, C), (B, C, D).
    const u0 = (k * side) / TILE, u1 = u0 + side / TILE, v0 = y0 / TILE, v1 = y1 / TILE;
    const tri = inward ? [[A, u0, v0], [B, u1, v0], [C, u0, v1], [B, u1, v0], [D, u1, v1], [C, u0, v1]]
      : [[B, u1, v0], [A, u0, v0], [C, u0, v1], [B, u1, v0], [C, u0, v1], [D, u1, v1]];
    for (const [p, u, v] of tri) push(p, u, v);
  }
  if (cap) {
    const ctr = [0, y1, 0];
    for (let k = 0; k < N; k++) {
      corner(k, R1, y1, A); corner(k + 1, R1, y1, B);
      // Up-facing: viewed from above (+y looking down) CCW is (center, B?, A?) -> verify by normal below.
      push(ctr, 0.5, 0.5); push(B, 0.5, 0.5); push(A, 0.5, 0.5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// Flat 16-gon disc facing up at height y (roof deck): UV is planar over the 18 m square (u = x, v = -z).
function deck(R, y) {
  const pos = [], uv = [];
  const A = [0, 0, 0], B = [0, 0, 0];
  const put = (p) => { pos.push(p[0], p[1], p[2]); uv.push(p[0] / (2 * 9) + 0.5, 0.5 - p[2] / (2 * 9)); };
  for (let k = 0; k < N; k++) {
    corner(k, R, y, A); corner(k + 1, R, y, B);
    put([0, y, 0]); put(A); put(B); // A -> B runs from +z to -z around the door side; CCW seen from above
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// A hollow wall ring (parapet): outer wall, inner wall, top. Optional list of facets to build (default all).
function ringWall(Ro, Ri, y0, y1, facets = null) {
  const parts = [];
  const list = facets || Array.from({ length: N }, (_, i) => i);
  for (const k of list) {
    const pos = [];
    const a = corner(k, Ro, y0), b = corner(k + 1, Ro, y0), c = corner(k, Ro, y1), d = corner(k + 1, Ro, y1);
    const e = corner(k, Ri, y0), f = corner(k + 1, Ri, y0), g2 = corner(k, Ri, y1), h = corner(k + 1, Ri, y1);
    const quad = (bl, br, tr, tl) => pos.push(...bl, ...br, ...tr, ...bl, ...tr, ...tl);
    quad(b, a, c, d); // outer
    quad(e, f, h, g2); // inner (reversed)
    quad(d, c, g2, h); // top: outer-left, outer-right, inner-right, inner-left (CCW from above)
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    parts.push(g);
  }
  const m = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return m;
}

// Flat polygon with a jagged outline in the XY plane facing +z (damage patches, breach voids).
function blob(rx, ry, rand, jag = 0.25, n = 12) {
  const pos = [];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = 1 - jag * rand();
    pts.push([Math.cos(a) * rx * r, Math.sin(a) * ry * r]);
  }
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    pos.push(0, 0, 0, p[0], p[1], 0, q[0], q[1], 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Irregular rubble chunk (20 triangles), flat shaded.
function chunk(rand, sx, sy, sz) {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const f = 0.65 + 0.7 * hashN(x + 0.1, y + 0.2, z + 0.3) + 0.0 * rand();
    pos.setXYZ(i, x * f * sx, y * f * sy, z * f * sz);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- textures ----------

function concreteTexture(size, rand) {
  const c = makeCanvas(size), x = c.getContext('2d');
  const fbm = makeFbm(rand, 6, 4), fine = makeFbm(rand, 28, 2);
  const img = x.createImageData(size, size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = i / size, v = j / size, n = fbm(u, v), f = fine(u, v);
      const base = 176 + (n - 0.5) * 40 + (f - 0.5) * 30;
      const k = (i + j * size) * 4;
      img.data[k] = base; img.data[k + 1] = base * 0.985; img.data[k + 2] = base * 0.95; img.data[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const S = size;
  // Vertical rain streaks.
  for (let i = 0; i < 18; i++) {
    const px = rand() * S, w = 2 + rand() * 5, len = S * (0.3 + 0.6 * rand()), py = rand() * (S - len);
    const g = x.createLinearGradient(0, py, 0, py + len);
    g.addColorStop(0, 'rgba(60,55,48,0.0)'); g.addColorStop(0.3, 'rgba(60,55,48,0.10)'); g.addColorStop(1, 'rgba(60,55,48,0)');
    x.fillStyle = g; x.fillRect(px, py, w, len);
  }
  // Pores.
  x.fillStyle = 'rgba(50,46,40,0.55)';
  for (let i = 0; i < size * 0.25; i++) x.fillRect(rand() * S, rand() * S, 1 + rand() * 1.5, 1 + rand() * 1.5);
  // Formwork seams on the tile edges (the texture wraps, so every panel edge gets one).
  x.fillStyle = 'rgba(38,36,32,0.6)'; x.fillRect(0, 0, S, 2.5); x.fillRect(0, 0, 2.5, S);
  x.fillStyle = 'rgba(240,235,225,0.22)'; x.fillRect(0, 2.5, S, 1.5); x.fillRect(2.5, 0, 1.5, S);
  // Form-tie holes every 0.6 m.
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      const cx = (a + 0.5) * S / 4, cy = (b + 0.5) * S / 4;
      x.fillStyle = 'rgba(34,32,28,0.85)'; x.beginPath(); x.arc(cx, cy, S * 0.0095, 0, Math.PI * 2); x.fill();
      x.strokeStyle = 'rgba(225,220,210,0.35)'; x.lineWidth = 1.2; x.beginPath(); x.arc(cx, cy, S * 0.0135, 0, Math.PI * 2); x.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// The roof deck as one picture: weathered slab, team-blue border ring, helipad ring and H, stains.
function roofTexture(size, rand) {
  const c = makeCanvas(size), x = c.getContext('2d');
  const S = size, m = (v) => (v / 18) * S + S / 2; // metres from the centre -> px
  const px = (v) => (v / 18) * S;
  x.fillStyle = '#7d7a72'; x.fillRect(0, 0, S, S);
  const fbm = makeFbm(rand, 5, 3);
  const q = Math.max(4, S / 128 | 0);
  for (let j = 0; j < S; j += q) {
    for (let i = 0; i < S; i += q) {
      const n = fbm(i / S, j / S);
      const v = Math.round(112 + (n - 0.5) * 46 + (rand() - 0.5) * 12);
      x.fillStyle = `rgb(${v},${v - 1},${v - 5})`;
      x.fillRect(i, j, q, q);
    }
  }
  // Expansion joints (a 3 m grid), the deck is poured in slabs.
  x.fillStyle = 'rgba(30,28,25,0.55)';
  for (let g = -9; g <= 9; g += 3) { x.fillRect(m(g) - 1, 0, 2, S); x.fillRect(0, m(g) - 1, S, 2); }
  // Painted markings (white/yellow, a little worn).
  const ring = (r, w, col) => { x.strokeStyle = col; x.lineWidth = px(w); x.beginPath(); x.arc(S / 2, S / 2, px(r), 0, Math.PI * 2); x.stroke(); };
  ring(8.15, 0.5, TEAM_PAINT);
  ring(7.7, 0.12, '#e9e6dc');
  ring(6.2, 0.34, '#ece9df');
  ring(5.7, 0.12, '#e8c63a');
  x.fillStyle = '#ece9df';
  x.fillRect(S / 2 - px(1.25), S / 2 - px(1.45), px(0.5), px(2.9)); // H: left leg
  x.fillRect(S / 2 + px(0.75), S / 2 - px(1.45), px(0.5), px(2.9)); // right leg
  x.fillRect(S / 2 - px(1.25), S / 2 - px(0.25), px(2.5), px(0.5)); // bar
  // Chevrons pointing at the heli approach (west).
  x.fillStyle = '#e8c63a';
  for (let i = 0; i < 3; i++) {
    const cx = m(-7.0) + px(i * 0.0), cy = S / 2;
    x.beginPath(); x.moveTo(cx - px(0.3), cy - px(0.9 - i * 0.18)); x.lineTo(cx + px(0.5), cy); x.lineTo(cx - px(0.3), cy + px(0.9 - i * 0.18));
    x.lineTo(cx - px(0.55), cy + px(0.9 - i * 0.18)); x.lineTo(cx + px(0.25), cy); x.lineTo(cx - px(0.55), cy - px(0.9 - i * 0.18)); x.closePath();
    if (i === 0) x.fill();
  }
  // Wear: scuffs over the paint, oil stains, tyre-like skid marks, bird droppings.
  for (let i = 0; i < 70; i++) {
    x.fillStyle = `rgba(${90 + rand() * 30 | 0},${88 + rand() * 30 | 0},${82 + rand() * 24 | 0},${0.18 + rand() * 0.25})`;
    x.fillRect(rand() * S, rand() * S, 2 + rand() * px(0.5), 1 + rand() * 3);
  }
  for (let i = 0; i < 10; i++) {
    const cx = rand() * S, cy = rand() * S, r = px(0.4 + rand() * 1.2);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(25,22,20,0.38)'); g.addColorStop(1, 'rgba(25,22,20,0)');
    x.fillStyle = g; x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Soft soot / blast scorch picture (alpha only, on a black decal): irregular core with rising streaks.
function scorchTexture(size, rand) {
  const c = makeCanvas(size), x = c.getContext('2d');
  const S = size, cx = S / 2, cy = S * 0.58;
  x.clearRect(0, 0, S, S);
  const blob1 = x.createRadialGradient(cx, cy, 0, cx, cy, S * 0.34);
  blob1.addColorStop(0, 'rgba(255,255,255,0.95)'); blob1.addColorStop(0.55, 'rgba(255,255,255,0.55)'); blob1.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = blob1; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 18; i++) { // rays thrown out by the blast
    const a = rand() * Math.PI * 2, len = S * (0.16 + 0.3 * rand()), w = S * (0.012 + 0.03 * rand());
    x.save(); x.translate(cx, cy); x.rotate(a);
    const g = x.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, -w / 2, len, w); x.restore();
  }
  for (let i = 0; i < 6; i++) { // soot climbing the wall
    const px = cx + (rand() - 0.5) * S * 0.3, w = S * (0.03 + 0.05 * rand()), len = S * (0.25 + 0.3 * rand());
    const g = x.createLinearGradient(0, cy, 0, cy - len);
    g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(px - w / 2, cy - len, w, len);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function flagTexture() {
  const c = makeCanvas(128, 80), x = c.getContext('2d');
  x.fillStyle = TEAM_HEX.def; x.fillRect(0, 0, 128, 80);
  x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(0, 5, 128, 4); x.fillRect(0, 71, 128, 4);
  x.fillStyle = '#eef3ff'; x.beginPath(); x.arc(64, 40, 25, 0, Math.PI * 2); x.fill();
  x.fillStyle = TEAM_HEX.def; x.beginPath(); x.arc(64, 40, 21, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#eef3ff'; x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 7 : 17;
    x.lineTo(64 + Math.cos(a) * r, 40 + Math.sin(a) * r);
  }
  x.closePath(); x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- flag cloth ----------

const FLAG_W = 3.4, FLAG_H = 2.1, FLAG_C = 14, FLAG_R = 7;

// Cloth in the XY plane (hoist at x = 0), rotated so it hangs off the mast toward -z. `keep(i, j)` drops quads (tears).
function flagGeometry(keep, shortenTo = 1) {
  const nv = (FLAG_C + 1) * (FLAG_R + 1);
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  for (let j = 0; j <= FLAG_R; j++) {
    for (let i = 0; i <= FLAG_C; i++) {
      const v = i + j * (FLAG_C + 1), u = i / FLAG_C, w = j / FLAG_R;
      pos[v * 3] = u * FLAG_W * shortenTo; pos[v * 3 + 1] = (w - 0.5) * FLAG_H; pos[v * 3 + 2] = 0;
      nor[v * 3 + 2] = 1;
      uv[v * 2] = u; uv[v * 2 + 1] = w;
    }
  }
  const idx = [];
  for (let j = 0; j < FLAG_R; j++) {
    for (let i = 0; i < FLAG_C; i++) {
      if (keep && !keep(i, j)) continue;
      const a = i + j * (FLAG_C + 1), b = a + 1, c = a + FLAG_C + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.userData.base = pos.slice(); // rest shape, for the wave
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(FLAG_W / 2, 0, 0), FLAG_W * 0.9);
  return g;
}

// Wave the cloth in place (no allocation). Amplitude grows from the hoist to the free edge.
function waveFlag(g, t, amp) {
  const pos = g.attributes.position.array, nor = g.attributes.normal.array, base = g.userData.base;
  const k = 4.2, w = 5.2;
  for (let j = 0; j <= FLAG_R; j++) {
    for (let i = 0; i <= FLAG_C; i++) {
      const v = i + j * (FLAG_C + 1), u = i / FLAG_C, y = base[v * 3 + 1], x = base[v * 3];
      const ph = k * x - w * t + 1.3 * j / FLAG_R * 2;
      const s = Math.sin(ph), c = Math.cos(ph), a = amp * u * (0.35 + 0.65 * u);
      pos[v * 3] = x - 0.06 * a * (1 - c); pos[v * 3 + 1] = y - 0.05 * a * s * u; pos[v * 3 + 2] = a * s;
      const dzdx = a * k * c + (amp / FLAG_W) * s * 0.3, dzdy = a * 0.6 * c;
      const l = 1 / Math.hypot(dzdx, dzdy, 1);
      nor[v * 3] = -dzdx * l; nor[v * 3 + 1] = -dzdy * l; nor[v * 3 + 2] = l;
    }
  }
  g.attributes.position.needsUpdate = true;
  g.attributes.normal.needsUpdate = true;
}

// ---------- the building ----------

const CONC = { c: 0xffffff, r: 0.92, m: 0 };
const concA = (mat) => ({ mat, c: 0xffffff, r: 0.92, m: 0, keepUV: true });
const STEELF = { c: 0x30363a, r: 0.55, m: 0.75 };
const PAINT_BLUE = { c: TEAM_PAINT, r: 0.55, m: 0.05 };
const WHITE_PAINT = { c: 0xe6e3d8, r: 0.6, m: 0 };
const YEL = { c: 0xd9b21e, r: 0.55, m: 0.05 };
const BLACKF = { c: 0x17181a, r: 0.7, m: 0.2 };
const GLASS = { c: 0x0b141c, r: 0.08, m: 0.65 };
const DOORF = { c: 0x3d4a3b, r: 0.5, m: 0.65 };
const RUST = { c: 0x6a3d22, r: 0.8, m: 0.5 };
const SOOTC = { c: 0x14120f, r: 0.95, m: 0 };

// Detail switches by quality level (0 low .. 3 ultra).
const detailOf = (lvl) => ({ frames: lvl >= 1, fine: lvl >= 2, texture: lvl >= 1, texSize: lvl >= 3 ? 512 : lvl === 2 ? 512 : 256,
  chunks: [60, 110, 180, 230][lvl], flagSegs: lvl >= 1 });

function wall(m, env) {
  // The 16 wall facets as subdivided quads so the dirt gradient bakes into the vertices.
  const c = concA(env.concrete);
  const g = prism(RC, RC, Y0, Y_CORNICE);
  // Subdivide by building each facet from rows: simplest is more prisms stacked in 1 m rows.
  g.dispose();
  const rows = env.d.fine ? 11 : 5;
  for (let r = 0; r < rows; r++) {
    const y0 = Y0 + ((Y_CORNICE - Y0) * r) / rows, y1 = Y0 + ((Y_CORNICE - Y0) * (r + 1)) / rows;
    m.add(prism(RC, RC, y0, y1), c);
  }
}

function plinth(m, env, dark = 1) {
  const c = concA(env.concrete);
  m.add(prism(R_PLINTH, R_PLINTH, 0, 0.18), c);
  m.add(prism(R_PLINTH, R_PLINTH, 0.18, 0.42), c);
  m.add(prism(R_PLINTH, 8.8, 0.42, 0.62), c);
  if (dark !== 1) return;
}

function cornices(m, env) {
  const c = concA(env.concrete);
  m.add(prism(8.88, 8.88, Y_STRING, Y_STRING + 0.14), c);
  m.add(prism(8.88, 8.76, Y_STRING + 0.14, Y_STRING + 0.24), c);
  m.add(prism(RC, 8.94, Y_CORNICE, Y_CORNICE + 0.26), c);
  m.add(prism(8.94, 8.94, Y_CORNICE + 0.26, HQ_ROOF_Y), c);
  // Team-blue painted band and a thin white line under it.
  m.add(prism(RC + 0.03, RC + 0.03, Y_BAND, Y_BAND + 0.46), PAINT_BLUE);
  m.add(prism(RC + 0.03, RC + 0.03, Y_BAND - 0.12, Y_BAND - 0.04), WHITE_PAINT);
}

function pilasters(m, env) {
  const c = { mat: env.concrete, c: 0xffffff, r: 0.93, m: 0 };
  for (let j = 0; j < N; j++) {
    const b = Math.PI + (j - 0.5) * STEP, ca = Math.cos(b), sa = Math.sin(b);
    const g = box(0.56, Y_CORNICE - Y0 - 0.05, 0.4);
    // local z (depth) along the corner's radial direction
    m.add(g, c, [ca * 8.7, (Y_CORNICE + Y0) / 2, sa * 8.7], [0, Math.PI / 2 - b, 0]);
  }
}

function windowAt(m, env, k, tx, yc, w, h, lit, shutter) {
  const d = env.d;
  m.on(k, plane(w, h), GLASS, tx, yc, 0.012);
  if (lit) env.lit.push({ k, tx, yc, w, h });
  if (d.frames) {
    const t = 0.1, dp = 0.14;
    m.on(k, box(w + 2 * t, t, dp), STEELF, tx, yc + h / 2 + t / 2, dp / 2);
    m.on(k, box(w + 2 * t, t, dp), STEELF, tx, yc - h / 2 - t / 2, dp / 2);
    m.on(k, box(t, h, dp), STEELF, tx - w / 2 - t / 2, yc, dp / 2);
    m.on(k, box(t, h, dp), STEELF, tx + w / 2 + t / 2, yc, dp / 2);
    m.on(k, box(w + 0.35, 0.12, 0.26), { c: 0x8f8b81, r: 0.9, m: 0 }, tx, yc - h / 2 - 0.16, 0.13); // sill
    if (shutter) { // armoured shutter half lowered
      const sh = h * shutter;
      m.on(k, box(w + 0.02, sh, 0.06), DOORF, tx, yc + h / 2 - sh / 2, 0.06);
      for (let i = 1; i < 4; i++) m.on(k, box(w + 0.03, 0.025, 0.075), BLACKF, tx, yc + h / 2 - (sh * i) / 4, 0.065);
    }
  }
}

function emblem(m, k, tx, y, r) {
  m.on(k, cylZ(r, 0.05, 20), WHITE_PAINT, tx, y, 0.025);
  m.on(k, cylZ(r * 0.88, 0.06, 20), PAINT_BLUE, tx, y, 0.035);
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.26 : r * 0.62;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  m.on(k, extrude(pts, 0.04), WHITE_PAINT, tx, y, 0.075);
}

function doorFacet(m, env) {
  const k = 0;
  const d = env.d;
  const conc = { c: 0xa9a59b, r: 0.9, m: 0 };
  // Portal frame (jambs + lintel), blast door recessed in it.
  m.on(k, box(0.42, 3.9, 0.3), conc, -1.25, Y0 + 1.95, 0.15);
  m.on(k, box(0.42, 3.9, 0.3), conc, 1.25, Y0 + 1.95, 0.15);
  m.on(k, box(2.92, 0.5, 0.3), conc, 0, Y0 + 3.9 + 0.05, 0.15);
  m.on(k, box(2.1, 3.2, 0.14), DOORF, 0, Y0 + 1.6, 0.0);
  m.on(k, plane(2.1, 3.25), { c: 0x050607, r: 0.9, m: 0 }, 0, Y0 + 1.62, -0.05);
  // Door details: ribs, hinge barrels, wheel, observation slit, keypad.
  for (const y of [0.8, 1.6, 2.4]) m.on(k, box(1.9, 0.07, 0.04), STEELF, 0, Y0 + y, 0.17);
  for (const y of [0.45, 1.6, 2.75]) for (const s of [-1, 1]) m.on(k, cylZ(0.05, 0.12, 8), BLACKF, s * 1.0, Y0 + y, 0.1);
  m.on(k, box(0.55, 0.1, 0.05), BLACKF, 0.45, Y0 + 2.45, 0.12);
  if (d.fine) {
    m.on(k, torus(0.2, 0.025, 6, 14), STEELF, -0.45, Y0 + 1.5, 0.18);
    for (let i = 0; i < 3; i++) m.on(k, box(0.4, 0.03, 0.03), STEELF, -0.45, Y0 + 1.5, 0.18, (i * Math.PI) / 3);
    m.on(k, box(0.16, 0.22, 0.06), BLACKF, -0.95, Y0 + 1.5, 0.16);
    m.on(k, box(0.05, 0.05, 0.02), env.led(0x5dff8a, 2.4), -0.95, Y0 + 1.55, 0.2);
  }
  // Hazard stripes on the jambs.
  const nz = d.fine ? 8 : 4;
  for (const s of [-1, 1]) for (let i = 0; i < nz; i++) if (i % 2 === 0) m.on(k, box(0.2, 0.3, 0.02), YEL, s * 1.25, Y0 + 0.22 + i * 0.46, 0.31);
  // Canopy with brackets and the door lamps.
  m.on(k, box(3.0, 0.16, 0.3), conc, 0, Y0 + 4.5, 0.15);
  for (const s of [-1, 1]) m.on(k, box(0.1, 0.5, 0.26), STEELF, s * 1.3, Y0 + 4.2, 0.14);
  for (const s of [-1, 1]) {
    m.on(k, box(0.28, 0.38, 0.2), BLACKF, s * 1.78, Y0 + 3.7, 0.1);
    m.on(k, box(0.2, 0.28, 0.02), env.glowFinish(0xc8e0ff, 2.6), s * 1.78, Y0 + 3.7, 0.21);
    env.litDots.push({ k, tx: s * 1.78, y: Y0 + 3.7 });
  }
  // The big team roundel above the canopy.
  emblem(m, k, 0, 8.25, 1.25);
  // "HQ" plate: two chunky letters made of boxes under the roundel's band line.
  const L = (tx) => { // H
    m.on(k, box(0.12, 0.7, 0.04), WHITE_PAINT, tx - 0.22, 6.2, 0.02);
    m.on(k, box(0.12, 0.7, 0.04), WHITE_PAINT, tx + 0.22, 6.2, 0.02);
    m.on(k, box(0.4, 0.1, 0.04), WHITE_PAINT, tx, 6.2, 0.02);
  };
  m.on(k, box(1.9, 0.95, 0.05), { c: 0x1d3f7a, r: 0.6, m: 0.1 }, 0, 6.2, 0.025);
  L(-0.45);
  // Q: ring + tail
  m.on(k, torus(0.31, 0.06, 6, 16), WHITE_PAINT, 0.5, 6.2, 0.04);
  m.on(k, box(0.22, 0.07, 0.04), WHITE_PAINT, 0.62, 5.95, 0.04, 0.8);
}

function details(m, env, rand) {
  const d = env.d;
  // Windows: upper tier two per facet on the odd facets, a firing slit below.
  for (const side of [-1, 1]) {
    for (const dd of [1, 3, 5, 7]) {
      const k = (side * dd + N) % N;
      for (const tx of [-0.85, 0.85]) {
        const lit = hashN(k, tx, 7) > 0.35;
        windowAt(m, env, k, tx, 8.35, 1.05, 1.3, lit, hashN(k, tx, 3) > 0.55 ? 0.35 : 0);
      }
      windowAt(m, env, k, 0, 3.2, 1.5, 0.36, false, 0);
    }
  }
  // Solid facets: louvres, AC condensers, pipes.
  for (const side of [-1, 1]) {
    for (const dd of [2, 4, 6]) {
      const k = (side * dd + N) % N;
      m.on(k, box(1.5, 1.0, 0.1), BLACKF, 0, 2.3, 0.05);
      if (d.frames) for (let i = 0; i < 6; i++) m.on(k, box(1.4, 0.04, 0.14), STEELF, 0, 1.92 + i * 0.15, 0.08, 0.35);
      if (dd === 4 || dd === 6) { // condenser units
        for (const tx of [-1.0, 1.0]) {
          m.on(k, box(0.95, 0.75, 0.32), { c: 0x9fa4a3, r: 0.5, m: 0.4 }, tx, 7.0, 0.17);
          m.on(k, cylZ(0.28, 0.04, 14), BLACKF, tx, 7.0, 0.34);
          m.on(k, box(0.2, 0.06, 0.4), STEELF, tx, 6.45, 0.2);
        }
      }
      if (dd === 2) emblem(m, k, 0, 7.4, 0.8);
      if (dd === 6) { // big pipe run up the wall and a floodlight
        m.on(k, cyl(0.07, 0.07, 9.0, 8), STEELF, -1.2, 5.1, 0.1);
        m.on(k, box(0.5, 0.35, 0.3), BLACKF, 0.9, 9.4, 0.16);
        m.on(k, box(0.42, 0.28, 0.02), env.glowFinish(0xfff2d8, 2.2), 0.9, 9.4, 0.31);
        env.litDots.push({ k, tx: 0.9, y: 9.4 });
      }
    }
  }
  // The back (east) side: service door, generator exhaust.
  const kb = 8;
  m.on(kb, box(1.5, 2.3, 0.12), DOORF, -0.9, Y0 + 1.15, 0.0);
  m.on(kb, box(0.2, 2.5, 0.2), { c: 0xa9a59b, r: 0.9, m: 0 }, -1.8, Y0 + 1.25, 0.1);
  m.on(kb, box(0.2, 2.5, 0.2), { c: 0xa9a59b, r: 0.9, m: 0 }, -0.0, Y0 + 1.25, 0.1);
  m.on(kb, box(1.7, 0.2, 0.2), { c: 0xa9a59b, r: 0.9, m: 0 }, -0.9, Y0 + 2.5, 0.1);
  m.on(kb, box(1.8, 1.2, 0.3), STEELF, 1.7, 2.3, 0.15);
  if (d.frames) for (let i = 0; i < 7; i++) m.on(kb, box(1.7, 0.04, 0.34), BLACKF, 1.7, 1.85 + i * 0.15, 0.17, 0.3);
  m.on(kb, cyl(0.16, 0.16, 9.6, 10), STEELF, 2.7, 5.4, 0.2);
  m.on(kb, cyl(0.24, 0.2, 0.2, 10), BLACKF, 2.7, 10.3, 0.2);
  // Downspouts and cable trays.
  for (const j of [2, 6, 10, 14]) {
    const b = Math.PI + (j - 0.5) * STEP;
    m.add(cyl(0.05, 0.05, 10.2, 6), STEELF, [Math.cos(b) * 8.6, 5.65, Math.sin(b) * 8.6]);
  }
  // Floodlights under the cornice at eight corners (night: lit).
  for (let j = 1; j < N; j += 2) {
    const b = Math.PI + (j - 0.5) * STEP, ca = Math.cos(b), sa = Math.sin(b);
    m.add(box(0.3, 0.2, 0.3), BLACKF, [ca * 8.72, 10.82, sa * 8.72], [0, Math.PI / 2 - b, 0]);
    m.add(box(0.2, 0.04, 0.2), env.glowFinish(0xd6e8ff, 2.6), [ca * 8.72, 10.71, sa * 8.72], [0, Math.PI / 2 - b, 0]);
    env.litDots.push({ raw: [ca * 8.72, 10.71, sa * 8.72] });
  }
}

// Roof furniture: parapet, low clutter, mast. mode 0 intact, 1 damaged, 2 critical.
function roofTop(m, env, mode, rand) {
  const c = concA(env.concrete);
  if (mode < 2) {
    m.add(ringWall(8.94, 8.52, HQ_ROOF_Y, HQ_ROOF_Y + 0.42), c, null, null, null, flatShade);
  } else {
    // Critical: the north-west quarter of the parapet is gone, jagged stumps remain.
    const keep = [];
    for (let k = 0; k < N; k++) if (k < 1 || k > 5) keep.push(k);
    m.add(ringWall(8.94, 8.52, HQ_ROOF_Y, HQ_ROOF_Y + 0.42, keep), c, null, null, null, flatShade);
    for (let k = 1; k <= 5; k++) {
      const h = 0.1 + 0.25 * hashN(k, 9, 9);
      const a = corner(k, 8.75, HQ_ROOF_Y + h / 2);
      m.add(box(0.7, h, 0.36), c, a, [0, Math.PI / 2 - (Math.PI + (k + 0.0) * STEP), 0], null, flatShade);
    }
  }
  // Low roof clutter beyond the landing disc: condensers, vents, a hatch (all under 1.1 m).
  const clutter = [[-0.2, 7.6], [0.9, 7.5], [2.4, 7.3], [4.2, 7.4]]; // [angle (rad), radius]
  const ac = { c: 0xa5aaa8, r: 0.5, m: 0.4 };
  const place = (ang, R, g, f, y, rot = 0) => m.add(g, f, [Math.cos(ang) * R, HQ_ROOF_Y + y, Math.sin(ang) * R], [0, rot, 0], null, flatShade);
  if (mode < 2) {
    [0.0 + 0.9, 2.2, 3.6, 5.5].forEach((a, i) => {
      place(a, 7.55, box(1.3, 0.9, 0.85), ac, 0.45, -a);
      place(a, 7.55, cylX(0.34, 0.04, 14).rotateZ(Math.PI / 2), BLACKF, 0.92, -a);
    });
    place(1.55, 7.6, cyl(0.12, 0.12, 0.8, 8), STEELF, 0.4);
    place(1.7, 7.7, cyl(0.2, 0.12, 0.3, 8), STEELF, 0.95);
    place(4.6, 7.2, box(1.5, 0.28, 1.5), { c: 0x8f8b81, r: 0.9, m: 0 }, 0.14, 0.4); // roof hatch
    place(4.6, 7.2, box(1.1, 0.04, 1.1), STEELF, 0.3, 0.4);
  } else {
    place(2.2, 7.55, box(1.3, 0.9, 0.85), ac, 0.45, -2.2);
    place(3.6, 7.5, box(1.3, 0.5, 0.85), ac, 0.2, 0.3);
    place(5.5, 7.55, box(1.3, 0.9, 0.85), ac, 0.45, -5.5);
  }
  mast(m, env, mode, rand);
  // Lamps along the parapet rim (unlit by day, glowing at night), tiny.
  if (mode < 2) for (let k = 0; k < N; k += 2) {
    const a = corner(k, 8.73, HQ_ROOF_Y + 0.5);
    m.add(box(0.16, 0.12, 0.16), BLACKF, a);
    m.add(box(0.1, 0.03, 0.1), env.glowFinish(0xbfe0ff, 3), [a[0], a[1] + 0.075, a[2]]);
    env.litDots.push({ raw: [a[0], a[1] + 0.075, a[2]] });
  }
}

function mast(m, env, mode, rand) {
  const bx = 8.0, base = HQ_ROOF_Y; // east rim, away from the door
  const steel = { c: 0x9aa0a4, r: 0.4, m: 0.8 };
  const dark = { c: 0x2a2d30, r: 0.5, m: 0.7 };
  const at = (x, y, z) => [bx + x, base + y, z];
  m.add(cyl(0.45, 0.55, 0.12, 10), dark, at(0, 0.06, 0));
  m.add(box(0.5, 0.5, 0.5), { c: 0x8f8b81, r: 0.9, m: 0 }, at(0, 0.25, 0));
  if (mode === 2) {
    // Snapped at 3.4 m: the top section hangs off the east side on its cable.
    m.add(cyl(0.12, 0.17, 3.2, 8), steel, at(0, 1.9, 0));
    m.add(cyl(0.06, 0.12, 6.4, 8), steel, at(1.9, 3.8, 0.0), [0, 0, -1.15]);
    m.add(cylX(0.02, 4.0, 4), dark, at(0.4, 4.1, 0.1), [0, 0, -0.4]);
    m.add(sph(0.8, 12, 5, 0, Math.PI * 2, 0, 1.0), steel, at(3.9, 1.0, 0.0), [0, 0, 2.6]); // dangling dish
    m.add(cyl(0.012, 0.012, 3.0, 4), dark, at(2.2, 2.0, 0.0), [0, 0, 0.5]);
    return;
  }
  // Intact or bent: the whole thing is built straight; the bend is the mode-1 rotation of the pole group below.
  const lean = mode === 1 ? 0.075 : 0;
  const R = (h) => [-Math.sin(lean) * h, Math.cos(lean) * h]; // point at height h along the leaning axis
  const place = (g, f, h, off = 0, z = 0, rot = null) => {
    const p = R(h);
    m.add(g, f, at(p[0] + off * Math.cos(lean), p[1], z), rot);
  };
  const rotZ = [0, 0, lean];
  // Tapered pole in three sections, with collars.
  const secs = [[0.5, 5.2, 0.16, 0.13], [5.2, 10.4, 0.13, 0.1], [10.4, 14.6, 0.1, 0.07]];
  for (const [h0, h1, r0, r1] of secs) {
    const mid = (h0 + h1) / 2, p = R(mid);
    m.add(cyl(r1, r0, h1 - h0, 8), steel, at(p[0], p[1], 0), rotZ);
  }
  for (const h of [5.2, 10.4]) { const p = R(h); m.add(cyl(0.2, 0.2, 0.12, 8), dark, at(p[0], p[1], 0), rotZ); }
  // Cross arms with whip antennas, panel antennas, a small radio cabinet.
  for (const [h, len] of [[8.0, 2.4], [12.2, 1.8]]) {
    const p = R(h);
    m.add(box(0.06, 0.06, len), dark, at(p[0], p[1], 0), rotZ);
    for (const s of [-1, 1]) m.add(cyl(0.012, 0.012, 2.4, 4), dark, at(p[0], p[1] + 1.2, s * len / 2), rotZ);
  }
  for (const s of [-1, 1]) { const p = R(9.4); m.add(box(0.1, 1.1, 0.3), { c: 0xcfd2cf, r: 0.5, m: 0.2 }, at(p[0] - 0.22, p[1], s * 0.3), rotZ); }
  { const p = R(1.6); m.add(box(0.5, 1.0, 0.7), dark, at(p[0] - 0.4, p[1], 0), rotZ); }
  // Dish facing west (the gate): bent off its mount in the damaged state.
  {
    const p = R(11.2), tilt = mode === 1 ? 0.5 : 0;
    m.add(sph(0.85, 14, 6, 0, Math.PI * 2, 0, 1.15), { c: 0xdadcda, r: 0.45, m: 0.3 }, at(p[0] - 0.55, p[1], 0), [0, 0, Math.PI / 2 + 0.2 + tilt]);
    m.add(cyl(0.012, 0.012, 0.9, 4), dark, at(p[0] - 0.9, p[1], 0), [0, 0, Math.PI / 2]);
    m.add(box(0.14, 0.14, 0.14), dark, at(p[0] - 1.38, p[1], 0));
  }
  // Finial and the red obstruction light (blinks; see update()).
  { const p = R(14.7); m.add(sph(0.1, 8, 6), { c: 0xc8a24a, r: 0.3, m: 0.9 }, at(p[0], p[1], 0)); }
  env.beaconAt = at(R(14.95)[0], R(14.95)[1], 0);
  env.flagAt = { x: bx + R(14.1)[0] - 0.02, y: base + R(14.1)[1] };
  env.flagLean = lean;
}

function damageOverlays(m, env, mode, rand) {
  // Spall patches, crack lines, rebar and fallen chunks on the plinth.
  const spall = { c: 0x948f84, r: 0.95, m: 0 };
  const bare = { c: 0x5c5851, r: 0.95, m: 0 };
  const rebar = { c: 0x5b3a22, r: 0.7, m: 0.6 };
  const sites = mode === 1 ? [[14, -0.6, 8.5], [2, 0.5, 6.4], [13, 0.2, 5.7]] : [[14, -0.6, 8.5], [13, 0.2, 5.7], [3, 0.0, 7.6], [1, -0.4, 8.1]];
  for (const [k, tx, y] of sites) {
    m.on(k, blob(0.9 + rand() * 0.5, 0.7 + rand() * 0.4, rand, 0.3, 10), spall, tx, y, 0.04, rand() * 6);
    m.on(k, blob(0.45, 0.35, rand, 0.4, 8), bare, tx + 0.15, y - 0.05, 0.05, rand() * 6);
    for (let i = 0; i < 4; i++) {
      const a = rand() * Math.PI * 2;
      m.on(k, cyl(0.012, 0.012, 0.5 + rand() * 0.5, 4), rebar, tx + Math.cos(a) * 0.35, y + Math.sin(a) * 0.3, 0.2, 1.1 + rand());
    }
    // A crack running away from the hit.
    let cx = tx, cy = y;
    for (let i = 0; i < 7; i++) {
      const dx = (rand() - 0.5) * 0.5, dy = -0.35 - rand() * 0.25;
      m.on(k, box(0.025, Math.hypot(dx, dy), 0.012), SOOTC, cx + dx / 2, cy + dy / 2, 0.012, Math.atan2(dx, -dy) * -1);
      cx += dx; cy += dy;
    }
  }
  // Scorch decals (soft soot pictures).
  const soot = env.decal;
  const scorches = mode === 1 ? [[14, -0.6, 8.8, 3.4], [2, 0.5, 6.6, 3.0], [13, 0.2, 5.9, 2.4]]
    : [[14, -0.6, 9.0, 4.6], [2, 0.3, 7.0, 6.0], [13, 0.2, 6.2, 3.4], [3, 0.0, 8.4, 3.6], [1, 0.0, 7.6, 3.4], [12, 0.0, 8.0, 3.4]];
  for (const [k, tx, y, s] of scorches) m.on(k, plane(s, s), soot, tx, y, 0.02, rand() * 0.5 - 0.25);
  // Fallen chunks on the plinth ring.
  for (let i = 0; i < (mode === 1 ? 7 : 14); i++) {
    const k = 12 + Math.floor(rand() * 7) - 3 + (rand() < 0.5 ? 0 : 2);
    const sz = 0.18 + rand() * 0.3;
    m.on(k, chunk(rand, sz, sz * 0.7, sz), { c: 0x8f8a80, r: 0.95, m: 0 }, (rand() - 0.5) * 3, 0.62 + sz * 0.5, 0.0 - 0.0 + 0.0, 0, flatShade);
  }
  // Roof scorch near the north-west rim (the thing smoking in the damaged state).
  const cx = -4.7, cz = -4.7;
  const g = plane(mode === 1 ? 4.4 : 6.2, mode === 1 ? 4.4 : 6.2).rotateX(-Math.PI / 2);
  m.add(g, soot, [cx, HQ_ROOF_Y + 0.02, cz], [0, 0.6, 0]);
  if (mode === 2) {
    // Roof crater: dark pit with torn slab edges, rebar and a glow of fire inside.
    const pit = blob(2.1, 1.7, rand, 0.3, 14).rotateX(-Math.PI / 2);
    m.add(pit, { c: 0x050403, r: 1, m: 0 }, [cx, HQ_ROOF_Y + 0.03, cz], [0, 0.4, 0], null, () => 1);
    const glowPit = blob(1.2, 0.9, rand, 0.4, 10).rotateX(-Math.PI / 2);
    m.add(glowPit, env.fireFinish(0xff6a18, 2.4), [cx + 0.2, HQ_ROOF_Y + 0.05, cz + 0.1], [0, 0.2, 0]);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rand() * 0.3, rr = 1.9 + rand() * 0.6;
      const sz = 0.25 + rand() * 0.4;
      m.add(chunk(rand, sz, sz * 0.5, sz * 0.8), { c: 0x8b867b, r: 0.95, m: 0 }, [cx + Math.cos(a) * rr * 1.1, HQ_ROOF_Y + 0.12 + sz * 0.2, cz + Math.sin(a) * rr * 0.9], [0, rand() * 6, 0], null, flatShade);
      if (i % 2 === 0) m.add(cyl(0.012, 0.012, 0.8 + rand() * 0.8, 4), rebar, [cx + Math.cos(a) * rr, HQ_ROOF_Y + 0.5, cz + Math.sin(a) * rr], [rand() - 0.5, 0, rand() - 0.5]);
    }
    // The big breach in the north-west wall (facet 2): void, fire glow, torn slab, rebar, beam.
    const k = 2, tx = 0.1, yc = 6.3;
    m.on(k, blob(2.0, 2.5, rand, 0.38, 16), { c: 0x070504, r: 1, m: 0 }, tx, yc, 0.05, 0.25, () => 1);
    m.on(k, blob(1.15, 1.2, rand, 0.4, 12), env.fireFinish(0xff6414, 2.6), tx - 0.2, yc - 0.9, 0.07, 0.1);
    m.on(k, blob(0.6, 0.55, rand, 0.4, 9), env.fireFinish(0xffc060, 3.0), tx - 0.25, yc - 1.15, 0.075, 0.6);
    m.on(k, box(2.2, 0.22, 0.32), { c: 0x8c877c, r: 0.95, m: 0 }, tx - 0.1, 4.95, 0.16, -0.12); // floor slab stub
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2;
      m.on(k, cyl(0.014, 0.014, 0.8 + rand() * 0.9, 4), rebar, tx + Math.cos(a) * 1.6, yc + Math.sin(a) * 1.9, 0.25, 0.7 + rand() * 1.2);
    }
    m.on(k, box(0.14, 2.6, 0.12), STEELF, tx + 0.9, yc + 0.4, 0.15, 0.35); // twisted I-beam
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, sz = 0.14 + rand() * 0.16;
      m.on(k, chunk(rand, sz, sz, sz * 0.7), { c: 0x8f8a80, r: 0.95, m: 0 }, tx + Math.cos(a) * 1.9, yc + Math.sin(a) * 2.35, 0.1);
    }
    // Soot above the breach and a second, smaller hole on the upper tier.
    m.on(k, plane(5.5, 6.5), soot, tx, yc + 2.2, 0.03);
    m.on(k, blob(0.7, 0.55, rand, 0.4, 10), { c: 0x070504, r: 1, m: 0 }, 1.1, 9.3, 0.05, 0.4, () => 1);
  }
}

function rubbleMound(m, env, rand) {
  const c = { mat: env.concrete, c: 0xffffff, r: 0.95, m: 0, keepUV: false };
  const dirt = { c: 0x4c4944, r: 0.95, m: 0 };
  const burnt = { c: 0x242220, r: 0.95, m: 0 };
  const shadeR = (x, y, z, nx, ny) => (0.5 + 0.5 * smooth(y / 3.5 + 0.2)) * (0.8 + 0.3 * hashN(x, y, z)) * (1 - 0.3 * Math.max(0, -ny));
  const count = env.d.chunks;
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, rr = 8.7 * Math.sqrt(rand()) * (0.98 - 0.02 * rand());
    const t = rr / 8.8;
    const hh = 4.3 * Math.pow(Math.max(0, 1 - t * t), 1.1) * (0.55 + 0.6 * vnoise(a * 2 + 5, rr * 0.4));
    const sz = 0.45 + rand() * 1.0 - 0.3 * t;
    const y = Math.max(0.5, hh) + (rand() - 0.5) * 0.4;
    const f = rand() < 0.22 ? burnt : rand() < 0.3 ? dirt : c;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    // Keep every chunk inside the cylinder.
    const rmax = 8.95 - sz * 1.0;
    const sc = Math.hypot(x, z) > rmax ? rmax / Math.hypot(x, z) : 1;
    m.add(chunk(rand, sz * (1 + rand() * 0.8), sz * (0.6 + rand() * 0.6), sz * (1 + rand() * 0.6)), f, [x * sc, y, z * sc], [rand() * 6, rand() * 6, rand() * 6], null, shadeR);
  }
  // Standing wall stubs on the east side, jagged tops.
  for (let k = 5; k <= 11; k++) {
    const h = 2.0 + 5.0 * hashN(k, 2, 5) * (k === 8 ? 1.2 : 0.8);
    const b = Math.PI + (k) * STEP, fr = FR[k];
    m.add(box(3.3, h, 0.7), { mat: env.concrete, c: 0xb7b2a8, r: 0.95, m: 0 }, [Math.cos(b) * (AP - 0.35), h / 2 + Y0 - 0.1, Math.sin(b) * (AP - 0.35)], [0, fr.rotY, 0], null, shadeR);
    for (let i = 0; i < 3; i++) m.add(chunk(rand, 0.6, 0.4, 0.5), c, [Math.cos(b) * (AP - 0.35) + fr.tx * (i - 1) * 1.1, h + Y0 + 0.1, Math.sin(b) * (AP - 0.35) + fr.tz * (i - 1) * 1.1], [rand() * 3, rand() * 6, rand() * 3], null, shadeR);
    for (let i = 0; i < 3; i++) m.add(cyl(0.014, 0.014, 1 + rand() * 1.8, 4), { c: 0x5b3a22, r: 0.7, m: 0.6 }, [Math.cos(b) * (AP - 0.35) + fr.tx * (i - 1) * 1.2, h + Y0 + 0.6, Math.sin(b) * (AP - 0.35) + fr.tz * (i - 1) * 1.2], [rand() - 0.5, 0, rand() - 0.5]);
  }
  // Twisted beams and rebar bristles through the heap, a collapsed mast and a flat scorch around.
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2, rr = rand() * 6.5;
    m.add(box(0.12, 0.12, 2 + rand() * 2.6), STEELF, [Math.cos(a) * rr, 2.2 + rand() * 1.8, Math.sin(a) * rr], [rand() * 1.2, rand() * 6, rand() * 1.2], null, flatShade);
  }
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2, rr = rand() * 7.6;
    m.add(cyl(0.012, 0.012, 0.8 + rand() * 1.6, 4), { c: 0x5b3a22, r: 0.7, m: 0.6 }, [Math.cos(a) * rr, 1.5 + rand() * 2.4, Math.sin(a) * rr], [rand() - 0.5, 0, rand() - 0.5], null, flatShade);
  }
  m.add(cyl(0.1, 0.14, 7, 8), { c: 0x9aa0a4, r: 0.4, m: 0.8 }, [3.4, 3.0, 2.2], [0.5, 0.4, 1.35], null, flatShade);
  m.add(sph(0.8, 12, 5, 0, Math.PI * 2, 0, 1.0), { c: 0xdadcda, r: 0.45, m: 0.3 }, [-1.6, 3.2, -3.4], [2.4, 0.4, 0.3], null, flatShade);
  m.add(plane(3.6, 3.6).rotateX(-Math.PI / 2), env.decal, [0, 0.0, 0]);
  // Fire inside the heap.
  for (const [x, y, z, s] of [[-1.0, 3.2, 0.5, 1.6], [2.0, 2.4, -1.5, 1.2], [-0.5, 3.8, 2.4, 1.0]]) {
    m.add(blob(s, s * 0.8, rand, 0.4, 9).rotateX(-Math.PI / 2), env.fireFinish(0xff6414, 2.4), [x, y, z]);
  }
}

// ---------- the model ----------

const _v3 = new THREE.Vector3();

/**
 * hq = world.hq { x, z, r, h, hp } (anything missing falls back to the defaults 604 / 240 / 9 / 12).
 * opts: { quality: 'low'..'ultra' (default 'high'), timeOfDay: 'day' | 'overcast' | 'sunset' | 'night', lit: 0..1 }.
 * Returns { object, setHp(frac), update(dt, time), setLit(k), anchors: { center, top }, state, fire, smoke,
 *           doorDir, roofY, radius, height, triangles, drawCalls, stats, materials, dispose() }.
 */
export function createHQModel(hq, { quality = 'high', timeOfDay = 'day', lit = null } = {}) {
  hq = hq || {};
  const lvl = qlevel(quality);
  const d = detailOf(lvl);
  const seed = ((hq.x || 0) * 7 + (hq.z || 0) * 13 + 99) | 0;
  const rand = mulberry32(seed >>> 0);
  const prevDetail = getDetail();
  setDetail(lvl);

  // Owned resources.
  const textures = [], materials = [], geometries = new Set();
  const own = (m) => { materials.push(m); return m; };
  let concreteTex = null;
  const concreteBase = new THREE.MeshStandardMaterial({ name: 'hq-concrete', roughness: 1, metalness: 0 });
  if (d.texture) {
    concreteTex = concreteTexture(d.texSize, mulberry32(seed + 1));
    concreteBase.map = concreteTex;
    if (lvl >= 2) { concreteBase.bumpMap = concreteTex; concreteBase.bumpScale = 1.4; }
    textures.push(concreteTex);
  }
  concreteBase.userData.boxUV = TILE;
  const concrete = own(uber(concreteBase));
  own(concreteBase);
  let roofTex = null;
  const roofBase = new THREE.MeshStandardMaterial({ name: 'hq-roof', roughness: 0.9, metalness: 0 });
  if (d.texture) { roofTex = roofTexture(lvl >= 2 ? 1024 : 512, mulberry32(seed + 2)); roofBase.map = roofTex; textures.push(roofTex); }
  const roofMat = own(uber(roofBase));
  own(roofBase);
  const scorchTex = d.texture ? scorchTexture(lvl >= 2 ? 256 : 128, mulberry32(seed + 3)) : null;
  if (scorchTex) textures.push(scorchTex);
  const decalMat = own(new THREE.MeshBasicMaterial({ color: 0x0b0a09, map: scorchTex, transparent: true, depthWrite: false, opacity: 0.9,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, name: 'hq-scorch', alphaTest: 0.02 }));
  decalMat.userData.noShadow = true;
  // Animated emissive channels: lit windows/lamps, fire glow, beacon. Per instance so they can be dimmed.
  const mkGlow = (name) => {
    const g = own(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, name }));
    g.userData.glow = true;
    return g;
  };
  const litMat = mkGlow('hq-lit'), fireMat = mkGlow('hq-fire'), beaconMat = mkGlow('hq-beacon');
  const flagTex = flagTexture();
  textures.push(flagTex);
  const flagMat = own(new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, name: 'hq-flag' }));
  flagMat.userData.noShadow = true;

  const env = {
    d, concrete, decal: decalMat, lit: [], litDots: [], beaconAt: [0, 0, 0], flagAt: { x: 8, y: 26 }, flagLean: 0,
    led: (c, i) => ({ mat: litMat, c, i, unlit: true }),
    glowFinish: (c, i) => ({ mat: litMat, c, i, unlit: true }),
    fireFinish: (c, i) => ({ mat: fireMat, c, i, unlit: true }),
  };
  const solid = solidMaterial();

  // Build one Mesher per group, convert to Mesh lists.
  const groups = {};
  const meshesOf = (name, list, extra = {}) => {
    const g = new THREE.Group();
    g.name = 'hq-' + name;
    for (const { geometry, material } of list) {
      geometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      const glowy = material.userData && material.userData.glow;
      const noShadow = glowy || (material.userData && material.userData.noShadow) || material.transparent;
      mesh.castShadow = !noShadow;
      mesh.receiveShadow = !glowy && material !== decalMat;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (glowy) mesh.userData.glowMat = material;
      g.add(mesh);
    }
    groups[name] = g;
    Object.assign(g.userData, extra);
    return g;
  };
  const roofFinish = { mat: roofMat, c: 0xffffff, r: 0.9, m: 0, keepUV: true };
  const mk = () => new Mesher(solid);

  try {
    // core: shared by the intact, damaged and critical states.
    {
      const m = mk();
      plinth(m, env);
      wall(m, env);
      cornices(m, env);
      pilasters(m, env);
      doorFacet(m, env);
      details(m, env, rand);
      m.add(deck(8.94, HQ_ROOF_Y), roofFinish, null, null, null, () => 1);
      // Lit window panes and lamps are real geometry on the lit channel (shown at night).
      for (const w of env.lit) {
        const fr = FR[w.k];
        m.add(plane(w.w * 0.92, w.h * 0.9), { mat: litMat, c: hashN(w.k, w.tx, 11) > 0.5 ? 0xffd9a0 : 0xa8d4ff, i: 1.9, unlit: true },
          [fr.nx * (AP + 0.03) + fr.tx * w.tx, w.yc, fr.nz * (AP + 0.03) + fr.tz * w.tx], [0, fr.rotY, 0]);
      }
      meshesOf('core', m.build());
      groups.core.userData.tris = m.tris;
    }
    for (const mode of [0, 1, 2]) {
      const m = mk();
      m.shade = flatShade;
      roofTop(m, env, mode, mulberry32(seed + 10 + mode));
      if (mode > 0) { m.shade = wallShade; damageOverlays(m, env, mode, mulberry32(seed + 20 + mode)); }
      // Beacon (red obstruction light) on its own channel.
      if (mode < 2) m.add(sph(0.14, 8, 6), { mat: beaconMat, c: 0xff3b2a, i: 4, unlit: true }, env.beaconAt.slice());
      meshesOf('s' + mode, m.build());
      groups['s' + mode].userData.tris = m.tris;
    }
    {
      const m = mk();
      m.shade = wallShade;
      plinth(m, env);
      rubbleMound(m, env, mulberry32(seed + 33));
      meshesOf('s3', m.build());
      groups.s3.userData.tris = m.tris;
    }
  } finally {
    setDetail(prevDetail);
  }

  // Flags: intact, torn (damaged), shredded (critical). Hung off the mast toward -z.
  const flags = [
    { geo: flagGeometry(null), amp: 0.3, state: 0 },
    { geo: flagGeometry((i, j) => i < FLAG_C - 1 - Math.floor(3.5 * hashN(j, 4, 4) + (j > 4 ? 2 : 0)) , 0.92), amp: 0.36, state: 1 },
    { geo: flagGeometry((i, j) => i < 5 && j > 1 && j < 6 ? true : i < 3 && (j <= 1 || j >= 6) && hashN(i, j, 8) > 0.3, 0.55), amp: 0.5, state: 2 },
  ];
  for (const f of flags) {
    f.mesh = new THREE.Mesh(f.geo, flagMat);
    f.mesh.frustumCulled = false;
    f.mesh.castShadow = false;
    f.mesh.rotation.y = Math.PI / 2;
    const px = (env.flagAt.x ?? 8);
    f.mesh.position.set(px, env.flagAt.y - 1.1 - (f.state === 2 ? 0.8 : 0), 0.05);
    f.mesh.matrixAutoUpdate = true;
    geometries.add(f.geo);
    groups['s' + f.state].add(f.mesh);
    waveFlag(f.geo, 0, f.amp * 0.5);
  }

  // Assemble.
  const object = new THREE.Group();
  object.name = 'hq';
  for (const k of ['core', 's0', 's1', 's2', 's3']) object.add(groups[k]);
  const sx = Number.isFinite(hq.r) && hq.r > 0 ? hq.r / 9 : 1, sy = Number.isFinite(hq.h) && hq.h > 0 ? hq.h / 12 : 1;
  object.scale.set(sx, sy, sx);
  object.position.set(Number.isFinite(hq.x) ? hq.x : 0, 0, Number.isFinite(hq.z) ? hq.z : 0);

  const anchors = { center: new THREE.Object3D(), top: new THREE.Object3D() };
  anchors.top.position.set(0, HQ_ROOF_Y, 0);
  anchors.center.position.set(0, HQ_ROOF_Y, 0);
  object.add(anchors.center, anchors.top);
  const fireSpots = [[0, HQ_ROOF_Y, 0], [-4.7, HQ_ROOF_Y + 0.3, -4.7], [-4.7, HQ_ROOF_Y + 0.4, -4.7], [0, 3.6, 0]];

  const self = {
    object, anchors, materials, groups,
    state: 0, fire: 0, smoke: 0, lit: 0,
    doorDir: [-1, 0, 0], roofY: HQ_ROOF_Y, radius: 9 * sx, height: 12 * sy, mastAt: [8.0, HQ_ROOF_Y, 0],
    t: 0, disposed: false, stats: null, triangles: 0, drawCalls: 0,
  };

  const visibleGroups = [['core', 's0'], ['core', 's1'], ['core', 's2'], ['s3']];
  function show(state) {
    const names = visibleGroups[state];
    let tris = 0, calls = 0;
    for (const k of ['core', 's0', 's1', 's2', 's3']) {
      const on = names.includes(k);
      groups[k].visible = on;
      if (on) { tris += groups[k].userData.tris | 0; calls += groups[k].children.length; }
    }
    // Only the flag of this state, only the visible ones count as draw calls (flags are children too).
    for (const f of flags) f.mesh.visible = f.state === state;
    self.triangles = Math.round(tris);
    self.drawCalls = calls - (state < 3 ? 2 : 0);
    anchors.center.position.fromArray(fireSpots[state]);
    self.fire = HQ_FIRE[state];
    self.smoke = HQ_SMOKE[state];
    // Night readiness: broken windows stay lit only in the intact state, fire glow only when burning.
    fireMat.visible = state >= 2;
    for (const g of Object.values(groups)) for (const mesh of g.children) if (mesh.material === fireMat) mesh.visible = state >= 2;
  }
  function applyLit() {
    const k = self.lit;
    litMat.color.setScalar(k);
    for (const g of [groups.core]) for (const mesh of g.children) if (mesh.material === litMat) mesh.visible = k > 0.02;
  }

  self.setHp = (frac) => {
    let f = Number(frac);
    if (!Number.isFinite(f)) f = 1;
    f = clamp(f, 0, 1);
    let s = self.state;
    for (;;) {
      if (s < 3 && f < HQ_THRESHOLDS[s]) { s++; continue; }
      if (s > 0 && f > HQ_THRESHOLDS[s - 1] + HQ_HYSTERESIS) { s--; continue; }
      break;
    }
    if (s === self.state) return false;
    self.state = s;
    show(s);
    applyLit();
    return true;
  };

  self.setLit = (k) => {
    self.lit = clamp(Number.isFinite(+k) ? +k : 0, 0, 1);
    applyLit();
  };

  self.update = (dt, time) => {
    dt = dt > 0 && dt < 0.25 ? dt : 0;
    self.t += dt;
    const t = Number.isFinite(time) ? time : self.t;
    const s = self.state;
    if (s < 3) {
      const f = flags[s];
      waveFlag(f.geo, t, f.amp);
    }
    // Beacon blinks (on at night and in the evening, a dim glint by day).
    const blink = Math.sin(t * 2.4) > 0.55 ? 1 : 0.06;
    beaconMat.color.setScalar(blink * (0.25 + 0.75 * Math.max(self.lit, 0.35)));
    // Windows breathe a little at night; the fire glow flickers.
    litMat.color.setScalar(self.lit * (0.95 + 0.05 * Math.sin(t * 9.3 + 1.2)));
    const fl = 0.75 + 0.25 * Math.sin(t * 13.1) * Math.sin(t * 7.3 + 0.7) + 0.1 * Math.sin(t * 29);
    fireMat.color.setScalar(0.8 + fl * 0.5);
    self.fire = HQ_FIRE[s] * (s >= 2 ? 0.93 + 0.07 * Math.sin(t * 11.3) : 1);
  };

  self.dispose = () => {
    if (self.disposed) return;
    self.disposed = true;
    object.removeFromParent();
    for (const g of geometries) g.dispose();
    geometries.clear();
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
    materials.length = 0;
    textures.length = 0;
  };

  self.stats = {
    tris: [0, 1, 2, 3].map((s) => Math.round(visibleGroups[s].reduce((a, k) => a + (groups[k].userData.tris | 0), 0))),
  };
  const nightish = timeOfDay === 'night' || timeOfDay === 'sunset';
  self.lit = lit != null ? clamp(+lit || 0, 0, 1) : timeOfDay === 'night' ? 1 : timeOfDay === 'sunset' ? 0.6 : 0;
  show(0);
  applyLit();
  if (nightish) litMat.color.setScalar(self.lit);
  return self;
}

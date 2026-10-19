// Military dressing for the two bases: canvas tents, cargo trucks, light vehicles, watchtowers, fuel tanks and
// Quonset huts. All pieces are non-collidable scenery appended to the merged chunk buffers (kept on the base's
// edges so nobody is seen walking through them).
import { trs } from './geo.js';
import { face4, hull } from './shapes.js';
import { DECAL } from './textures.js';

// Local frame helper: model space has +x forward, +z right; rotation.y = -yaw like every other model.
function frame(x, z, yaw) {
  const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
  return (lx, ly, lz) => [x + lx * cy + lz * sy, ly, z - lx * sy + lz * cy];
}

const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f];

// Gabled canvas tent (x along the ridge). c = canvas tint.
export function addTent(ctx, tpl, { x, z, yaw = 0, w = 8, d = 6, c = [0.42, 0.45, 0.3], open = true }) {
  const g = ctx.geoAt(x, z).get('canvas');
  const m = ctx.geoAt(x, z).get('metal');
  const wallH = 1.7, ridge = 3.3;
  const hx = w / 2, hz = d / 2;
  const L = frame(x, z, yaw);
  const T = 3;
  const mid = L(0, 1.5, 0);
  face4(g, L(-hx, 0, hz), L(hx, 0, hz), L(hx, wallH, hz), L(-hx, wallH, hz), mid, T, [shade(c, 0.7), shade(c, 0.7), c, c]);
  face4(g, L(hx, 0, -hz), L(-hx, 0, -hz), L(-hx, wallH, -hz), L(hx, wallH, -hz), mid, T, [shade(c, 0.7), shade(c, 0.7), c, c]);
  face4(g, L(-hx - 0.3, wallH - 0.1, hz + 0.3), L(hx + 0.3, wallH - 0.1, hz + 0.3), L(hx + 0.3, ridge, 0), L(-hx - 0.3, ridge, 0), mid, T, shade(c, 1.05));
  face4(g, L(hx + 0.3, wallH - 0.1, -hz - 0.3), L(-hx - 0.3, wallH - 0.1, -hz - 0.3), L(-hx - 0.3, ridge, 0), L(hx + 0.3, ridge, 0), mid, T, shade(c, 0.95));
  for (const s of [-1, 1]) {
    const dark = s > 0 && open;
    const col = dark ? [0.05, 0.05, 0.04] : shade(c, 0.85);
    const ex = s * hx;
    g.quad([...L(ex, 0, s > 0 ? -hz : hz), ...L(ex, 0, s > 0 ? hz : -hz), ...L(ex, ridge, 0), ...L(ex, ridge, 0)], null, col);
    face4(g, L(ex, 0, -hz), L(ex, 0, hz), L(ex, wallH, hz), L(ex, wallH, -hz), mid, T, col);
  }
  for (const s of [-1, 1]) {
    const p = L(s * (hx + 0.3), 0, 0);
    m.add(tpl.cyl(0.04, 0.05, 1, 5), trs(p[0], 0, p[2], 0, 1, ridge, 1), [0.3, 0.25, 0.2]);
  }
  ctx.decals.ground(x, z, Math.max(w, d) + 5, yaw, DECAL.dust, 0.5, { y: 0.02 });
}

// Wheel with a rubber tyre and a hub, axis along the model's z.
function wheel(g, m, tpl, L, yaw, lx, lz, r, wd) {
  const p = L(lx, r, lz - wd / 2);
  g.add(tpl.cyl(r, r, wd, 12), trs(p[0], p[1], p[2], -yaw, 1, 1, 1, Math.PI / 2, 0), [0.1, 0.1, 0.1], 0.5);
  const side = lz > 0 ? 1 : -1;
  const h = L(lx, r, lz + side * (wd / 2 + 0.005) - 0.02);
  m.add(tpl.cyl(r * 0.5, r * 0.5, 0.04, 10), trs(h[0], h[1], h[2], -yaw, 1, 1, 1, Math.PI / 2, 0), [0.55, 0.55, 0.52]);
}

// Six-wheel cargo truck with a canvas-covered bed. body = paint tint.
export function addTruck(ctx, tpl, { x, z, yaw = 0, body = [0.33, 0.37, 0.24], tarp = [0.4, 0.42, 0.28] }) {
  const set = ctx.geoAt(x, z);
  const m = set.get('metal'), g = set.get('canvas'), t = set.get('trim');
  const L = frame(x, z, yaw);
  const B = (geo, lx, ly, lz, w, h, d, col, ry = 0, rz = 0) => {
    const p = L(lx, ly, lz);
    geo.add(tpl.box(1, 1, 1), trs(p[0], p[1], p[2], -yaw + ry, w, h, d, 0, rz), col, Math.max(w, h, d) / 2);
  };
  const dark = [0.12, 0.12, 0.11];
  B(m, 0, 0.62, 0, 7.2, 0.3, 1.5, dark);
  // cab: hull with a raked windscreen, dark glass bands
  const cabX0 = 1.2, cabX1 = 2.9;
  hull(m, [L(cabX0, 0.9, -1.2), L(cabX1, 0.9, -1.2), L(cabX1, 0.9, 1.2), L(cabX0, 0.9, 1.2),
    L(cabX0, 2.55, -1.15), L(cabX1 - 0.55, 2.5, -1.15), L(cabX1 - 0.55, 2.5, 1.15), L(cabX0, 2.55, 1.15)], 2, body);
  for (const s of [-1, 1]) face4(m, L(cabX0 + 0.25, 1.55, s * 1.205), L(cabX1 - 0.6, 1.55, s * 1.205), L(cabX1 - 0.7, 2.3, s * 1.205), L(cabX0 + 0.25, 2.3, s * 1.205), L(1.9, 1.5, 0), 2, [0.05, 0.06, 0.07]);
  face4(m, L(cabX1 - 0.52, 1.6, -1.0), L(cabX1 - 0.52, 1.6, 1.0), L(cabX1 - 0.12, 2.28, 1.0), L(cabX1 - 0.12, 2.28, -1.0), L(1.9, 1.5, 0), 2, [0.05, 0.06, 0.07]);
  B(m, 3.45, 0.95, 0, 1.2, 0.85, 2.0, body);
  B(m, 4.1, 0.72, 0, 0.3, 0.32, 2.2, dark); // bumper
  for (const s of [-1, 1]) B(m, 4.06, 1.1, s * 0.75, 0.1, 0.2, 0.28, [0.75, 0.72, 0.6]);
  // bed with raised boards and a tarp stretched over bows
  B(m, -1.1, 0.95, 0, 5.1, 0.12, 2.3, dark);
  for (const s of [-1, 1]) B(m, -1.1, 1.07, s * 1.14, 5.1, 0.85, 0.1, shade(body, 0.9));
  B(m, -3.62, 1.07, 0, 0.1, 0.85, 2.3, shade(body, 0.9));
  B(m, 1.18, 1.07, 0, 0.1, 1.2, 2.3, shade(body, 0.85));
  const stations = [-3.55, -2.4, -1.3, -0.2, 0.9];
  const arch = (xx, k) => [[-1.12, 1.9], [-0.95, 2.45], [-0.5, 2.85], [0, 3.0 - k], [0.5, 2.85], [0.95, 2.45], [1.12, 1.9]].map(([zz, yy]) => L(xx, yy, zz));
  const cen = L(-1.3, 1.6, 0);
  for (let i = 0; i < stations.length - 1; i++) {
    const a = arch(stations[i], (i % 2) * 0.05), b = arch(stations[i + 1], ((i + 1) % 2) * 0.05);
    for (let k = 0; k < a.length - 1; k++) face4(g, a[k], a[k + 1], b[k + 1], b[k], cen, 3, k === 3 ? tarp : shade(tarp, 0.9));
  }
  face4(g, L(-3.55, 1.9, -1.12), L(-3.55, 1.9, 1.12), L(-3.55, 2.9, 0.6), L(-3.55, 2.9, -0.6), L(-3.3, 2.2, 0), 3, [0.03, 0.03, 0.03]);
  // wheels: front axle, rear tandem; spare under the bed; exhaust stack behind the cab
  for (const [lx, lz] of [[2.6, -1.15], [2.6, 1.15], [-1.9, -1.15], [-1.9, 1.15], [-3.1, -1.15], [-3.1, 1.15]]) wheel(t, m, tpl, L, yaw, lx, lz, 0.55, 0.4);
  const ex = L(1.0, 1.0, 1.2);
  m.add(tpl.cyl(0.07, 0.07, 1.8, 6), trs(ex[0], ex[1], ex[2], 0, 1, 1, 1), [0.25, 0.22, 0.2]);
  ctx.decals.ground(x, z, 9, yaw, DECAL.oil, 0.4, { y: 0.02 });
}

// 4x4 light vehicle with a pintle-mounted machine gun.
export function addJeepProp(ctx, tpl, { x, z, yaw = 0, body = [0.5, 0.45, 0.3] }) {
  const set = ctx.geoAt(x, z);
  const m = set.get('metal'), t = set.get('trim');
  const L = frame(x, z, yaw);
  const B = (lx, ly, lz, w, h, d, col, ry = 0, rz = 0) => {
    const p = L(lx, ly, lz);
    m.add(tpl.box(1, 1, 1), trs(p[0], p[1], p[2], -yaw + ry, w, h, d, 0, rz), col, Math.max(w, h, d) / 2);
  };
  const dark = [0.1, 0.1, 0.1];
  hull(m, [L(-2.2, 0.55, -1.0), L(2.2, 0.55, -1.0), L(2.2, 0.55, 1.0), L(-2.2, 0.55, 1.0), L(-2.1, 1.3, -1.0), L(2.2, 1.12, -0.98), L(2.2, 1.12, 0.98), L(-2.1, 1.3, 1.0)], 2, body);
  hull(m, [L(-1.3, 1.3, -0.95), L(0.9, 1.3, -0.95), L(0.9, 1.3, 0.95), L(-1.3, 1.3, 0.95), L(-1.2, 1.95, -0.85), L(0.5, 1.95, -0.85), L(0.5, 1.95, 0.85), L(-1.2, 1.95, 0.85)], 2, shade(body, 0.92));
  for (const s of [-1, 1]) face4(m, L(-1.0, 1.4, s * 0.96), L(0.65, 1.4, s * 0.96), L(0.45, 1.85, s * 0.9), L(-1.0, 1.85, s * 0.9), L(0, 1.5, 0), 2, [0.05, 0.06, 0.07]);
  B(2.35, 0.55, 0, 0.3, 0.3, 2.1, dark);
  B(-2.3, 0.5, 0, 0.2, 0.28, 2.0, dark);
  const ring = L(-0.2, 1.95, 0);
  m.add(tpl.cyl(0.4, 0.4, 0.15, 10), trs(ring[0], ring[1], ring[2], 0), dark);
  B(-0.1, 2.15, 0, 0.9, 0.12, 0.12, dark, 0, 0.08);
  for (const [lx, lz] of [[1.45, -1.0], [1.45, 1.0], [-1.45, -1.0], [-1.45, 1.0]]) wheel(t, m, tpl, L, yaw, lx, lz, 0.46, 0.34);
}

// Four-legged steel watchtower with a sandbagged cab and a searchlight.
export function addWatchtower(ctx, tpl, { x, z, yaw = 0, h = 5.4, sand = [0.78, 0.7, 0.5] }) {
  const set = ctx.geoAt(x, z);
  const m = set.get('metal'), sb = set.get('sandbag'), lg = set.get('lampglow');
  const L = frame(x, z, yaw);
  const steel = [0.34, 0.36, 0.34];
  for (const [lx, lz] of [[-1.1, -1.1], [1.1, -1.1], [1.1, 1.1], [-1.1, 1.1]]) {
    const b = L(lx * 1.25, 0, lz * 1.25), t = L(lx, h, lz);
    const dx = t[0] - b[0], dz = t[2] - b[2], len = Math.hypot(dx, h, dz);
    // leg leaning inward: rotate a unit cylinder to the leg direction
    const ang = Math.acos(h / len);
    m.add(tpl.cyl(0.07, 0.08, 1, 6), trs(b[0], 0, b[2], Math.atan2(dx, dz), 1, len, 1, ang, 0), steel);
  }
  for (const yy of [1.8, 3.6]) {
    const k = 1.25 - (yy / h) * 0.25;
    for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
      const p0 = L(a[0] * k, yy, a[1] * k), p1 = L(b[0] * k, yy, b[1] * k);
      const dx = p1[0] - p0[0], dz = p1[2] - p0[2];
      m.add(tpl.box(1, 0.06, 0.06), trs((p0[0] + p1[0]) / 2, yy, (p0[2] + p1[2]) / 2, Math.atan2(-dz, dx), Math.hypot(dx, dz), 1, 1), steel);
    }
  }
  const dk = L(0, h, 0);
  m.add(tpl.box(1, 1, 1), trs(dk[0], dk[1], dk[2], -yaw, 3.0, 0.16, 3.0), [0.3, 0.27, 0.22], 1);
  // sandbag walls with a firing slot on the front, roof on posts
  for (const [lx, lz, w, d] of [[0, -1.35, 3.0, 0.5], [0, 1.35, 3.0, 0.5], [-1.35, 0, 0.5, 2.2]]) {
    const p = L(lx, h + 0.16, lz);
    sb.add(tpl.box(1, 1, 1), trs(p[0], p[1], p[2], -yaw, w, 1.0, d), sand, 1.2);
  }
  for (const [lx, lz] of [[-1.35, -1.35], [1.35, -1.35], [1.35, 1.35], [-1.35, 1.35]]) {
    const p = L(lx, h + 0.16, lz);
    m.add(tpl.cyl(0.05, 0.05, 2.2, 5), trs(p[0], p[1], p[2], 0), steel);
  }
  const rf = L(0, h + 2.35, 0);
  m.add(tpl.box(1, 1, 1), trs(rf[0], rf[1], rf[2], -yaw, 3.7, 0.12, 3.7, 0, 0.03), [0.25, 0.3, 0.2], 1);
  const sl = L(1.55, h + 1.3, 0.6);
  m.add(tpl.box(0.35, 0.3, 0.35), trs(sl[0], sl[1], sl[2], -yaw), [0.2, 0.2, 0.2]);
  const sl2 = L(1.75, h + 1.3, 0.6);
  lg.add(tpl.box(0.05, 0.28, 0.28), trs(sl2[0], sl2[1], sl2[2], -yaw), [1, 1, 1]);
  ctx.lamps.push([sl[0], sl[1] + 0.1, sl[2], 0.8]);
  // ladder
  const ld = L(-1.3 * 1.25, 0, 0);
  for (let r = 0.3; r < h; r += 0.35) m.add(tpl.box(1, 0.04, 0.04), trs(ld[0], r, ld[2], -yaw + Math.PI / 2, 0.55, 1, 1), steel);
}

// Horizontal fuel tank on cradles (x = tank axis).
export function addFuelTank(ctx, tpl, { x, z, yaw = 0, len = 6.5, r = 1.35, col = [0.45, 0.47, 0.4] }) {
  const set = ctx.geoAt(x, z);
  const m = set.get('metal');
  const L = frame(x, z, yaw);
  const p = L(-len / 2, r + 0.55, 0);
  m.add(tpl.cyl(r, r, len, 14), trs(p[0], p[1], p[2], -yaw, 1, 1, 1, 0, -Math.PI / 2), col);
  for (const lx of [-len * 0.3, len * 0.3]) {
    for (const s of [-1, 1]) {
      const q = L(lx, 0, s * r * 0.7);
      m.add(tpl.box(0.25, 0.9, 0.25), trs(q[0], 0, q[2], -yaw), [0.25, 0.25, 0.24], 1);
    }
  }
  const top = L(0, r * 2 + 0.55, 0);
  m.add(tpl.cyl(0.3, 0.3, 0.15, 8), trs(top[0], top[1], top[2], 0), [0.3, 0.3, 0.3]);
  ctx.decals.ground(x, z, len + 3, yaw, DECAL.oil, 0.55, { y: 0.02 });
}

// Quonset hut: corrugated half-cylinder shell with a dark open end (x = long axis).
export function addHut(ctx, { x, z, yaw = 0, len = 12, r = 3.2, col = [0.5, 0.52, 0.4] }) {
  const g = ctx.geoAt(x, z).get('container');
  const L = frame(x, z, yaw);
  const n = 10;
  const ring = (lx) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI;
      pts.push(L(lx, Math.sin(a) * r, -Math.cos(a) * r));
    }
    return pts;
  };
  const cen = L(0, r * 0.4, 0);
  const rowA = ring(-len / 2), rowB = ring(len / 2);
  for (let i = 0; i < n; i++) {
    const shadeK = 0.85 + 0.15 * Math.sin(((i + 0.5) / n) * Math.PI);
    face4(g, rowA[i], rowA[i + 1], rowB[i + 1], rowB[i], cen, 2.6, shade(col, shadeK));
  }
  // end walls: dark door opening at the front, solid rear
  const fan = (row, lx, dark) => {
    for (let i = 0; i < n; i += 2) {
      const a = row[i], b = row[i + 1], c = row[Math.min(i + 2, n)];
      face4(g, L(lx, 0, 0), a, b, c, cen, 2.6, dark ? [0.05, 0.05, 0.05] : shade(col, 0.8));
    }
  };
  fan(rowA, -len / 2, false);
  fan(rowB, len / 2, true);
  ctx.decals.ground(x, z, len + 5, yaw, DECAL.dust, 0.4, { y: 0.02 });
}


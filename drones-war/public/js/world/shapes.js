// Small shape toolkit on top of Geo: convex hulls from eight corners (car bodies, bags, wedges), extruded
// profiles (jersey barriers), cached primitive templates and planar-uv helpers.
import * as THREE from 'three';

// Appends a quad whose winding is flipped if needed so that it faces away from `center`.
// Planar uvs: top/bottom faces use (x, z), side faces use (horizontal run, y).
export function face4(g, a, b, c, d, center, tile, color) {
  let nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]);
  let ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]);
  let nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
  const mx = (a[0] + b[0] + c[0] + d[0]) / 4 - center[0];
  const my = (a[1] + b[1] + c[1] + d[1]) / 4 - center[1];
  const mz = (a[2] + b[2] + c[2] + d[2]) / 4 - center[2];
  if (nx * mx + ny * my + nz * mz < 0) { [b, d] = [d, b]; nx = -nx; ny = -ny; nz = -nz; }
  const pts = [a, b, c, d];
  const top = Math.abs(ny) > Math.hypot(nx, nz) * 0.9;
  const alongX = Math.abs(nz) >= Math.abs(nx);
  const uvs = [];
  for (const p of pts) {
    if (top) uvs.push(p[0] / tile, p[2] / tile);
    else uvs.push((alongX ? p[0] * Math.sign(nz || 1) : p[2] * -Math.sign(nx || 1)) / tile, p[1] / tile);
  }
  g.quad([...a, ...b, ...c, ...d], uvs, color);
}

// Hull from 8 points: bottom ring p0..p3 and the matching top ring p4..p7 (any consistent winding).
export function hull(g, p, tile, color, { top = true, bottom = true } = {}) {
  const c = [0, 0, 0];
  for (const v of p) { c[0] += v[0] / 8; c[1] += v[1] / 8; c[2] += v[2] / 8; }
  const col = (i) => (Array.isArray(color && color[0]) ? color[i] : color);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    face4(g, p[i], p[j], p[j + 4], p[i + 4], c, tile, color);
  }
  if (top) face4(g, p[4], p[5], p[6], p[7], c, tile, color);
  if (bottom) face4(g, p[0], p[1], p[2], p[3], c, tile, color);
  void col;
}

// Box (x0..x1, y0..y1, z0..z1) as a hull with an independent inset of the top ring: the top rectangle is shrunk
// by (tx, tz) on each side and shifted by (sx, sz).
export function taperBox(g, x0, y0, z0, x1, y1, z1, tx, tz, tile, color, sx = 0, sz = 0, opt) {
  hull(g, [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0 + tx + sx, y1, z0 + tz + sz], [x1 - tx + sx, y1, z0 + tz + sz], [x1 - tx + sx, y1, z1 - tz + sz], [x0 + tx + sx, y1, z1 - tz + sz],
  ], tile, color, opt);
}

// Extrudes a 2D profile (array of [across, up], closed, counter-clockwise looking along +length) from
// l0 to l1 along x (axis 'x') or z (axis 'z') at position (cx, cz) across. Ends are capped.
export function extrude(g, profile, cx, cz, l0, l1, axis, tile, color) {
  const n = profile.length;
  const P = (i, l) => (axis === 'x' ? [l, profile[i][1], cz + profile[i][0]] : [cx + profile[i][0], profile[i][1], l]);
  const mid = [axis === 'x' ? (l0 + l1) / 2 : cx, 0.3, axis === 'x' ? cz : (l0 + l1) / 2];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    face4(g, P(i, l0), P(j, l0), P(j, l1), P(i, l1), mid, tile, color);
  }
  // end caps as fans of quads (profile is convex enough for a centroid fan)
  const capc = (l) => {
    let ax = 0, ay = 0;
    for (const p of profile) { ax += p[0] / n; ay += p[1] / n; }
    return axis === 'x' ? [l, ay, cz + ax] : [cx + ax, ay, l];
  };
  for (const l of [l0, l1]) {
    const c = capc(l);
    for (let i = 0; i < n; i += 2) {
      const a = P(i, l), b = P((i + 1) % n, l), d = P((i + 2) % n, l);
      face4(g, c, a, b, d, mid, tile, color);
    }
  }
}

// Cached primitive templates (disposed together).
export class Templates {
  constructor(level) {
    this.level = level;
    this.cache = new Map();
  }
  get(key, make) {
    let t = this.cache.get(key);
    if (!t) { t = make(); this.cache.set(key, t); }
    return t;
  }
  // upright cylinder from y = 0 to h
  cyl(rt, rb, h, seg) {
    return this.get(`c${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1).translate(0, h / 2, 0));
  }
  box(w, h, d) {
    return this.get(`b${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0));
  }
  dispose() { for (const g of this.cache.values()) g.dispose(); this.cache.clear(); }
}

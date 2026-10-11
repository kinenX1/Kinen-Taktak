// Geometry accumulator: every static piece of the city is appended into one buffer per material and
// turned into a single BufferGeometry at the end (one draw call per material for the whole city).
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

export class Geo {
  constructor({ uv = true, color = true, lit = false } = {}) {
    this.pos = [];
    this.nor = [];
    this.uv = uv ? [] : null;
    this.col = color ? [] : null;
    this.lit = lit ? [] : null;
    this.idx = [];
  }

  get vertexCount() { return this.pos.length / 3; }

  vert(x, y, z, nx, ny, nz, u, v, c, lit) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    if (this.uv) this.uv.push(u, v);
    if (this.col) this.col.push(c ? c[0] : 1, c ? c[1] : 1, c ? c[2] : 1);
    if (this.lit) this.lit.push(lit || 0);
  }

  // Quad from four corners in counter-clockwise order as seen from the front. uvs = [u0,v0, u1,v1, u2,v2, u3,v3].
  // colors may be one color or an array of four (per-corner tint, used for baked ambient occlusion).
  quad(p, uvs, color, lit = 0) {
    const b = this.vertexCount;
    const ax = p[3] - p[0], ay = p[4] - p[1], az = p[5] - p[2];
    const bx = p[9] - p[0], by = p[10] - p[1], bz = p[11] - p[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const per = Array.isArray(color && color[0]);
    for (let i = 0; i < 4; i++) {
      this.vert(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], nx, ny, nz, uvs ? uvs[i * 2] : 0, uvs ? uvs[i * 2 + 1] : 0,
        per ? color[i] : color, lit);
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  // Vertical wall quad from (x0,z0) to (x1,z1), y0..y1; front faces the right-hand side of the direction
  // of travel (so walking a footprint counter-clockwise seen from above with z south gives outward faces).
  wall(x0, z0, x1, z1, y0, y1, u0, u1, v0, v1, color, lit = 0) {
    this.quad([x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0], [u0, v0, u1, v0, u1, v1, u0, v1], color, lit);
  }

  // Horizontal quad (up-facing unless down=true) with planar world uvs scaled by 1/tile.
  flat(x0, z0, x1, z1, y, tile, color, down = false, uoff = 0, voff = 0) {
    const u0 = x0 / tile + uoff, u1 = x1 / tile + uoff, v0 = z0 / tile + voff, v1 = z1 / tile + voff;
    if (!down) this.quad([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0], [u0, v1, u1, v1, u1, v0, u0, v0], color);
    else this.quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], [u0, v0, u1, v0, u1, v1, u0, v1], color);
  }

  // Axis-aligned box with world-planar uvs (tile metres per texture repeat) — for slabs, trims, curbs.
  box(x0, y0, z0, x1, y1, z1, tile, color, { top = true, bottom = false, sides = true } = {}) {
    if (sides) {
      this.wall(x0, z1, x1, z1, y0, y1, x0 / tile, x1 / tile, y0 / tile, y1 / tile, color); // south (+z)
      this.wall(x1, z1, x1, z0, y0, y1, -z1 / tile, -z0 / tile, y0 / tile, y1 / tile, color); // east (+x)
      this.wall(x1, z0, x0, z0, y0, y1, -x1 / tile, -x0 / tile, y0 / tile, y1 / tile, color); // north (-z)
      this.wall(x0, z0, x0, z1, y0, y1, z0 / tile, z1 / tile, y0 / tile, y1 / tile, color); // west (-x)
    }
    if (top) this.flat(x0, z0, x1, z1, y1, tile, color);
    if (bottom) this.flat(x0, z0, x1, z1, y0, tile, color, true);
  }

  // Appends an arbitrary BufferGeometry transformed by matrix (uvs scaled by uvScale), tinted by color.
  add(geom, matrix, color, uvScale = 1, lit = 0) {
    const g = geom.index ? geom : geom;
    const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv, C = g.attributes.color;
    const b = this.vertexCount;
    if (matrix) _nm.getNormalMatrix(matrix);
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i);
      if (matrix) _v.applyMatrix4(matrix);
      if (N) { _n.fromBufferAttribute(N, i); if (matrix) _n.applyMatrix3(_nm).normalize(); } else _n.set(0, 1, 0);
      let c = color;
      if (C) {
        const cr = C.getX(i), cg = C.getY(i), cb = C.getZ(i);
        c = color ? [cr * color[0], cg * color[1], cb * color[2]] : [cr, cg, cb];
      }
      this.vert(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, UV ? UV.getX(i) * uvScale : 0, UV ? UV.getY(i) * uvScale : 0, c, lit);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(b + g.index.getX(i));
    else for (let i = 0; i < P.count; i++) this.idx.push(b + i);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.lit) g.setAttribute('aLit', new THREE.Float32BufferAttribute(this.lit, 1));
    const n = this.vertexCount;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// A set of Geo buffers keyed by material name.
export class GeoSet {
  constructor() { this.map = new Map(); }
  get(name, opts) {
    let g = this.map.get(name);
    if (!g) { g = new Geo(opts); this.map.set(name, g); }
    return g;
  }
}

// Builds a reusable transform matrix (position, yaw around y, optional tilt, scale).
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function trs(x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0, out = new THREE.Matrix4()) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return out.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

export function hexColor(hex, mul = 1) {
  const c = new THREE.Color(hex);
  return [c.r * mul, c.g * mul, c.b * mul];
}

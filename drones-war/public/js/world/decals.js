// Decal batch: every scorch mark, crack, lane marking, graffiti and blast hole of the city is a quad in one
// alpha-blended mesh sampling the decal atlas (one draw call). Quads hover a few centimetres above the
// surface and rely on polygon offset, so no projection geometry is needed.
import * as THREE from 'three';
import { decalUV, DECAL } from './textures.js';

export class DecalBatch {
  constructor({ glow = false } = {}) {
    this.glow = glow;
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = [];
  }

  get count() { return this.pos.length / 12; }

  push(corners, normal, cell, color, alpha) {
    const [u0, v0, u1, v1] = decalUV(cell);
    const b = this.pos.length / 3;
    const uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
    for (let i = 0; i < 4; i++) {
      this.pos.push(corners[i * 3], corners[i * 3 + 1], corners[i * 3 + 2]);
      this.nor.push(normal[0], normal[1], normal[2]);
      this.uv.push(uvs[i * 2], uvs[i * 2 + 1]);
      this.col.push(color[0], color[1], color[2], alpha);
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  // Flat on the ground, width w (across) × length l (along the rotated x axis), rotated by rot around y.
  rect(x, z, w, l, rot, cell, { alpha = 1, y = 0.075, color = [1, 1, 1] } = {}) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const hl = l / 2, hw = w / 2;
    // local (u along x, v along z) → world; winding so the quad faces up
    const P = (lx, lz) => [x + lx * c - lz * s, y, z + lx * s + lz * c];
    const a = P(-hl, hw), b = P(hl, hw), d = P(hl, -hw), e = P(-hl, -hw);
    this.push([...a, ...b, ...d, ...e], [0, 1, 0], cell, color, alpha);
  }

  // Square ground decal (the signature buildings.js uses).
  ground(x, z, size, rot, cell, alpha = 1, opt = {}) {
    this.rect(x, z, size, size, rot, cell, { alpha, ...opt });
  }

  // On a vertical wall whose outward normal is (nx, 0, nz).
  wall(x, y, z, nx, nz, w, h, cell, alpha = 1, color = [1, 1, 1]) {
    const rx = nz, rz = -nx; // right-hand direction seen from outside
    const hw = w / 2, hh = h / 2, off = 0.035;
    const cx = x + nx * off, cz = z + nz * off;
    const corners = [
      cx - rx * hw, y - hh, cz - rz * hw,
      cx + rx * hw, y - hh, cz + rz * hw,
      cx + rx * hw, y + hh, cz + rz * hw,
      cx - rx * hw, y + hh, cz - rz * hw,
    ];
    this.push(corners, [nx, 0, nz], cell, color, alpha);
  }

  // Arbitrary oriented quad (used for decals on the HQ drum and slanted surfaces).
  free(center, right, up, w, h, cell, alpha = 1, color = [1, 1, 1]) {
    const n = new THREE.Vector3().crossVectors(right, up).normalize();
    const hw = w / 2, hh = h / 2;
    const p = (sx, sy) => [center[0] + right.x * hw * sx + up.x * hh * sy, center[1] + right.y * hw * sx + up.y * hh * sy, center[2] + right.z * hw * sx + up.z * hh * sy];
    this.push([...p(-1, -1), ...p(1, -1), ...p(1, 1), ...p(-1, 1)], [n.x, n.y, n.z], cell, color, alpha);
  }

  build(material) {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 4));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.renderOrder = this.glow ? 2 : 1;
    m.name = this.glow ? 'glow-decals' : 'decals';
    return m;
  }
}

export { DECAL };

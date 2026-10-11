// Merges many small transformed, vertex-coloured primitives into one
// BufferGeometry so a whole city (or a whole boat) is a handful of draw calls.

import * as THREE from "three";

const tmpPos = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();
const tmpColor = new THREE.Color();

export class GeometryBatch {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private uvs: number[] = [];
  private indices: number[] = [];
  private vertexCount = 0;

  get isEmpty(): boolean {
    return this.vertexCount === 0;
  }

  /** Adds `geo` transformed by `matrix`, painted `color` (sRGB hex or Color). */
  add(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.ColorRepresentation): void {
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const nor = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute | undefined;
    normalMatrix.getNormalMatrix(matrix);
    tmpColor.set(color);
    const base = this.vertexCount;
    for (let i = 0; i < pos.count; i++) {
      tmpPos.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      this.positions.push(tmpPos.x, tmpPos.y, tmpPos.z);
      if (nor) {
        tmpNormal.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
        this.normals.push(tmpNormal.x, tmpNormal.y, tmpNormal.z);
      } else {
        this.normals.push(0, 1, 0);
      }
      this.colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
      if (uv) this.uvs.push(uv.getX(i), uv.getY(i));
      else this.uvs.push(0, 0);
    }
    const index = geo.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i++) this.indices.push(base + index.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) this.indices.push(base + i);
    }
    // A mirroring transform flips the winding; fix it so faces stay outward.
    if (matrix.determinant() < 0) {
      const start = this.indices.length - (index ? index.count : pos.count);
      for (let i = start; i + 2 < this.indices.length; i += 3) {
        const t = this.indices[i + 1];
        this.indices[i + 1] = this.indices[i + 2];
        this.indices[i + 2] = t;
      }
    }
    this.vertexCount += pos.count;
  }

  /** Builds the merged geometry, or null when nothing was added. */
  build(): THREE.BufferGeometry | null {
    if (this.vertexCount === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geo.setIndex(this.vertexCount > 65535 ? new THREE.Uint32BufferAttribute(this.indices, 1) : new THREE.Uint16BufferAttribute(this.indices, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}

/** Reusable matrix builder: compose(position, euler/yaw, scale). */
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const p = new THREE.Vector3();
const s = new THREE.Vector3();

export function trs(
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
  order: THREE.EulerOrder = "XYZ",
): THREE.Matrix4 {
  e.set(rx, ry, rz, order);
  q.setFromEuler(e);
  p.set(x, y, z);
  s.set(sx, sy, sz);
  return m4.compose(p, q, s);
}

/** Shared unit primitives (1 m sized, centred). Never dispose these. */
export const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  cylinderLow: new THREE.CylinderGeometry(0.5, 0.5, 1, 7),
  cone: new THREE.ConeGeometry(0.5, 1, 12),
  pyramid: new THREE.ConeGeometry(0.7071, 1, 4, 1).rotateY(Math.PI / 4),
  sphere: new THREE.SphereGeometry(0.5, 14, 10),
  sphereLow: new THREE.IcosahedronGeometry(0.5, 1),
  dome: new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  rock: new THREE.DodecahedronGeometry(0.5, 0),
};

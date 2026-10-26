// Reusable scenery pieces: palm trees, rocks, wooden piers, text labels,
// and the registry of walkable built surfaces.

import * as THREE from "three";
import { forwardOf, makeRng, rightOf } from "../../../../shared/math";
import type { Collider } from "../../contracts";
import { GeometryBatch, UNIT, trs } from "../batch";
import { GLOW_BOOST } from "../renderer";

export const vertexColorMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 });
export const glowMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  fog: false,
  toneMapped: false,
  color: new THREE.Color(GLOW_BOOST, GLOW_BOOST, GLOW_BOOST),
});

// ---------------------------------------------------------------------------
// Walkable surfaces (oriented rectangles).

export interface Surface {
  x: number;
  z: number;
  heading: number;
  halfLength: number;
  halfWidth: number;
  y: number;
}

export class SurfaceSet {
  private list: (Surface & { reach: number; fx: number; fz: number; rx: number; rz: number })[] = [];

  add(s: Surface): void {
    const f = forwardOf(s.heading);
    const r = rightOf(s.heading);
    this.list.push({ ...s, reach: Math.hypot(s.halfLength, s.halfWidth), fx: f.x, fz: f.z, rx: r.x, rz: r.z });
  }

  heightAt(x: number, z: number): number | null {
    let best: number | null = null;
    for (const s of this.list) {
      const dx = x - s.x;
      const dz = z - s.z;
      if (Math.abs(dx) > s.reach || Math.abs(dz) > s.reach) continue;
      const along = dx * s.fx + dz * s.fz;
      const across = dx * s.rx + dz * s.rz;
      if (Math.abs(along) <= s.halfLength && Math.abs(across) <= s.halfWidth && (best === null || s.y > best)) best = s.y;
    }
    return best;
  }
}

/**
 * A wooden walkway from (x0,z0) to (x1,z1): planks on posts. Adds the deck
 * to `surfaces` and the geometry to `batch`.
 */
export function addPier(
  batch: GeometryBatch,
  surfaces: SurfaceSet,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  width: number,
  y: number,
  wood = "#a07850",
): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.5) return;
  const heading = Math.atan2(x1 - x0, z1 - z0);
  const f = forwardOf(heading);
  const r = rightOf(heading);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  surfaces.add({ x: cx, z: cz, heading, halfLength: len / 2, halfWidth: width / 2, y: y + 0.08 });
  const planks = Math.max(1, Math.round(len / 0.6));
  const dark = new THREE.Color(wood).multiplyScalar(0.8);
  for (let i = 0; i < planks; i++) {
    const t = (i + 0.5) / planks - 0.5;
    const px = cx + f.x * t * len;
    const pz = cz + f.z * t * len;
    batch.add(UNIT.box, trs(px, y, pz, 0, heading, 0, width, 0.12, (len / planks) * 0.9), i % 3 === 0 ? dark : wood);
  }
  const posts = Math.max(2, Math.round(len / 3) + 1);
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1) - 0.5;
    for (const side of [-1, 1]) {
      const px = cx + f.x * t * len + r.x * side * (width / 2 - 0.1);
      const pz = cz + f.z * t * len + r.z * side * (width / 2 - 0.1);
      batch.add(UNIT.cylinderLow, trs(px, y - 1.6, pz, 0, 0, 0, 0.28, 3.4, 0.28), "#6b4f35");
    }
  }
}

// ---------------------------------------------------------------------------
// Palm tree (one merged geometry, used with InstancedMesh).

export function palmGeometry(seed = 1): THREE.BufferGeometry {
  const rng = makeRng(seed);
  const batch = new GeometryBatch();
  const segs = 7;
  let x = 0;
  let y = 0;
  const bend = 0.12 + rng() * 0.1;
  for (let i = 0; i < segs; i++) {
    const h = 1.05;
    const d = 0.5 - i * 0.035;
    const nx = x + bend * (i + 1) * 0.35;
    const tilt = Math.atan2(nx - x, h);
    batch.add(UNIT.cylinderLow, trs((x + nx) / 2, y + h / 2, 0, 0, 0, -tilt, d, h * 1.04, d), i % 2 ? "#8d6e4f" : "#7a5c40");
    x = nx;
    y += h * 0.98;
  }
  const leaves = 9;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + rng() * 0.3;
    const droop = 0.35 + rng() * 0.35;
    const len = 3 + rng() * 0.8;
    const m = new THREE.Matrix4()
      .makeTranslation(x, y + 0.1, 0)
      .multiply(new THREE.Matrix4().makeRotationY(a))
      .multiply(new THREE.Matrix4().makeRotationX(droop))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, len / 2))
      .multiply(new THREE.Matrix4().makeScale(0.9, 0.06, len));
    batch.add(UNIT.box, m, i % 2 ? "#3f9a3f" : "#4fb34c");
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    batch.add(UNIT.sphereLow, trs(x + Math.sin(a) * 0.25, y - 0.15, Math.cos(a) * 0.25, 0, 0, 0, 0.32, 0.32, 0.32), "#6b4a2a");
  }
  return batch.build()!;
}

export interface Placement {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
}

export function instanced(geo: THREE.BufferGeometry, placements: Placement[], castShadow = true): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, vertexColorMaterial, Math.max(1, placements.length));
  const m = new THREE.Matrix4();
  placements.forEach((p, i) => {
    mesh.setMatrixAt(i, m.copy(trs(p.x, p.y, p.z, 0, p.rotY, 0, p.scale, p.scale, p.scale)));
  });
  mesh.count = placements.length;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

export function rockGeometry(): THREE.BufferGeometry {
  const batch = new GeometryBatch();
  batch.add(UNIT.rock, trs(0, 0.25, 0, 0.3, 0.5, 0.1, 1.2, 0.8, 1), "#9a958a");
  batch.add(UNIT.rock, trs(0.45, 0.15, 0.2, 0.8, 0.1, 0.4, 0.6, 0.5, 0.6), "#8a857a");
  return batch.build()!;
}

// ---------------------------------------------------------------------------
// Text labels.

export function textSprite(
  text: string,
  opts: { color?: string; background?: string; size?: number; fog?: boolean; sub?: string } = {},
): THREE.Sprite {
  const size = opts.size ?? 64;
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d")!;
  const font = `700 ${size}px "Baloo 2", "Trebuchet MS", system-ui, sans-serif`;
  const subFont = `600 ${Math.round(size * 0.45)}px "Baloo 2", "Trebuchet MS", system-ui, sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width);
  g.font = subFont;
  const sw = opts.sub ? Math.ceil(g.measureText(opts.sub).width) : 0;
  const pad = size * 0.5;
  canvas.width = Math.max(w, sw) + pad * 2;
  canvas.height = Math.round(size * (opts.sub ? 1.9 : 1.4));
  const ctx = canvas.getContext("2d")!;
  if (opts.background) {
    ctx.fillStyle = opts.background;
    const r = canvas.height * 0.3;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, r);
    ctx.fill();
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font;
  ctx.lineWidth = size * 0.12;
  ctx.strokeStyle = "rgba(10,30,50,0.55)";
  const ty = opts.sub ? size * 0.72 : canvas.height / 2;
  ctx.strokeText(text, canvas.width / 2, ty);
  ctx.fillStyle = opts.color ?? "#ffffff";
  ctx.fillText(text, canvas.width / 2, ty);
  if (opts.sub) {
    ctx.font = subFont;
    ctx.lineWidth = size * 0.08;
    ctx.strokeText(opts.sub, canvas.width / 2, size * 1.42);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(opts.sub, canvas.width / 2, size * 1.42);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: opts.fog ?? false });
  const sprite = new THREE.Sprite(material);
  sprite.userData.aspect = canvas.width / canvas.height;
  return sprite;
}

export function addCollider(colliders: Collider[], x: number, z: number, r: number): void {
  colliders.push({ x, z, r });
}

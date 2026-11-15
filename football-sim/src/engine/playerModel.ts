/** Procedural footballer: one skinned mesh (single draw call) with a 13-bone skeleton and a per-player texture atlas. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Kit, PlayerData } from '../data/types';
import { ATLAS, playerAtlas } from './textures';

export const enum B { hips, spine, head, armL, foreL, armR, foreR, thighL, shinL, footL, thighR, shinR, footR }
// [parent, x, y, z] in bind pose. Model faces +X, up +Y, right side is +Z.
const BONES: [number, number, number, number][] = [
  [-1, 0, 0.95, 0], [0, 0, 0.12, 0], [1, 0, 0.5, 0],
  [1, 0, 0.425, -0.2], [3, 0, -0.29, 0], [1, 0, 0.425, 0.2], [5, 0, -0.29, 0],
  [0, 0, -0.03, -0.1], [7, 0, -0.44, 0], [8, 0, -0.42, 0], [0, 0, -0.03, 0.1], [10, 0, -0.44, 0], [11, 0, -0.42, 0],
];
// Atlas rectangles in pixels: [x, y, w, h]
const R = {
  shirt: [0, 0, 512, 256], face: [0, 256, 256, 128],
  skin: [10, 400, 44, 96], shorts: [74, 400, 44, 96], socks: [138, 386, 44, 110], boots: [202, 400, 44, 96],
  hair: [266, 400, 44, 96], hands: [330, 400, 44, 96], fore: [394, 400, 44, 96], sleeve: [458, 400, 44, 96],
} as const;

function bindWorld(i: number, out = new THREE.Vector3()) {
  out.set(0, 0, 0);
  for (let b = i; b >= 0; b = BONES[b][0]) out.add(new THREE.Vector3(BONES[b][1], BONES[b][2], BONES[b][3]));
  return out;
}
function part(geo: THREE.BufferGeometry, bone: number, rect: readonly number[]) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  g.translate(...bindWorld(bone).toArray());
  const n = g.attributes.position.count;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < n; i++) uv.setXY(i, (rect[0] + uv.getX(i) * rect[2]) / ATLAS, 1 - (rect[1] + (1 - uv.getY(i)) * rect[3]) / ATLAS);
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
  return g;
}
const lathe = (pts: [number, number][], seg = 18) => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg);
/** Tapered limb segment hanging down from its joint. */
const limb = (r0: number, r1: number, len: number, y0 = 0, seg = 12) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg, 1); g.translate(0, y0 - len / 2, 0); return g; };
const ball = (r: number, y = 0, sx = 1, sy = 1, sz = 1, seg = 12) => { const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)); g.scale(sx, sy, sz); g.translate(0, y, 0); return g; };

const geoCache = new Map<number, THREE.BufferGeometry>();
function bodyGeometry(hair: number): THREE.BufferGeometry {
  const cached = geoCache.get(hair); if (cached) return cached;
  const parts: THREE.BufferGeometry[] = [];
  // Pelvis and shorts
  const pelvis = lathe([[0.02, -0.12], [0.165, -0.1], [0.172, 0.02], [0.155, 0.14], [0.02, 0.15]]); pelvis.scale(0.72, 1, 1);
  parts.push(part(pelvis, B.hips, R.shorts));
  // Torso: waist to shoulders, flattened front to back
  const torso = lathe([[0.03, -0.02], [0.158, 0], [0.166, 0.12], [0.182, 0.3], [0.185, 0.4], [0.15, 0.47], [0.07, 0.515], [0.05, 0.53]], 20); torso.scale(0.66, 1, 1.02);
  parts.push(part(torso, B.spine, R.shirt));
  // Neck and head
  parts.push(part(limb(0.06, 0.068, 0.11, 0.085), B.head, R.skin));
  const head = new THREE.SphereGeometry(0.108, 18, 14); head.scale(1.02, 1.2, 0.9); head.translate(0, 0.152, 0);
  parts.push(part(head, B.head, R.face));
  for (const s of [-1, 1]) parts.push(part(ball(0.022, 0.147, 0.6, 1.3, 1).translate(0, 0, s * 0.1), B.head, R.skin));
  if (hair > 0) {
    const cfg = [0, 1.035, 1.07, 1.28, 1.08, 1.035, 1.14][hair];
    const cap = new THREE.SphereGeometry(0.108 * cfg, 16, 10, 0, Math.PI * 2, 0, hair === 3 ? 1.9 : 1.45);
    cap.scale(1.02, hair === 6 ? 1.34 : 1.2, 0.92 * (hair === 3 ? 1.08 : 1)); cap.rotateZ(0.42); cap.translate(-0.008, 0.157, 0);
    parts.push(part(cap, B.head, R.hair));
    if (hair === 4) { const tail = ball(0.07, 0.08, 0.8, 1.7, 1.25); tail.translate(-0.085, 0, 0); parts.push(part(tail, B.head, R.hair)); }
    if (hair === 5) { const ridge = new THREE.BoxGeometry(0.2, 0.06, 0.035); ridge.translate(-0.01, 0.287, 0); parts.push(part(ridge, B.head, R.hair)); }
  }
  for (const [arm, fore, s] of [[B.armL, B.foreL, -1], [B.armR, B.foreR, 1]] as const) {
    parts.push(part(ball(0.06, -0.005, 1, 1, 1, 12), arm, R.sleeve));
    parts.push(part(limb(0.064, 0.056, 0.17, 0), arm, R.sleeve));
    parts.push(part(limb(0.052, 0.046, 0.14, -0.155), arm, R.skin));
    parts.push(part(ball(0.047, 0), fore, R.fore));
    parts.push(part(limb(0.046, 0.036, 0.25, 0), fore, R.fore));
    parts.push(part(ball(0.04, -0.285, 0.75, 1.25, 0.95), fore, R.hands));
    void s;
  }
  for (const [th, sh, ft] of [[B.thighL, B.shinL, B.footL], [B.thighR, B.shinR, B.footR]] as const) {
    parts.push(part(limb(0.098, 0.088, 0.24, 0.02), th, R.shorts));
    parts.push(part(limb(0.08, 0.058, 0.26, -0.19), th, R.skin));
    parts.push(part(ball(0.057, 0), sh, R.skin));
    const calf = lathe([[0.05, 0], [0.062, -0.1], [0.058, -0.2], [0.042, -0.34], [0.04, -0.42]].map(([r, y]) => [r, y] as [number, number]).reverse(), 10);
    parts.push(part(calf, sh, R.socks));
    const boot = new THREE.CapsuleGeometry(0.047, 0.15, 3, 8); boot.rotateZ(Math.PI / 2); boot.scale(1, 0.85, 1); boot.translate(0.075, -0.018, 0);
    parts.push(part(boot, ft, R.boots));
  }
  const merged = mergeGeometries(parts, false)!;
  merged.computeBoundingSphere();
  merged.boundingSphere!.radius = 2.5;
  geoCache.set(hair, merged);
  return merged;
}

export class PlayerModel {
  group = new THREE.Group();
  mesh: THREE.SkinnedMesh;
  bones: THREE.Bone[] = [];
  material: THREE.MeshStandardMaterial;
  height: number;
  constructor(public data: PlayerData, kit: Kit, gk: boolean) {
    this.material = new THREE.MeshStandardMaterial({ map: playerAtlas(data, kit, gk), roughness: 0.62, metalness: 0.02 });
    this.mesh = new THREE.SkinnedMesh(bodyGeometry(data.look.hair), this.material);
    for (let i = 0; i < BONES.length; i++) {
      const b = new THREE.Bone(); b.position.set(BONES[i][1], BONES[i][2], BONES[i][3]);
      if (BONES[i][0] >= 0) this.bones[BONES[i][0]].add(b);
      this.bones.push(b);
    }
    this.bones[B.hips].rotation.order = 'YZX';
    this.mesh.add(this.bones[0]);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.castShadow = true; this.mesh.receiveShadow = false; this.mesh.frustumCulled = false;
    this.height = data.look.height / 1.82;
    this.mesh.scale.set(this.height * data.look.build, this.height, this.height * data.look.build);
    this.group.add(this.mesh);
  }
  dispose() { this.material.map?.dispose(); this.material.dispose(); }
}

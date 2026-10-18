// Reusable vehicle parts: finishes derived from the suit/team paint, wheels, lamps, antennas, pipes, decals.
import * as THREE from 'three';
import {
  uber, F, glow, box, rbox, cyl, cylX, cylZ, sph, torus, tube, lathe, xf, decal, decalMaterial, DECAL, getDetail, extrude,
} from './kit.js';
import { vehiclePaint } from '../suit.js';

const _c = new THREE.Color();
export function tint(hex, k) {
  _c.set(hex);
  _c.r = Math.min(1, _c.r * k); _c.g = Math.min(1, _c.g * k); _c.b = Math.min(1, _c.b * k);
  return _c.getHex();
}

// Painted-metal finishes: all share the one paint material (camo or team paint) and differ in tint/gloss.
export function paintFinishes(suit, team) {
  const mat = uber(vehiclePaint(suit, team));
  return {
    paint: { mat, c: 0xffffff, r: 0.74, m: 0.12 },
    paintDk: { mat, c: 0x9a9a9a, r: 0.8, m: 0.12 },
    paintLt: { mat, c: 0xffffff, r: 0.62, m: 0.2 },
    paintWorn: { mat, c: 0xd0cabc, r: 0.9, m: 0.25 },
  };
}

export const TEAM_RGB = { def: 0x3d8bff, atk: 0xff4d3d };

// ---------- wheels ----------

// Wheel with axle along local z, centered at the origin. side = +1/-1: which z side is the outer face.
export function wheel(rig, bone, { R = 0.45, W = 0.3, side = 1, rim = F.steel, tire = F.tire, lugs = 8, treads = 18, rimFrac = 0.62, spokes = 0 } = {}) {
  const hi = getDetail() >= 2;
  const rr = R * rimFrac;
  rig.add(bone, lathe([[rr, -W / 2], [R * 0.84, -W * 0.52], [R * 0.96, -W * 0.47], [R, -W * 0.34], [R, W * 0.34], [R * 0.96, W * 0.47],
    [R * 0.84, W * 0.52], [rr, W / 2]], 20).rotateX(Math.PI / 2), tire);
  if (hi) {
    for (let i = 0; i < treads; i++) {
      const a = (i / treads) * Math.PI * 2;
      rig.add(bone, box(0.045, 0.03, W * 0.62), tire, [Math.cos(a) * (R + 0.006), Math.sin(a) * (R + 0.006), 0], [0, 0, a]);
    }
  }
  // Rim barrel and dished outer face.
  rig.add(bone, cylZ(rr * 0.98, W * 0.86, 16), rim);
  rig.add(bone, cylZ(rr * 0.86, 0.02, 16), F.darkSteel, [0, 0, side * W * 0.44]);
  rig.add(bone, cylZ(R * 0.17, 0.045, 12), F.chrome, [0, 0, side * W * 0.46]);
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * Math.PI * 2;
    rig.add(bone, cylZ(R * 0.035, 0.03, 6), F.chrome, [Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3, side * W * 0.47]);
  }
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    rig.add(bone, box(rr * 0.8, 0.035, 0.03), rim, [Math.cos(a) * rr * 0.5, Math.sin(a) * rr * 0.5, side * W * 0.44], [0, 0, a]);
  }
  // Brake disc/hub on the inner side.
  rig.add(bone, cylZ(rr * 0.7, 0.02, 12), F.darkSteel, [0, 0, -side * W * 0.3]);
}

// ---------- small details ----------

export function lamp(rig, bone, p, r, color, intensity = 3, dir = [1, 0, 0], housing = F.darkSteel) {
  const g = cyl(r, r, 0.02, 12);
  // Cylinder axis is y; aim it along dir.
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  rig.add(bone, g, glow(color, intensity), p, [e.x, e.y, e.z]);
  const h = cyl(r * 1.15, r * 1.15, 0.04, 12);
  rig.add(bone, h, housing, [p[0] - dir[0] * 0.015, p[1] - dir[1] * 0.015, p[2] - dir[2] * 0.015], [e.x, e.y, e.z]);
}

// Thin whip antenna (tapered) with a base spring.
export function whip(rig, bone, p, h, r = 0.006, lean = [0, 0, 0]) {
  rig.add(bone, cyl(r * 0.5, r, h, 5), F.rubber, [p[0], p[1] + h / 2, p[2]], lean);
  rig.add(bone, cyl(0.03, 0.04, 0.07, 8), F.darkSteel, p);
}

export function pipe(rig, bone, pts, r, f, n = 6, m = 12) {
  rig.add(bone, tube(pts, r, n, m), f);
}

// Decal quad. face: +1 (faces +z), -1 (faces -z), 'up' (faces +y).
export function decalAt(rig, bone, cell, w, h, p, face = 1, rotZ = 0) {
  const g = decal(cell, w, h);
  if (face === 'up') {
    g.rotateZ(rotZ).rotateX(-Math.PI / 2);
    rig.add(bone, g, decalMaterial(), p);
  } else {
    g.rotateZ(rotZ);
    if (face < 0) g.rotateY(Math.PI);
    rig.add(bone, g, decalMaterial(), p);
  }
}

export { DECAL };

// Team identification: roundels on both flanks (and optionally the roof), a stripe, and a hull number.
export function teamMarks(rig, bone, team, { roundel = [0, 0, 0], size = 0.5, roofAt = null, roofSize = 0.8, stripe = null, number = null, numberSize = 0.3 } = {}) {
  const cell = DECAL.roundel[team] ?? 0;
  decalAt(rig, bone, cell, size, size, [roundel[0], roundel[1], roundel[2]], 1);
  decalAt(rig, bone, cell, size, size, [roundel[0], roundel[1], -roundel[2]], -1);
  if (roofAt) decalAt(rig, bone, cell, roofSize, roofSize, roofAt, 'up', -Math.PI / 2);
  if (stripe) {
    const sc = DECAL.stripe[team] ?? 2;
    decalAt(rig, bone, sc, stripe.w, stripe.h, [stripe.x, stripe.y, stripe.z], 1);
    decalAt(rig, bone, sc, stripe.w, stripe.h, [stripe.x, stripe.y, -stripe.z], -1);
  }
  if (number) {
    decalAt(rig, bone, DECAL.number + (number.i % 8), numberSize * 1.0, numberSize * 0.5, [number.x, number.y, number.z], 1);
    decalAt(rig, bone, DECAL.number + (number.i % 8), numberSize * 1.0, numberSize * 0.5, [number.x, number.y, -number.z], -1);
  }
}

// Bolt row along x (rivets / hex bolts) — cheap detail strip.
export function boltRow(rig, bone, f, p0, p1, count, r = 0.012) {
  if (getDetail() < 2) return;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    rig.add(bone, cyl(r, r, 0.012, 6), f, [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t], [Math.PI / 2, 0, 0]);
  }
}

// Panel groove: a thin dark strip laid on a surface (panel lines).
export function groove(rig, bone, p, size, rot = null) {
  rig.add(bone, box(size[0], size[1], size[2]), F.soot, p, rot);
}

export { box, rbox, cyl, cylX, cylZ, sph, torus, lathe, xf, extrude };

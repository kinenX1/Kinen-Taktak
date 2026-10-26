// Life in the world: grass that sways in the wind, flowers, driftwood on the
// beaches and seagulls circling the islands. All instanced, so it is cheap.

import * as THREE from "three";
import { TAU, makeRng } from "../../../../shared/math";
import { CITIES, HOME_ISLAND, ISLANDS, SLIPS, SPAWN, islandRadiusAt, terrainHeight, type Island } from "../../../../shared/world";
import type { Collider } from "../../contracts";
import { GeometryBatch, UNIT, trs } from "../batch";

export interface Nature {
  group: THREE.Group;
  update(dt: number, time: number): void;
}

function grassGeometry(): THREE.BufferGeometry {
  const rng = makeRng(5);
  const b = new GeometryBatch();
  const blade = new THREE.ConeGeometry(0.04, 1, 3, 1, true);
  blade.translate(0, 0.5, 0);
  for (let i = 0; i < 11; i++) {
    const a = rng() * TAU;
    const r = rng() * 0.2;
    const h = 0.22 + rng() * 0.28;
    b.add(blade, trs(Math.sin(a) * r, 0, Math.cos(a) * r, (rng() - 0.5) * 0.6, a, (rng() - 0.5) * 0.6, 1, h, 1), "#ffffff");
  }
  const geo = b.build()!;
  // Dark at the root, sunny at the tips.
  const pos = geo.getAttribute("position");
  const col = geo.getAttribute("color");
  const root = new THREE.Color("#3d7a2a");
  const tip = new THREE.Color("#b6dd6a");
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(root).lerp(tip, Math.min(1, pos.getY(i) / 0.4));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  return geo;
}

/** Stem, leaves and the yellow heart; the petals are a separate, tinted mesh. */
function stemGeometry(): THREE.BufferGeometry {
  const b = new GeometryBatch();
  b.add(UNIT.cylinderLow, trs(0, 0.2, 0, 0, 0, 0, 0.03, 0.4, 0.03), "#3f8a2e");
  b.add(UNIT.sphereLow, trs(0.06, 0.12, 0, 0, 0, 0.5, 0.12, 0.02, 0.06), "#4c9a35");
  b.add(UNIT.sphereLow, trs(-0.05, 0.2, 0.02, 0, 0.4, -0.5, 0.1, 0.02, 0.05), "#4c9a35");
  b.add(UNIT.sphereLow, trs(0, 0.43, 0, 0, 0, 0, 0.08, 0.06, 0.08), "#ffd43b");
  return b.build()!;
}

function petalGeometry(): THREE.BufferGeometry {
  const b = new GeometryBatch();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    b.add(UNIT.sphereLow, trs(Math.sin(a) * 0.08, 0.42, Math.cos(a) * 0.08, 0, a, 0, 0.13, 0.03, 0.1), "#ffffff");
  }
  return b.build()!;
}

function driftwoodGeometry(): THREE.BufferGeometry {
  const b = new GeometryBatch();
  b.add(UNIT.cylinderLow, trs(0, 0.12, 0, Math.PI / 2, 0, 0.1, 0.22, 2.2, 0.22), "#b7a58a");
  b.add(UNIT.cylinderLow, trs(0.5, 0.15, 0.3, Math.PI / 2, 0.7, 0, 0.1, 0.8, 0.1), "#a8957a");
  return b.build()!;
}

/** Grass sways with a little vertex wind, offset per instance. */
function windMaterial(time: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float h = max(transformed.y, 0.0);
        #ifdef USE_INSTANCING
          vec2 ip = instanceMatrix[3].xz;
        #else
          vec2 ip = vec2(0.0);
        #endif
        float w = sin(uTime * 1.7 + ip.x * 0.13 + ip.y * 0.09) * 0.16 + sin(uTime * 3.3 + ip.x * 0.4) * 0.05;
        transformed.x += w * h;
        transformed.z += w * 0.5 * h;`,
      );
  };
  return m;
}

function blocked(colliders: readonly Collider[], x: number, z: number, pad: number): boolean {
  for (const c of colliders) {
    const dx = x - c.x;
    const dz = z - c.z;
    const r = c.r + pad;
    if (Math.abs(dx) < r && Math.abs(dz) < r && dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

function scatter(
  isl: Island,
  count: number,
  rng: () => number,
  accept: (x: number, z: number, h: number) => boolean,
): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (let tries = 0; out.length < count && tries < count * 8; tries++) {
    const a = rng() * TAU;
    const d = Math.sqrt(rng()) * 0.95;
    const r = islandRadiusAt(isl, a) * d;
    const x = isl.x + Math.sin(a) * r;
    const z = isl.z + Math.cos(a) * r;
    const h = terrainHeight(x, z);
    if (accept(x, z, h)) out.push({ x, y: h, z });
  }
  return out;
}

export function createNature(colliders: readonly Collider[]): Nature {
  const group = new THREE.Group();
  const rng = makeRng(31);
  const time = { value: 0 };

  // --- Grass and flowers.
  const grassSpots: { x: number; y: number; z: number }[] = [];
  const flowerSpots: { x: number; y: number; z: number }[] = [];
  const lushness: Record<string, number> = { home: 1700, islet: 90, coral: 500, verdant: 900, lantern: 450, iron: 150, sun: 60, frost: 0 };
  for (const isl of ISLANDS) {
    const n = isl.kind === "city" ? lushness[isl.style ?? ""] ?? 0 : lushness[isl.kind];
    if (!n) continue;
    const ok = (x: number, z: number, h: number) =>
      h > 1.25 &&
      Math.hypot(x - SPAWN.x, z - SPAWN.z) > 3 &&
      (isl.kind !== "city" || Math.hypot(x - isl.x, z - isl.z) > isl.radius * 0.3) &&
      !blocked(colliders, x, z, 0.4);
    grassSpots.push(...scatter(isl, n, rng, ok));
    flowerSpots.push(...scatter(isl, Math.round(n / 9), rng, ok));
  }
  const grass = new THREE.InstancedMesh(grassGeometry(), windMaterial(time), grassSpots.length);
  const m = new THREE.Matrix4();
  grassSpots.forEach((p, i) => grass.setMatrixAt(i, m.copy(trs(p.x, p.y - 0.04, p.z, 0, rng() * TAU, 0, 0.9 + rng() * 0.6, 0.7 + rng() * 0.6, 0.9 + rng() * 0.6))));
  grass.receiveShadow = true;
  grass.instanceMatrix.needsUpdate = true;
  grass.computeBoundingSphere();
  group.add(grass);

  const flowerColors = ["#ff6b6b", "#ffd43b", "#f783ac", "#ffffff", "#9775fa", "#ffa94d", "#4dabf7"].map((c) => new THREE.Color(c));
  const flowerMat = windMaterial(time);
  const stems = new THREE.InstancedMesh(stemGeometry(), flowerMat, Math.max(1, flowerSpots.length));
  const petals = new THREE.InstancedMesh(petalGeometry(), flowerMat, Math.max(1, flowerSpots.length));
  flowerSpots.forEach((p, i) => {
    m.copy(trs(p.x, p.y - 0.02, p.z, 0, rng() * TAU, 0, 1.2, 0.9 + rng() * 0.6, 1.2));
    stems.setMatrixAt(i, m);
    petals.setMatrixAt(i, m);
    petals.setColorAt(i, flowerColors[Math.floor(rng() * flowerColors.length)]);
  });
  for (const mesh of [stems, petals]) {
    mesh.count = flowerSpots.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  // --- Driftwood on the home beach (kept away from the slip piers).
  const slipAngles = SLIPS.map((s) => s.heading);
  const wood: { x: number; y: number; z: number; ry: number }[] = [];
  for (let tries = 0; wood.length < 10 && tries < 200; tries++) {
    const a = rng() * TAU;
    if (slipAngles.some((s) => Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s))) < 0.25)) continue;
    const r = islandRadiusAt(HOME_ISLAND, a) * (0.86 + rng() * 0.08);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    wood.push({ x, y: Math.max(0, terrainHeight(x, z)), z, ry: rng() * TAU });
  }
  const drift = new THREE.InstancedMesh(driftwoodGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), wood.length);
  wood.forEach((w, i) => drift.setMatrixAt(i, m.copy(trs(w.x, w.y, w.z, 0, w.ry, 0))));
  drift.castShadow = true;
  drift.receiveShadow = true;
  drift.instanceMatrix.needsUpdate = true;
  drift.computeBoundingSphere();
  group.add(drift);

  // --- Seagulls.
  interface Gull {
    cx: number;
    cz: number;
    r: number;
    h: number;
    speed: number;
    phase: number;
    flap: number;
  }
  const gulls: Gull[] = [];
  const addGulls = (isl: Island, n: number) => {
    for (let i = 0; i < n; i++) {
      gulls.push({
        cx: isl.x,
        cz: isl.z,
        r: isl.radius * (0.7 + rng() * 0.8),
        h: 16 + rng() * 22,
        speed: (0.08 + rng() * 0.08) * (rng() < 0.5 ? 1 : -1),
        phase: rng() * TAU,
        flap: rng() * TAU,
      });
    }
  };
  addGulls(HOME_ISLAND, 7);
  for (const c of CITIES) addGulls(c, 4);

  // Double-sided: the right wings are mirrored, which flips their winding.
  const gullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
  const bodyB = new GeometryBatch();
  bodyB.add(UNIT.sphere, trs(0, 0, 0, 0, 0, 0, 0.22, 0.2, 0.62), "#f5f5f0");
  bodyB.add(UNIT.sphere, trs(0, 0.06, 0.3, 0, 0, 0, 0.16, 0.16, 0.18), "#f5f5f0");
  bodyB.add(UNIT.cone, trs(0, 0.05, 0.43, Math.PI / 2, 0, 0, 0.05, 0.12, 0.05), "#f2a93b");
  bodyB.add(UNIT.box, trs(0, 0, -0.33, 0, 0, 0, 0.18, 0.03, 0.16), "#c9ccd1");
  const wingB = new GeometryBatch();
  wingB.add(UNIT.box, trs(0.35, 0, 0, 0, 0, 0, 0.7, 0.02, 0.24), "#e9ecef");
  wingB.add(UNIT.box, trs(0.82, 0, -0.03, 0, 0, 0, 0.26, 0.02, 0.2), "#3d4148");
  const bodies = new THREE.InstancedMesh(bodyB.build()!, gullMat, gulls.length);
  const wingsL = new THREE.InstancedMesh(wingB.build()!, gullMat, gulls.length);
  const wingsR = new THREE.InstancedMesh(wingsL.geometry, gullMat, gulls.length);
  for (const mesh of [bodies, wingsL, wingsR]) {
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    group.add(mesh);
  }
  const base = new THREE.Matrix4();
  const wing = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const mirror = new THREE.Matrix4().makeScale(-1, 1, 1);
  const shoulder = new THREE.Matrix4().makeTranslation(0.08, 0.04, 0);

  return {
    group,
    update(_dt, t) {
      time.value = t;
      gulls.forEach((g, i) => {
        const a = g.phase + t * g.speed;
        pos.set(g.cx + Math.sin(a) * g.r, g.h + Math.sin(t * 0.5 + g.phase) * 2, g.cz + Math.cos(a) * g.r);
        const heading = a + (g.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
        e.set(0, heading, (g.speed > 0 ? -1 : 1) * 0.25, "YXZ");
        base.compose(pos, q.setFromEuler(e), one);
        bodies.setMatrixAt(i, base);
        // Flap, then glide for a while.
        const cycle = (t * 0.35 + g.flap) % 3;
        const flap = cycle < 1.2 ? Math.sin(t * 9 + g.flap) * 0.55 : 0.12;
        wing.makeRotationZ(flap).premultiply(shoulder).premultiply(base);
        wingsL.setMatrixAt(i, wing);
        wing.makeRotationZ(flap).premultiply(shoulder).premultiply(mirror).premultiply(base);
        wingsR.setMatrixAt(i, wing);
      });
      bodies.instanceMatrix.needsUpdate = true;
      wingsL.instanceMatrix.needsUpdate = true;
      wingsR.instanceMatrix.needsUpdate = true;
    },
  };
}

// Driftwood Isle: the empty starting island. A few palms and rocks, a
// campfire where everyone spawns, and the shipyard: one slip per player with
// catwalks around the build bay and a pier back to the beach.

import * as THREE from "three";
import { TAU, forwardOf, makeRng, rightOf } from "../../../../shared/math";
import { HOME_ISLAND, SLIPS, SPAWN, islandRadiusAt, terrainHeight } from "../../../../shared/world";
import type { Collider } from "../../contracts";
import { GeometryBatch, UNIT, trs } from "../batch";
import { GLOW_BOOST } from "../renderer";
import {
  SurfaceSet,
  addCollider,
  addPier,
  instanced,
  palmGeometry,
  rockGeometry,
  textSprite,
  vertexColorMaterial,
  type Placement,
} from "./props";

export interface HomeIsland {
  group: THREE.Group;
  update(dt: number, time: number): void;
}

/** Half sizes of a slip's build bay (a 9 x 15 boat plus clearance). */
const BAY_HALF_WIDTH = 5.2;
const BAY_HALF_LENGTH = 8.3;
const DECK_Y = 1.0;

export function createHomeIsland(colliders: Collider[], surfaces: SurfaceSet): HomeIsland {
  const group = new THREE.Group();
  const rng = makeRng(2024);
  const batch = new GeometryBatch();

  // --- Shipyard slips.
  SLIPS.forEach((slip) => {
    const f = forwardOf(slip.heading);
    const r = rightOf(slip.heading);
    const at = (along: number, across: number) => ({
      x: slip.x + f.x * along + r.x * across,
      z: slip.z + f.z * along + r.z * across,
    });
    // Side catwalks along the bay.
    for (const side of [-1, 1]) {
      const a = at(-BAY_HALF_LENGTH, side * (BAY_HALF_WIDTH + 0.5));
      const b = at(BAY_HALF_LENGTH, side * (BAY_HALF_WIDTH + 0.5));
      addPier(batch, surfaces, a.x, a.z, b.x, b.z, 1.1, DECK_Y);
      // Mooring bollards.
      for (const along of [-5, 0, 5]) {
        const p = at(along, side * (BAY_HALF_WIDTH + 0.15));
        batch.add(UNIT.cylinder, trs(p.x, DECK_Y + 0.3, p.z, 0, 0, 0, 0.32, 0.5, 0.32), "#3d3d3d");
      }
    }
    // Stern walkway across the back of the bay.
    const s0 = at(-BAY_HALF_LENGTH - 0.6, -(BAY_HALF_WIDTH + 1.05));
    const s1 = at(-BAY_HALF_LENGTH - 0.6, BAY_HALF_WIDTH + 1.05);
    addPier(batch, surfaces, s0.x, s0.z, s1.x, s1.z, 1.2, DECK_Y);
    // Pier from the beach to the stern walkway.
    const stern = at(-BAY_HALF_LENGTH - 0.6, 0);
    addPier(batch, surfaces, slip.beachX, slip.beachZ, stern.x, stern.z, 2.2, DECK_Y);
    // Keel blocks the docked boat rests on.
    for (const along of [-5.5, -1.8, 1.8, 5.5]) {
      for (const across of [-2.6, 0, 2.6]) {
        const p = at(along, across);
        batch.add(UNIT.box, trs(p.x, -0.7, p.z, 0, slip.heading, 0, 0.9, 3.15, 1.2), across === 0 ? "#5c4430" : "#6b4f35");
      }
    }
    // Marker buoys at the open end of the bay.
    for (const side of [-1, 1]) {
      const p = at(BAY_HALF_LENGTH + 1.5, side * BAY_HALF_WIDTH);
      batch.add(UNIT.sphere, trs(p.x, 0.2, p.z, 0, 0, 0, 0.9, 0.9, 0.9), side < 0 ? "#e63946" : "#2b9348");
    }
    // Slip number signpost on the beach.
    const sign = at(-BAY_HALF_LENGTH - 15.5, 2.4);
    const groundY = Math.max(0, terrainHeight(sign.x, sign.z));
    batch.add(UNIT.box, trs(sign.x, groundY + 1, sign.z, 0, 0, 0, 0.18, 2, 0.18), "#6b4f35");
    addCollider(colliders, sign.x, sign.z, 0.3);
    const label = textSprite(`Slip ${slip.index + 1}`, { size: 48, background: "rgba(107,79,53,0.92)", fog: true });
    label.position.set(sign.x, groundY + 2.3, sign.z);
    label.scale.set(1.1 * label.userData.aspect, 1.1, 1);
    group.add(label);
  });

  // --- Campfire at the spawn point.
  const fireY = terrainHeight(SPAWN.x, SPAWN.z);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    batch.add(UNIT.rock, trs(SPAWN.x + Math.sin(a) * 1.1, fireY + 0.12, SPAWN.z + Math.cos(a) * 1.1, a, a * 2, 0, 0.45, 0.35, 0.45), "#8a857a");
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    batch.add(UNIT.cylinderLow, trs(SPAWN.x, fireY + 0.2, SPAWN.z, Math.PI / 2, a, 0, 0.22, 1.6, 0.22), "#5c3a1e");
  }
  addCollider(colliders, SPAWN.x, SPAWN.z, 1.4);
  // Log benches around the fire.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    const bx = SPAWN.x + Math.sin(a) * 3.4;
    const bz = SPAWN.z + Math.cos(a) * 3.4;
    batch.add(UNIT.cylinderLow, trs(bx, terrainHeight(bx, bz) + 0.25, bz, Math.PI / 2, a + Math.PI / 2, 0, 0.5, 2.2, 0.5), "#7a5c40");
    addCollider(colliders, bx, bz, 0.6);
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff8a1f").multiplyScalar(GLOW_BOOST), transparent: true, opacity: 0.9, toneMapped: false });
  const flameMat2 = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffe066").multiplyScalar(GLOW_BOOST), transparent: true, opacity: 0.95, toneMapped: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 8), flameMat);
  const flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.8, 8), flameMat2);
  flame.position.set(SPAWN.x, fireY + 0.75, SPAWN.z);
  flameCore.position.set(SPAWN.x, fireY + 0.6, SPAWN.z);
  const fireLight = new THREE.PointLight("#ffa040", 6, 16, 1.6);
  fireLight.position.set(SPAWN.x, fireY + 1.5, SPAWN.z);
  group.add(flame, flameCore, fireLight);

  // --- Palms and rocks, kept away from the slips and the campfire.
  const slipAngles = SLIPS.map((s) => s.heading);
  const nearSlip = (a: number) => slipAngles.some((s) => Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s))) < 0.32);
  const palms: Placement[] = [];
  for (let tries = 0; palms.length < 9 && tries < 200; tries++) {
    const a = rng() * TAU;
    if (nearSlip(a)) continue;
    const d = 0.38 + rng() * 0.45;
    const r = islandRadiusAt(HOME_ISLAND, a) * d;
    const x = HOME_ISLAND.x + Math.sin(a) * r;
    const z = HOME_ISLAND.z + Math.cos(a) * r;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 9) continue;
    if (palms.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) continue;
    const scale = 0.85 + rng() * 0.35;
    palms.push({ x, y: terrainHeight(x, z) - 0.1, z, rotY: rng() * TAU, scale });
    addCollider(colliders, x, z, 0.5 * scale);
  }
  group.add(instanced(palmGeometry(3), palms));

  const rocks: Placement[] = [];
  for (let tries = 0; rocks.length < 12 && tries < 200; tries++) {
    const a = rng() * TAU;
    if (nearSlip(a)) continue;
    const d = 0.55 + rng() * 0.42;
    const r = islandRadiusAt(HOME_ISLAND, a) * d;
    const x = HOME_ISLAND.x + Math.sin(a) * r;
    const z = HOME_ISLAND.z + Math.cos(a) * r;
    const scale = 0.6 + rng() * 1.1;
    rocks.push({ x, y: terrainHeight(x, z) - 0.1, z, rotY: rng() * TAU, scale });
    addCollider(colliders, x, z, 0.7 * scale);
  }
  group.add(instanced(rockGeometry(), rocks));

  const structures = new THREE.Mesh(batch.build()!, vertexColorMaterial);
  structures.castShadow = true;
  structures.receiveShadow = true;
  group.add(structures);

  return {
    group,
    update(_dt, time) {
      const flicker = 0.85 + 0.15 * Math.sin(time * 11) * Math.sin(time * 7.3 + 1);
      flame.scale.set(1, flicker, 1);
      flameCore.scale.set(1, 1.1 - flicker * 0.2, 1);
      fireLight.intensity = 5 + 2 * flicker;
    },
  };
}

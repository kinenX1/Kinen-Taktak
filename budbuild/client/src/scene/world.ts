// The whole static world: sky, ocean, islands, the home island and cities.

import * as THREE from "three";
import { ISLETS, islandRadiusAt, terrainHeight } from "../../../shared/world";
import { makeRng, TAU } from "../../../shared/math";
import type { Collider, CreateWorld } from "../contracts";
import { SUN_DIRECTION } from "./renderer";
import { createCities } from "./world/cities";
import { createHomeIsland } from "./world/home";
import { createNature } from "./world/nature";
import { SurfaceSet, addCollider, instanced, palmGeometry, rockGeometry, type Placement } from "./world/props";
import { createClouds, createSky } from "./world/sky";
import { createTerrain } from "./world/terrain";
import { createOcean } from "./world/water";

function islets(colliders: Collider[]): THREE.Object3D[] {
  const rng = makeRng(77);
  const palms: Placement[] = [];
  const rocks: Placement[] = [];
  for (const isl of ISLETS) {
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU;
      const r = islandRadiusAt(isl, a) * (0.15 + rng() * 0.45);
      const x = isl.x + Math.sin(a) * r;
      const z = isl.z + Math.cos(a) * r;
      const scale = 0.8 + rng() * 0.4;
      palms.push({ x, y: terrainHeight(x, z) - 0.1, z, rotY: rng() * TAU, scale });
      addCollider(colliders, x, z, 0.5 * scale);
    }
    for (let i = 0; i < 3; i++) {
      const a = rng() * TAU;
      const r = islandRadiusAt(isl, a) * (0.6 + rng() * 0.35);
      const x = isl.x + Math.sin(a) * r;
      const z = isl.z + Math.cos(a) * r;
      const scale = 0.7 + rng() * 1.3;
      rocks.push({ x, y: terrainHeight(x, z) - 0.15, z, rotY: rng() * TAU, scale });
      addCollider(colliders, x, z, 0.7 * scale);
    }
  }
  return [instanced(palmGeometry(11), palms), instanced(rockGeometry(), rocks)];
}

export const createWorld: CreateWorld = (ctx) => {
  const colliders: Collider[] = [];
  const surfaces = new SurfaceSet();

  const sky = createSky();
  const clouds = createClouds();
  const ocean = createOcean();
  const terrain = createTerrain();
  const home = createHomeIsland(colliders, surfaces);
  const cities = createCities(colliders, surfaces);
  const isletProps = islets(colliders);
  // After every collider exists, so grass keeps clear of buildings and rocks.
  const nature = createNature(colliders);
  ctx.scene.add(sky, clouds.group, ocean.group, terrain, home.group, cities.group, nature.group, ...isletProps);

  const sunOffset = SUN_DIRECTION.clone().multiplyScalar(200);

  return {
    colliders,
    surfaceAt: (x, z) => surfaces.heightAt(x, z),
    update(dt, time, focus) {
      sky.position.copy(ctx.camera.position);
      ocean.update(time, focus);
      clouds.update(dt, time, focus);
      home.update(dt, time);
      cities.update(dt, time, focus);
      nature.update(dt, time);
      // Keep the shadow box centred on the focus, snapped to texels so
      // shadows don't shimmer as you move.
      const sc = ctx.sun.shadow.camera;
      const snap = (sc.right - sc.left) / Math.max(1, ctx.sun.shadow.mapSize.x);
      const fx = Math.round(focus.x / snap) * snap;
      const fz = Math.round(focus.z / snap) * snap;
      ctx.sun.position.set(fx + sunOffset.x, focus.y + sunOffset.y, fz + sunOffset.z);
      ctx.sun.target.position.set(fx, focus.y, fz);
      ctx.sun.target.updateMatrixWorld();
    },
  };
};

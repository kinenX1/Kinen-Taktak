// The six cities. Each is generated deterministically from its id: streets of
// buildings in the city's style, a landmark on the plaza, a pier pointing
// home, a lighthouse with a beam you can see across the sea, and a name
// label that stays readable from far away.

import * as THREE from "three";
import { TAU, hashString, makeRng } from "../../../../shared/math";
import { CITIES, HOME_ISLAND, islandRadiusAt, terrainHeight, type CityStyle, type Island } from "../../../../shared/world";
import type { Collider } from "../../contracts";
import { GeometryBatch, UNIT, trs } from "../batch";
import { SurfaceSet, addCollider, addPier, glowMaterial, instanced, palmGeometry, textSprite, vertexColorMaterial, type Placement } from "./props";

export interface Cities {
  group: THREE.Group;
  update(dt: number, time: number, focus: THREE.Vector3): void;
}

interface Building {
  x: number;
  z: number;
  y: number;
  w: number;
  d: number;
  h: number;
  yaw: number;
}

interface Batches {
  solid: GeometryBatch;
  glow: GeometryBatch;
}

type Rng = () => number;

const pickFrom = <T,>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length) % list.length];

// Simple tree geometries shared by all cities.
function roundTreeGeometry(): THREE.BufferGeometry {
  const b = new GeometryBatch();
  b.add(UNIT.cylinderLow, trs(0, 1.4, 0, 0, 0, 0, 0.45, 2.8, 0.45), "#6b4f35");
  b.add(UNIT.sphereLow, trs(0, 3.6, 0, 0, 0, 0, 3.2, 2.8, 3.2), "#4f9a3c");
  b.add(UNIT.sphereLow, trs(0.8, 3.1, 0.5, 0, 0, 0, 2.2, 2, 2.2), "#5fae46");
  b.add(UNIT.sphereLow, trs(-0.7, 4.2, -0.4, 0, 0, 0, 2, 1.8, 2), "#468c36");
  return b.build()!;
}

function pineGeometry(snowy: boolean): THREE.BufferGeometry {
  const b = new GeometryBatch();
  b.add(UNIT.cylinderLow, trs(0, 0.8, 0, 0, 0, 0, 0.4, 1.6, 0.4), "#5c3a1e");
  for (let i = 0; i < 3; i++) {
    const s = 3.2 - i * 0.85;
    b.add(UNIT.cone, trs(0, 2 + i * 1.3, 0, 0, 0, 0, s, 2.2, s), "#2e6b45");
    if (snowy) b.add(UNIT.cone, trs(0, 2.55 + i * 1.3, 0, 0, 0, 0, s * 0.62, 1.1, s * 0.62), "#f4fbff");
  }
  return b.build()!;
}

let ROUND_TREE: THREE.BufferGeometry | null = null;
let PINE: THREE.BufferGeometry | null = null;
let SNOW_PINE: THREE.BufferGeometry | null = null;
let PALM: THREE.BufferGeometry | null = null;

// ---------------------------------------------------------------------------
// Building styles

function addWindows(b: Batches, bd: Building, floors: number, color: string, rng: Rng): void {
  const cols = Math.max(1, Math.floor(bd.w / 2.2));
  for (let f = 0; f < floors; f++) {
    const y = bd.y + 1.7 + f * 3;
    if (y > bd.y + bd.h - 0.8) break;
    for (let c = 0; c < cols; c++) {
      if (rng() < 0.15) continue;
      const lx = -bd.w / 2 + ((c + 0.5) * bd.w) / cols;
      for (const side of [1, -1]) {
        const lz = side * (bd.d / 2 + 0.02);
        const x = bd.x + Math.cos(bd.yaw) * lx + Math.sin(bd.yaw) * lz;
        const z = bd.z - Math.sin(bd.yaw) * lx + Math.cos(bd.yaw) * lz;
        b.solid.add(UNIT.box, trs(x, y, z, 0, bd.yaw, 0, 0.9, 1.1, 0.08), color);
      }
    }
  }
  // Front door (faces local +z, which looks at the plaza).
  const dz = bd.d / 2 + 0.03;
  b.solid.add(UNIT.box, trs(bd.x + Math.sin(bd.yaw) * dz, bd.y + 1.1, bd.z + Math.cos(bd.yaw) * dz, 0, bd.yaw, 0, 1.1, 2.1, 0.1), "#4a3020");
}

function hipRoof(b: Batches, bd: Building, color: string, height: number): void {
  b.solid.add(UNIT.pyramid, trs(bd.x, bd.y + bd.h + height / 2, bd.z, 0, bd.yaw, 0, bd.w + 0.5, height, bd.d + 0.5), color);
}

function gableRoof(b: Batches, bd: Building, color: string, height: number): void {
  // Two slabs leaning on each other along the building's length (local z).
  const half = bd.w / 2 + 0.35;
  const slope = Math.atan2(height, half);
  const len = Math.hypot(half, height);
  for (const side of [1, -1]) {
    const lx = (side * half) / 2;
    const x = bd.x + Math.cos(bd.yaw) * lx;
    const z = bd.z - Math.sin(bd.yaw) * lx;
    b.solid.add(UNIT.box, trs(x, bd.y + bd.h + height / 2, z, 0, bd.yaw, side * slope, len, 0.25, bd.d + 0.6, "YXZ"), color);
  }
  // Gable ends.
  b.solid.add(UNIT.pyramid, trs(bd.x, bd.y + bd.h + height * 0.3, bd.z, 0, bd.yaw, 0, bd.w * 0.95, height * 0.6, bd.d * 0.96), color);
}

function styleBuilding(style: CityStyle, b: Batches, bd: Building, rng: Rng): void {
  const box = (color: string, h = bd.h, w = bd.w, d = bd.d, y0 = bd.y) =>
    b.solid.add(UNIT.box, trs(bd.x, y0 + h / 2, bd.z, 0, bd.yaw, 0, w, h, d), color);
  switch (style) {
    case "coral": {
      box(pickFrom(rng, ["#ffd6e0", "#ffe5b4", "#c1f0e8", "#fff1a8", "#d7c4f2", "#ffc8a8"]));
      hipRoof(b, bd, pickFrom(rng, ["#d9643a", "#c8553d", "#e07a5f"]), 1.6 + rng());
      addWindows(b, bd, Math.floor(bd.h / 3), "#3f7cac", rng);
      break;
    }
    case "iron": {
      const wall = pickFrom(rng, ["#8a4b3c", "#6c757d", "#4a4e57", "#7d5a4f", "#5f6b73"]);
      box(wall);
      box("#34353a", 0.4, bd.w + 0.3, bd.d + 0.3, bd.y + bd.h);
      if (rng() < 0.35) {
        b.solid.add(UNIT.cylinderLow, trs(bd.x + bd.w * 0.2, bd.y + bd.h + 2, bd.z, 0, 0, 0, 0.7, 4, 0.7), "#2b2b2f");
      }
      addWindows(b, bd, Math.floor(bd.h / 3), "#c9d6df", rng);
      break;
    }
    case "sun": {
      box(pickFrom(rng, ["#f8f4ec", "#f3ead8", "#fffaf0", "#efe2c8"]));
      box("#e8dcc2", 0.5, bd.w + 0.2, bd.d + 0.2, bd.y + bd.h);
      if (rng() < 0.45) {
        const s = Math.min(bd.w, bd.d) * 0.8;
        b.solid.add(UNIT.dome, trs(bd.x, bd.y + bd.h + 0.3, bd.z, 0, 0, 0, s, s * 0.9, s), pickFrom(rng, ["#e8b923", "#2d6cdf", "#e8b923"]));
      }
      addWindows(b, bd, Math.floor(bd.h / 3), "#2d6cdf", rng);
      break;
    }
    case "frost": {
      box(pickFrom(rng, ["#7b4a2e", "#a0522d", "#2f4f6f", "#8b3a3a", "#4a6f8a"]));
      gableRoof(b, bd, "#f4fbff", 2.2 + rng() * 1.2);
      addWindows(b, bd, Math.floor(bd.h / 3), "#ffd27a", rng);
      if (rng() < 0.5) b.solid.add(UNIT.box, trs(bd.x, bd.y + bd.h + 2.4, bd.z, 0, bd.yaw, 0, 0.6, 2, 0.6), "#5c4033");
      break;
    }
    case "lantern": {
      const wall = pickFrom(rng, ["#f3e9d2", "#9e2a2b", "#e9d8a6", "#7f1d1d"]);
      const roof = pickFrom(rng, ["#3a1f1f", "#7a1f1f", "#1d1d22"]);
      box(wall);
      const tiers = bd.h > 9 ? 3 : 1;
      let y = bd.y + bd.h;
      let w = bd.w + 1.6;
      let d = bd.d + 1.6;
      for (let i = 0; i < tiers; i++) {
        b.solid.add(UNIT.pyramid, trs(bd.x, y + 0.6, bd.z, 0, bd.yaw, 0, w, 1.2, d), roof);
        if (i < tiers - 1) {
          b.solid.add(UNIT.box, trs(bd.x, y + 1.9, bd.z, 0, bd.yaw, 0, w * 0.55, 2.6, d * 0.55), wall);
          y += 3.2;
          w *= 0.7;
          d *= 0.7;
        }
      }
      // Paper lanterns hanging at the corners.
      for (const sx of [1, -1]) {
        const lx = sx * (bd.w / 2 + 0.5);
        const lz = bd.d / 2 + 0.5;
        const x = bd.x + Math.cos(bd.yaw) * lx + Math.sin(bd.yaw) * lz;
        const z = bd.z - Math.sin(bd.yaw) * lx + Math.cos(bd.yaw) * lz;
        b.glow.add(UNIT.sphereLow, trs(x, bd.y + bd.h - 0.4, z, 0, 0, 0, 0.6, 0.75, 0.6), "#ff5a3c");
      }
      addWindows(b, bd, 1, "#2b1b17", rng);
      break;
    }
    case "verdant": {
      const stone = pickFrom(rng, ["#9c9a8a", "#8a8a78", "#a9a58f"]);
      if (rng() < 0.35) {
        // A ruin: broken walls, no roof.
        const h = bd.h * (0.4 + rng() * 0.4);
        for (const side of [1, -1]) {
          const lz = side * (bd.d / 2 - 0.3);
          const hh = h * (0.6 + rng() * 0.5);
          b.solid.add(
            UNIT.box,
            trs(bd.x + Math.sin(bd.yaw) * lz, bd.y + hh / 2, bd.z + Math.cos(bd.yaw) * lz, 0, bd.yaw, 0, bd.w, hh, 0.6),
            stone,
          );
        }
        b.solid.add(UNIT.box, trs(bd.x, bd.y + 0.3, bd.z, 0, bd.yaw, 0, bd.w * 0.9, 0.6, bd.d * 0.9), "#6f7d4f");
      } else {
        box(stone);
        b.solid.add(UNIT.cone, trs(bd.x, bd.y + bd.h + 1.4, bd.z, 0, rng() * TAU, 0, Math.max(bd.w, bd.d) * 1.3, 2.8, Math.max(bd.w, bd.d) * 1.3), "#b59a5a");
        b.solid.add(UNIT.box, trs(bd.x, bd.y + 0.6, bd.z, 0, bd.yaw, 0, bd.w + 0.1, 1.2, bd.d + 0.1), "#6f7d4f");
        addWindows(b, bd, 1, "#2b2b22", rng);
      }
      break;
    }
  }
}

const HEIGHTS: Record<CityStyle, [number, number]> = {
  coral: [4, 8],
  iron: [6, 14],
  sun: [4, 9],
  frost: [3.5, 6.5],
  lantern: [4, 8],
  verdant: [3, 6],
};

// ---------------------------------------------------------------------------
// Landmarks

interface Animated {
  smoke: THREE.Sprite[];
  spin: THREE.Object3D[];
  pulse: THREE.MeshBasicMaterial[];
}

function smokeTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(220,220,220,0.85)");
  grad.addColorStop(1, "rgba(220,220,220,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
let SMOKE: THREE.CanvasTexture | null = null;

function landmark(city: Island, style: CityStyle, b: Batches, group: THREE.Group, colliders: Collider[], anim: Animated, rng: Rng): void {
  const cx = city.x;
  const cz = city.z;
  const gy = terrainHeight(cx, cz);
  switch (style) {
    case "coral": {
      // A giant coral arch over the plaza, and a fountain.
      const span = 22;
      const steps = 18;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI;
        const x = cx + Math.cos(a) * (span / 2);
        const y = gy + Math.sin(a) * 17;
        const s = 3.4 - Math.sin(a) * 1.2;
        b.solid.add(UNIT.sphereLow, trs(x, y, cz + 6, rng(), rng(), 0, s, s, s), i % 2 ? "#ff7f6e" : "#ff9eaa");
      }
      addCollider(colliders, cx - span / 2, cz + 6, 2.2);
      addCollider(colliders, cx + span / 2, cz + 6, 2.2);
      b.solid.add(UNIT.cylinder, trs(cx, gy + 0.4, cz - 6, 0, 0, 0, 7, 0.8, 7), "#f0e2d0");
      b.solid.add(UNIT.cylinder, trs(cx, gy + 0.85, cz - 6, 0, 0, 0, 6.2, 0.1, 6.2), "#4cc9f0");
      b.solid.add(UNIT.cylinder, trs(cx, gy + 2, cz - 6, 0, 0, 0, 0.8, 3, 0.8), "#f0e2d0");
      b.solid.add(UNIT.sphere, trs(cx, gy + 3.6, cz - 6, 0, 0, 0, 1.4, 1.4, 1.4), "#ff9eaa");
      addCollider(colliders, cx, cz - 6, 3.6);
      break;
    }
    case "iron": {
      SMOKE ??= smokeTexture();
      const smokeMat = new THREE.SpriteMaterial({ map: SMOKE, transparent: true, depthWrite: false, opacity: 0.7 });
      for (let i = 0; i < 3; i++) {
        const x = cx - 8 + i * 8;
        const z = cz + 4;
        const h = 26 + i * 4;
        b.solid.add(UNIT.cylinder, trs(x, gy + h / 2, z, 0, 0, 0, 3, h, 3), "#8a4b3c");
        b.solid.add(UNIT.cylinder, trs(x, gy + h - 1.5, z, 0, 0, 0, 3.3, 1, 3.3), "#2b2b2f");
        b.solid.add(UNIT.cylinder, trs(x, gy + h * 0.6, z, 0, 0, 0, 3.2, 0.8, 3.2), "#e9c46a");
        addCollider(colliders, x, z, 1.8);
        for (let k = 0; k < 6; k++) {
          const puff = new THREE.Sprite(smokeMat);
          puff.position.set(x, gy + h + k * 3, z);
          puff.userData = { baseX: x, baseZ: z, top: gy + h, phase: k / 6 };
          anim.smoke.push(puff);
          group.add(puff);
        }
      }
      // A big spinning gear sculpture on the plaza.
      const gear = new THREE.Group();
      const gearMat = new THREE.MeshStandardMaterial({ color: "#b5893a", metalness: 0.8, roughness: 0.35 });
      gear.add(new THREE.Mesh(new THREE.TorusGeometry(4, 0.9, 8, 24), gearMat));
      for (let i = 0; i < 12; i++) {
        const tooth = new THREE.Mesh(UNIT.box, gearMat);
        const a = (i / 12) * TAU;
        tooth.position.set(Math.cos(a) * 5.1, Math.sin(a) * 5.1, 0);
        tooth.rotation.z = a;
        tooth.scale.set(1.4, 1.2, 1.6);
        gear.add(tooth);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2, 12).rotateX(Math.PI / 2), gearMat);
      gear.add(hub);
      gear.position.set(cx, gy + 7.5, cz - 8);
      gear.traverse((o) => {
        o.castShadow = true;
      });
      group.add(gear);
      anim.spin.push(gear);
      b.solid.add(UNIT.box, trs(cx, gy + 1.2, cz - 8, 0, 0, 0, 3, 2.4, 3), "#4a4e57");
      addCollider(colliders, cx, cz - 8, 2.5);
      break;
    }
    case "sun": {
      b.solid.add(UNIT.box, trs(cx, gy + 2, cz, 0, Math.PI / 4, 0, 10, 4, 10), "#fffaf0");
      b.solid.add(UNIT.cylinder, trs(cx, gy + 14, cz, 0, 0, 0, 4, 22, 4), "#fffaf0");
      b.solid.add(UNIT.cylinder, trs(cx, gy + 25.5, cz, 0, 0, 0, 5, 1.2, 5), "#e8b923");
      b.solid.add(UNIT.cone, trs(cx, gy + 37, cz, 0, 0, 0, 3.6, 22, 3.6), "#e8b923");
      b.solid.add(UNIT.sphere, trs(cx, gy + 48.5, cz, 0, 0, 0, 2, 2, 2), "#ffe066");
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        b.solid.add(UNIT.dome, trs(cx + Math.sin(a) * 9, gy + 4, cz + Math.cos(a) * 9, 0, 0, 0, 4, 4, 4), "#e8b923");
        b.solid.add(UNIT.box, trs(cx + Math.sin(a) * 9, gy + 2, cz + Math.cos(a) * 9, 0, a, 0, 4, 4, 4), "#f3ead8");
        addCollider(colliders, cx + Math.sin(a) * 9, cz + Math.cos(a) * 9, 2.8);
      }
      addCollider(colliders, cx, cz, 7.5);
      break;
    }
    case "frost": {
      const crystalMat = new THREE.MeshBasicMaterial({ color: "#a5e3ff", transparent: true, opacity: 0.85, toneMapped: false });
      anim.pulse.push(crystalMat);
      const cluster = new THREE.Group();
      for (let i = 0; i < 9; i++) {
        const h = 6 + rng() * 12;
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), crystalMat);
        crystal.scale.set(1.2 + rng(), h / 2, 1.2 + rng());
        const a = rng() * TAU;
        const r = i === 0 ? 0 : 2 + rng() * 4;
        crystal.position.set(Math.sin(a) * r, h / 2 - 1, Math.cos(a) * r);
        crystal.rotation.set((rng() - 0.5) * 0.5, rng() * TAU, (rng() - 0.5) * 0.5);
        cluster.add(crystal);
      }
      cluster.position.set(cx, gy, cz);
      group.add(cluster);
      addCollider(colliders, cx, cz, 6);
      break;
    }
    case "lantern": {
      // A five-tier pagoda.
      let y = gy;
      let w = 12;
      for (let i = 0; i < 5; i++) {
        b.solid.add(UNIT.box, trs(cx, y + 2, cz, 0, Math.PI / 4, 0, w * 0.62, 4, w * 0.62), i % 2 ? "#9e2a2b" : "#f3e9d2");
        b.solid.add(UNIT.pyramid, trs(cx, y + 4.6, cz, 0, Math.PI / 4, 0, w, 1.4, w), "#3a1f1f");
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU;
          b.glow.add(UNIT.sphereLow, trs(cx + Math.sin(a) * w * 0.48, y + 3.9, cz + Math.cos(a) * w * 0.48, 0, 0, 0, 0.7, 0.9, 0.7), "#ff5a3c");
        }
        y += 5.2;
        w *= 0.8;
      }
      b.solid.add(UNIT.cylinder, trs(cx, y + 2, cz, 0, 0, 0, 0.4, 4, 0.4), "#e8b923");
      addCollider(colliders, cx, cz, 5);
      break;
    }
    case "verdant": {
      // The ancient tree.
      b.solid.add(UNIT.cylinder, trs(cx, gy + 14, cz, 0, 0, 0, 6, 28, 6), "#6b4f35");
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        b.solid.add(UNIT.cylinderLow, trs(cx + Math.sin(a) * 4, gy + 1.5, cz + Math.cos(a) * 4, 0.5 * Math.cos(a), 0, -0.5 * Math.sin(a), 1.6, 5, 1.6), "#5c4430");
      }
      for (let i = 0; i < 9; i++) {
        const a = rng() * TAU;
        const r = i === 0 ? 0 : 6 + rng() * 9;
        const s = 12 + rng() * 8;
        b.solid.add(UNIT.sphereLow, trs(cx + Math.sin(a) * r, gy + 28 + rng() * 6, cz + Math.cos(a) * r, 0, 0, 0, s, s * 0.6, s), pickFrom(rng, ["#2f7d32", "#3f9142", "#4caf50"]));
      }
      addCollider(colliders, cx, cz, 4.5);
      // A step pyramid beside it.
      const px = cx + 18;
      const pz = cz - 6;
      const py = terrainHeight(px, pz);
      for (let i = 0; i < 5; i++) {
        const s = 14 - i * 2.6;
        b.solid.add(UNIT.box, trs(px, py + 1 + i * 2, pz, 0, 0, 0, s, 2, s), i % 2 ? "#a9a58f" : "#9c9a8a");
      }
      b.solid.add(UNIT.box, trs(px, py + 11, pz, 0, 0, 0, 2.5, 2, 2.5), "#6f7d4f");
      addCollider(colliders, px, pz, 7.5);
      break;
    }
  }
}

// ---------------------------------------------------------------------------

export function createCities(colliders: Collider[], surfaces: SurfaceSet): Cities {
  const group = new THREE.Group();
  const anim: Animated = { smoke: [], spin: [], pulse: [] };
  const beams: THREE.Mesh[] = [];
  const sweepers: THREE.Object3D[] = [];
  const labels: THREE.Sprite[] = [];
  ROUND_TREE ??= roundTreeGeometry();
  PINE ??= pineGeometry(false);
  SNOW_PINE ??= pineGeometry(true);
  PALM ??= palmGeometry(7);

  for (const city of CITIES) {
    const style = city.style!;
    const rng = makeRng(hashString(city.id));
    const b: Batches = { solid: new GeometryBatch(), glow: new GeometryBatch() };
    const homeAngle = Math.atan2(HOME_ISLAND.x - city.x, HOME_ISLAND.z - city.z);
    const pierAngle = homeAngle + 0.28;
    const lightAngle = homeAngle - 0.22;
    const streetDirs = [pierAngle, pierAngle + Math.PI / 2, pierAngle + Math.PI, pierAngle - Math.PI / 2];

    // Buildings.
    const buildings: Building[] = [];
    const [hMin, hMax] = HEIGHTS[style];
    const target = style === "verdant" ? 46 : 64;
    for (let tries = 0; buildings.length < target && tries < 1400; tries++) {
      const a = rng() * TAU;
      const t = 0.26 + rng() * 0.46;
      const r = islandRadiusAt(city, a) * t;
      const x = city.x + Math.sin(a) * r;
      const z = city.z + Math.cos(a) * r;
      // Keep streets clear: four avenues out from the plaza.
      const onStreet = streetDirs.some((s) => {
        const along = Math.sin(s) * (x - city.x) + Math.cos(s) * (z - city.z);
        const across = Math.abs(Math.cos(s) * (x - city.x) - Math.sin(s) * (z - city.z));
        return along > 0 && across < 6.5;
      });
      if (onStreet) continue;
      const w = 4 + rng() * 4.5;
      const d = 4 + rng() * 4.5;
      const radius = Math.max(w, d) * 0.6;
      if (buildings.some((o) => Math.hypot(o.x - x, o.z - z) < radius + Math.max(o.w, o.d) * 0.6 + 1.8)) continue;
      const ground = terrainHeight(x, z);
      if (ground < 1.4) continue;
      const tall = style === "lantern" && rng() < 0.12;
      const h = tall ? 10 + rng() * 4 : hMin + rng() * (hMax - hMin);
      // Face the plaza.
      const yaw = Math.atan2(city.x - x, city.z - z);
      buildings.push({ x, z, y: ground - 0.4, w, d, h, yaw });
    }
    for (const bd of buildings) {
      styleBuilding(style, b, bd, rng);
      addCollider(colliders, bd.x, bd.z, Math.max(bd.w, bd.d) * 0.55);
    }

    landmark(city, style, b, group, colliders, anim, rng);

    // Trees between the houses.
    const trees: Placement[] = [];
    for (let tries = 0; trees.length < 26 && tries < 400; tries++) {
      const a = rng() * TAU;
      const t = 0.3 + rng() * 0.5;
      const r = islandRadiusAt(city, a) * t;
      const x = city.x + Math.sin(a) * r;
      const z = city.z + Math.cos(a) * r;
      if (terrainHeight(x, z) < 1.4) continue;
      if (buildings.some((o) => Math.hypot(o.x - x, o.z - z) < Math.max(o.w, o.d) * 0.6 + 2)) continue;
      if (Math.hypot(x - city.x, z - city.z) < 16) continue;
      const scale = 0.8 + rng() * 0.5;
      trees.push({ x, y: terrainHeight(x, z) - 0.2, z, rotY: rng() * TAU, scale });
      addCollider(colliders, x, z, 0.5 * scale);
    }
    const treeGeo = style === "frost" ? SNOW_PINE : style === "sun" || style === "coral" ? PALM : style === "iron" ? PINE : ROUND_TREE;
    group.add(instanced(treeGeo, trees));

    // Pier toward home.
    const pr0 = islandRadiusAt(city, pierAngle) * 0.9;
    const pr1 = islandRadiusAt(city, pierAngle) + 40;
    addPier(
      b.solid,
      surfaces,
      city.x + Math.sin(pierAngle) * pr0,
      city.z + Math.cos(pierAngle) * pr0,
      city.x + Math.sin(pierAngle) * pr1,
      city.z + Math.cos(pierAngle) * pr1,
      3,
      1.1,
    );

    // Lighthouse with a beam.
    const lr = islandRadiusAt(city, lightAngle) * 0.86;
    const lx = city.x + Math.sin(lightAngle) * lr;
    const lz = city.z + Math.cos(lightAngle) * lr;
    const ly = terrainHeight(lx, lz) - 0.3;
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      const rad = 4.4 - i * 0.35;
      b.solid.add(UNIT.cylinder, trs(lx, ly + 1.5 + i * 3, lz, 0, 0, 0, rad, 3.02, rad), i % 2 ? city.color : "#fdfdfd");
    }
    const top = ly + bands * 3;
    b.solid.add(UNIT.cylinder, trs(lx, top + 0.3, lz, 0, 0, 0, 4.4, 0.6, 4.4), "#2b2b2f");
    b.glow.add(UNIT.cylinder, trs(lx, top + 1.8, lz, 0, 0, 0, 2.2, 2.4, 2.2), "#fff3b0");
    b.solid.add(UNIT.cone, trs(lx, top + 4, lz, 0, 0, 0, 3.6, 2.2, 3.6), "#b0101e");
    addCollider(colliders, lx, lz, 2.6);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 2.2, 420, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: city.color,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        side: THREE.DoubleSide,
      }),
    );
    beam.position.set(lx, top + 212, lz);
    beams.push(beam);
    group.add(beam);
    const sweep = new THREE.Mesh(
      new THREE.ConeGeometry(6, 70, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 35),
      new THREE.MeshBasicMaterial({
        color: "#fff3b0",
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    sweep.position.set(lx, top + 1.8, lz);
    sweepers.push(sweep);
    group.add(sweep);

    // Name label, constant size on screen.
    const label = textSprite(city.name, { size: 72, color: "#ffffff" });
    const mat = label.material as THREE.SpriteMaterial;
    mat.sizeAttenuation = false;
    mat.depthTest = false;
    label.renderOrder = 20;
    label.scale.set(0.05 * label.userData.aspect, 0.05, 1);
    label.position.set(city.x, 60, city.z);
    label.userData.city = city.id;
    labels.push(label);
    group.add(label);

    const solid = new THREE.Mesh(b.solid.build()!, vertexColorMaterial);
    solid.castShadow = true;
    solid.receiveShadow = true;
    group.add(solid);
    const glowGeo = b.glow.build();
    if (glowGeo) {
      const glowMat = style === "lantern" ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) : glowMaterial;
      if (glowMat !== glowMaterial) anim.pulse.push(glowMat);
      group.add(new THREE.Mesh(glowGeo, glowMat));
    }
  }

  return {
    group,
    update(dt, time, focus) {
      for (const s of anim.smoke) {
        const u = s.userData as { baseX: number; baseZ: number; top: number; phase: number };
        const k = (time * 0.12 + u.phase) % 1;
        s.position.set(u.baseX + k * 6, u.top + k * 22, u.baseZ + k * 3);
        const size = 3 + k * 9;
        s.scale.set(size, size, 1);
        (s.material as THREE.SpriteMaterial).opacity = 0.7;
      }
      for (const g of anim.spin) g.rotation.z += dt * 0.35;
      for (let i = 0; i < anim.pulse.length; i++) {
        const v = 0.85 + 0.15 * Math.sin(time * 2.2 + i);
        anim.pulse[i].color.setScalar(v);
      }
      for (let i = 0; i < sweepers.length; i++) sweepers[i].rotation.y = time * 0.6 + i;
      // Beams brighten with distance so they read as guides, not glare.
      for (const beam of beams) {
        const dist = Math.hypot(beam.position.x - focus.x, beam.position.z - focus.z);
        (beam.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp((dist - 80) / 600, 0.04, 0.28);
      }
      for (const label of labels) {
        const dist = Math.hypot(label.position.x - focus.x, label.position.z - focus.z);
        (label.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.clamp((dist - 60) / 120, 0.25, 1);
      }
    },
  };
}

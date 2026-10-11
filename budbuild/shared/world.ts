// The world map: islands, cities, terrain height, waves and wind.
// Everything here is deterministic so every client sees the same world.
//
// Time: "world time" is seconds since the room was created (the room epoch the
// server sends on join). Waves and wind are functions of world time, so all
// players see the same swell and the same wind.

import { SLIP_COUNT, WORLD_HALF } from "./constants";
import { TAU, clamp, smoothstep } from "./math";

export type IslandKind = "home" | "city" | "islet";
export type CityStyle = "coral" | "iron" | "sun" | "frost" | "lantern" | "verdant";

export interface Island {
  id: string;
  name: string;
  kind: IslandKind;
  x: number;
  z: number;
  /** Average shoreline radius in metres (the coastline wobbles around it). */
  radius: number;
  /** Height of the inland plateau above sea level. */
  height: number;
  seed: number;
  /** Cities only. */
  style?: CityStyle;
  /** Cities only: one line shown when you discover it. */
  blurb?: string;
  /** Map / label colour. */
  color: string;
}

export const SEA_LEVEL = 0;
/** Depth of the open-sea floor. */
export const SEABED = -18;
/** Where the beach starts, as a fraction of the shoreline radius. */
const BEACH_START = 0.82;
/** How far the underwater shelf extends past the shoreline, as a fraction. */
const SHELF = 0.6;
const BEACH_HEIGHT = 1;

export const HOME_ISLAND: Island = {
  id: "home",
  name: "Driftwood Isle",
  kind: "home",
  x: 0,
  z: 0,
  radius: 60,
  height: 5,
  seed: 1.7,
  color: "#f4d58d",
};

export const CITIES: Island[] = [
  {
    id: "port-coral",
    name: "Port Coral",
    kind: "city",
    style: "coral",
    x: 620,
    z: -420,
    radius: 85,
    height: 3,
    seed: 4.1,
    color: "#ff8fa3",
    blurb: "A pastel harbour town built around a giant coral arch.",
  },
  {
    id: "ironhaven",
    name: "Ironhaven",
    kind: "city",
    style: "iron",
    x: -860,
    z: -560,
    radius: 95,
    height: 3.5,
    seed: 7.3,
    color: "#adb5bd",
    blurb: "Smokestacks and shipyards. The engines here never sleep.",
  },
  {
    id: "sunspire",
    name: "Sunspire",
    kind: "city",
    style: "sun",
    x: 1080,
    z: 640,
    radius: 90,
    height: 3,
    seed: 2.9,
    color: "#ffd43b",
    blurb: "White walls, golden domes and a spire that catches the sun.",
  },
  {
    id: "frostholm",
    name: "Frostholm",
    kind: "city",
    style: "frost",
    x: -380,
    z: -1260,
    radius: 90,
    height: 4,
    seed: 5.5,
    color: "#a5d8ff",
    blurb: "A snowy fishing town among glittering ice crystals.",
  },
  {
    id: "lantern-bay",
    name: "Lantern Bay",
    kind: "city",
    style: "lantern",
    x: -1180,
    z: 520,
    radius: 85,
    height: 3,
    seed: 9.2,
    color: "#ff6b6b",
    blurb: "Pagoda roofs and a thousand red lanterns over the water.",
  },
  {
    id: "verdant-reach",
    name: "Verdant Reach",
    kind: "city",
    style: "verdant",
    x: 240,
    z: 1220,
    radius: 100,
    height: 4,
    seed: 3.3,
    color: "#69db7c",
    blurb: "Jungle ruins in the shade of an enormous ancient tree.",
  },
];

export const ISLETS: Island[] = [
  { x: 300, z: 180, radius: 18, seed: 11.1 },
  { x: -260, z: 240, radius: 22, seed: 12.7 },
  { x: -420, z: -180, radius: 16, seed: 13.3 },
  { x: 820, z: -1000, radius: 26, seed: 14.9 },
  { x: 1300, z: -200, radius: 20, seed: 15.2 },
  { x: -1400, z: -900, radius: 24, seed: 16.8 },
  { x: -700, z: 1100, radius: 20, seed: 17.4 },
  { x: 1250, z: 1300, radius: 22, seed: 18.6 },
  { x: 400, z: -800, radius: 15, seed: 19.9 },
  { x: -1000, z: -100, radius: 18, seed: 20.3 },
].map((i, n) => ({
  id: `islet-${n + 1}`,
  name: "Islet",
  kind: "islet" as const,
  height: 2.2,
  color: "#e9d8a6",
  ...i,
}));

export const ISLANDS: Island[] = [HOME_ISLAND, ...CITIES, ...ISLETS];

/** Shoreline radius of an island in a given direction (angle = atan2(dx, dz)). */
export function islandRadiusAt(isl: Island, angle: number): number {
  const s = isl.seed;
  return (
    isl.radius *
    (1 + 0.09 * Math.sin(3 * angle + s) + 0.05 * Math.sin(5 * angle + s * 1.7) + 0.025 * Math.sin(9 * angle + s * 2.3))
  );
}

/** Terrain height contributed by one island, or null when (x, z) is too far away. */
export function islandHeight(isl: Island, x: number, z: number): number | null {
  const dx = x - isl.x;
  const dz = z - isl.z;
  const dist = Math.hypot(dx, dz);
  if (dist > isl.radius * 1.15 * (1 + SHELF)) return null;
  const r = islandRadiusAt(isl, Math.atan2(dx, dz));
  const d = dist / r;
  if (d >= 1 + SHELF) return null;
  if (d >= 1) return SEABED * Math.pow((d - 1) / SHELF, 0.8);
  if (d > BEACH_START) return (BEACH_HEIGHT * (1 - d)) / (1 - BEACH_START);
  const t = smoothstep(BEACH_START, 0.45, d);
  let h = BEACH_HEIGHT + (isl.height - BEACH_HEIGHT) * t;
  h += 0.6 * Math.sin(x * 0.045 + isl.seed) * Math.cos(z * 0.05 + isl.seed * 2) * t;
  return h;
}

/** Ground height (metres, sea level = 0) anywhere on the map. */
export function terrainHeight(x: number, z: number): number {
  let h = SEABED;
  for (const isl of ISLANDS) {
    const ih = islandHeight(isl, x, z);
    if (ih !== null && ih > h) h = ih;
  }
  return h;
}

/** Is (x, z) dry land? */
export function isLand(x: number, z: number): boolean {
  return terrainHeight(x, z) > 0.05;
}

/** The island whose shoreline is closest to containing (x, z), if any is near. */
export function islandAt(x: number, z: number, margin = 1): Island | null {
  for (const isl of ISLANDS) {
    const dx = x - isl.x;
    const dz = z - isl.z;
    const dist = Math.hypot(dx, dz);
    if (dist < islandRadiusAt(isl, Math.atan2(dx, dz)) * margin) return isl;
  }
  return null;
}

/** Cities are "discovered" when you come within this many radii of their centre. */
export const DISCOVERY_RADIUS_FACTOR = 1.6;

export function cityNear(x: number, z: number): Island | null {
  for (const c of CITIES) {
    if (Math.hypot(x - c.x, z - c.z) < c.radius * DISCOVERY_RADIUS_FACTOR) return c;
  }
  return null;
}

/**
 * Closest dry-land point within maxDist of (x, z), stepping a little inland so
 * an avatar placed there is clearly on the beach. Null if there is none.
 */
export function nearestLandPoint(x: number, z: number, maxDist = 40): { x: number; z: number } | null {
  if (isLand(x, z)) return { x, z };
  for (let dist = 2; dist <= maxDist; dist += 2) {
    const steps = Math.max(12, Math.round(dist * 1.5));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TAU;
      const px = x + Math.sin(a) * dist;
      const pz = z + Math.cos(a) * dist;
      if (isLand(px, pz)) {
        const ix = px + Math.sin(a) * 2.5;
        const iz = pz + Math.cos(a) * 2.5;
        return isLand(ix, iz) ? { x: ix, z: iz } : { x: px, z: pz };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Waves. The client's water shader must use exactly these components so boats
// bob on the same surface that is drawn.

export interface WaveComponent {
  /** Direction on the XZ plane (not necessarily unit; multiplied into k). */
  dx: number;
  dz: number;
  /** Spatial frequency (radians per metre). */
  k: number;
  /** Temporal frequency (radians per second). */
  w: number;
  phase: number;
  amp: number;
}

export const WAVES: WaveComponent[] = [
  { dx: 1, dz: 0, k: 0.07, w: 0.8, phase: 0, amp: 0.32 },
  { dx: 0, dz: 1, k: 0.09, w: -0.95, phase: 1.3, amp: 0.24 },
  { dx: 0.6, dz: 0.8, k: 0.19, w: 1.6, phase: 0.4, amp: 0.12 },
  { dx: -0.7, dz: 0.7, k: 0.37, w: 2.3, phase: 2.1, amp: 0.06 },
];

/** Water surface height at (x, z) and world time t (seconds). */
export function waveHeight(x: number, z: number, t: number): number {
  let h = SEA_LEVEL;
  for (const c of WAVES) h += c.amp * Math.sin(c.k * (c.dx * x + c.dz * z) + c.w * t + c.phase);
  return h;
}

/** GLSL source of the same wave function: `float waveHeight(vec2 p, float t)`. */
export function waveGlsl(): string {
  const terms = WAVES.map(
    (c) =>
      `${c.amp.toFixed(4)} * sin(${c.k.toFixed(4)} * (${c.dx.toFixed(4)} * p.x + ${c.dz.toFixed(4)} * p.y) + ${c.w.toFixed(4)} * t + ${c.phase.toFixed(4)})`,
  );
  return `float waveHeight(vec2 p, float t) {\n  return ${terms.join("\n    + ")};\n}\n`;
}

// ---------------------------------------------------------------------------
// Wind. `dir` is the heading the wind blows TOWARDS (same convention as boat
// headings), strength is 0..1.

export function windAt(t: number): { dir: number; strength: number } {
  const dir = 0.6 + 0.9 * Math.sin(t / 240) + 0.3 * Math.sin(t / 97);
  const strength = clamp(0.72 + 0.22 * Math.sin(t / 63 + 1) + 0.06 * Math.sin(t / 17), 0.35, 1);
  return { dir, strength };
}

// ---------------------------------------------------------------------------
// Shipyard slips on the home island, one per player. A docked boat sits on
// its slip with the bow pointing out to sea.

export interface Slip {
  index: number;
  x: number;
  z: number;
  /** Heading the docked boat faces (out to sea). */
  heading: number;
  /** A point on the beach next to the slip, where the owner can stand. */
  beachX: number;
  beachZ: number;
}

export const SLIPS: Slip[] = Array.from({ length: SLIP_COUNT }, (_, i) => {
  const a = (i / SLIP_COUNT) * TAU + 0.35;
  const shore = islandRadiusAt(HOME_ISLAND, a);
  const dist = shore + 16;
  const beach = shore - 7;
  return {
    index: i,
    x: HOME_ISLAND.x + Math.sin(a) * dist,
    z: HOME_ISLAND.z + Math.cos(a) * dist,
    heading: a,
    beachX: HOME_ISLAND.x + Math.sin(a) * beach,
    beachZ: HOME_ISLAND.z + Math.cos(a) * beach,
  };
});

/** Where new players appear: the middle of the home island, by the campfire. */
export const SPAWN = { x: HOME_ISLAND.x + 4, z: HOME_ISLAND.z + 4 };

/** Keeps a position inside the playable map. */
export function clampToWorld(x: number, z: number, margin = 20): { x: number; z: number } {
  const lim = WORLD_HALF - margin;
  return { x: clamp(x, -lim, lim), z: clamp(z, -lim, lim) };
}

// Boat pieces: the data format the AI produces, how it is cleaned up, and the
// gameplay stats each piece gets.
//
// A piece is drawn from up to MAX_PARTS primitive "parts". Each part is a unit
// primitive scaled to (sx, sy, sz) metres, rotated by (rx, ry, rz) degrees
// (three.js Euler order "XYZ") and centred at (x, y, z) in piece space.
//
// Piece space: y is up and y = 0 is the bottom of the piece. The piece is
// centred on x = 0, z = 0. +z is towards the bow of the boat, +x is towards
// port (the left side when facing the bow). One unit is one metre and one boat
// grid cell is 1 m x 1 m.
//
// Shapes (all centred on their position, before rotation):
//   box      sx wide, sy tall, sz deep.
//   cylinder axis along y; diameter sx (x) and sz (z), height sy.
//   cone     like cylinder with the tip at +y.
//   sphere   ellipsoid with diameters sx, sy, sz.
//   capsule  axis along y; diameter sx/sz, total height sy.
//   wedge    ramp: full height at -z sloping down to zero at +z, sx wide.
//   bow      pointed prism: the -z edge is sx wide, narrowing to a point at
//            +z, extruded sy tall. Handy for boat bows.
//   torus    ring lying flat (axis along y); outer diameter sx/sz, tube
//            thickness sy.

import {
  MAX_FOOTPRINT,
  MAX_PARTS,
  MAX_PIECE_HEIGHT,
} from "./constants";
import { clamp, isFiniteNumber, round } from "./math";

export const SHAPES = ["box", "cylinder", "cone", "sphere", "capsule", "wedge", "bow", "torus"] as const;
export type Shape = (typeof SHAPES)[number];

export const MATERIALS = [
  "wood",
  "darkwood",
  "metal",
  "cloth",
  "rope",
  "glass",
  "stone",
  "plastic",
  "gold",
  "glow",
] as const;
export type Material = (typeof MATERIALS)[number];

/** What a piece does on the boat. Drives its stats. */
export const ROLES = [
  "hull",
  "float",
  "deck",
  "sail",
  "mast",
  "engine",
  "oars",
  "rudder",
  "cabin",
  "seat",
  "cannon",
  "light",
  "flag",
  "storage",
  "decor",
] as const;
export type Role = (typeof ROLES)[number];

/** Simple per-part animations the client plays. */
export const ANIMS = ["none", "spin", "sway", "flutter", "pulse"] as const;
export type Anim = (typeof ANIMS)[number];

export const ROLE_INFO: Record<Role, { label: string; icon: string; hint: string }> = {
  hull: { label: "Hull", icon: "🛶", hint: "Keeps the boat afloat. You need these first." },
  float: { label: "Float", icon: "🛟", hint: "Pontoons, barrels and logs that add buoyancy." },
  deck: { label: "Deck", icon: "🪵", hint: "Floors and platforms to stand on." },
  sail: { label: "Sail", icon: "⛵", hint: "Catches the wind. Best with the wind behind or beside you." },
  mast: { label: "Mast", icon: "🎏", hint: "Poles and rigging." },
  engine: { label: "Engine", icon: "⚙️", hint: "Pushes the boat when you hold W." },
  oars: { label: "Oars", icon: "🚣", hint: "Weak but light propulsion." },
  rudder: { label: "Rudder", icon: "🧭", hint: "Makes the boat turn faster." },
  cabin: { label: "Cabin", icon: "🛖", hint: "Rooms and shelters." },
  seat: { label: "Seat", icon: "🪑", hint: "Somewhere for the crew to sit." },
  cannon: { label: "Cannon", icon: "💥", hint: "Press F while sailing to fire a (harmless) salute." },
  light: { label: "Light", icon: "🏮", hint: "Lamps and lanterns." },
  flag: { label: "Flag", icon: "🚩", hint: "Show your colours." },
  storage: { label: "Storage", icon: "📦", hint: "Crates, chests and barrels." },
  decor: { label: "Decor", icon: "✨", hint: "Anything else that makes it yours." },
};

export const MATERIAL_COLORS: Record<Material, string> = {
  wood: "#a0703c",
  darkwood: "#5c3a1e",
  metal: "#8a9299",
  cloth: "#f1ead8",
  rope: "#c8a670",
  glass: "#a8d8ff",
  stone: "#8d8a83",
  plastic: "#e0e0e0",
  gold: "#e8b923",
  glow: "#ffe28a",
};

/** Relative heaviness of each material, used for piece mass. */
const MATERIAL_DENSITY: Record<Material, number> = {
  wood: 1,
  darkwood: 1.2,
  metal: 2.2,
  cloth: 0.4,
  rope: 0.6,
  glass: 1.4,
  stone: 2.6,
  plastic: 0.8,
  gold: 3,
  glow: 1,
};

export interface Part {
  shape: Shape;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rx: number;
  ry: number;
  rz: number;
  /** "#rrggbb" */
  color: string;
  material: Material;
  anim: Anim;
}

export interface PieceStats {
  /** kg-ish */
  mass: number;
  /** How much mass this piece can hold up. */
  buoyancy: number;
  /** Engine/oar push at full throttle. */
  thrust: number;
  /** Sail area in square metres. */
  sail: number;
  /** Extra turning authority. */
  turn: number;
}

export type PieceSource = "ai" | "workshop";

export interface PieceDef {
  /** Server-assigned unique id. Definitions never change once created. */
  id: string;
  name: string;
  description: string;
  role: Role;
  /** Footprint in grid cells along x (w) and z (d), 1..MAX_FOOTPRINT. */
  w: number;
  d: number;
  /** Height in metres. */
  h: number;
  /** 1..10, how strong/big the piece is meant to be. */
  power: number;
  parts: Part[];
  stats: PieceStats;
  /** Name of the player whose AI made it. */
  author: string;
  source: PieceSource;
  createdAt: number;
}

export interface PieceMeta {
  id: string;
  author: string;
  source: PieceSource;
  createdAt: number;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function pickEnum<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  if (typeof v === "string") {
    const lower = v.trim().toLowerCase();
    if ((list as readonly string[]).includes(lower)) return lower as T;
  }
  return fallback;
}

function num(v: unknown, fallback: number): number {
  if (isFiniteNumber(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}

function cleanText(v: unknown, max: number, fallback: string): string {
  if (typeof v !== "string") return fallback;
  // Drop control characters and collapse whitespace.
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : fallback;
}

function wrapDegrees(v: number): number {
  const w = v % 360;
  return w < 0 ? w + 360 : w;
}

export function sanitizePart(raw: unknown): Part | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const material = pickEnum(MATERIALS, r.material, "wood");
  const color =
    typeof r.color === "string" && HEX_COLOR.test(r.color.trim())
      ? r.color.trim().toLowerCase()
      : MATERIAL_COLORS[material];
  return {
    shape: pickEnum(SHAPES, r.shape, "box"),
    x: clamp(num(r.x, 0), -20, 20),
    y: clamp(num(r.y, 0), -20, 20),
    z: clamp(num(r.z, 0), -20, 20),
    sx: clamp(Math.abs(num(r.sx, 0.5)), 0.02, 12),
    sy: clamp(Math.abs(num(r.sy, 0.5)), 0.02, 12),
    sz: clamp(Math.abs(num(r.sz, 0.5)), 0.02, 12),
    rx: wrapDegrees(num(r.rx, 0)),
    ry: wrapDegrees(num(r.ry, 0)),
    rz: wrapDegrees(num(r.rz, 0)),
    color,
    material,
    anim: pickEnum(ANIMS, r.anim, "none"),
  };
}

/**
 * Row-major rotation matrix for three.js Euler order "XYZ", angles in degrees.
 * Rotating a vector v gives M * v.
 */
export function eulerXYZMatrix(rxDeg: number, ryDeg: number, rzDeg: number): number[][] {
  const x = (rxDeg * Math.PI) / 180;
  const y = (ryDeg * Math.PI) / 180;
  const z = (rzDeg * Math.PI) / 180;
  const a = Math.cos(x);
  const b = Math.sin(x);
  const c = Math.cos(y);
  const d = Math.sin(y);
  const e = Math.cos(z);
  const f = Math.sin(z);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  return [
    [c * e, -c * f, d],
    [af + be * d, ae - bf * d, -b * c],
    [bf - ae * d, be + af * d, a * c],
  ];
}

/** Axis-aligned bounds of a part, treating every shape as its (rotated) box. */
export function partBounds(p: Part): { min: [number, number, number]; max: [number, number, number] } {
  const m = eulerXYZMatrix(p.rx, p.ry, p.rz);
  const h = [p.sx / 2, p.sy / 2, p.sz / 2];
  const c = [p.x, p.y, p.z];
  const min: [number, number, number] = [0, 0, 0];
  const max: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const ext = Math.abs(m[i][0]) * h[0] + Math.abs(m[i][1]) * h[1] + Math.abs(m[i][2]) * h[2];
    min[i] = c[i] - ext;
    max[i] = c[i] + ext;
  }
  return { min, max };
}

function partVolume(p: Part): number {
  const box = p.sx * p.sy * p.sz;
  switch (p.shape) {
    case "cylinder":
    case "capsule":
      return box * 0.785;
    case "cone":
      return box * 0.262;
    case "sphere":
      return box * 0.524;
    case "wedge":
    case "bow":
      return box * 0.5;
    case "torus":
      return box * 0.4;
    default:
      return box;
  }
}

function dominantMaterial(parts: Part[]): Material {
  const weight = new Map<Material, number>();
  for (const p of parts) weight.set(p.material, (weight.get(p.material) ?? 0) + partVolume(p));
  let best: Material = "wood";
  let bestW = -1;
  for (const [m, w] of weight) {
    if (w > bestW) {
      best = m;
      bestW = w;
    }
  }
  return best;
}

/**
 * Gameplay stats come from the role, footprint, height and power, not from the
 * exact geometry, so the AI cannot accidentally make a piece useless (or
 * absurdly strong) just by how it draws it.
 */
export function computePieceStats(
  role: Role,
  w: number,
  d: number,
  h: number,
  power: number,
  parts: Part[],
): PieceStats {
  const area = w * d;
  const mf = MATERIAL_DENSITY[dominantMaterial(parts)];
  const p = clamp(power, 1, 10);
  let mass = 0;
  let buoyancy = 0;
  let thrust = 0;
  let sail = 0;
  let turn = 0;
  switch (role) {
    case "hull":
      mass = 90 * area * (0.6 + 0.4 * Math.min(h, 2)) * mf;
      buoyancy = 950 * area * clamp(h, 0.4, 1.6) * (0.85 + 0.03 * p);
      break;
    case "float":
      mass = 45 * area * mf;
      buoyancy = 620 * area * clamp(h, 0.3, 1.5) * (0.9 + 0.02 * p);
      break;
    case "deck":
      mass = 55 * area * mf;
      buoyancy = 140 * area;
      break;
    case "sail":
      sail = clamp(h * Math.max(w, d) * 0.7 * (0.8 + 0.04 * p), 0.5, 40);
      mass = 25 + 6 * sail;
      break;
    case "mast":
      mass = 35 * h * mf;
      sail = 0.4 * h;
      break;
    case "engine":
      thrust = 450 + 300 * p;
      mass = (180 + 70 * p) * Math.max(1, mf * 0.6);
      break;
    case "oars":
      thrust = 160 + 45 * p;
      mass = 30 * area;
      break;
    case "rudder":
      turn = 0.35 + 0.07 * p;
      mass = 40 + 10 * area;
      break;
    case "cabin":
      mass = 60 * area * Math.min(h, 3) * mf;
      buoyancy = 60 * area;
      break;
    case "seat":
      mass = 25 * area;
      break;
    case "cannon":
      mass = 220 + 40 * p;
      break;
    case "light":
      mass = 15;
      break;
    case "flag":
      mass = 8 + 3 * h;
      break;
    case "storage":
      mass = 70 * area;
      break;
    case "decor":
      mass = 30 * area * Math.min(h, 3) * mf * 0.6;
      break;
  }
  return {
    mass: Math.round(Math.max(1, mass)),
    buoyancy: Math.round(buoyancy),
    thrust: Math.round(thrust),
    sail: round(sail, 1),
    turn: round(turn, 2),
  };
}

/**
 * Turns whatever the AI (or the offline workshop) produced into a valid,
 * playable piece:
 *  - text is trimmed, enums are checked, numbers are clamped;
 *  - the geometry is re-centred (bottom at y = 0, centred on x/z);
 *  - it is scaled down to fit MAX_FOOTPRINT x MAX_FOOTPRINT x MAX_PIECE_HEIGHT,
 *    or scaled up when it is drawn far smaller than the footprint it asked for;
 *  - the footprint is measured from the final geometry, so what you see is
 *    what occupies the grid.
 *
 * Expected input shape (all fields optional, extra fields ignored):
 *   { name, description, role, width, length, power, parts: Part-like[] }
 */
export function normalizePiece(raw: unknown, meta: PieceMeta): PieceDef {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const role = pickEnum(ROLES, r.role, "decor");
  const power = Math.round(clamp(num(r.power, 5), 1, 10));
  const wantW = Math.round(clamp(num(r.width, 1), 1, MAX_FOOTPRINT));
  const wantD = Math.round(clamp(num(r.length, 1), 1, MAX_FOOTPRINT));

  const rawParts = Array.isArray(r.parts) ? r.parts.slice(0, MAX_PARTS) : [];
  let parts = rawParts.map(sanitizePart).filter((p): p is Part => p !== null);
  if (parts.length === 0) {
    parts = [sanitizePart({ shape: "box", x: 0, y: 0.25, z: 0, sx: 0.9, sy: 0.5, sz: 0.9, material: "wood" })!];
  }

  // Current bounds.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const b = partBounds(p);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i]);
      max[i] = Math.max(max[i], b.max[i]);
    }
  }
  const bw = Math.max(0.01, max[0] - min[0]);
  const bh = Math.max(0.01, max[1] - min[1]);
  const bd = Math.max(0.01, max[2] - min[2]);

  let s = Math.min(1, MAX_FOOTPRINT / bw, MAX_FOOTPRINT / bd, MAX_PIECE_HEIGHT / bh);
  // Drawn much smaller than the footprint it asked for (e.g. in 0..1 units):
  // blow it up to fill that footprint.
  const fit = Math.min(wantW / bw, wantD / bd);
  if (fit > 1.6) s = Math.min(fit, MAX_PIECE_HEIGHT / bh, MAX_FOOTPRINT / bw, MAX_FOOTPRINT / bd);
  // Microscopic pieces are made at least ~0.6 m big.
  const biggest = Math.max(bw, bh, bd) * s;
  if (biggest < 0.3) s *= 0.6 / biggest;

  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const by = min[1];
  parts = parts.map((p) => ({
    ...p,
    x: round((p.x - cx) * s),
    y: round((p.y - by) * s),
    z: round((p.z - cz) * s),
    sx: round(Math.max(0.01, p.sx * s)),
    sy: round(Math.max(0.01, p.sy * s)),
    sz: round(Math.max(0.01, p.sz * s)),
    rx: round(p.rx, 1),
    ry: round(p.ry, 1),
    rz: round(p.rz, 1),
  }));

  const w = clamp(Math.ceil(bw * s - 0.08), 1, MAX_FOOTPRINT);
  const d = clamp(Math.ceil(bd * s - 0.08), 1, MAX_FOOTPRINT);
  const h = round(Math.max(0.05, bh * s), 2);

  return {
    id: meta.id,
    name: cleanText(r.name, 32, "Mystery Piece"),
    description: cleanText(r.description, 160, ""),
    role,
    w,
    d,
    h,
    power,
    parts,
    stats: computePieceStats(role, w, d, h, power, parts),
    author: meta.author,
    source: meta.source,
    createdAt: meta.createdAt,
  };
}

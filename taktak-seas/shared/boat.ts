// Boats: the build grid, stacking, stats and sailing physics. Shared so the
// server validates exactly what the client previews and simulates.
//
// Boat-local space: origin at the centre of the build grid at keel level
// (y = 0). +z is the bow, +x is port (left when facing the bow), y is up.
// Grid cell (gx, gz) covers x in [gx - GRID_W/2, gx + 1 - GRID_W/2] and
// z in [gz - GRID_L/2, gz + 1 - GRID_L/2]. gz = 0 is the stern row and
// gz = GRID_L - 1 is the bow row.
//
// A boat is a list of placed pieces in placement order. Pieces stack: a piece
// sits on top of the highest thing already under its footprint. Removing a
// piece lets everything above it settle back down.

import { CREW_MASS, GRID_L, GRID_W, MAX_BUILD_HEIGHT, MAX_PIECES } from "./constants";
import { clamp, forwardOf, rightOf, wrapAngle } from "./math";
import type { PieceDef } from "./pieces";
import { clampToWorld, terrainHeight, waveHeight } from "./world";

export type Rot = 0 | 1 | 2 | 3;

export interface PlacedPiece {
  /** Unique within the boat. */
  uid: string;
  defId: string;
  /** Grid cell of the footprint's minimum corner (after rotation). */
  gx: number;
  gz: number;
  /** Quarter turns around y (counter-clockwise seen from above). */
  rot: Rot;
  /** Height of the piece's base above the keel, set by settle(). */
  y: number;
}

/** A boat as sent over the network. `rev` increases with every change. */
export interface BoatNet {
  pieces: PlacedPiece[];
  rev: number;
}

export type DefLookup = (id: string) => PieceDef | undefined;

/** Footprint size in cells after rotation. */
export function footprint(def: Pick<PieceDef, "w" | "d">, rot: Rot): { fw: number; fd: number } {
  return rot % 2 === 1 ? { fw: def.d, fd: def.w } : { fw: def.w, fd: def.d };
}

export function inGrid(gx: number, gz: number, fw: number, fd: number): boolean {
  return (
    Number.isInteger(gx) &&
    Number.isInteger(gz) &&
    gx >= 0 &&
    gz >= 0 &&
    gx + fw <= GRID_W &&
    gz + fd <= GRID_L
  );
}

/** Rotation of a placed piece around y, in radians. */
export function rotRadians(rot: Rot): number {
  return (rot * Math.PI) / 2;
}

/** Boat-local position of a placed piece's origin (footprint centre, base height). */
export function piecePosition(p: Pick<PlacedPiece, "gx" | "gz" | "rot" | "y">, def: Pick<PieceDef, "w" | "d">): {
  x: number;
  y: number;
  z: number;
} {
  const { fw, fd } = footprint(def, p.rot);
  return { x: p.gx + fw / 2 - GRID_W / 2, y: p.y, z: p.gz + fd / 2 - GRID_L / 2 };
}

/** Boat-local centre of a grid cell. */
export function cellCenter(gx: number, gz: number): { x: number; z: number } {
  return { x: gx + 0.5 - GRID_W / 2, z: gz + 0.5 - GRID_L / 2 };
}

/** Grid cell containing a boat-local point (may be outside the grid). */
export function cellAt(x: number, z: number): { gx: number; gz: number } {
  return { gx: Math.floor(x + GRID_W / 2), gz: Math.floor(z + GRID_L / 2) };
}

/** Top surface height of every cell, row-major by gz then gx. */
export function heightMap(pieces: readonly PlacedPiece[], defs: DefLookup): Float64Array {
  const map = new Float64Array(GRID_W * GRID_L);
  for (const p of pieces) {
    const def = defs(p.defId);
    if (!def) continue;
    const { fw, fd } = footprint(def, p.rot);
    const top = p.y + def.h;
    for (let z = p.gz; z < p.gz + fd; z++) {
      for (let x = p.gx; x < p.gx + fw; x++) {
        const i = z * GRID_W + x;
        if (top > map[i]) map[i] = top;
      }
    }
  }
  return map;
}

function baseOn(map: Float64Array, gx: number, gz: number, fw: number, fd: number): number {
  let base = 0;
  for (let z = gz; z < gz + fd; z++) {
    for (let x = gx; x < gx + fw; x++) base = Math.max(base, map[z * GRID_W + x]);
  }
  return base;
}

/**
 * Recomputes every piece's height in placement order, so pieces rest on what
 * is below them. Pieces whose definition is unknown are dropped.
 */
export function settle(pieces: readonly PlacedPiece[], defs: DefLookup): PlacedPiece[] {
  const map = new Float64Array(GRID_W * GRID_L);
  const out: PlacedPiece[] = [];
  for (const p of pieces) {
    const def = defs(p.defId);
    if (!def) continue;
    const { fw, fd } = footprint(def, p.rot);
    if (!inGrid(p.gx, p.gz, fw, fd)) continue;
    const y = baseOn(map, p.gx, p.gz, fw, fd);
    const top = y + def.h;
    for (let z = p.gz; z < p.gz + fd; z++) {
      for (let x = p.gx; x < p.gx + fw; x++) map[z * GRID_W + x] = Math.max(map[z * GRID_W + x], top);
    }
    out.push({ ...p, y: Math.round(y * 1000) / 1000 });
  }
  return out;
}

export type PlacementCheck = { ok: true; y: number } | { ok: false; reason: string };

/** Can `def` be placed at (gx, gz) with rotation `rot` on this boat? */
export function checkPlacement(
  pieces: readonly PlacedPiece[],
  def: PieceDef,
  gx: number,
  gz: number,
  rot: Rot,
  defs: DefLookup,
): PlacementCheck {
  if (pieces.length >= MAX_PIECES) return { ok: false, reason: `A boat can have at most ${MAX_PIECES} pieces.` };
  const { fw, fd } = footprint(def, rot);
  if (!inGrid(gx, gz, fw, fd)) return { ok: false, reason: "That doesn't fit inside the build area." };
  const y = baseOn(heightMap(pieces, defs), gx, gz, fw, fd);
  if (y + def.h > MAX_BUILD_HEIGHT) return { ok: false, reason: "That would stack too high." };
  return { ok: true, y };
}

// ---------------------------------------------------------------------------
// Stats

export interface BoatStats {
  pieceCount: number;
  mass: number;
  buoyancy: number;
  /** Engine + oar push at full throttle. */
  thrust: number;
  sailArea: number;
  /** Turning authority (base 0.3 + rudders), capped at 2.2. */
  turn: number;
  /** buoyancy >= mass with at least one piece. */
  floats: boolean;
  /** mass / buoyancy (0 when there is no buoyancy). Above 1 it sinks. */
  load: number;
  /** How deep the keel sits below the waterline, metres. */
  draft: number;
  /** Occupied extent in metres along z (length) and x (beam). */
  length: number;
  beam: number;
  cannons: number;
  lights: number;
  /** Rough top speed in m/s with full throttle and a good wind. */
  topSpeed: number;
  /** Friendly problems to show while building. */
  warnings: string[];
}

export const PHYSICS = {
  /** Quadratic water drag coefficient. */
  drag: 0.0022,
  /** Force per square metre of sail in a full-strength wind. */
  sailForce: 45,
  maxSpeed: 38,
  maxReverse: 6,
  /** Reverse thrust is weaker than forward. */
  reverseFactor: 0.45,
  baseTurn: 0.3,
  maxTurn: 2.2,
  /** How close (metres of water depth) the hull may get to the seabed. */
  minDepth: 0.8,
} as const;

/** How well a sail pulls at a given angle between the boat heading and the wind. */
export function sailEfficiency(heading: number, windDir: number): number {
  const a = wrapAngle(heading - windDir);
  return 0.12 + 0.75 * Math.max(0, Math.cos(a)) + 0.45 * Math.abs(Math.sin(a));
}

export function computeBoatStats(pieces: readonly PlacedPiece[], defs: DefLookup): BoatStats {
  let mass = CREW_MASS;
  let buoyancy = 0;
  let thrust = 0;
  let sailArea = 0;
  let turn: number = PHYSICS.baseTurn;
  let cannons = 0;
  let lights = 0;
  let hasHull = false;
  let hasRudder = false;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let count = 0;
  for (const p of pieces) {
    const def = defs(p.defId);
    if (!def) continue;
    count++;
    mass += def.stats.mass;
    buoyancy += def.stats.buoyancy;
    thrust += def.stats.thrust;
    sailArea += def.stats.sail;
    turn += def.stats.turn;
    if (def.role === "hull" || def.role === "float") hasHull = true;
    if (def.role === "rudder") hasRudder = true;
    if (def.role === "cannon") cannons++;
    if (def.role === "light") lights++;
    const { fw, fd } = footprint(def, p.rot);
    minX = Math.min(minX, p.gx);
    maxX = Math.max(maxX, p.gx + fw);
    minZ = Math.min(minZ, p.gz);
    maxZ = Math.max(maxZ, p.gz + fd);
  }
  turn = Math.min(turn, PHYSICS.maxTurn);
  const floats = count > 0 && buoyancy >= mass;
  const load = buoyancy > 0 ? mass / buoyancy : 0;
  const draft = clamp(0.15 + 1.1 * Math.min(load, 2), 0.15, 2.4);
  const push = thrust + sailArea * PHYSICS.sailForce * 0.8;
  const topSpeed = floats && push > 0 ? Math.min(PHYSICS.maxSpeed, Math.sqrt(push / (mass * PHYSICS.drag))) : 0;

  const warnings: string[] = [];
  if (count === 0) warnings.push("Your boat is empty. Ask your AI for a hull piece to start.");
  else if (!hasHull) warnings.push("No hull or floats yet, so it will sink.");
  if (count > 0 && !floats && buoyancy > 0) {
    warnings.push(`Too heavy by ${Math.ceil(mass - buoyancy)}. Add hulls or floats.`);
  }
  if (count > 0 && thrust === 0 && sailArea < 1) warnings.push("No engine, oars or sail, so it can only drift.");
  if (count > 0 && !hasRudder && (thrust > 0 || sailArea >= 1)) warnings.push("No rudder, so turning is slow.");

  return {
    pieceCount: count,
    mass: Math.round(mass),
    buoyancy: Math.round(buoyancy),
    thrust: Math.round(thrust),
    sailArea: Math.round(sailArea * 10) / 10,
    turn: Math.round(turn * 100) / 100,
    floats,
    load: Math.round(load * 100) / 100,
    draft,
    length: count ? maxZ - minZ : 0,
    beam: count ? maxX - minX : 0,
    cannons,
    lights,
    topSpeed: Math.round(topSpeed * 10) / 10,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Sailing physics. The owner's client runs this; everyone else just sees the
// result in snapshots.

export interface BoatMotion {
  x: number;
  z: number;
  heading: number;
  /** Forward speed in m/s (negative = reversing). */
  speed: number;
  /** Current turn rate in rad/s (positive = turning left / heading increasing). */
  yawRate: number;
}

export interface HelmInput {
  /** -1 (full reverse) .. 1 (full ahead). Drives engines and oars. */
  throttle: number;
  /** -1 (left) .. 1 (right). */
  steer: number;
  sailsUp: boolean;
}

export interface StepResult {
  /** True when the hull ran aground or hit the map edge this step. */
  bumped: boolean;
}

/**
 * Advances a boat by dt seconds. `wind` comes from windAt(worldTime).
 * Boats that do not float sit still (and the client shows them sinking).
 */
export function stepBoat(
  m: BoatMotion,
  input: HelmInput,
  stats: BoatStats,
  wind: { dir: number; strength: number },
  dt: number,
): StepResult {
  if (!stats.floats) {
    m.speed *= Math.max(0, 1 - 3 * dt);
    m.yawRate = 0;
    return { bumped: false };
  }
  const throttle = clamp(input.throttle, -1, 1);
  const steer = clamp(input.steer, -1, 1);

  let force = throttle >= 0 ? throttle * stats.thrust : throttle * stats.thrust * PHYSICS.reverseFactor;
  if (input.sailsUp && stats.sailArea > 0) {
    force += stats.sailArea * PHYSICS.sailForce * wind.strength * sailEfficiency(m.heading, wind.dir);
  }
  const mass = Math.max(1, stats.mass);
  const accel = force / mass - PHYSICS.drag * m.speed * Math.abs(m.speed) - 0.05 * Math.sign(m.speed);
  m.speed = clamp(m.speed + accel * dt, -PHYSICS.maxReverse, PHYSICS.maxSpeed);
  if (Math.abs(m.speed) < 0.02 && Math.abs(force) < 1) m.speed = 0;

  // Rudders bite harder with speed; a stopped boat can still turn slowly.
  const authority = stats.turn * (0.25 + Math.min(1, Math.abs(m.speed) / 5));
  const direction = m.speed < -0.1 ? -1 : 1;
  const targetYaw = -steer * authority * direction;
  m.yawRate += (targetYaw - m.yawRate) * Math.min(1, 4 * dt);
  m.heading = wrapAngle(m.heading + m.yawRate * dt);

  const f = forwardOf(m.heading);
  const nx = m.x + f.x * m.speed * dt;
  const nz = m.z + f.z * m.speed * dt;
  // Probe ahead of the bow (or behind the stern when reversing).
  const probe = Math.max(2, stats.length / 2) * (m.speed >= 0 ? 1 : -1);
  const px = nx + f.x * probe;
  const pz = nz + f.z * probe;
  const clamped = clampToWorld(nx, nz);
  const hitEdge = clamped.x !== nx || clamped.z !== nz;
  const aground =
    terrainHeight(px, pz) > -PHYSICS.minDepth || terrainHeight(nx, nz) > -PHYSICS.minDepth;
  if (aground || hitEdge) {
    m.speed = -m.speed * 0.25;
    return { bumped: true };
  }
  m.x = nx;
  m.z = nz;
  return { bumped: false };
}

/**
 * Where a boat floats: height of the boat origin (keel) and the pitch/roll
 * from the waves under it. `calm` (0..1) damps the motion, e.g. 1 in build
 * mode so pieces are easy to click.
 */
export function floatPose(
  x: number,
  z: number,
  heading: number,
  t: number,
  stats: Pick<BoatStats, "draft" | "floats" | "length" | "beam">,
  calm = 0,
): { y: number; pitch: number; roll: number } {
  const f = forwardOf(heading);
  const r = rightOf(heading);
  const halfL = Math.max(1.5, stats.length / 2);
  const halfB = Math.max(1, stats.beam / 2);
  const center = waveHeight(x, z, t);
  const bow = waveHeight(x + f.x * halfL, z + f.z * halfL, t);
  const stern = waveHeight(x - f.x * halfL, z - f.z * halfL, t);
  const right = waveHeight(x + r.x * halfB, z + r.z * halfB, t);
  const left = waveHeight(x - r.x * halfB, z - r.z * halfB, t);
  const k = 1 - clamp(calm, 0, 1);
  const surface = (center * 2 + bow + stern + left + right) / 6;
  // Pitch: positive raises the bow (three.js rotation.x is negative for that
  // with +z forward, so the client applies -pitch). Roll: positive lifts port.
  const pitch = Math.atan2(bow - stern, halfL * 2) * k;
  const roll = Math.atan2(left - right, halfB * 2) * k;
  const y = surface * k - stats.draft;
  return { y, pitch, roll };
}

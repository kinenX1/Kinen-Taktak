import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PHYSICS,
  checkPlacement,
  computeBoatStats,
  footprint,
  heightMap,
  settle,
  stepBoat,
  type PlacedPiece,
} from "../shared/boat";
import { GRID_L, GRID_W, MAX_FOOTPRINT, MAX_PARTS, MAX_PIECE_HEIGHT } from "../shared/constants";
import { forwardOf, rightOf } from "../shared/math";
import { normalizePiece, type PieceDef } from "../shared/pieces";
import { CITIES, HOME_ISLAND, SLIPS, SPAWN, isLand, terrainHeight, waveGlsl } from "../shared/world";

const meta = (id = "p1") => ({ id, author: "Tester", source: "workshop" as const, createdAt: 0 });

function box(w: number, h: number, d: number, extra: Record<string, unknown> = {}) {
  return { shape: "box", x: 0, y: h / 2, z: 0, sx: w, sy: h, sz: d, rx: 0, ry: 0, rz: 0, color: "#a0703c", material: "wood", anim: "none", ...extra };
}

test("normalizePiece survives junk input", () => {
  for (const junk of [null, undefined, 42, "hull", [], { parts: "nope" }, { parts: [null, 7, { shape: "blob", x: "NaN" }] }]) {
    const def = normalizePiece(junk, meta());
    assert.ok(def.parts.length >= 1 && def.parts.length <= MAX_PARTS);
    assert.ok(def.w >= 1 && def.w <= MAX_FOOTPRINT && def.d >= 1 && def.d <= MAX_FOOTPRINT);
    assert.ok(def.h > 0 && def.h <= MAX_PIECE_HEIGHT);
    assert.equal(def.role, "decor");
    for (const p of def.parts) {
      for (const k of ["x", "y", "z", "sx", "sy", "sz", "rx", "ry", "rz"] as const) assert.ok(Number.isFinite(p[k]));
      assert.match(p.color, /^#[0-9a-f]{6}$/);
    }
  }
});

test("normalizePiece recentres and measures the footprint from the geometry", () => {
  const def = normalizePiece({ role: "hull", width: 3, length: 4, parts: [{ ...box(3, 1, 4), x: 10, z: -7, y: 5 }] }, meta());
  assert.equal(def.w, 3);
  assert.equal(def.d, 4);
  assert.equal(def.h, 1);
  assert.equal(def.parts[0].x, 0);
  assert.equal(def.parts[0].z, 0);
  assert.equal(def.parts[0].y, 0.5);
});

test("normalizePiece shrinks huge drawings to the limits", () => {
  const def = normalizePiece({ role: "hull", width: 5, length: 5, parts: [box(12, 20, 12)] }, meta());
  assert.ok(def.w <= MAX_FOOTPRINT && def.d <= MAX_FOOTPRINT);
  assert.ok(def.h <= MAX_PIECE_HEIGHT + 1e-6);
});

test("normalizePiece blows up multi-cell pieces drawn in unit coordinates, but not 1x1 trinkets", () => {
  const hull = normalizePiece({ role: "hull", width: 3, length: 4, parts: [box(0.75, 0.3, 1)] }, meta());
  assert.equal(hull.w, 3);
  assert.equal(hull.d, 4);
  const lantern = normalizePiece({ role: "light", width: 1, length: 1, parts: [box(0.3, 0.6, 0.3)] }, meta());
  assert.equal(lantern.w, 1);
  assert.ok(lantern.h < 1, "a small lantern stays small");
});

test("normalizePiece clamps power and picks valid enums", () => {
  const def = normalizePiece({ role: "ENGINE", power: 99, parts: [box(1, 1, 1, { shape: "Sphere", material: "unobtainium", anim: "spin" })] }, meta());
  assert.equal(def.role, "engine");
  assert.equal(def.power, 10);
  assert.equal(def.parts[0].shape, "sphere");
  assert.equal(def.parts[0].material, "wood");
  assert.equal(def.parts[0].anim, "spin");
  assert.ok(def.stats.thrust > 0);
});

// ---------------------------------------------------------------- Boats

const hull: PieceDef = normalizePiece({ role: "hull", width: 3, length: 4, power: 5, parts: [box(3, 1.2, 4)] }, meta("hull"));
const brick: PieceDef = normalizePiece({ role: "decor", width: 1, length: 1, parts: [box(1, 1, 1, { material: "stone" })] }, meta("brick"));
const engine: PieceDef = normalizePiece({ role: "engine", width: 1, length: 2, power: 5, parts: [box(1, 1, 2, { material: "metal" })] }, meta("engine"));
const anchorStone: PieceDef = normalizePiece({ role: "storage", width: 5, length: 5, power: 10, parts: [box(5, 3, 5, { material: "gold" })] }, meta("anchor"));
const defs = new Map([hull, brick, engine, anchorStone].map((d) => [d.id, d]));
const lookup = (id: string) => defs.get(id);

function placed(uid: string, defId: string, gx: number, gz: number, rot: 0 | 1 | 2 | 3 = 0): PlacedPiece {
  return { uid, defId, gx, gz, rot, y: 0 };
}

test("pieces stack on top of what is below them", () => {
  const first = checkPlacement([], hull, 3, 5, 0, lookup);
  assert.deepEqual(first, { ok: true, y: 0 });
  const pieces = settle([placed("a", "hull", 3, 5)], lookup);
  const second = checkPlacement(pieces, brick, 4, 6, 0, lookup);
  assert.ok(second.ok);
  assert.equal(second.ok && second.y, hull.h);
  const map = heightMap(pieces, lookup);
  assert.equal(map[6 * GRID_W + 4], hull.h);
  assert.equal(map[0], 0);
});

test("removing a piece lets the ones above settle down", () => {
  const stacked = settle([placed("a", "hull", 3, 5), placed("b", "brick", 4, 6)], lookup);
  assert.equal(stacked[1].y, hull.h);
  const after = settle(stacked.filter((p) => p.uid !== "a"), lookup);
  assert.equal(after[0].y, 0);
});

test("placement must stay inside the grid", () => {
  assert.equal(checkPlacement([], hull, GRID_W - 2, 0, 0, lookup).ok, false);
  assert.equal(checkPlacement([], hull, -1, 0, 0, lookup).ok, false);
  const { fw, fd } = footprint(hull, 1);
  assert.deepEqual([fw, fd], [hull.d, hull.w]);
  assert.equal(checkPlacement([], hull, GRID_W - fw, GRID_L - fd, 1, lookup).ok, true);
});

test("boat stats: empty, floating, sinking", () => {
  const empty = computeBoatStats([], lookup);
  assert.equal(empty.floats, false);
  assert.equal(empty.pieceCount, 0);
  const floating = computeBoatStats([placed("a", "hull", 3, 5), placed("e", "engine", 4, 3)], lookup);
  assert.equal(floating.floats, true);
  assert.ok(floating.thrust > 0 && floating.topSpeed > 0);
  const sinking = computeBoatStats([placed("a", "anchor", 0, 0), placed("b", "anchor", 4, 0), placed("c", "anchor", 0, 5)], lookup);
  assert.equal(sinking.floats, false);
  assert.ok(sinking.warnings.length > 0);
});

test("stepBoat accelerates with thrust and sits still when it doesn't float", () => {
  const stats = computeBoatStats([placed("a", "hull", 3, 5), placed("e", "engine", 4, 3)], lookup);
  const start = { x: 0, z: 400, heading: 0, speed: 0, yawRate: 0 };
  const m = { ...start };
  for (let i = 0; i < 120; i++) stepBoat(m, { throttle: 1, steer: 0, sailsUp: false }, stats, { dir: 0, strength: 1 }, 1 / 30);
  assert.ok(m.speed > 1, `speed ${m.speed}`);
  assert.ok(m.z > start.z + 2);
  const sinking = computeBoatStats([placed("a", "anchor", 0, 0)], lookup);
  const s = { ...start };
  stepBoat(s, { throttle: 1, steer: 0, sailsUp: true }, sinking, { dir: 0, strength: 1 }, 1 / 30);
  assert.equal(s.z, start.z);
});

test("stepBoat stops at the shore", () => {
  const stats = computeBoatStats([placed("a", "hull", 3, 5), placed("e", "engine", 4, 3)], lookup);
  // Start west of the home island, heading east (towards -x is east; +x is west), i.e. straight at it.
  const m = { x: HOME_ISLAND.radius + 60, z: 0, heading: -Math.PI / 2, speed: 10, yawRate: 0 };
  let bumped = false;
  for (let i = 0; i < 600 && !bumped; i++) bumped = stepBoat(m, { throttle: 1, steer: 0, sailsUp: false }, stats, { dir: 0, strength: 0 }, 1 / 30).bumped;
  assert.ok(bumped, "ran aground");
  assert.ok(!isLand(m.x, m.z));
});

// ---------------------------------------------------------------- World

test("players spawn on land", () => {
  assert.ok(isLand(SPAWN.x, SPAWN.z));
});

test("a full-size docked boat never touches the bottom at any slip", () => {
  for (const slip of SLIPS) {
    const f = forwardOf(slip.heading);
    const r = rightOf(slip.heading);
    for (const along of [-GRID_L / 2, 0, GRID_L / 2]) {
      for (const across of [-GRID_W / 2, 0, GRID_W / 2]) {
        const x = slip.x + f.x * along + r.x * across;
        const z = slip.z + f.z * along + r.z * across;
        assert.ok(terrainHeight(x, z) < -PHYSICS.minDepth, `slip ${slip.index} at (${along}, ${across}) is too shallow`);
      }
    }
    assert.ok(isLand(slip.beachX, slip.beachZ), `slip ${slip.index} beach point is on land`);
  }
});

test("cities are apart from each other and from home", () => {
  const all = [HOME_ISLAND, ...CITIES];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const d = Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z);
      assert.ok(d > (all[i].radius + all[j].radius) * 2, `${all[i].name} and ${all[j].name} overlap`);
    }
  }
});

test("the GLSL wave function is generated", () => {
  assert.match(waveGlsl(), /float waveHeight\(vec2 p, float t\)/);
});

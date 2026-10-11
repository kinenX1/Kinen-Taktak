import assert from "node:assert/strict";
import { test } from "node:test";
import { computeBoatStats, settle, type PlacedPiece } from "../shared/boat";
import { MAX_FOOTPRINT, MAX_PARTS } from "../shared/constants";
import { normalizePiece, type PieceDef, type Role } from "../shared/pieces";
import { _internal, workshopPiece } from "../server/workshop";

const ctx = { botName: "Bolt", playerName: "Sam", recentPieces: [] };

function make(prompt: string, seed = 7): { def: PieceDef; message: string } {
  const r = workshopPiece(prompt, ctx, seed);
  return { def: normalizePiece(r.piece, { id: prompt || "empty", author: "Sam", source: "workshop", createdAt: 0 }), message: r.message };
}

const ROLE_PROMPTS: [string, Role][] = [
  ["wooden hull section", "hull"],
  ["pontoon float", "float"],
  ["a log raft", "float"],
  ["deck with railing", "deck"],
  ["big red sail with a skull", "sail"],
  ["tall mast with a crow's nest", "mast"],
  ["steam engine with a chimney", "engine"],
  ["turbo outboard motor", "engine"],
  ["jet thruster", "engine"],
  ["pair of oars", "oars"],
  ["rudder", "rudder"],
  ["ship's wheel", "rudder"],
  ["captain's cabin", "cabin"],
  ["golden throne", "seat"],
  ["golden cannon", "cannon"],
  ["glowing lantern", "light"],
  ["pirate flag", "flag"],
  ["treasure chest", "storage"],
  ["an anchor", "decor"],
];

test("typical prompts get the right role", () => {
  for (const [prompt, role] of ROLE_PROMPTS) assert.equal(make(prompt).def.role, role, prompt);
});

test("whole-boat requests give a hull section and explain why", () => {
  for (const prompt of ["a pirate ship", "build me a yacht", "speedboat"]) {
    const { def, message } = make(prompt);
    assert.equal(def.role, "hull", prompt);
    assert.match(message, /piece/i);
  }
});

test("typos and other languages are understood", () => {
  assert.equal(make("red sial").def.role, "sail");
  assert.equal(make("fast engin").def.role, "engine");
  assert.equal(make("moter").def.role, "engine");
  assert.equal(make("une voile rouge").def.role, "sail");
  assert.equal(make("un motor azul").def.role, "engine");
  assert.match(make("une voile rouge avec une tete de mort").message, /voile|Voici|atelier/i);
  // Everyday words are not "corrected" into keywords.
  assert.equal(make("the most powerful engine").def.role, "engine");
});

test("colours are applied", () => {
  const { def } = make("blue rudder");
  assert.ok(def.parts.some((p) => p.color === "#1f6fd1"));
});

test("every piece is valid after normalising", () => {
  for (const [prompt] of ROLE_PROMPTS) {
    const { def } = make(prompt);
    assert.ok(def.parts.length >= 1 && def.parts.length <= MAX_PARTS, prompt);
    assert.ok(def.w <= MAX_FOOTPRINT && def.d <= MAX_FOOTPRINT, prompt);
  }
});

test("same prompt and seed give the same piece", () => {
  assert.deepEqual(workshopPiece("red sail", ctx, 42), workshopPiece("red sail", ctx, 42));
});

test("garbage never throws", () => {
  for (const prompt of ["", "   ", "🚀🚀🚀", "a".repeat(5000), "<script>alert(1)</script>", "ÆØÅ ñ ü"]) {
    const { def } = make(prompt);
    assert.ok(def.parts.length > 0);
  }
  assert.doesNotThrow(() => workshopPiece(undefined as unknown as string, ctx, 1));
});

test("a simple workshop boat floats and moves at a sensible speed", () => {
  const defs = new Map<string, PieceDef>();
  const add = (prompt: string, id: string) => {
    const def = normalizePiece(workshopPiece(prompt, ctx, 3).piece, { id, author: "Sam", source: "workshop", createdAt: 0 });
    defs.set(id, def);
    return def;
  };
  const h = add("hull section", "h");
  add("sail", "s");
  add("rudder", "r");
  add("outboard motor", "e");
  const lookup = (id: string) => defs.get(id);
  const solo = computeBoatStats([{ uid: "1", defId: "h", gx: 3, gz: 5, rot: 0, y: 0 }], lookup);
  assert.equal(solo.floats, true, "one hull section floats on its own");
  const pieces: PlacedPiece[] = settle(
    [
      { uid: "1", defId: "h", gx: 3, gz: 2, rot: 0, y: 0 },
      { uid: "2", defId: "h", gx: 3, gz: 2 + h.d, rot: 0, y: 0 },
      { uid: "3", defId: "s", gx: 3, gz: 4, rot: 0, y: 0 },
      { uid: "4", defId: "r", gx: 4, gz: 2, rot: 0, y: 0 },
      { uid: "5", defId: "e", gx: 5, gz: 2, rot: 0, y: 0 },
    ],
    lookup,
  );
  const stats = computeBoatStats(pieces, lookup);
  assert.equal(stats.floats, true);
  assert.ok(stats.topSpeed >= 8 && stats.topSpeed <= 30, `top speed ${stats.topSpeed}`);
});

test("fuzzy matching helper", () => {
  const { editDistanceAtMostOne } = _internal;
  assert.ok(editDistanceAtMostOne("sial", "sail"));
  assert.ok(editDistanceAtMostOne("engin", "engine"));
  assert.ok(!editDistanceAtMostOne("most", "mast", false));
});

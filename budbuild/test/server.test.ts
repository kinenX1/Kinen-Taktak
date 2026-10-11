import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { io as connect, type Socket } from "socket.io-client";
import type { ClientToServerEvents, JoinAck, MotionState, ServerToClientEvents } from "../shared/protocol";
import { SLIPS } from "../shared/world";
import { createGameServer, type GameServerHandle } from "../server/app";
import type { ForgeFn } from "../server/forge";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: GameServerHandle;
let url = "";
const clients: Client[] = [];

/** A fake forge: a big floating hull for "hull", a heavy rock for "rock", else a flag. */
const fakeForge: ForgeFn = async (prompt) => {
  const hull = prompt.includes("hull");
  const rock = prompt.includes("rock");
  return {
    source: "workshop",
    result: {
      message: `Made: ${prompt}`,
      piece: {
        name: prompt,
        role: hull ? "hull" : rock ? "storage" : "flag",
        width: hull || rock ? 5 : 1,
        length: hull || rock ? 5 : 1,
        power: rock ? 10 : 5,
        parts: [
          {
            shape: "box",
            x: 0,
            y: 0.5,
            z: 0,
            sx: hull || rock ? 5 : 0.5,
            sy: rock ? 4 : 1,
            sz: hull || rock ? 5 : 0.5,
            rx: 0,
            ry: 0,
            rz: 0,
            color: "#123456",
            material: rock ? "gold" : "wood",
            anim: "none",
          },
        ],
      },
    },
  };
};

before(async () => {
  server = createGameServer({ forge: fakeForge, quiet: true });
  await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
});

after(async () => {
  for (const c of clients) c.disconnect();
  await server.close();
});

function client(): Promise<Client> {
  const c: Client = connect(url, { transports: ["websocket"], forceNew: true, reconnection: false });
  clients.push(c);
  return new Promise((resolve, reject) => {
    c.once("connect", () => resolve(c));
    c.once("connect_error", reject);
  });
}

let keyCounter = 0;
function key(): string {
  return `test-key-${String(++keyCounter).padStart(8, "0")}`;
}

function join(c: Client, room: string | null, name: string, k = key()): Promise<JoinAck> {
  return new Promise((resolve) => c.emit("join", { room, name, color: "#ff6b6b", botName: "Bolt", key: k }, resolve));
}

function once<E extends keyof ServerToClientEvents>(c: Client, event: E, timeout = 3000): Promise<Parameters<ServerToClientEvents[E]>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${String(event)}`)), timeout);
    const handler = (...args: unknown[]) => {
      clearTimeout(timer);
      resolve(args as Parameters<ServerToClientEvents[E]>);
    };
    (c as unknown as { once(e: string, h: (...a: unknown[]) => void): void }).once(event as string, handler);
  });
}

function ack<T>(fn: (cb: (res: T) => void) => void): Promise<T> {
  return new Promise((resolve) => fn(resolve));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("two friends join the same island and see each other", async () => {
  const a = await client();
  const b = await client();
  const ja = await join(a, null, "Ana");
  assert.ok(ja.ok);
  if (!ja.ok) return;
  assert.match(ja.room.code, /^[A-Z0-9]{5}$/);
  assert.equal(ja.you.docked, true);

  const joinedP = once(a, "player:joined");
  const boatP = once(a, "boat:update");
  const jb = await join(b, ja.room.code.toLowerCase(), "Ben");
  assert.ok(jb.ok);
  if (!jb.ok) return;
  assert.equal(jb.room.players.length, 2);
  assert.notEqual(jb.you.slip, ja.you.slip);
  const [joined] = await joinedP;
  assert.equal(joined.name, "Ben");
  const [boat] = await boatP;
  assert.equal(boat.ownerId, jb.you.id);

  const snap = await once(b, "snapshot");
  assert.equal(snap[0].players.length, 2);
});

test("unknown but well-formed codes create that island; bad codes are refused", async () => {
  const c = await client();
  const res = await join(c, "ZZZZ9", "Cleo");
  assert.ok(res.ok && res.room.code === "ZZZZ9");
  const d = await client();
  const bad = await join(d, "nope!", "Dan");
  assert.equal(bad.ok, false);
});

test("chat is broadcast and rate limited", async () => {
  const a = await client();
  const b = await client();
  const ja = await join(a, null, "Ana");
  assert.ok(ja.ok);
  if (!ja.ok) return;
  await join(b, ja.room.code, "Ben");
  await sleep(50);
  const got: string[] = [];
  b.on("chat", (m) => {
    if (m.kind === "chat") got.push(m.text);
  });
  for (let i = 0; i < 8; i++) a.emit("chat", `hello ${i}`);
  a.emit("chat", "   ");
  await sleep(300);
  assert.deepEqual(got, ["hello 0", "hello 1", "hello 2", "hello 3", "hello 4"]);
});

test("forge, build, launch and dock", async () => {
  const a = await client();
  const b = await client();
  const ja = await join(a, null, "Ana");
  assert.ok(ja.ok);
  if (!ja.ok) return;
  await join(b, ja.room.code, "Ben");

  const doneP = once(a, "forge:done");
  const res = await ack<{ ok: boolean }>((cb) => a.emit("forge", "big hull", cb));
  assert.ok(res.ok);
  const [done] = await doneP;
  assert.equal(done.piece.role, "hull");
  assert.equal(done.piece.w, 5);

  // Cooldown between requests.
  const tooSoon = await ack<{ ok: boolean }>((cb) => a.emit("forge", "rock", cb));
  assert.equal(tooSoon.ok, false);

  // Launching an empty boat is refused.
  const empty = await ack<{ ok: boolean }>((cb) => a.emit("boat:launch", cb));
  assert.equal(empty.ok, false);

  // Placing: the friend gets the definition exactly once.
  const updates: { defs: number; pieces: number }[] = [];
  b.on("boat:update", (u) => {
    if (u.ownerId === ja.you.id) updates.push({ defs: u.defs.length, pieces: u.boat.pieces.length });
  });
  const p1 = await ack<{ ok: boolean }>((cb) => a.emit("boat:place", { defId: done.piece.id, gx: 2, gz: 0, rot: 0 }, cb));
  assert.ok(p1.ok);
  const p2 = await ack<{ ok: boolean }>((cb) => a.emit("boat:place", { defId: done.piece.id, gx: 2, gz: 5, rot: 0 }, cb));
  assert.ok(p2.ok);
  const outside = await ack<{ ok: boolean }>((cb) => a.emit("boat:place", { defId: done.piece.id, gx: 7, gz: 0, rot: 0 }, cb));
  assert.equal(outside.ok, false);
  const notMine = await ack<{ ok: boolean }>((cb) => a.emit("boat:place", { defId: "p_doesnotexist", gx: 0, gz: 0, rot: 0 }, cb));
  assert.equal(notMine.ok, false);
  await sleep(100);
  assert.deepEqual(updates, [
    { defs: 1, pieces: 1 },
    { defs: 0, pieces: 2 },
  ]);

  // A boat of nothing but rocks would sink, so it can't launch.
  await sleep(3100);
  const rockP = once(a, "forge:done");
  await ack((cb) => a.emit("forge", "rock", cb));
  const [rock] = await rockP;
  await ack((cb) => a.emit("boat:clear", cb));
  await ack((cb) => a.emit("boat:place", { defId: rock.piece.id, gx: 2, gz: 0, rot: 0 }, cb));
  const sinks = await ack<{ ok: boolean; error?: string }>((cb) => a.emit("boat:launch", cb));
  assert.equal(sinks.ok, false);
  assert.match(sinks.error ?? "", /sink/);
  await ack((cb) => a.emit("boat:clear", cb));
  await ack((cb) => a.emit("boat:place", { defId: done.piece.id, gx: 2, gz: 0, rot: 0 }, cb));

  const updateP = once(b, "player:update");
  const launched = await ack<{ ok: boolean }>((cb) => a.emit("boat:launch", cb));
  assert.ok(launched.ok);
  const [update] = await updateP;
  assert.equal(update.docked, false);

  // Building at sea is refused.
  const atSea = await ack<{ ok: boolean }>((cb) => a.emit("boat:place", { defId: done.piece.id, gx: 2, gz: 6, rot: 0 }, cb));
  assert.equal(atSea.ok, false);

  // Motion is relayed; docked boats are pinned to their slip.
  const motion: MotionState = {
    x: 1,
    y: 2,
    z: 3,
    ry: 0,
    mode: "helm",
    aboard: ja.you.id,
    moving: false,
    boat: { x: 300, z: 300, heading: 1, speed: 5, sailsUp: true, throttle: 1 },
  };
  a.emit("motion", motion);
  await sleep(200);
  const snap = (await once(b, "snapshot"))[0];
  const entry = snap.players.find((p) => p.id === ja.you.id)!;
  assert.equal(entry.boat.x, 300);
  await ack((cb) => a.emit("boat:dock", cb));
  await sleep(150);
  const snap2 = (await once(b, "snapshot"))[0];
  const docked = snap2.players.find((p) => p.id === ja.you.id)!;
  assert.equal(docked.boat.x, SLIPS[ja.you.slip].x);
});

test("discoveries need you to be near the city", async () => {
  const a = await client();
  const ja = await join(a, null, "Ana");
  assert.ok(ja.ok);
  if (!ja.ok) return;
  a.emit("discover", "sunspire");
  await sleep(150);
  const updP = once(a, "player:update");
  a.emit("motion", { x: 1080, y: 3, z: 640, ry: 0, mode: "walk", aboard: null, moving: false, boat: { x: 0, z: 0, heading: 0, speed: 0, sailsUp: false, throttle: 0 } });
  await sleep(100);
  a.emit("discover", "sunspire");
  const [upd] = await updP;
  assert.deepEqual(upd.discoveries, ["sunspire"]);
});

test("voice signalling is relayed only between people in voice", async () => {
  const a = await client();
  const b = await client();
  const ja = await join(a, null, "Ana");
  assert.ok(ja.ok);
  if (!ja.ok) return;
  const jb = await join(b, ja.room.code, "Ben");
  assert.ok(jb.ok);
  if (!jb.ok) return;
  const peersA = await ack<string[]>((cb) => a.emit("voice:join", cb));
  assert.deepEqual(peersA, []);
  const joinedP = once(a, "voice:peer-joined");
  const peersB = await ack<string[]>((cb) => b.emit("voice:join", cb));
  assert.deepEqual(peersB, [ja.you.id]);
  assert.equal((await joinedP)[0], jb.you.id);
  const sigP = once(a, "voice:signal");
  b.emit("voice:signal", { to: ja.you.id, data: { sdp: { type: "offer", sdp: "v=0" } } });
  const [sig] = await sigP;
  assert.equal(sig.from, jb.you.id);
  const leftP = once(a, "voice:peer-left");
  b.emit("voice:leave");
  assert.equal((await leftP)[0], jb.you.id);
});

test("rejoining with the same key restores your stuff and kicks the old tab", async () => {
  const k = key();
  const a = await client();
  const ja = await join(a, null, "Ana", k);
  assert.ok(ja.ok);
  if (!ja.ok) return;
  const doneP = once(a, "forge:done");
  await ack((cb) => a.emit("forge", "hull", cb));
  await doneP;
  const kickedP = once(a, "kicked");
  const a2 = await client();
  const again = await join(a2, ja.room.code, "Ana", k);
  assert.ok(again.ok);
  if (!again.ok) return;
  assert.equal(again.you.id, ja.you.id);
  assert.equal(again.inventory.length, 1);
  await kickedP;
});

test("garbage payloads don't crash the server", async () => {
  const a = await client();
  const ja = await join(a, null, "Ana");
  assert.ok(ja.ok);
  const raw = a as unknown as { emit(e: string, ...args: unknown[]): void };
  raw.emit("motion", { x: "nope" });
  raw.emit("motion", null);
  raw.emit("chat", { text: 5 });
  raw.emit("boat:place", { defId: 7 }, () => {});
  raw.emit("boat:place", "x");
  raw.emit("voice:signal", { to: "x", data: { sdp: { type: "evil", sdp: 1 } } });
  raw.emit("fx", { kind: "nuke" });
  raw.emit("discover", 12);
  raw.emit("join", "not an object", () => {});
  await sleep(200);
  const pong = await ack<{ ok: boolean }>((cb) => a.emit("boat:launch", cb));
  assert.equal(pong.ok, false);
});

// Client-side game state, kept in sync with the server, plus snapshot
// interpolation for remote players. Every UI/scene module reads from here and
// listens to its events instead of talking to the socket directly (the voice
// module is the one exception: it uses the voice:* socket events itself).

import { INTERP_DELAY_MS } from "../../shared/constants";
import { lerp, lerpAngle } from "../../shared/math";
import type { PieceDef } from "../../shared/pieces";
import type {
  BoatNet,
  ChatMessage,
  ForgeDone,
  FxEvent,
  PlayerPublic,
  RoomSnapshot,
  Snapshot,
  SnapshotEntry,
} from "../../shared/protocol";
import type { GameSocket } from "./net/socket";

type Listener<A extends unknown[]> = (...args: A) => void;

/** Minimal typed event emitter. */
export class Emitter<E extends Record<string, unknown[]>> {
  private listeners: { [K in keyof E]?: Set<Listener<E[K]>> } = {};

  on<K extends keyof E>(event: K, fn: Listener<E[K]>): () => void {
    const set = (this.listeners[event] ??= new Set());
    set.add(fn);
    return () => set.delete(fn);
  }

  emit<K extends keyof E>(event: K, ...args: E[K]): void {
    const set = this.listeners[event];
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`listener for "${String(event)}" failed`, err);
      }
    }
  }
}

export interface GameEvents extends Record<string, unknown[]> {
  /** Player list or any player's public info changed. */
  players: [];
  playerJoined: [PlayerPublic];
  playerLeft: [string];
  /** A boat layout changed (ownerId). Definitions are already in `defs`. */
  boat: [string];
  /** Your inventory changed. */
  inventory: [];
  chat: [ChatMessage];
  /** The whole chat history was replaced (after joining or reconnecting). */
  chatReset: [];
  forgeWorking: [{ prompt: string }];
  forgeDone: [ForgeDone];
  forgeFailed: [{ prompt: string; error: string }];
  fx: [FxEvent & { from: string }];
  /** A city was discovered by someone (playerId, cityId). */
  discovery: [string, string];
  kicked: [string];
  disconnected: [];
  reconnected: [];
}

/** All known piece definitions, by id. Definitions are immutable. */
export class DefStore {
  private map = new Map<string, PieceDef>();

  get = (id: string): PieceDef | undefined => this.map.get(id);

  has(id: string): boolean {
    return this.map.has(id);
  }

  add(defs: PieceDef | readonly PieceDef[]): void {
    for (const d of Array.isArray(defs) ? defs : [defs as PieceDef]) this.map.set(d.id, d);
  }
}

const SNAPSHOT_BUFFER = 40;

export class GameState extends Emitter<GameEvents> {
  selfId = "";
  roomCode = "";
  /** Server time (ms) the room was created. */
  epoch = 0;
  aiEnabled = false;
  players = new Map<string, PlayerPublic>();
  boats = new Map<string, BoatNet>();
  defs = new DefStore();
  /** Your own pieces, newest first. */
  inventory: PieceDef[] = [];
  chat: ChatMessage[] = [];
  connected = true;

  /** serverTime ≈ Date.now() + clockOffset */
  private clockOffset = 0;
  private snapshots: Snapshot[] = [];

  get self(): PlayerPublic | undefined {
    return this.players.get(this.selfId);
  }

  /** Server-synchronised time in ms. */
  now(): number {
    return Date.now() + this.clockOffset;
  }

  /** Seconds since the room was created; drives waves and wind for everyone. */
  worldTime(): number {
    return (this.now() - this.epoch) / 1000;
  }

  /** Applies the join response. */
  load(you: PlayerPublic, room: RoomSnapshot, inventory: PieceDef[]): void {
    this.selfId = you.id;
    this.roomCode = room.code;
    this.epoch = room.epoch;
    this.aiEnabled = room.ai.enabled;
    this.clockOffset = room.serverNow - Date.now();
    this.players.clear();
    for (const p of room.players) this.players.set(p.id, p);
    this.players.set(you.id, you);
    this.boats.clear();
    for (const [id, boat] of Object.entries(room.boats)) this.boats.set(id, boat);
    this.defs.add(room.defs);
    this.defs.add(inventory);
    this.inventory = inventory;
    this.chat = room.chat.slice();
    this.snapshots = room.motions.length ? [{ t: room.serverNow, players: room.motions }] : [];
    this.emit("players");
    for (const id of this.boats.keys()) this.emit("boat", id);
    this.emit("inventory");
    this.emit("chatReset");
  }

  /** Wires server events into this state. Call once after joining. */
  bind(socket: GameSocket): void {
    socket.on("snapshot", (snap) => this.pushSnapshot(snap));
    socket.on("player:joined", (player, boat) => {
      this.players.set(player.id, player);
      this.boats.set(player.id, boat);
      this.emit("playerJoined", player);
      this.emit("players");
      this.emit("boat", player.id);
    });
    socket.on("player:left", (id) => {
      if (!this.players.delete(id)) return;
      this.boats.delete(id);
      this.emit("playerLeft", id);
      this.emit("players");
    });
    socket.on("player:update", (player) => {
      const before = this.players.get(player.id);
      this.players.set(player.id, player);
      if (before) {
        for (const city of player.discoveries) {
          if (!before.discoveries.includes(city)) this.emit("discovery", player.id, city);
        }
      }
      this.emit("players");
    });
    socket.on("boat:update", ({ ownerId, boat, defs }) => {
      this.defs.add(defs);
      this.boats.set(ownerId, boat);
      this.emit("boat", ownerId);
    });
    socket.on("chat", (msg) => {
      this.chat.push(msg);
      if (this.chat.length > 200) this.chat.splice(0, this.chat.length - 200);
      this.emit("chat", msg);
    });
    socket.on("forge:working", (msg) => this.emit("forgeWorking", msg));
    socket.on("forge:done", (msg) => {
      this.defs.add(msg.piece);
      this.emit("forgeDone", msg);
    });
    socket.on("forge:failed", (msg) => this.emit("forgeFailed", msg));
    socket.on("inventory", (defs) => {
      this.defs.add(defs);
      this.inventory = defs;
      this.emit("inventory");
    });
    socket.on("fx", (msg) => this.emit("fx", msg));
    socket.on("kicked", (reason) => this.emit("kicked", reason));
    socket.on("disconnect", () => {
      this.connected = false;
      this.emit("disconnected");
    });
  }

  private pushSnapshot(snap: Snapshot): void {
    // Smoothly track the server clock.
    const estimate = snap.t - Date.now();
    this.clockOffset += (estimate - this.clockOffset) * 0.05;
    const last = this.snapshots[this.snapshots.length - 1];
    if (last && snap.t <= last.t) return;
    this.snapshots.push(snap);
    if (this.snapshots.length > SNAPSHOT_BUFFER) this.snapshots.shift();
  }

  /**
   * Interpolated state of a remote player, drawn INTERP_DELAY_MS in the past.
   * Returns null if the player has never appeared in a snapshot.
   * (For yourself, use your local simulation instead.)
   */
  sampleMotion(id: string): SnapshotEntry | null {
    const snaps = this.snapshots;
    if (snaps.length === 0) return null;
    const renderT = this.now() - INTERP_DELAY_MS;
    let i = snaps.length - 1;
    while (i > 0 && snaps[i - 1].t > renderT) i--;
    // snaps[i] is the first snapshot at/after renderT (or the oldest one).
    const b = findEntry(snaps[i], id);
    const prev = i > 0 ? snaps[i - 1] : null;
    const a = prev ? findEntry(prev, id) : null;
    if (!b) {
      // Not in the newer snapshot: fall back to the newest one that has them.
      for (let j = snaps.length - 1; j >= 0; j--) {
        const e = findEntry(snaps[j], id);
        if (e) return e;
      }
      return null;
    }
    if (!a || !prev || renderT >= snaps[i].t) return b;
    const span = snaps[i].t - prev.t;
    const t = span > 0 ? Math.min(1, Math.max(0, (renderT - prev.t) / span)) : 1;
    return blendEntries(a, b, t);
  }
}

function findEntry(snap: Snapshot, id: string): SnapshotEntry | undefined {
  return snap.players.find((p) => p.id === id);
}

function blendEntries(a: SnapshotEntry, b: SnapshotEntry, t: number): SnapshotEntry {
  // Avatar position: only blend when both samples are in the same space.
  const sameSpace = a.aboard === b.aboard;
  const avatar = sameSpace
    ? { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), ry: lerpAngle(a.ry, b.ry, t) }
    : { x: b.x, y: b.y, z: b.z, ry: b.ry };
  // A boat that jumped (e.g. teleported back to its slip) snaps.
  const jump = Math.hypot(a.boat.x - b.boat.x, a.boat.z - b.boat.z) > 60;
  const boat = jump
    ? b.boat
    : {
        ...b.boat,
        x: lerp(a.boat.x, b.boat.x, t),
        z: lerp(a.boat.z, b.boat.z, t),
        heading: lerpAngle(a.boat.heading, b.boat.heading, t),
        speed: lerp(a.boat.speed, b.boat.speed, t),
        throttle: lerp(a.boat.throttle, b.boat.throttle, t),
      };
  return { ...b, ...avatar, boat };
}

// The game server: serves the built client, and runs rooms over Socket.IO.
// See shared/protocol.ts for the event contract and the authority model.

import { randomBytes, randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, type Socket } from "socket.io";
import { checkPlacement, computeBoatStats, settle, type BoatNet, type Rot } from "../shared/boat";
import {
  BOT_NAMES,
  BOT_NAME_MAX,
  CHAT_HISTORY,
  CHAT_MAX,
  MAX_INVENTORY,
  MAX_PLAYERS,
  NAME_MAX,
  PLAYER_COLORS,
  PROMPT_MAX,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SLIP_COUNT,
  SNAPSHOT_HZ,
  WORLD_HALF,
} from "../shared/constants";
import { clamp, wrapAngle } from "../shared/math";
import { normalizePiece, type PieceDef } from "../shared/pieces";
import type {
  ChatKind,
  ChatMessage,
  ClientToServerEvents,
  MotionState,
  PlayerPublic,
  RoomSnapshot,
  ServerToClientEvents,
  SnapshotEntry,
} from "../shared/protocol";
import { CITIES, SLIPS, SPAWN, terrainHeight } from "../shared/world";
import { aiConfigured, aiModel } from "./ai";
import { createForge, type ForgeFn } from "./forge";
import {
  FxSchema,
  IdSchema,
  JoinSchema,
  MotionSchema,
  PlaceSchema,
  RateLimiter,
  ROOM_CODE_RE,
  TextSchema,
  VoiceSignalSchema,
  cleanText,
} from "./validate";

const MAX_ROOMS = 300;
const ROOM_TTL_MS = 30 * 60_000;
const FORGE_COOLDOWN_MS = 3000;

interface Player {
  id: string;
  /** Secret rejoin key. Never sent to anyone. */
  key: string;
  name: string;
  color: string;
  botName: string;
  slip: number;
  discoveries: string[];
  inVoice: boolean;
  docked: boolean;
  socketId: string | null;
  inventory: PieceDef[];
  boat: BoatNet;
  motion: MotionState;
  lastSeen: number;
  chatLimit: RateLimiter;
  forgeLimit: RateLimiter;
  forgeBusy: boolean;
  lastForgeAt: number;
}

interface Room {
  code: string;
  epoch: number;
  players: Map<string, Player>;
  byKey: Map<string, Player>;
  /** Every piece definition created in this room. */
  defs: Map<string, PieceDef>;
  chat: ChatMessage[];
  emptySince: number | null;
}

interface SocketData {
  roomCode?: string;
  playerId?: string;
  knownDefs: Set<string>;
  motionLimit: RateLimiter;
  fxLimit: RateLimiter;
  signalLimit: RateLimiter;
}

type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface GameServerOptions {
  /** Replace the piece generator (tests). */
  forge?: ForgeFn;
  /** Quiet logs (tests). */
  quiet?: boolean;
}

export interface GameServerHandle {
  httpServer: HttpServer;
  io: GameServer;
  close(): Promise<void>;
}

function randomId(prefix: string, bytes = 6): string {
  return prefix + randomBytes(bytes).toString("base64url");
}

function slipMotion(slip: number): MotionState["boat"] {
  const s = SLIPS[slip] ?? SLIPS[0];
  return { x: s.x, z: s.z, heading: s.heading, speed: 0, sailsUp: false, throttle: 0 };
}

function spawnMotion(slip: number): MotionState {
  const x = SPAWN.x + randomInt(-30, 31) / 10;
  const z = SPAWN.z + randomInt(-30, 31) / 10;
  return { x, y: Math.max(0, terrainHeight(x, z)), z, ry: 0, mode: "walk", aboard: null, moving: false, boat: slipMotion(slip) };
}

function publicOf(p: Player): PlayerPublic {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    botName: p.botName,
    slip: p.slip,
    discoveries: [...p.discoveries],
    inVoice: p.inVoice,
    docked: p.docked,
  };
}

/** Where a player's boat is, honouring the docked state. */
function boatMotionOf(p: Player): MotionState["boat"] {
  return p.docked ? slipMotion(p.slip) : p.motion.boat;
}

function entryOf(p: Player): SnapshotEntry {
  return { id: p.id, ...p.motion, boat: boatMotionOf(p) };
}

function resolveClientDir(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Bundled: dist/server/index.js -> dist/client. Source: server/app.ts -> dist/client.
  for (const dir of [path.resolve(here, "../client"), path.resolve(here, "../dist/client")]) {
    if (existsSync(path.join(dir, "index.html")) && existsSync(path.join(dir, "assets"))) return dir;
  }
  return null;
}

function iceServers(): { urls: string | string[]; username?: string; credential?: string }[] {
  const servers: { urls: string | string[]; username?: string; credential?: string }[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  const turn = process.env.TURN_URL?.split(",").map((u) => u.trim()).filter(Boolean);
  if (turn?.length) {
    servers.push({ urls: turn, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
  return servers;
}

export function createGameServer(opts: GameServerOptions = {}): GameServerHandle {
  const forge = opts.forge ?? createForge();
  const log = opts.quiet ? () => {} : (...args: unknown[]) => console.log(new Date().toISOString(), ...args);
  const rooms = new Map<string, Room>();

  // ---------------------------------------------------------------- HTTP
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "microphone=(self), camera=()");
    next();
  });
  app.get("/healthz", (_req, res) => {
    res.type("text/plain").send("ok");
  });
  app.get("/api/config", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ iceServers: iceServers(), ai: { enabled: aiConfigured(), model: aiConfigured() ? aiModel() : null } });
  });
  const clientDir = resolveClientDir();
  if (clientDir) {
    const indexHtml = path.join(clientDir, "index.html");
    app.use("/assets", express.static(path.join(clientDir, "assets"), { immutable: true, maxAge: "365d", fallthrough: false }));
    app.use(express.static(clientDir, { index: false, maxAge: "1h" }));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api/") || req.path.startsWith("/socket.io")) return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(indexHtml);
    });
  }

  const httpServer = createServer(app);
  const io: GameServer = new Server(httpServer, {
    maxHttpBufferSize: 64_000,
    pingTimeout: 20_000,
    serveClient: false,
  });

  // --------------------------------------------------------------- Rooms
  function uniqueRoomCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!rooms.has(code)) return code;
    }
  }

  function createRoom(code: string): Room {
    const room: Room = {
      code,
      epoch: Date.now(),
      players: new Map(),
      byKey: new Map(),
      defs: new Map(),
      chat: [],
      emptySince: null,
    };
    rooms.set(code, room);
    log(`[room ${code}] created (${rooms.size} rooms)`);
    return room;
  }

  const lookupIn = (room: Room) => (id: string) => room.defs.get(id);

  function onlinePlayers(room: Room): Player[] {
    return [...room.players.values()].filter((p) => p.socketId !== null);
  }

  function socketOf(p: Player): GameSocket | undefined {
    return p.socketId ? io.sockets.sockets.get(p.socketId) : undefined;
  }

  function contextOf(socket: GameSocket): { room: Room; player: Player } | null {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return null;
    const room = rooms.get(roomCode);
    const player = room?.players.get(playerId);
    if (!room || !player || player.socketId !== socket.id) return null;
    return { room, player };
  }

  function pushChat(room: Room, from: Player | null, text: string, kind: ChatKind): void {
    const msg: ChatMessage = {
      id: randomId("m", 5),
      from: from?.id ?? null,
      name: from?.name ?? "",
      color: from?.color ?? "#adb5bd",
      text,
      t: Date.now(),
      kind,
    };
    room.chat.push(msg);
    if (room.chat.length > CHAT_HISTORY) room.chat.splice(0, room.chat.length - CHAT_HISTORY);
    io.to(room.code).emit("chat", msg);
  }

  /** Definitions used on a boat that this socket doesn't have yet (marks them known). */
  function unknownDefs(room: Room, owner: Player, known: Set<string>): PieceDef[] {
    const out: PieceDef[] = [];
    for (const piece of owner.boat.pieces) {
      if (known.has(piece.defId)) continue;
      const def = room.defs.get(piece.defId);
      if (!def) continue;
      known.add(def.id);
      out.push(def);
    }
    return out;
  }

  function broadcastBoat(room: Room, owner: Player, exceptSocketId?: string): void {
    for (const member of onlinePlayers(room)) {
      const sock = socketOf(member);
      if (!sock || sock.id === exceptSocketId) continue;
      sock.emit("boat:update", { ownerId: owner.id, boat: owner.boat, defs: unknownDefs(room, owner, sock.data.knownDefs) });
    }
  }

  function broadcastPlayer(room: Room, p: Player): void {
    io.to(room.code).emit("player:update", publicOf(p));
  }

  function freeSlip(room: Room, self: Player | null): number {
    const used = new Set(onlinePlayers(room).filter((p) => p !== self).map((p) => p.slip));
    for (let i = 0; i < SLIP_COUNT; i++) if (!used.has(i)) return i;
    return 0;
  }

  function pickColor(room: Room, wanted: string, self: Player | null): string {
    const used = new Set(onlinePlayers(room).filter((p) => p !== self).map((p) => p.color));
    if ((PLAYER_COLORS as readonly string[]).includes(wanted)) return wanted;
    return PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[0];
  }

  function leaveVoice(room: Room, p: Player): void {
    if (!p.inVoice) return;
    p.inVoice = false;
    for (const other of onlinePlayers(room)) {
      if (other !== p && other.inVoice) socketOf(other)?.emit("voice:peer-left", p.id);
    }
  }

  function roomSnapshot(room: Room, known: Set<string>): RoomSnapshot {
    const online = onlinePlayers(room);
    const boats: Record<string, BoatNet> = {};
    const defs: PieceDef[] = [];
    for (const p of online) {
      boats[p.id] = p.boat;
      defs.push(...unknownDefs(room, p, known));
    }
    return {
      code: room.code,
      epoch: room.epoch,
      serverNow: Date.now(),
      players: online.map(publicOf),
      boats,
      defs,
      motions: online.map(entryOf),
      chat: room.chat.slice(-CHAT_HISTORY),
      ai: { enabled: aiConfigured() },
    };
  }

  // ------------------------------------------------------------ Sockets
  io.on("connection", (rawSocket) => {
    const socket = rawSocket as GameSocket;
    socket.data.knownDefs = new Set();
    socket.data.motionLimit = new RateLimiter(30, 1000);
    socket.data.fxLimit = new RateLimiter(4, 1000);
    socket.data.signalLimit = new RateLimiter(80, 1000);

    socket.on("join", (raw, ack) => {
      if (typeof ack !== "function") return;
      if (socket.data.playerId) return ack({ ok: false, error: "You're already on an island." });
      const parsed = JoinSchema.safeParse(raw);
      if (!parsed.success) return ack({ ok: false, error: "That join request didn't make sense." });
      const req = parsed.data;

      let code: string | null = null;
      if (req.room !== null && req.room.trim() !== "") {
        code = req.room.trim().toUpperCase();
        if (!ROOM_CODE_RE.test(code)) {
          return ack({ ok: false, error: `Island codes are ${ROOM_CODE_LENGTH} letters or numbers.` });
        }
      }
      let room = code ? rooms.get(code) : undefined;
      if (!room) {
        if (rooms.size >= MAX_ROOMS) return ack({ ok: false, error: "The servers are full, try again soon." });
        room = createRoom(code ?? uniqueRoomCode());
      }

      let player = room.byKey.get(req.key) ?? null;
      const othersOnline = onlinePlayers(room).filter((p) => p !== player).length;
      if (othersOnline >= MAX_PLAYERS) return ack({ ok: false, error: `This island is full (${MAX_PLAYERS} sailors).` });

      let takeover = false;
      if (player?.socketId) {
        const old = io.sockets.sockets.get(player.socketId) as GameSocket | undefined;
        if (old && old.id !== socket.id) {
          old.emit("kicked", "You joined from another tab.");
          old.data.playerId = undefined;
          old.data.roomCode = undefined;
          old.disconnect(true);
        }
        takeover = true;
        leaveVoice(room, player);
      }

      const name = cleanText(req.name, NAME_MAX) || "Sailor";
      const botName = cleanText(req.botName, BOT_NAME_MAX) || BOT_NAMES[randomInt(BOT_NAMES.length)];
      if (!player) {
        const slip = freeSlip(room, null);
        player = {
          id: randomId("u", 6),
          key: req.key,
          name,
          color: pickColor(room, req.color, null),
          botName,
          slip,
          discoveries: [],
          inVoice: false,
          docked: true,
          socketId: null,
          inventory: [],
          boat: { pieces: [], rev: 0 },
          motion: spawnMotion(slip),
          lastSeen: Date.now(),
          chatLimit: new RateLimiter(5, 5000),
          forgeLimit: new RateLimiter(40, 30 * 60_000),
          forgeBusy: false,
          lastForgeAt: 0,
        };
        room.players.set(player.id, player);
        room.byKey.set(player.key, player);
      } else {
        player.name = name;
        player.botName = botName;
        player.color = pickColor(room, req.color, player);
        if (!takeover && onlinePlayers(room).some((p) => p !== player && p.slip === player!.slip)) {
          player.slip = freeSlip(room, player);
        }
      }

      player.socketId = socket.id;
      player.lastSeen = Date.now();
      room.emptySince = null;
      socket.data.roomCode = room.code;
      socket.data.playerId = player.id;
      socket.data.knownDefs = new Set(player.inventory.map((d) => d.id));
      void socket.join(room.code);

      ack({ ok: true, you: publicOf(player), room: roomSnapshot(room, socket.data.knownDefs), inventory: player.inventory });

      if (takeover) {
        broadcastPlayer(room, player);
      } else {
        socket.to(room.code).emit("player:joined", publicOf(player), player.boat);
        broadcastBoat(room, player, socket.id);
        pushChat(room, null, `${player.name} joined the island`, "system");
      }
      log(`[room ${room.code}] ${player.name} joined (${onlinePlayers(room).length} online)`);
    });

    socket.on("disconnect", () => {
      const ctx = contextOf(socket);
      if (!ctx) return;
      const { room, player } = ctx;
      player.socketId = null;
      player.lastSeen = Date.now();
      leaveVoice(room, player);
      io.to(room.code).emit("player:left", player.id);
      pushChat(room, null, `${player.name} left`, "system");
      if (onlinePlayers(room).length === 0) room.emptySince = Date.now();
      log(`[room ${room.code}] ${player.name} left (${onlinePlayers(room).length} online)`);
    });

    socket.on("motion", (raw) => {
      const ctx = contextOf(socket);
      if (!ctx || !socket.data.motionLimit.allow()) return;
      const parsed = MotionSchema.safeParse(raw);
      if (!parsed.success) return;
      const m = parsed.data;
      const { room, player } = ctx;
      let aboard = m.aboard;
      if (aboard !== null) {
        const owner = room.players.get(aboard);
        if (!owner || owner.socketId === null) aboard = null;
      }
      const posLimit = aboard ? 40 : WORLD_HALF;
      player.motion = {
        x: clamp(m.x, -posLimit, posLimit),
        y: clamp(m.y, -50, 200),
        z: clamp(m.z, -posLimit, posLimit),
        ry: wrapAngle(m.ry),
        mode: m.mode,
        aboard,
        moving: m.moving,
        boat: {
          x: clamp(m.boat.x, -WORLD_HALF, WORLD_HALF),
          z: clamp(m.boat.z, -WORLD_HALF, WORLD_HALF),
          heading: wrapAngle(m.boat.heading),
          speed: clamp(m.boat.speed, -60, 60),
          sailsUp: m.boat.sailsUp,
          throttle: clamp(m.boat.throttle, -1, 1),
        },
      };
    });

    socket.on("chat", (raw) => {
      const ctx = contextOf(socket);
      if (!ctx) return;
      const parsed = TextSchema.safeParse(raw);
      if (!parsed.success) return;
      const text = cleanText(parsed.data, CHAT_MAX);
      if (!text || !ctx.player.chatLimit.allow()) return;
      pushChat(ctx.room, ctx.player, text, "chat");
    });

    socket.on("forge", async (raw, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const ctx = contextOf(socket);
      if (!ctx) return reply({ ok: false, error: "Join an island first." });
      const { room, player } = ctx;
      const parsed = TextSchema.safeParse(raw);
      const prompt = parsed.success ? cleanText(parsed.data, PROMPT_MAX) : "";
      if (!prompt) return reply({ ok: false, error: `Tell ${player.botName} what piece you want.` });
      if (player.forgeBusy) return reply({ ok: false, error: `${player.botName} is still building your last piece.` });
      if (Date.now() - player.lastForgeAt < FORGE_COOLDOWN_MS) {
        return reply({ ok: false, error: `Give ${player.botName} a second between pieces.` });
      }
      if (player.inventory.length >= MAX_INVENTORY) {
        return reply({ ok: false, error: "Your inventory is full. Discard a piece first." });
      }
      if (!player.forgeLimit.allow()) {
        return reply({ ok: false, error: `${player.botName} needs a break. Try again in a few minutes.` });
      }

      player.forgeBusy = true;
      player.lastForgeAt = Date.now();
      reply({ ok: true });
      socket.emit("forge:working", { prompt });
      const started = Date.now();
      try {
        const outcome = await forge(prompt, {
          botName: player.botName,
          playerName: player.name,
          recentPieces: player.inventory.slice(0, 8).map((d) => d.name),
        });
        const def = normalizePiece(outcome.result.piece, {
          id: randomId("p_", 9),
          author: player.name,
          source: outcome.source,
          createdAt: Date.now(),
        });
        room.defs.set(def.id, def);
        player.inventory.unshift(def);
        const sock = socketOf(player);
        if (sock) {
          sock.data.knownDefs.add(def.id);
          sock.emit("forge:done", { piece: def, message: outcome.result.message, source: outcome.source, prompt });
          sock.emit("inventory", player.inventory);
        }
        pushChat(room, null, `${player.name}'s ${player.botName} built ${def.name}`, "forge");
        log(`[room ${room.code}] forge ${outcome.source} "${def.name}" in ${Date.now() - started} ms`);
      } catch (err) {
        log(`[room ${room.code}] forge failed:`, err instanceof Error ? err.message : err);
        socketOf(player)?.emit("forge:failed", { prompt, error: `${player.botName} dropped the hammer. Please try again.` });
      } finally {
        player.forgeBusy = false;
      }
    });

    socket.on("inventory:discard", (raw, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const ctx = contextOf(socket);
      const parsed = IdSchema.safeParse(raw);
      if (!ctx || !parsed.success) return reply({ ok: false, error: "That piece wasn't found." });
      const { player } = ctx;
      const before = player.inventory.length;
      player.inventory = player.inventory.filter((d) => d.id !== parsed.data);
      if (player.inventory.length === before) return reply({ ok: false, error: "That piece wasn't found." });
      reply({ ok: true });
      socket.emit("inventory", player.inventory);
    });

    socket.on("boat:place", (raw, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const ctx = contextOf(socket);
      if (!ctx) return reply({ ok: false, error: "Join an island first." });
      const parsed = PlaceSchema.safeParse(raw);
      if (!parsed.success) return reply({ ok: false, error: "That placement didn't make sense." });
      const { room, player } = ctx;
      if (!player.docked) return reply({ ok: false, error: "Dock your boat at the shipyard to build." });
      const { defId, gx, gz } = parsed.data;
      const rot = parsed.data.rot as Rot;
      const def = room.defs.get(defId);
      const owned =
        def !== undefined &&
        (player.inventory.some((d) => d.id === defId) || player.boat.pieces.some((p) => p.defId === defId));
      if (!def || !owned) return reply({ ok: false, error: "You don't have that piece." });
      const lookup = lookupIn(room);
      const check = checkPlacement(player.boat.pieces, def, gx, gz, rot, lookup);
      if (!check.ok) return reply({ ok: false, error: check.reason });
      player.boat = {
        pieces: settle([...player.boat.pieces, { uid: randomId("b", 5), defId, gx, gz, rot, y: check.y }], lookup),
        rev: player.boat.rev + 1,
      };
      reply({ ok: true });
      broadcastBoat(room, player);
    });

    socket.on("boat:remove", (raw, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const ctx = contextOf(socket);
      const parsed = IdSchema.safeParse(raw);
      if (!ctx || !parsed.success) return reply({ ok: false, error: "That piece wasn't found." });
      const { room, player } = ctx;
      if (!player.docked) return reply({ ok: false, error: "Dock your boat at the shipyard to build." });
      const remaining = player.boat.pieces.filter((p) => p.uid !== parsed.data);
      if (remaining.length === player.boat.pieces.length) return reply({ ok: false, error: "That piece wasn't found." });
      player.boat = { pieces: settle(remaining, lookupIn(room)), rev: player.boat.rev + 1 };
      reply({ ok: true });
      broadcastBoat(room, player);
    });

    socket.on("boat:clear", (ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const ctx = contextOf(socket);
      if (!ctx) return reply({ ok: false, error: "Join an island first." });
      const { room, player } = ctx;
      if (!player.docked) return reply({ ok: false, error: "Dock your boat at the shipyard to build." });
      player.boat = { pieces: [], rev: player.boat.rev + 1 };
      reply({ ok: true });
      broadcastBoat(room, player);
    });

    socket.on("boat:launch", (ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const ctx = contextOf(socket);
      if (!ctx) return reply({ ok: false, error: "Join an island first." });
      const { room, player } = ctx;
      if (!player.docked) return reply({ ok: true });
      if (player.boat.pieces.length === 0) {
        return reply({ ok: false, error: "Your boat is empty! Ask your AI for a hull piece first." });
      }
      const stats = computeBoatStats(player.boat.pieces, lookupIn(room));
      if (!stats.floats) return reply({ ok: false, error: "Your boat would sink! Add more hull or float pieces." });
      player.docked = false;
      player.motion.boat = slipMotion(player.slip);
      reply({ ok: true });
      broadcastPlayer(room, player);
    });

    socket.on("boat:dock", (ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const ctx = contextOf(socket);
      if (!ctx) return reply({ ok: false, error: "Join an island first." });
      const { room, player } = ctx;
      player.docked = true;
      player.motion.boat = slipMotion(player.slip);
      reply({ ok: true });
      broadcastPlayer(room, player);
    });

    socket.on("discover", (raw) => {
      const ctx = contextOf(socket);
      const parsed = IdSchema.safeParse(raw);
      if (!ctx || !parsed.success) return;
      const { room, player } = ctx;
      const city = CITIES.find((c) => c.id === parsed.data);
      if (!city || player.discoveries.includes(city.id)) return;
      const range = city.radius * 3;
      const near = (x: number, z: number) => Math.hypot(x - city.x, z - city.z) < range;
      const m = player.motion;
      let avatarNear = false;
      if (m.aboard === null) avatarNear = near(m.x, m.z);
      else {
        const owner = room.players.get(m.aboard);
        if (owner) {
          const b = boatMotionOf(owner);
          avatarNear = near(b.x, b.z);
        }
      }
      const boat = boatMotionOf(player);
      if (!avatarNear && !near(boat.x, boat.z)) return;
      player.discoveries.push(city.id);
      broadcastPlayer(room, player);
      pushChat(room, player, `${player.name} discovered ${city.name}!`, "discovery");
    });

    socket.on("fx", (raw) => {
      const ctx = contextOf(socket);
      if (!ctx || !socket.data.fxLimit.allow()) return;
      const parsed = FxSchema.safeParse(raw);
      if (!parsed.success) return;
      const f = parsed.data;
      const len = Math.hypot(f.dx, f.dy, f.dz) || 1;
      socket.to(ctx.room.code).emit("fx", {
        kind: "cannon",
        x: clamp(f.x, -WORLD_HALF, WORLD_HALF),
        y: clamp(f.y, -50, 200),
        z: clamp(f.z, -WORLD_HALF, WORLD_HALF),
        dx: f.dx / len,
        dy: f.dy / len,
        dz: f.dz / len,
        from: ctx.player.id,
      });
    });

    socket.on("voice:join", (ack) => {
      const ctx = contextOf(socket);
      if (!ctx || typeof ack !== "function") return;
      const { room, player } = ctx;
      const peers = onlinePlayers(room).filter((p) => p !== player && p.inVoice);
      player.inVoice = true;
      ack(peers.map((p) => p.id));
      for (const peer of peers) socketOf(peer)?.emit("voice:peer-joined", player.id);
      broadcastPlayer(room, player);
    });

    socket.on("voice:leave", () => {
      const ctx = contextOf(socket);
      if (!ctx || !ctx.player.inVoice) return;
      leaveVoice(ctx.room, ctx.player);
      broadcastPlayer(ctx.room, ctx.player);
    });

    socket.on("voice:signal", (raw) => {
      const ctx = contextOf(socket);
      if (!ctx || !socket.data.signalLimit.allow()) return;
      const parsed = VoiceSignalSchema.safeParse(raw);
      if (!parsed.success) return;
      const { room, player } = ctx;
      const target = room.players.get(parsed.data.to);
      if (!target || target === player || !target.inVoice || !player.inVoice) return;
      socketOf(target)?.emit("voice:signal", { from: player.id, data: parsed.data.data });
    });
  });

  // ------------------------------------------------------------- Timers
  const snapshotTimer = setInterval(() => {
    const t = Date.now();
    for (const room of rooms.values()) {
      const online = onlinePlayers(room);
      if (online.length === 0) continue;
      io.to(room.code).volatile.emit("snapshot", { t, players: online.map(entryOf) });
    }
  }, 1000 / SNAPSHOT_HZ);

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.emptySince !== null && now - room.emptySince > ROOM_TTL_MS) {
        rooms.delete(room.code);
        log(`[room ${room.code}] deleted after being empty (${rooms.size} rooms)`);
      }
    }
  }, 60_000);

  return {
    httpServer,
    io,
    async close() {
      clearInterval(snapshotTimer);
      clearInterval(cleanupTimer);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (httpServer.listening) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

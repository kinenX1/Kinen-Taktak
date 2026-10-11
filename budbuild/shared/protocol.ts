// Socket.IO event contract between the browser and the game server.
//
// Authority model (co-op, not competitive):
//  - Each client simulates its own avatar and its own boat and sends a
//    MotionState ~12 times a second. The server validates/clamps it and
//    rebroadcasts everyone's latest state in snapshots.
//  - The server owns everything persistent: players, inventories, piece
//    definitions (only the server creates them), boat layouts, docked
//    state, discoveries and chat.

import type { BoatNet, PlacedPiece, Rot } from "./boat";
import type { PieceDef, PieceSource } from "./pieces";

export type { BoatNet, PlacedPiece, Rot } from "./boat";

export interface PlayerPublic {
  id: string;
  name: string;
  /** "#rrggbb" */
  color: string;
  /** The name of this player's personal AI builder. */
  botName: string;
  /** Shipyard slip index on the home island. */
  slip: number;
  /** City ids this player has discovered. */
  discoveries: string[];
  inVoice: boolean;
  /** Boat is moored at the slip (buildable) rather than out sailing. */
  docked: boolean;
}

/**
 * What the avatar is doing.
 *  walk      on land (or wading in the shallows)
 *  swim      in deep water
 *  build     in build mode at their own slip (avatar stands on the beach)
 *  helm      steering their own boat
 *  passenger riding on someone else's boat (or their own while not steering)
 */
export const AVATAR_MODES = ["walk", "swim", "build", "helm", "passenger"] as const;
export type AvatarMode = (typeof AVATAR_MODES)[number];

export interface BoatMotionNet {
  x: number;
  z: number;
  heading: number;
  speed: number;
  sailsUp: boolean;
  /** -1..1 */
  throttle: number;
}

export interface MotionState {
  /**
   * Avatar position. In world space, EXCEPT while `aboard` is set: then it is
   * boat-local space of that boat (so riders stay glued to the deck).
   */
  x: number;
  y: number;
  z: number;
  /** Avatar heading (world heading when not aboard, boat-local when aboard). */
  ry: number;
  mode: AvatarMode;
  /** Owner id of the boat the avatar stands on, or null. */
  aboard: string | null;
  /** True while the avatar is moving (drives the walk animation). */
  moving: boolean;
  /** This player's own boat. */
  boat: BoatMotionNet;
}

export interface SnapshotEntry extends MotionState {
  id: string;
}

export interface Snapshot {
  /** Server time (ms since the Unix epoch) when the snapshot was taken. */
  t: number;
  players: SnapshotEntry[];
}

export type ChatKind = "chat" | "system" | "forge" | "discovery";

export interface ChatMessage {
  id: string;
  /** Player id, or null for system messages. */
  from: string | null;
  name: string;
  color: string;
  text: string;
  /** Server time in ms. */
  t: number;
  kind: ChatKind;
}

export interface RoomSnapshot {
  code: string;
  /** Server time (ms) the room was created: world time = (now - epoch) / 1000. */
  epoch: number;
  /** Server time (ms) when this was sent, for clock offset. */
  serverNow: number;
  players: PlayerPublic[];
  /** Boat layout of every player in `players`, keyed by player id. */
  boats: Record<string, BoatNet>;
  /** Every piece definition used on any boat in the room. */
  defs: PieceDef[];
  motions: SnapshotEntry[];
  chat: ChatMessage[];
  ai: { enabled: boolean };
}

export interface JoinRequest {
  /** Room code to join, or null to create a new room. */
  room: string | null;
  name: string;
  color: string;
  botName: string;
  /** Random secret kept in localStorage; rejoining with it restores your boat and inventory. */
  key: string;
}

export type JoinAck =
  | { ok: true; you: PlayerPublic; room: RoomSnapshot; inventory: PieceDef[] }
  | { ok: false; error: string };

export type Ack = { ok: true } | { ok: false; error: string };

export interface PlaceRequest {
  defId: string;
  gx: number;
  gz: number;
  rot: Rot;
}

export interface ForgeDone {
  piece: PieceDef;
  /** A short friendly line from the player's AI builder. */
  message: string;
  source: PieceSource;
  prompt: string;
}

/** Visual-only effects relayed to everyone in the room. */
export interface FxEvent {
  kind: "cannon";
  /** World position and direction of the shot. */
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

/** WebRTC signalling payload, relayed verbatim between two voice peers. */
export interface VoiceSignal {
  sdp?: { type: "offer" | "answer"; sdp: string };
  candidate?: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null; usernameFragment?: string | null };
}

export interface ClientToServerEvents {
  join: (req: JoinRequest, ack: (res: JoinAck) => void) => void;
  motion: (state: MotionState) => void;
  chat: (text: string) => void;
  /** Ask your AI for a new piece. Result arrives as forge:done / forge:failed. */
  forge: (prompt: string, ack: (res: Ack) => void) => void;
  "inventory:discard": (defId: string, ack: (res: Ack) => void) => void;
  "boat:place": (req: PlaceRequest, ack: (res: Ack) => void) => void;
  "boat:remove": (uid: string, ack: (res: Ack) => void) => void;
  "boat:clear": (ack: (res: Ack) => void) => void;
  /** Leave the slip and start sailing. Refused if the boat would sink. */
  "boat:launch": (ack: (res: Ack) => void) => void;
  /** The boat is back at its slip (the client teleports it there). */
  "boat:dock": (ack: (res: Ack) => void) => void;
  discover: (cityId: string) => void;
  fx: (fx: FxEvent) => void;
  /** Join voice chat. The ack lists the ids already in voice; the joiner sends them offers. */
  "voice:join": (ack: (peers: string[]) => void) => void;
  "voice:leave": () => void;
  "voice:signal": (msg: { to: string; data: VoiceSignal }) => void;
}

export interface ServerToClientEvents {
  snapshot: (snap: Snapshot) => void;
  "player:joined": (player: PlayerPublic, boat: BoatNet) => void;
  "player:left": (id: string) => void;
  /** Name, voice, docked or discoveries changed. */
  "player:update": (player: PlayerPublic) => void;
  /** A boat changed. `defs` holds any definitions the room hasn't seen yet. */
  "boat:update": (msg: { ownerId: string; boat: BoatNet; defs: PieceDef[] }) => void;
  chat: (msg: ChatMessage) => void;
  /** Sent only to the requesting player. */
  "forge:working": (msg: { prompt: string }) => void;
  "forge:done": (msg: ForgeDone) => void;
  "forge:failed": (msg: { prompt: string; error: string }) => void;
  /** Your inventory changed (after forge or discard). Full list. */
  inventory: (defs: PieceDef[]) => void;
  fx: (msg: FxEvent & { from: string }) => void;
  "voice:peer-joined": (id: string) => void;
  "voice:peer-left": (id: string) => void;
  "voice:signal": (msg: { from: string; data: VoiceSignal }) => void;
  /** You were disconnected by the server (e.g. you joined from another tab). */
  kicked: (reason: string) => void;
}

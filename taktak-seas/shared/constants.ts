// Game-wide constants shared by the server and the browser client.

/** Boat build grid: cells across the beam (boat-local x). */
export const GRID_W = 9;
/** Boat build grid: cells along the length (boat-local z). The bow points to +z. */
export const GRID_L = 15;
/** Largest piece footprint, in cells, on either axis. */
export const MAX_FOOTPRINT = 5;
/** Tallest single piece, in metres. */
export const MAX_PIECE_HEIGHT = 10;
/** Pieces may not stack above this height (metres above the keel). */
export const MAX_BUILD_HEIGHT = 16;
/** Most primitive parts the AI may use to draw one piece. */
export const MAX_PARTS = 32;
/** Most pieces on one boat. */
export const MAX_PIECES = 150;
/** Most pieces a player can keep in their inventory. */
export const MAX_INVENTORY = 60;

export const MAX_PLAYERS = 8;
/** Shipyard slips around the home island (one per player). */
export const SLIP_COUNT = 8;
/** The map spans -WORLD_HALF..WORLD_HALF on x and z. */
export const WORLD_HALF = 1700;

/** How often clients send their motion, and the server broadcasts snapshots. */
export const NET_SEND_HZ = 12;
export const SNAPSHOT_HZ = 12;
/** Remote players are drawn this far in the past so there are always two snapshots to blend. */
export const INTERP_DELAY_MS = 150;

export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const NAME_MAX = 16;
export const BOT_NAME_MAX = 16;
export const CHAT_MAX = 240;
export const PROMPT_MAX = 300;
export const CHAT_HISTORY = 60;

/** Weight of the captain, added to every boat. */
export const CREW_MASS = 80;

export const PLAYER_COLORS = [
  "#ff6b6b",
  "#ffa94d",
  "#ffd43b",
  "#69db7c",
  "#38d9a9",
  "#4dabf7",
  "#9775fa",
  "#f783ac",
] as const;

export const BOT_NAMES = [
  "Bolt",
  "Pip",
  "Nimbus",
  "Rivet",
  "Coral",
  "Sprocket",
  "Mako",
  "Juniper",
  "Echo",
  "Tidbit",
  "Gizmo",
  "Marlin",
] as const;

// Shared types for the two piece generators: the Claude-powered AI builder
// (ai.ts) and the offline procedural workshop (workshop.ts).

export interface ForgeContext {
  /** The player's AI builder name, e.g. "Bolt". */
  botName: string;
  playerName: string;
  /** Names of the player's most recent pieces, newest first (for context). */
  recentPieces: string[];
}

export interface ForgeResult {
  /**
   * Raw piece data in the shape normalizePiece() accepts:
   * { name, description, role, width, length, power, parts: [...] }.
   * It is always passed through normalizePiece() before use.
   */
  piece: unknown;
  /** One or two friendly sentences from the AI builder. */
  message: string;
}

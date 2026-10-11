// Zod schemas for every payload a client can send. Anything that does not
// match is ignored (or answered with an error ack).

import { z } from "zod";
import { BOT_NAME_MAX, NAME_MAX, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "../shared/constants";
import { AVATAR_MODES } from "../shared/protocol";

const finite = z.number();

export const ROOM_CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export const JoinSchema = z.object({
  room: z.string().max(16).nullable(),
  name: z.string().max(NAME_MAX * 4),
  color: z.string().max(16),
  botName: z.string().max(BOT_NAME_MAX * 4),
  key: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
});

export const MotionSchema = z.object({
  x: finite,
  y: finite,
  z: finite,
  ry: finite,
  mode: z.enum(AVATAR_MODES),
  aboard: z.string().max(32).nullable(),
  moving: z.boolean(),
  boat: z.object({
    x: finite,
    z: finite,
    heading: finite,
    speed: finite,
    sailsUp: z.boolean(),
    throttle: finite,
  }),
});

export const PlaceSchema = z.object({
  defId: z.string().min(1).max(40),
  gx: z.number().int().min(0).max(64),
  gz: z.number().int().min(0).max(64),
  rot: z.number().int().min(0).max(3),
});

export const IdSchema = z.string().min(1).max(40);

export const TextSchema = z.string().max(4000);

export const FxSchema = z.object({
  kind: z.literal("cannon"),
  x: finite,
  y: finite,
  z: finite,
  dx: finite,
  dy: finite,
  dz: finite,
});

export const VoiceSignalSchema = z.object({
  to: z.string().min(1).max(32),
  data: z
    .object({
      sdp: z
        .object({
          type: z.enum(["offer", "answer"]),
          sdp: z.string().max(20000),
        })
        .optional(),
      candidate: z
        .object({
          candidate: z.string().max(2000),
          sdpMid: z.string().max(64).nullable(),
          sdpMLineIndex: z.number().int().min(0).max(64).nullable(),
          usernameFragment: z.string().max(256).nullable().optional(),
        })
        .optional(),
    })
    .refine((d) => Boolean(d.sdp) !== Boolean(d.candidate), "exactly one of sdp or candidate"),
});

/** Strips control characters, collapses whitespace and trims. */
export function cleanText(s: string, max: number): string {
  return s
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Keeps at most `limit` events per `windowMs`. Returns true when the event is
 * allowed (and records it).
 */
export class RateLimiter {
  private times: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    while (this.times.length && this.times[0] <= cutoff) this.times.shift();
    if (this.times.length >= this.limit) return false;
    this.times.push(now);
    return true;
  }

  /** How many events are recorded inside the window right now. */
  count(now = Date.now()): number {
    const cutoff = now - this.windowMs;
    return this.times.filter((t) => t > cutoff).length;
  }
}

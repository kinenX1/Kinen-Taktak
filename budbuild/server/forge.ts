// Chooses how a piece gets made: by Claude (when configured, within the
// hourly budget and concurrency limit) or by the offline workshop. Any AI
// failure falls back to the workshop so players always get a piece.

import { randomInt } from "node:crypto";
import type { PieceSource } from "../shared/pieces";
import { aiAvailable, aiPiece } from "./ai";
import type { ForgeContext, ForgeResult } from "./forgeTypes";
import { workshopPiece } from "./workshop";

export interface ForgeOutcome {
  result: ForgeResult;
  source: PieceSource;
}

export type ForgeFn = (prompt: string, ctx: ForgeContext) => Promise<ForgeOutcome>;

const AI_TIMEOUT_MS = 60_000;

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

/** A tiny counting semaphore. */
class Semaphore {
  private waiting: (() => void)[] = [];
  private active = 0;

  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.waiting.shift()?.();
    };
  }
}

export function createForge(): ForgeFn {
  const hourlyLimit = envInt("AI_HOURLY_LIMIT", 300);
  const slots = new Semaphore(envInt("AI_MAX_CONCURRENT", 4));
  const recentAiCalls: number[] = [];

  function underHourlyCap(now: number): boolean {
    while (recentAiCalls.length && recentAiCalls[0] < now - 3_600_000) recentAiCalls.shift();
    return recentAiCalls.length < hourlyLimit;
  }

  return async (prompt, ctx) => {
    let note = "";
    if (aiAvailable() && underHourlyCap(Date.now())) {
      recentAiCalls.push(Date.now());
      const release = await slots.acquire();
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), AI_TIMEOUT_MS);
      try {
        const result = await aiPiece(prompt, ctx, abort.signal);
        return { result, source: "ai" };
      } catch {
        note = "My AI circuits fizzled, so I built this one by hand: ";
      } finally {
        clearTimeout(timer);
        release();
      }
    }
    const result = workshopPiece(prompt, ctx, randomInt(0, 2 ** 31 - 1));
    return { result: { ...result, message: note + result.message }, source: "workshop" };
  };
}

import "server-only";
import { headers } from "next/headers";

/**
 * Minimal fixed-window rate limiter kept in process memory.
 * Good enough for a single instance; swap for Redis/Upstash when running
 * multiple instances behind a load balancer.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export async function clientIp() {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

export async function rateLimit(action: string, limit: number, windowMs: number) {
  const key = `${action}:${await clientIp()}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
    }
    return { ok: true as const };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false as const, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true as const };
}

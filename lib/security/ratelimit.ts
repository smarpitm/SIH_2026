// lib/security/ratelimit.ts — fixed-window rate limiting (audit findings #7, #10).
// Durable path: Redis INCR + EXPIRE, shared across instances and restarts.
// Fallback path: process-local Map, ONLY for local dev without REDIS_URL —
// lib/security/env.ts refuses production boots without REDIS_URL, and a Redis
// error at runtime logs loudly and falls back rather than taking auth down.
import { getRedis } from "@/lib/security/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/** Fixed-window counter. Call BEFORE the protected operation. */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const bucket = Math.floor(now / (windowSec * 1000));
  const r = getRedis();
  if (r) {
    try {
      const k = `rl:${key}:${bucket}`;
      const count = await r.incr(k);
      if (count === 1) await r.expire(k, windowSec + 1);
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        retryAfterSec: windowSec,
      };
    } catch (err) {
      console.error("[ratelimit] redis unavailable, using process-local fallback:", err);
    }
  }
  return memoryLimit(key, limit, windowSec, bucket, now);
}

const memory = new Map<string, { count: number; resetAt: number }>();

function memoryLimit(
  key: string,
  limit: number,
  windowSec: number,
  bucket: number,
  now: number
): RateLimitResult {
  const k = `${key}:${bucket}`;
  const cur = memory.get(k) ?? { count: 0, resetAt: (bucket + 1) * windowSec * 1000 };
  cur.count += 1;
  memory.set(k, cur);
  if (memory.size > 10_000) {
    memory.forEach((v, kk) => {
      if (v.resetAt < now) memory.delete(kk);
    });
  }
  return {
    allowed: cur.count <= limit,
    remaining: Math.max(0, limit - cur.count),
    retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)),
  };
}

/** Client IP for rate-limit keys. `x-forwarded-for` is consumed ONLY when the
 *  deployment explicitly sits behind a trusted proxy (audit finding #7) —
 *  otherwise a direct client can spoof it and rotate the key. Unknown clients
 *  share the "local" bucket, which is correct for a single-host demo. */
export function clientIp(req: Request): string {
  if (process.env.TRUST_PROXY === "true") {
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) {
      const first = fwd.split(",")[0].trim();
      if (first) return first;
    }
  }
  return "local";
}

// lib/security/redis.ts — ONE lazy shared ioredis client for the durable
// rate-limiter and the public stats cache (previously each module created its
// own). Null when REDIS_URL is unset (local dev without redis). Callers must
// treat redis errors as degradable — never crash the request path on them.
import Redis from "ioredis";

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });
    redis.on("error", (err) => console.error("[redis] connection error:", err.message));
  }
  return redis;
}

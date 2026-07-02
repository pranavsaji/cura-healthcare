import type { Redis } from "ioredis";

/**
 * Fixed-window rate limiter behind a swappable interface (CONVENTIONS §2): a
 * Redis-backed impl for multi-replica prod and an in-memory impl for dev/tests.
 * Keyed per org+user (or IP pre-auth) by the caller. Returns a decision plus the
 * headers the gateway surfaces (`X-RateLimit-*`).
 */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
}

export interface RateLimiter {
  /** Count one hit against `key`; decide if it is within `limit` per `windowMs`. */
  hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
  /** Release any resources (Redis connection). */
  close?(): Promise<void>;
}

/**
 * In-memory fixed-window counters. Correct for a single replica; dev/test only
 * (a second replica would not share state — use {@link RedisRateLimiter} in prod).
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const nowMs = this.now();
    const existing = this.windows.get(key);
    let window = existing;
    if (!window || window.resetAt <= nowMs) {
      window = { count: 0, resetAt: nowMs + windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    const remaining = Math.max(0, limit - window.count);
    return { allowed: window.count <= limit, limit, remaining, resetAt: window.resetAt };
  }
}

/**
 * Redis-backed fixed-window limiter: `INCR` + `PEXPIRE` on first hit. Shared
 * across replicas so a horizontally-scaled gateway enforces one global limit.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: Redis) {}

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const redisKey = `rl:${key}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) {
      await this.redis.pexpire(redisKey, windowMs);
    }
    const ttl = await this.redis.pttl(redisKey);
    const resetAt = Date.now() + (ttl >= 0 ? ttl : windowMs);
    const remaining = Math.max(0, limit - count);
    return { allowed: count <= limit, limit, remaining, resetAt };
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

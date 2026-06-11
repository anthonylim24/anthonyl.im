import type { MiddlewareHandler } from "hono";

interface RateLimitOpts {
  windowMs: number;
  max: number;
  keyPrefix: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

function pruneIfNeeded(now: number) {
  if (store.size < 1000) return;
  for (const [k, v] of store) {
    if (v.resetAt < now) store.delete(k);
  }
}

export function createRateLimit(opts: RateLimitOpts): MiddlewareHandler {
  const { windowMs, max, keyPrefix } = opts;

  return async (c, next) => {
    // Idempotency guard: skip if this prefix was already counted for this request
    const guardKey = `rateLimited:${keyPrefix}`;
    if (c.get(guardKey as any)) {
      return next();
    }
    c.set(guardKey as any, true);

    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    pruneIfNeeded(now);

    let bucket = store.get(key);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + windowMs };
      store.set(key, bucket);
    }

    bucket.count++;

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "rate_limited" }, 429);
    }

    return next();
  };
}

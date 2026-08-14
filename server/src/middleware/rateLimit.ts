import { createHash } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";

interface RateLimitOpts {
  windowMs: number;
  max: number;
  keyPrefix: string;
  /** Override the bucket key. Default is the caller-controlled first X-Forwarded-For hop. */
  key?: (c: Context) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export type RateLimitConsume =
  | { ok: true }
  | { ok: false; retryAfter: number };

const store = new Map<string, Bucket>();

function pruneIfNeeded(now: number) {
  if (store.size < 1000) return;
  for (const [k, v] of store) {
    if (v.resetAt < now) store.delete(k);
  }
}

export function consumeRateLimit(
  key: string,
  opts: { windowMs: number; max: number },
): RateLimitConsume {
  const now = Date.now();
  pruneIfNeeded(now);

  let bucket = store.get(key);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
    store.set(key, bucket);
  }

  bucket.count++;

  if (bucket.count > opts.max) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true };
}

/**
 * Connecting peer as appended by a reverse proxy (`$proxy_add_x_forwarded_for`
 * puts `$remote_addr` last). Never use the first X-Forwarded-For value — that
 * hop is caller-controlled.
 */
export function trustedProxyClientAddress(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }
  const realIp = c.req.header("x-real-ip")?.trim();
  return realIp || "unknown";
}

export function hashedIdentityKey(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

export function createRateLimit(opts: RateLimitOpts): MiddlewareHandler {
  const { windowMs, max, keyPrefix, key: keyFn } = opts;

  return async (c, next) => {
    // Idempotency guard: skip if this prefix was already counted for this request
    const guardKey = `rateLimited:${keyPrefix}`;
    if (c.get(guardKey as never)) {
      return next();
    }
    c.set(guardKey as never, true);

    const ip = keyFn
      ? keyFn(c)
      : (c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown");
    const consumed = consumeRateLimit(`${keyPrefix}:${ip}`, { windowMs, max });

    if (!consumed.ok) {
      c.header("Retry-After", String(consumed.retryAfter));
      return c.json({ error: "rate_limited" }, 429);
    }

    return next();
  };
}

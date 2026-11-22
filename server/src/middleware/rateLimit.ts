import { createHash } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";

interface RateLimitOpts {
  windowMs: number;
  max: number;
  keyPrefix: string;
  /** Override the bucket key. Default is the client address (`trustedProxyClientAddress`). */
  key?: (c: Context) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export type RateLimitConsume =
  | { ok: true }
  | { ok: false; retryAfter: number };

/**
 * Memory bound. One bucket is ~100 bytes, so the cap is about 1 MB on a 1 GB
 * droplet. Past it the oldest bucket is evicted, which forgets one caller's
 * count rather than letting a flood of fresh keys grow the map without limit.
 */
export const MAX_BUCKETS = 10_000;
/** Expired buckets are swept at most this often, never on every request. */
const SWEEP_INTERVAL_MS = 30_000;

const store = new Map<string, Bucket>();
let nextSweepAt = 0;

function sweep(now: number) {
  if (now >= nextSweepAt) {
    nextSweepAt = now + SWEEP_INTERVAL_MS;
    for (const [k, v] of store) {
      if (v.resetAt < now) store.delete(k);
    }
  }
  // Map iteration is insertion order, and a bucket is re-inserted when its
  // window resets, so the first key is the stalest.
  while (store.size >= MAX_BUCKETS) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function consumeRateLimit(
  key: string,
  opts: { windowMs: number; max: number },
): RateLimitConsume {
  const now = Date.now();

  let bucket = store.get(key);
  if (!bucket || bucket.resetAt < now) {
    if (bucket) store.delete(key);
    sweep(now);
    bucket = { count: 0, resetAt: now + opts.windowMs };
    store.set(key, bucket);
  }

  bucket.count++;

  if (bucket.count > opts.max) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true };
}

/** Test seam: bucket count and a clean slate. */
export const rateLimitStore = {
  size: () => store.size,
  clear: () => {
    store.clear();
    nextSweepAt = 0;
  },
};

/**
 * The caller's address as our own proxies saw it. Production is
 * Cloudflare → nginx → Bun: Cloudflare sets `CF-Connecting-IP` (a client
 * cannot override it) and appends the peer to `X-Forwarded-For`; nginx
 * appends the peer it saw (`$proxy_add_x_forwarded_for`) and sets
 * `X-Real-IP`. Never use the first X-Forwarded-For value — that hop is
 * whatever the caller sent.
 */
export function trustedProxyClientAddress(c: Context): string {
  const cf = c.req.header("cf-connecting-ip")?.trim();
  if (cf) return cf;
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

/**
 * The signed-in user when an auth middleware ran first (`c.get("userId")`),
 * else the client address. Users behind one NAT or office IP then get a
 * bucket each.
 */
export function userOrClientKey(c: Context): string {
  const userId = c.get("userId" as never) as string | undefined;
  return userId ? `user:${userId}` : `ip:${trustedProxyClientAddress(c)}`;
}

export function hashedIdentityKey(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

/**
 * `RATE_LIMITS=off` turns every limiter off on a local or e2e stack, where
 * one dev user drives many tests at once. Production ignores it.
 */
export function rateLimitsOff(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RATE_LIMITS === "off" && env.NODE_ENV !== "production";
}

export function createRateLimit(opts: RateLimitOpts): MiddlewareHandler {
  const { windowMs, max, keyPrefix, key: keyFn = trustedProxyClientAddress } = opts;
  if (rateLimitsOff()) return (_c, next) => next();

  return async (c, next) => {
    // Idempotency guard: skip if this prefix was already counted for this request
    const guardKey = `rateLimited:${keyPrefix}`;
    if (c.get(guardKey as never)) {
      return next();
    }
    c.set(guardKey as never, true);

    const consumed = consumeRateLimit(`${keyPrefix}:${keyFn(c)}`, { windowMs, max });

    if (!consumed.ok) {
      c.header("Retry-After", String(consumed.retryAfter));
      return c.json({ error: "rate_limited" }, 429);
    }

    return next();
  };
}

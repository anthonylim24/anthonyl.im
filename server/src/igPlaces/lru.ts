// Tiny in-process LRU + TTL cache. Used to memoize deterministic-ish
// network lookups (geocoding) and short-lived Supabase reads (day-saves
// during Map Mode polling). No external dependency — JS Map preserves
// insertion order so eviction is `next iterator value`.

export interface LRUOptions {
  /** Hard cap on entry count. Oldest insertion is evicted when exceeded. */
  max: number;
  /** Max age of an entry, in ms. Entries past this age are treated as misses
   *  and lazily evicted on read. */
  ttlMs: number;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class LRU<K, V> {
  private readonly max: number;
  private readonly ttlMs: number;
  private readonly store = new Map<K, Entry<V>>();

  constructor(opts: LRUOptions) {
    this.max = opts.max;
    this.ttlMs = opts.ttlMs;
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Bump recency: re-insert moves to the end of the iteration order.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    this.store.delete(key); // refresh recency
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    if (this.store.size > this.max) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  /** For tests / observability. */
  get size(): number {
    return this.store.size;
  }
}

/** Wrap an async function with an LRU cache keyed by a custom key function.
 *  Both successful results and `null` misses are cached — null gets a
 *  shorter TTL so transient errors are reattempted sooner. */
export function memoLRU<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  opts: {
    keyFn: (...args: Args) => string;
    /** Cap on successful-result cache entries. */
    max: number;
    /** TTL for non-null results. */
    ttlMs: number;
    /** TTL for null results (default 1/10 of ttlMs, min 1 minute). */
    nullTtlMs?: number;
  },
): (...args: Args) => Promise<R> {
  const hit = new LRU<string, R>({ max: opts.max, ttlMs: opts.ttlMs });
  const miss = new LRU<string, R>({
    max: Math.max(50, Math.floor(opts.max / 4)),
    ttlMs: opts.nullTtlMs ?? Math.max(60_000, Math.floor(opts.ttlMs / 10)),
  });
  return async (...args: Args): Promise<R> => {
    const key = opts.keyFn(...args);
    const cached = hit.get(key) ?? miss.get(key);
    if (cached !== undefined) return cached;
    const result = await fn(...args);
    if (result === null || result === undefined) {
      miss.set(key, result);
    } else {
      hit.set(key, result);
    }
    return result;
  };
}

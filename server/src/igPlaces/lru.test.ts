import { test, expect, describe } from 'bun:test';
import { LRU, memoLRU } from './lru';

describe('LRU', () => {
  test('get returns undefined for missing keys', () => {
    const lru = new LRU<string, number>({ max: 10, ttlMs: 1000 });
    expect(lru.get('missing')).toBeUndefined();
  });

  test('set + get round-trip', () => {
    const lru = new LRU<string, number>({ max: 10, ttlMs: 1000 });
    lru.set('a', 1);
    expect(lru.get('a')).toBe(1);
  });

  test('evicts oldest when over max', () => {
    const lru = new LRU<string, number>({ max: 2, ttlMs: 60_000 });
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);
    expect(lru.get('a')).toBeUndefined();
    expect(lru.get('b')).toBe(2);
    expect(lru.get('c')).toBe(3);
  });

  test('accessing key bumps recency', () => {
    const lru = new LRU<string, number>({ max: 2, ttlMs: 60_000 });
    lru.set('a', 1);
    lru.set('b', 2);
    lru.get('a'); // bump
    lru.set('c', 3); // should evict b, not a
    expect(lru.get('a')).toBe(1);
    expect(lru.get('b')).toBeUndefined();
  });

  test('returns undefined after ttl expires', async () => {
    const lru = new LRU<string, number>({ max: 10, ttlMs: 50 });
    lru.set('a', 1);
    await new Promise((r) => setTimeout(r, 75));
    expect(lru.get('a')).toBeUndefined();
  });

  test('delete removes key', () => {
    const lru = new LRU<string, number>({ max: 10, ttlMs: 1000 });
    lru.set('a', 1);
    lru.delete('a');
    expect(lru.get('a')).toBeUndefined();
  });
});

describe('memoLRU', () => {
  test('caches non-null results', async () => {
    let calls = 0;
    const fn = async (key: string) => { calls++; return `result:${key}`; };
    const memo = memoLRU(fn, { keyFn: (k) => k, max: 10, ttlMs: 1000 });
    await memo('a');
    await memo('a');
    await memo('a');
    expect(calls).toBe(1);
  });

  test('caches null misses with shorter TTL', async () => {
    let calls = 0;
    const fn = async () => { calls++; return null; };
    const memo = memoLRU(fn, { keyFn: () => 'k', max: 10, ttlMs: 10_000 });
    await memo();
    await memo();
    expect(calls).toBe(1); // 2nd call hit the null cache
  });

  test('different keys cache independently', async () => {
    let calls = 0;
    const fn = async (k: string) => { calls++; return k; };
    const memo = memoLRU(fn, { keyFn: (k) => k, max: 10, ttlMs: 1000 });
    await memo('a');
    await memo('b');
    await memo('a');
    expect(calls).toBe(2);
  });
});

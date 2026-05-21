// server/src/igPlaces/savePlaces.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createSavePlaces, upsertPostFactory } from './savePlaces';
import type { EnrichedPlace, PostPayload } from './types';

const payload: PostPayload = {
  shortcode: 'A', caption: 'C', mediaItems: [{ type: 'image', url: 'i.jpg' }],
  source: 'bright-data', raw: { x: 1 },
};
const place = (over: Partial<EnrichedPlace> = {}): EnrichedPlace => ({
  name: '어니언', name_romanized: 'Onion', city: 'Seoul', category: 'cafe',
  confidence: 0.9, is_subject: true, supporting_quote: 'q',
  signal_source: 'caption', vote_count: 3, confidence_band: 'high',
  address: 'A', lat: 37.5, lng: 127, google_place_id: 'GP',
  phone: null, rating: 4.6, business_types: ['cafe'],
  geocode_source: 'google', geocode_kakao_id: null, geocode_disagree: false,
  ...over,
});

describe('upsertPost', () => {
  test('inserts a new post row, returns id', async () => {
    const insert = mock(async () => [{ id: 42 }]);
    const sb: any = { insert };
    const upsert = upsertPostFactory(sb);
    const id = await upsert('dedupe-A', 'https://i', payload, undefined, undefined);
    expect(id).toBe(42);
    expect((insert.mock.calls[0] as any[])[0]).toBe('instagram_posts');
    expect((insert.mock.calls[0] as any[])[2]).toEqual(
      { onConflict: 'dedupe_key', returning: 'representation' },
    );
  });
});

describe('savePlaces', () => {
  test('inserts each place row scoped to user_id + post_id', async () => {
    const insert = mock(async () => [{ id: 1 }]);
    const sb: any = { insert };
    const save = createSavePlaces(sb);
    await save(99, 'user-1', [place(), place({ name: '광장시장', category: 'other' })]);
    expect(insert).toHaveBeenCalledTimes(2);
    const firstArgs = (insert.mock.calls[0] as any[])[1];
    expect(firstArgs.user_id).toBe('user-1');
    expect(firstArgs.post_id).toBe(99);
  });

  test('one row with an invalid enum (22P02) does NOT drop the rest', async () => {
    // Simulate Postgres rejecting the bad-enum row while accepting the
    // other two. Without the recoverable-error path this used to throw
    // and lose every successful insert in the batch.
    const insert = mock(async (_table: string, row: any) => {
      if (row.name === 'BAD') {
        throw new Error('invalid input value for enum ig_place_category: "bakery" (22P02)');
      }
      return [{ id: 1 }];
    });
    const sb: any = { insert };
    const save = createSavePlaces(sb);
    await save(99, 'user-1', [
      place({ name: 'OK1' }),
      place({ name: 'BAD' }),
      place({ name: 'OK2' }),
    ]);
    expect(insert).toHaveBeenCalledTimes(3);
    // No throw, no rejection — the two good rows are persisted.
  });

  test('throws only when EVERY row fails with a non-recoverable error', async () => {
    const insert = mock(async () => {
      throw new Error('Supabase 500 — unrecoverable');
    });
    const sb: any = { insert };
    const save = createSavePlaces(sb);
    let caught: unknown;
    try {
      await save(99, 'user-1', [place({ name: 'X' }), place({ name: 'Y' })]);
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(Error);
  });

  test('duplicate (23505) row is treated as success', async () => {
    const insert = mock(async (_t: string, row: any) => {
      if (row.name === 'DUPE') {
        throw new Error('duplicate key value violates unique constraint (23505)');
      }
      return [{ id: 1 }];
    });
    const sb: any = { insert };
    const save = createSavePlaces(sb);
    await save(99, 'user-1', [place({ name: 'OK' }), place({ name: 'DUPE' })]);
    expect(insert).toHaveBeenCalledTimes(2);
  });
});

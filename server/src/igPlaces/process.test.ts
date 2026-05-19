// server/src/igPlaces/process.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createProcessor } from './process';
import type { PostPayload, VotedPlace, EnrichedPlace } from './types';

const payload: PostPayload = {
  shortcode: 'A', caption: 'cap', mediaItems: [{ type: 'image', url: 'i.jpg' }],
  source: 'apify', raw: {},
};
const voted: VotedPlace = {
  name: '어니언', name_romanized: 'Onion', city: 'Seoul', category: 'cafe',
  confidence: 0.9, is_subject: true, supporting_quote: 'cap', signal_source: 'caption',
  vote_count: 3, confidence_band: 'high',
};
const enriched: EnrichedPlace = {
  ...voted, address: 'A', lat: 37.5, lng: 127, google_place_id: null, phone: null,
  rating: null, business_types: [], geocode_source: 'google', geocode_kakao_id: null,
  geocode_disagree: false,
};

describe('process', () => {
  test('happy path: fetch → bundle → extract → enrich → save → complete', async () => {
    const fetchPost = mock(async () => payload);
    const upsertPost = mock(async () => 99);
    const buildBundle = mock(async () => ({ caption: 'cap', hashtags: [], mentions: [] }));
    const extract = mock(async () => [voted]);
    const geocode = mock(async () => enriched);
    const savePlaces = mock(async () => undefined);
    const complete = mock(async () => undefined);
    const fail = mock(async () => undefined);

    const proc = createProcessor({
      fetchPost, upsertPost, buildBundle, extract, geocode, savePlaces, complete, fail,
    });
    await proc({ id: 1, userId: 'u', url: 'https://i', dedupeKey: 'd' } as any);

    expect(fetchPost).toHaveBeenCalled();
    expect(upsertPost).toHaveBeenCalled();
    expect(savePlaces).toHaveBeenCalledWith(99, 'u', [enriched]);
    expect(complete).toHaveBeenCalledWith(1, 99);
    expect(fail).not.toHaveBeenCalled();
  });

  test('error path: fail invoked with retryable=true on generic error', async () => {
    const fail = mock(async () => undefined);
    const proc = createProcessor({
      fetchPost: mock(async () => { throw new Error('network'); }),
      upsertPost: mock(async () => 0),
      buildBundle: mock(async () => ({} as any)),
      extract: mock(async () => []),
      geocode: mock(async () => ({} as any)),
      savePlaces: mock(async () => undefined),
      complete: mock(async () => undefined),
      fail,
    });
    await proc({ id: 1, userId: 'u', url: 'x', dedupeKey: 'd' } as any);
    expect(fail).toHaveBeenCalledWith(1, expect.any(Error), true);
  });
});

// server/src/igPlaces/process.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createProcessor } from './process';
import type { PostPayload, VotedPlace, EnrichedPlace } from './types';
import type { IgComment } from './fetchComments';

const payload: PostPayload = {
  shortcode: 'A', caption: 'cap', mediaItems: [{ type: 'image', url: 'i.jpg' }],
  source: 'bright-data', raw: {},
};
const voted: VotedPlace = {
  name: '어니언', name_romanized: 'Onion', city: 'Seoul', category: 'cafe',
  confidence: 0.9, is_subject: true, supporting_quote: 'cap', signal_source: 'caption',
  vote_count: 3, confidence_band: 'high',
};
const enriched: EnrichedPlace = {
  ...voted, address: 'A', lat: 37.5, lng: 127, google_place_id: null, phone: null,
  rating: null, business_types: [], geocode_source: 'google', geocode_kakao_id: null,
  geocode_disagree: false, busyness: null, busyness_source: null, busyness_confidence: null,
};

describe('process', () => {
  test('happy path: fetch → bundle → extract → enrich → save → complete', async () => {
    const stepLog: string[] = [];
    const fetchPost = mock(async () => payload);
    const upsertPost = mock(async () => 99);
    const buildBundle = mock(async () => ({ caption: 'cap', hashtags: [], mentions: [] }));
    const extract = mock(async () => [voted]);
    const geocode = mock(async () => enriched);
    const savePlaces = mock(async () => undefined);
    const complete = mock(async () => undefined);
    const fail = mock(async () => undefined);
    const setStep = mock(async (_id: number, step: string) => { stepLog.push(step); });
    const log = mock(async () => undefined);

    const proc = createProcessor({
      fetchPost, upsertPost, buildBundle, extract, geocode, savePlaces, complete, fail, setStep, log,
    });
    await proc({ id: 1, userId: 'u', url: 'https://i', dedupeKey: 'd' } as any);

    expect(fetchPost).toHaveBeenCalled();
    expect(upsertPost).toHaveBeenCalled();
    expect(savePlaces).toHaveBeenCalledWith(99, 'u', [enriched]);
    expect(complete).toHaveBeenCalledWith(1, 99);
    expect(fail).not.toHaveBeenCalled();
    expect(stepLog).toEqual(['fetching', 'bundling', 'extracting', 'geocoding', 'saving']);
    expect(log).toHaveBeenCalled();
  });

  test('error path: fail invoked with retryable=true on generic error', async () => {
    const fail = mock(async () => undefined);
    const log = mock(async () => undefined);
    const proc = createProcessor({
      fetchPost: mock(async () => { throw new Error('network'); }),
      upsertPost: mock(async () => 0),
      buildBundle: mock(async () => ({} as any)),
      extract: mock(async () => []),
      geocode: mock(async () => ({} as any)),
      savePlaces: mock(async () => undefined),
      complete: mock(async () => undefined),
      fail,
      setStep: mock(async () => undefined),
      log,
    });
    await proc({ id: 1, userId: 'u', url: 'x', dedupeKey: 'd' } as any);
    expect(fail).toHaveBeenCalledWith(1, expect.any(Error), true);
    // error log should have been emitted
    expect(log).toHaveBeenCalledWith(1, 'fetching', 'error', 'network');
  });

  test('NonRetryableError → fail called with retryable=false', async () => {
    const fail = mock(async () => undefined);
    const log = mock(async () => undefined);
    const proc = createProcessor({
      fetchPost: mock(async () => { throw new (await import('./types')).NonRetryableError('bad url'); }),
      upsertPost: mock(async () => 0),
      buildBundle: mock(async () => ({} as any)),
      extract: mock(async () => []),
      geocode: mock(async () => ({} as any)),
      savePlaces: mock(async () => undefined),
      complete: mock(async () => undefined),
      fail,
      setStep: mock(async () => undefined),
      log,
    });
    await proc({ id: 1, userId: 'u', url: 'x', dedupeKey: 'd' } as any);
    expect(fail).toHaveBeenCalledWith(1, expect.any(Error), false);
  });

  test('comment fallback: fetchComments called when primary extract returns []', async () => {
    const payloadWithUrl: PostPayload = {
      ...payload,
      url: 'https://www.instagram.com/p/DX0KioDtDz_/',
    };
    const comments: IgComment[] = [
      { id: '1', text: 'Food section at the basement of Hyundai dept store (Gangnam) was a solid 10/10 too', ownerUsername: 'user1', likesCount: 160 },
    ];
    const fetchComments = mock(async () => comments);
    // First extract returns [], second returns the voted place
    let extractCallCount = 0;
    const extract = mock(async () => {
      extractCallCount++;
      return extractCallCount === 1 ? [] : [voted];
    });
    const geocode = mock(async () => enriched);
    const savePlaces = mock(async () => undefined);
    const complete = mock(async () => undefined);
    const fail = mock(async () => undefined);
    const log = mock(async () => undefined);

    const proc = createProcessor({
      fetchPost: mock(async () => payloadWithUrl),
      upsertPost: mock(async () => 99),
      buildBundle: mock(async () => ({ caption: 'cap', hashtags: [], mentions: [] })),
      extract,
      geocode,
      savePlaces,
      complete,
      fail,
      setStep: mock(async () => undefined),
      log,
      fetchComments,
    });
    await proc({ id: 1, userId: 'u', url: payloadWithUrl.url!, dedupeKey: 'd' } as any);

    // fetchComments must have been called with the post URL
    expect(fetchComments).toHaveBeenCalledWith(
      'https://www.instagram.com/p/DX0KioDtDz_/',
      expect.objectContaining({ limit: 50 }),
    );
    // extract called twice: once for primary, once for comment-enriched bundle
    expect(extract).toHaveBeenCalledTimes(2);
    // Final result: the comment-path voted place was saved
    expect(savePlaces).toHaveBeenCalledWith(99, 'u', [enriched]);
    expect(complete).toHaveBeenCalledWith(1, 99);
    expect(fail).not.toHaveBeenCalled();
  });

  test('comment fallback: skipped when primary extract returns results', async () => {
    const payloadWithUrl: PostPayload = {
      ...payload,
      url: 'https://www.instagram.com/p/abc/',
    };
    const fetchComments = mock(async () => []);
    const extract = mock(async () => [voted]);
    const proc = createProcessor({
      fetchPost: mock(async () => payloadWithUrl),
      upsertPost: mock(async () => 99),
      buildBundle: mock(async () => ({ caption: 'cap', hashtags: [], mentions: [] })),
      extract,
      geocode: mock(async () => enriched),
      savePlaces: mock(async () => undefined),
      complete: mock(async () => undefined),
      fail: mock(async () => undefined),
      setStep: mock(async () => undefined),
      log: mock(async () => undefined),
      fetchComments,
    });
    await proc({ id: 1, userId: 'u', url: 'https://www.instagram.com/p/abc/', dedupeKey: 'd' } as any);
    // fetchComments should NOT be called since primary extract succeeded
    expect(fetchComments).not.toHaveBeenCalled();
    expect(extract).toHaveBeenCalledTimes(1);
  });

  test('comment fallback: skipped when no fetchComments dep provided', async () => {
    const payloadWithUrl: PostPayload = { ...payload, url: 'https://www.instagram.com/p/abc/' };
    let extractCallCount = 0;
    const extract = mock(async () => { extractCallCount++; return []; });
    const proc = createProcessor({
      fetchPost: mock(async () => payloadWithUrl),
      upsertPost: mock(async () => 99),
      buildBundle: mock(async () => ({ caption: 'cap', hashtags: [], mentions: [] })),
      extract,
      geocode: mock(async () => enriched),
      savePlaces: mock(async () => undefined),
      complete: mock(async () => undefined),
      fail: mock(async () => undefined),
      setStep: mock(async () => undefined),
      log: mock(async () => undefined),
      // no fetchComments
    });
    await proc({ id: 1, userId: 'u', url: 'https://www.instagram.com/p/abc/', dedupeKey: 'd' } as any);
    // extract called exactly once — no retry
    expect(extractCallCount).toBe(1);
  });

  test('comment fallback: fetchComments error is swallowed, job completes with 0 places', async () => {
    const payloadWithUrl: PostPayload = { ...payload, url: 'https://www.instagram.com/p/abc/' };
    const fetchComments = mock(async () => { throw new Error('network error'); });
    const extract = mock(async () => []);
    const complete = mock(async () => undefined);
    const fail = mock(async () => undefined);
    const proc = createProcessor({
      fetchPost: mock(async () => payloadWithUrl),
      upsertPost: mock(async () => 99),
      buildBundle: mock(async () => ({ caption: 'cap', hashtags: [], mentions: [] })),
      extract,
      geocode: mock(async () => enriched),
      savePlaces: mock(async () => undefined),
      complete,
      fail,
      setStep: mock(async () => undefined),
      log: mock(async () => undefined),
      fetchComments,
    });
    await proc({ id: 1, userId: 'u', url: 'https://www.instagram.com/p/abc/', dedupeKey: 'd' } as any);
    // Error from fetchComments must not propagate — job should complete normally
    expect(complete).toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
  });

  test('comment fallback: empty comments array → no second extract', async () => {
    const payloadWithUrl: PostPayload = { ...payload, url: 'https://www.instagram.com/p/abc/' };
    const fetchComments = mock(async () => [] as IgComment[]);
    let extractCallCount = 0;
    const extract = mock(async () => { extractCallCount++; return []; });
    const proc = createProcessor({
      fetchPost: mock(async () => payloadWithUrl),
      upsertPost: mock(async () => 99),
      buildBundle: mock(async () => ({ caption: 'cap', hashtags: [], mentions: [] })),
      extract,
      geocode: mock(async () => enriched),
      savePlaces: mock(async () => undefined),
      complete: mock(async () => undefined),
      fail: mock(async () => undefined),
      setStep: mock(async () => undefined),
      log: mock(async () => undefined),
      fetchComments,
    });
    await proc({ id: 1, userId: 'u', url: 'https://www.instagram.com/p/abc/', dedupeKey: 'd' } as any);
    // fetchComments was called, but returned 0 comments → extract only once
    expect(fetchComments).toHaveBeenCalled();
    expect(extractCallCount).toBe(1);
  });

  test('skipVideo: geminiPrimaryExtract runs FIRST, gpt-oss-120b not called when Gemini returns places', async () => {
    const geminiPrimaryExtract = mock(async () => [voted]);
    const extract = mock(async () => [voted]);
    const proc = createProcessor({
      fetchPost: mock(async () => payload),
      upsertPost: mock(async () => 99),
      buildBundle: mock(async () => ({ caption: 'cap', hashtags: [], mentions: [] })),
      extract,
      geminiPrimaryExtract,
      geocode: mock(async () => enriched),
      savePlaces: mock(async () => undefined),
      complete: mock(async () => undefined),
      fail: mock(async () => undefined),
      setStep: mock(async () => undefined),
      log: mock(async () => undefined),
    });
    await proc({ id: 1, userId: 'u', url: 'x', dedupeKey: 'd', skipVideo: true } as any);
    expect(geminiPrimaryExtract).toHaveBeenCalledTimes(1);
    expect(extract).not.toHaveBeenCalled();
  });

  test('skipVideo: when geminiPrimaryExtract returns [], gpt-oss-120b backup is called', async () => {
    const geminiPrimaryExtract = mock(async () => []);
    const extract = mock(async () => [voted]);
    const proc = createProcessor({
      fetchPost: mock(async () => payload),
      upsertPost: mock(async () => 99),
      buildBundle: mock(async () => ({ caption: 'cap', hashtags: [], mentions: [] })),
      extract,
      geminiPrimaryExtract,
      geocode: mock(async () => enriched),
      savePlaces: mock(async () => undefined),
      complete: mock(async () => undefined),
      fail: mock(async () => undefined),
      setStep: mock(async () => undefined),
      log: mock(async () => undefined),
    });
    await proc({ id: 1, userId: 'u', url: 'x', dedupeKey: 'd', skipVideo: true } as any);
    expect(geminiPrimaryExtract).toHaveBeenCalledTimes(1);
    expect(extract).toHaveBeenCalledTimes(1);
  });

  test('skipVideo: when geminiPrimaryExtract throws, gpt-oss-120b backup is called', async () => {
    const geminiPrimaryExtract = mock(async () => { throw new Error('gemini 500'); });
    const extract = mock(async () => [voted]);
    const proc = createProcessor({
      fetchPost: mock(async () => payload),
      upsertPost: mock(async () => 99),
      buildBundle: mock(async () => ({ caption: 'cap', hashtags: [], mentions: [] })),
      extract,
      geminiPrimaryExtract,
      geocode: mock(async () => enriched),
      savePlaces: mock(async () => undefined),
      complete: mock(async () => undefined),
      fail: mock(async () => undefined),
      setStep: mock(async () => undefined),
      log: mock(async () => undefined),
    });
    await proc({ id: 1, userId: 'u', url: 'x', dedupeKey: 'd', skipVideo: true } as any);
    expect(extract).toHaveBeenCalledTimes(1);
  });

  test('skipVideo=false: gpt-oss-120b runs as before; geminiPrimaryExtract NOT called', async () => {
    const geminiPrimaryExtract = mock(async () => [voted]);
    const extract = mock(async () => [voted]);
    const proc = createProcessor({
      fetchPost: mock(async () => payload),
      upsertPost: mock(async () => 99),
      buildBundle: mock(async () => ({ caption: 'cap', hashtags: [], mentions: [] })),
      extract,
      geminiPrimaryExtract,
      geocode: mock(async () => enriched),
      savePlaces: mock(async () => undefined),
      complete: mock(async () => undefined),
      fail: mock(async () => undefined),
      setStep: mock(async () => undefined),
      log: mock(async () => undefined),
    });
    await proc({ id: 1, userId: 'u', url: 'x', dedupeKey: 'd', skipVideo: false } as any);
    expect(geminiPrimaryExtract).not.toHaveBeenCalled();
    expect(extract).toHaveBeenCalledTimes(1);
  });
});

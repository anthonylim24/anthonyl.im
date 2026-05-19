// server/src/igPlaces/extractPlaces.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createExtractor, levenshteinNormalized, canonicalize, voteMerge } from './extractPlaces';
import type { RawExtractedPlace, ExtractionBundle } from './types';

const placeFactory = (over: Partial<RawExtractedPlace> = {}): RawExtractedPlace => ({
  name: 'Cafe Onion', name_romanized: '어니언 성수', city: 'Seoul', address: null,
  category: 'cafe', confidence: 0.9, is_subject: true,
  supporting_quote: 'Cafe Onion in Seongsu', signal_source: 'caption',
  ...over,
});

describe('canonicalize', () => {
  test('NFC, lowercase, strip punctuation/whitespace', () => {
    expect(canonicalize('Café  Onion-1!')).toBe('cafeonion1');
  });
});

describe('levenshteinNormalized', () => {
  test('exact match → 0', () => {
    expect(levenshteinNormalized('abc', 'abc')).toBe(0);
  });
  test('off by one', () => {
    expect(levenshteinNormalized('abc', 'abd')).toBe(1);
  });
});

describe('voteMerge', () => {
  test('all 3 runs surface same place → vote_count=3, band=high', () => {
    const runs = [[placeFactory()], [placeFactory()], [placeFactory()]];
    const out = voteMerge(runs, 'Cafe Onion in Seongsu');
    expect(out.length).toBe(1);
    expect(out[0].vote_count).toBe(3);
    expect(out[0].confidence_band).toBe('high');
  });
  test('2 runs surface, 1 doesnt → vote_count=2, band=medium', () => {
    const runs = [[placeFactory()], [placeFactory()], []];
    const out = voteMerge(runs, 'Cafe Onion in Seongsu');
    expect(out[0].vote_count).toBe(2);
    expect(out[0].confidence_band).toBe('medium');
  });
  test('vote_count=1 AND confidence<0.6 → dropped', () => {
    const runs = [[placeFactory({ confidence: 0.4 })], [], []];
    const out = voteMerge(runs, 'Cafe Onion in Seongsu');
    expect(out).toEqual([]);
  });
  test('substring-quote hallucination filter drops phantom places', () => {
    const runs = [[placeFactory({ supporting_quote: 'Never said this' })]];
    const out = voteMerge(runs, 'Cafe Onion in Seongsu');
    expect(out).toEqual([]);
  });
  test('different signals → signal_source=multiple', () => {
    const runs = [
      [placeFactory({ signal_source: 'caption' })],
      [placeFactory({ signal_source: 'transcript' })],
      [placeFactory({ signal_source: 'ocr' })],
    ];
    const out = voteMerge(runs, 'Cafe Onion in Seongsu');
    expect(out[0].signal_source).toBe('multiple');
  });
  test('merges address — longest non-null wins across votes', () => {
    const runs = [
      [placeFactory({ address: null })],
      [placeFactory({ address: '12 Insadong-gil' })],
      [placeFactory({ address: '12 Insadong-gil, Jongno-gu, Seoul' })],
    ];
    const out = voteMerge(runs, 'Cafe Onion in Seongsu');
    expect(out[0].address).toBe('12 Insadong-gil, Jongno-gu, Seoul');
  });
});

describe('createExtractor', () => {
  test('issues 3 parallel groq calls with temperature 0.5', async () => {
    const calls: object[] = [];
    const groq = { chat: { completions: { create: mock(async (params: any) => {
      calls.push(params);
      return { choices: [{ message: { content: JSON.stringify({ places: [placeFactory()] }) } }] };
    })}}} as any;
    const extract = createExtractor({ groq });
    const bundle: ExtractionBundle = { caption: 'Cafe Onion in Seongsu', hashtags: [], mentions: [] };
    const out = await extract(bundle);
    expect(calls).toHaveLength(3);
    expect((calls[0] as any).temperature).toBe(0.5);
    expect((calls[0] as any).response_format.type).toBe('json_schema');
    expect(out[0].vote_count).toBe(3);
  });

  test('Groq 429 + Cerebras key set → falls back to Cerebras for that call', async () => {
    let groqCalls = 0;
    const groq = { chat: { completions: { create: mock(async () => {
      groqCalls++;
      // 1st of 3 parallel calls rate-limits; the other 2 succeed.
      if (groqCalls === 1) {
        const err: any = new Error('rate limited');
        err.status = 429;
        err.headers = { 'retry-after': '5' };
        throw err;
      }
      return { choices: [{ message: { content: JSON.stringify({ places: [placeFactory()] }) } }] };
    })}}} as any;

    const cerebrasFetch = mock(async (url: string, init: any) => {
      expect(url).toBe('https://api.cerebras.ai/v1/chat/completions');
      const body = JSON.parse(init.body);
      expect(body.model).toBe('gpt-oss-120b');
      expect(init.headers.Authorization).toBe('Bearer cb-key');
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ places: [placeFactory()] }) } }],
      }), { status: 200 });
    });

    const logMessages: string[] = [];
    const extract = createExtractor({
      groq, cerebrasApiKey: 'cb-key', cerebrasFetch: cerebrasFetch as any,
    });
    const bundle: ExtractionBundle = { caption: 'Cafe Onion in Seongsu', hashtags: [], mentions: [] };
    const out = await extract(bundle, {
      log: (_l, m) => { logMessages.push(m); },
    });
    expect(cerebrasFetch).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(1);
    expect(out[0].vote_count).toBe(3);
    expect(logMessages.some(m => m.includes('Cerebras'))).toBe(true);
  });

  test('Groq 429 + no Cerebras key → throws RetryableError as before', async () => {
    const groq = { chat: { completions: { create: mock(async () => {
      const err: any = new Error('rate limited');
      err.status = 429;
      err.headers = { 'retry-after': '5' };
      throw err;
    })}}} as any;
    const extract = createExtractor({ groq });
    const bundle: ExtractionBundle = { caption: 'Cafe Onion in Seongsu', hashtags: [], mentions: [] };
    await expect(extract(bundle)).rejects.toThrow(/rate-limited/);
  });

  test('Groq 429 + Cerebras 429 → still throws RetryableError', async () => {
    const groq = { chat: { completions: { create: mock(async () => {
      const err: any = new Error('rate limited');
      err.status = 429;
      err.headers = { 'retry-after': '5' };
      throw err;
    })}}} as any;
    const cerebrasFetch = mock(async () =>
      new Response('', { status: 429, headers: { 'retry-after': '10' } })) as any;
    const extract = createExtractor({ groq, cerebrasApiKey: 'cb-key', cerebrasFetch });
    const bundle: ExtractionBundle = { caption: 'Cafe Onion in Seongsu', hashtags: [], mentions: [] };
    await expect(extract(bundle)).rejects.toThrow(/both rate-limited/);
  });
});

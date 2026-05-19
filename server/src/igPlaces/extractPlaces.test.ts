// server/src/igPlaces/extractPlaces.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createExtractor, levenshteinNormalized, canonicalize, voteMerge } from './extractPlaces';
import type { RawExtractedPlace, ExtractionBundle } from './types';

const placeFactory = (over: Partial<RawExtractedPlace> = {}): RawExtractedPlace => ({
  name: 'Cafe Onion', name_romanized: 'Cafe Onion', city: 'Seoul',
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
});

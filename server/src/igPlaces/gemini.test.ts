import { test, expect, describe, mock } from 'bun:test';
import { createGeminiExtractor, createGeminiVideoTranscriber } from './gemini';
import type { ExtractionBundle } from './types';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const baseBundle: ExtractionBundle = {
  caption: 'Hannam-dong Hanbang Tongdak — best chicken in Seoul',
  hashtags: [],
  mentions: [],
};

function mockFetch(handlers: Array<{ url: RegExp; response: () => Response }>) {
  return mock(async (input: string | URL | Request) => {
    const url = input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url;
    for (const h of handlers) {
      if (h.url.test(url)) return h.response();
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe('createGeminiExtractor', () => {
  test('parses JSON-fenced output into VotedPlace[]', async () => {
    const responseBody = {
      candidates: [{
        content: {
          parts: [{
            text: '```json\n{"places":[{"name":"Cafe Onion","name_romanized":"어니언","city":"Seoul","address":null,"category":"cafe","confidence":0.95,"is_subject":true,"supporting_quote":"Cafe Onion","signal_source":"caption"}]}\n```',
          }],
        },
      }],
    };
    const fetch = mockFetch([{
      url: /generateContent$/,
      response: () => new Response(JSON.stringify(responseBody), { status: 200 }),
    }]) as unknown as typeof globalThis.fetch;

    const extract = createGeminiExtractor({ apiKey: 'k', fetch });
    const out = await extract(baseBundle);
    expect(out.length).toBe(1);
    expect(out[0].name).toBe('Cafe Onion');
    expect(out[0].confidence_band).toBe('high');
    expect(out[0].vote_count).toBe(1);
    expect(out[0].category).toBe('cafe');
  });

  test('handles unfenced JSON output', async () => {
    const fetch = mockFetch([{
      url: /generateContent$/,
      response: () => new Response(JSON.stringify({
        candidates: [{
          content: { parts: [{ text: '{"places":[{"name":"X","confidence":0.7,"category":"bar","is_subject":false}]}' }] },
        }],
      }), { status: 200 }),
    }]) as unknown as typeof globalThis.fetch;
    const extract = createGeminiExtractor({ apiKey: 'k', fetch });
    const out = await extract(baseBundle);
    expect(out[0].name).toBe('X');
    expect(out[0].confidence_band).toBe('medium');
  });

  test('returns [] when Gemini returns non-JSON text', async () => {
    const fetch = mockFetch([{
      url: /generateContent$/,
      response: () => new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'No places found.' }] } }],
      }), { status: 200 }),
    }]) as unknown as typeof globalThis.fetch;
    const extract = createGeminiExtractor({ apiKey: 'k', fetch });
    const out = await extract(baseBundle);
    expect(out).toEqual([]);
  });

  test('429 throws RetryableError', async () => {
    const fetch = mockFetch([{
      url: /generateContent$/,
      response: () => new Response('rate limit', { status: 429 }),
    }]) as unknown as typeof globalThis.fetch;
    const extract = createGeminiExtractor({ apiKey: 'k', fetch });
    await expect(extract(baseBundle)).rejects.toThrow(/rate-limited/);
  });

  test('uses google maps grounding tool in request', async () => {
    let captured: any = null;
    const fetch = mock(async (_input: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string);
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"places":[]}' }] } }],
      }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const extract = createGeminiExtractor({ apiKey: 'k', fetch });
    await extract(baseBundle);
    expect(captured.tools).toEqual([{ googleMaps: {} }]);
    expect(captured.generationConfig.thinkingConfig).toBeDefined();
  });
});

describe('createGeminiVideoTranscriber', () => {
  test('uploads file → polls → transcribes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gemini-test-'));
    const path = join(dir, 'video.mp4');
    await writeFile(path, new Uint8Array(1024));

    try {
      let pollCount = 0;
      const fetch = mock(async (input: string, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.endsWith('/upload/v1beta/files') && init?.method === 'POST') {
          // init: resumable upload
          return new Response(null, {
            status: 200,
            headers: { 'x-goog-upload-url': 'https://upload.example/u1' },
          });
        }
        if (url === 'https://upload.example/u1') {
          // upload bytes
          return new Response(JSON.stringify({
            file: { name: 'files/abc', uri: 'gs://files/abc', state: 'PROCESSING' },
          }), { status: 200 });
        }
        if (url.endsWith('/files/abc')) {
          pollCount++;
          // First poll: still processing; second: ACTIVE
          return new Response(JSON.stringify({ state: pollCount > 1 ? 'ACTIVE' : 'PROCESSING' }), { status: 200 });
        }
        if (url.endsWith(':generateContent')) {
          return new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'spoken transcript here.' }] } }],
          }), { status: 200 });
        }
        throw new Error(`unexpected: ${url}`);
      }) as unknown as typeof globalThis.fetch;

      const transcriber = createGeminiVideoTranscriber({ apiKey: 'k', fetch });
      const result = await transcriber(path);
      expect(result).toBe('spoken transcript here.');
      expect(pollCount).toBeGreaterThanOrEqual(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('429 on generation throws RetryableError', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gemini-test-'));
    const path = join(dir, 'video.mp4');
    await writeFile(path, new Uint8Array(64));
    try {
      const fetch = mock(async (input: string, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.endsWith('/upload/v1beta/files') && init?.method === 'POST') {
          return new Response(null, { status: 200, headers: { 'x-goog-upload-url': 'https://upload.example/u2' } });
        }
        if (url === 'https://upload.example/u2') {
          return new Response(JSON.stringify({ file: { name: 'files/x', uri: 'gs://x', state: 'ACTIVE' } }), { status: 200 });
        }
        if (url.endsWith(':generateContent')) {
          return new Response('rate limited', { status: 429 });
        }
        throw new Error(`unexpected: ${url}`);
      }) as unknown as typeof globalThis.fetch;
      const transcriber = createGeminiVideoTranscriber({ apiKey: 'k', fetch });
      await expect(transcriber(path)).rejects.toThrow(/rate-limited/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

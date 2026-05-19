import { test, expect, describe, mock } from 'bun:test';
import { createOcr } from './ocr';

const RESP = {
  responses: [{
    fullTextAnnotation: { text: '어니언 ONION\n성수동' },
  }],
};

describe('createOcr', () => {
  test('reads a JPEG, base64-encodes, posts to Vision, returns text', async () => {
    const readFile = mock(async () => new Uint8Array([0xff, 0xd8, 0xff]));
    const fetch = mock(async (url: string, init?: RequestInit) => {
      expect(url).toContain('https://vision.googleapis.com/v1/images:annotate');
      expect(url).toContain('key=K');
      const body = JSON.parse(String(init?.body));
      expect(body.requests[0].features[0].type).toBe('DOCUMENT_TEXT_DETECTION');
      return new Response(JSON.stringify(RESP), { status: 200 });
    });
    const ocr = createOcr({ apiKey: 'K', fetch, readFile });
    const text = await ocr('/tmp/frame.jpg');
    expect(text).toContain('어니언');
  });
  test('returns empty string when no text detected', async () => {
    const ocr = createOcr({
      apiKey: 'K',
      fetch: mock(async () => new Response(JSON.stringify({ responses: [{}] }), { status: 200 })),
      readFile: mock(async () => new Uint8Array()),
    });
    expect(await ocr('/tmp/f.jpg')).toBe('');
  });
});

// server/src/igPlaces/fetchBusyness.test.ts
import { test, expect, describe } from 'bun:test';
import { createBusynessFetcher } from './fetchBusyness';

const PLACE = {
  name: '어니언 성수',
  name_romanized: 'Onion Seongsu',
  city: 'Seoul',
  category: 'cafe',
  lat: 37.5447,
  lng: 127.0556,
  geocode_kakao_id: null,
};

// ─── mock fetch helpers ───────────────────────────────────────────────

function geminiResponse(body: { busyness: string; confidence: number; reasoning?: string }): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ text: JSON.stringify(body) }] } },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function kakaoResponse(documents: Array<Record<string, unknown>>): Response {
  return new Response(JSON.stringify({ documents }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createBusynessFetcher', () => {
  test('Gemini high-confidence → returns source=gemini-grounded', async () => {
    const f = async (url: string | URL) => {
      const u = url.toString();
      if (u.includes('generativelanguage')) {
        return geminiResponse({ busyness: 'busy', confidence: 0.82, reasoning: 'crowded reviews' });
      }
      throw new Error(`unexpected fetch: ${u}`);
    };
    const fetcher = createBusynessFetcher({
      geminiApiKey: 'gemini-key',
      kakaoApiKey: 'kakao-key',
      fetch: f as typeof fetch,
    });
    const out = await fetcher(PLACE);
    expect(out.source).toBe('gemini-grounded');
    expect(out.busyness).toBe('busy');
    expect(out.confidence).toBeGreaterThanOrEqual(0.6);
  });

  test('Gemini low-confidence + Kakao available → falls to Kakao', async () => {
    let kakaoCalled = false;
    const f = async (url: string | URL, _init?: RequestInit) => {
      const u = url.toString();
      if (u.includes('generativelanguage')) {
        return geminiResponse({ busyness: 'moderate', confidence: 0.3 });
      }
      if (u.includes('dapi.kakao.com')) {
        kakaoCalled = true;
        return kakaoResponse([
          {
            place_name: '어니언 성수',
            category_group_code: 'CE7', // cafe → 'moderate'
            road_address_name: 'Seongsu-dong, Seoul',
            address_name: 'Seongsu Seoul',
          },
        ]);
      }
      throw new Error(`unexpected fetch: ${u}`);
    };
    const fetcher = createBusynessFetcher({
      geminiApiKey: 'gemini-key',
      kakaoApiKey: 'kakao-key',
      fetch: f as typeof fetch,
    });
    const out = await fetcher(PLACE);
    expect(kakaoCalled).toBe(true);
    expect(out.source).toBe('kakao');
    // Seongsu is in BUSY_DISTRICTS → cafe baseline 'moderate' bumps to 'busy'.
    expect(out.busyness).toBe('busy');
    expect(out.confidence).toBe(0.5);
  });

  test('Gemini throws + Kakao available → falls to Kakao', async () => {
    let kakaoCalled = false;
    const f = async (url: string | URL) => {
      const u = url.toString();
      if (u.includes('generativelanguage')) {
        throw new TypeError('network failure');
      }
      if (u.includes('dapi.kakao.com')) {
        kakaoCalled = true;
        return kakaoResponse([
          { place_name: 'X', category_group_code: 'FD6', address_name: 'Anywhere' },
        ]);
      }
      throw new Error(`unexpected fetch: ${u}`);
    };
    const fetcher = createBusynessFetcher({
      geminiApiKey: 'gemini-key',
      kakaoApiKey: 'kakao-key',
      fetch: f as typeof fetch,
    });
    const out = await fetcher({ ...PLACE, name: 'Plain Spot', name_romanized: null, city: 'Suwon' });
    expect(kakaoCalled).toBe(true);
    expect(out.source).toBe('kakao');
    expect(out.busyness).toBe('moderate');
  });

  test('no API keys → category-based inference, source=inferred, confidence=0.2', async () => {
    const f = async () => {
      throw new Error('fetch should not be called when no API keys are set');
    };
    const fetcher = createBusynessFetcher({ fetch: f as typeof fetch });
    const out = await fetcher(PLACE);
    expect(out.source).toBe('inferred');
    expect(out.confidence).toBe(0.2);
    // category 'cafe' → 'moderate' per categoryFallback.
    expect(out.busyness).toBe('moderate');
  });

  test('no Gemini key, Kakao keyword search empty → category fallback at 0.3', async () => {
    const f = async (url: string | URL) => {
      const u = url.toString();
      if (u.includes('dapi.kakao.com')) {
        return kakaoResponse([]); // no docs found
      }
      throw new Error(`unexpected fetch: ${u}`);
    };
    const fetcher = createBusynessFetcher({
      kakaoApiKey: 'kakao-key',
      fetch: f as typeof fetch,
    });
    const out = await fetcher({ ...PLACE, category: 'landmark', city: null });
    // Kakao path returns 0.3 confidence when no doc found, category 'landmark'
    // → 'busy' via categoryFallback.
    expect(out.source).toBe('kakao');
    expect(out.busyness).toBe('busy');
    expect(out.confidence).toBe(0.3);
  });

  test('Gemini high-confidence wins even when Kakao key is present', async () => {
    let kakaoCalled = false;
    const f = async (url: string | URL) => {
      const u = url.toString();
      if (u.includes('generativelanguage')) {
        return geminiResponse({ busyness: 'very_busy', confidence: 0.95 });
      }
      if (u.includes('dapi.kakao.com')) {
        kakaoCalled = true;
        return kakaoResponse([{ place_name: 'X', category_group_code: 'PK6' }]);
      }
      throw new Error(`unexpected fetch: ${u}`);
    };
    const fetcher = createBusynessFetcher({
      geminiApiKey: 'gemini-key',
      kakaoApiKey: 'kakao-key',
      fetch: f as typeof fetch,
    });
    const out = await fetcher(PLACE);
    expect(out.source).toBe('gemini-grounded');
    expect(out.busyness).toBe('very_busy');
    expect(kakaoCalled).toBe(false);
  });
});

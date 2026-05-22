// server/src/igPlaces/fetchBusyness.ts
//
// Fetches the typical busyness level for an extracted place.
//
// Primary: Gemini 3.1 Flash Lite with Google Maps grounding — asks the model
// how crowded the venue typically is, using Maps data for grounding.
//
// Fallback: When Gemini confidence < 0.6 or the call fails, infers busyness
// from Kakao Local's category_group_code and district heuristics.

import type { BusynessLevel, BusynessSource } from './types';
import { GEMINI_MODEL, GEMINI_BASE } from './gemini';

export interface BusynessResult {
  busyness: BusynessLevel;
  source: BusynessSource;
  confidence: number;
}

export interface BusynessDeps {
  geminiApiKey?: string;
  kakaoApiKey?: string;
  model?: string;
  fetch?: typeof fetch;
}

export type BusynessFetcher = (place: {
  name: string;
  name_romanized?: string | null;
  city: string | null;
  category: string;
  lat?: number | null;
  lng?: number | null;
  geocode_kakao_id?: string | null;
}) => Promise<BusynessResult>;

// ─── Gemini grounded busyness lookup ──────────────────────────────────

const BUSYNESS_PROMPT = (name: string, nameRomanized: string | null, city: string | null, category: string) =>
  `You are a Korea travel assistant. Use Google Maps grounding to look up "${name}"${nameRomanized && nameRomanized !== name ? ` (${nameRomanized})` : ''}${city ? ` in ${city}, South Korea` : ' in South Korea'}.

Determine how busy / crowded this ${category} typically is based on Maps data (popular times, reviews, wait times, diner comments).

Respond with JSON only — no markdown fencing:
{
  "busyness": "quiet" | "moderate" | "busy" | "very_busy",
  "confidence": <0..1>,
  "reasoning": "<one sentence>"
}

Definitions:
- quiet: rarely crowded, easy walk-in
- moderate: occasionally busy, short waits at peak
- busy: often crowded, waits common, reservations recommended
- very_busy: almost always packed, long queues, hard to get in`;

interface GeminiResponse {
  busyness?: unknown;
  confidence?: unknown;
  reasoning?: unknown;
}

async function fetchBusynessFromGemini(
  name: string,
  nameRomanized: string | null,
  city: string | null,
  category: string,
  apiKey: string,
  model: string,
  f: typeof fetch,
): Promise<{ busyness: BusynessLevel; confidence: number } | null> {
  const prompt = BUSYNESS_PROMPT(name, nameRomanized ?? null, city, category);
  let r: Response;
  try {
    r = await f(`${GEMINI_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ googleMaps: {} }],
        generationConfig: {
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 256 },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return null;
  }

  if (!r.ok) return null;

  const j = await r.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = j.candidates?.[0]?.content?.parts
    ?.map((p) => p.text)
    .filter(Boolean)
    .join('') ?? '';

  // Strip optional markdown fences before parsing.
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let parsed: GeminiResponse;
  try {
    parsed = JSON.parse(cleaned) as GeminiResponse;
  } catch {
    return null;
  }

  const VALID: BusynessLevel[] = ['quiet', 'moderate', 'busy', 'very_busy'];
  const level = typeof parsed.busyness === 'string' && VALID.includes(parsed.busyness as BusynessLevel)
    ? parsed.busyness as BusynessLevel
    : null;
  const confidence = typeof parsed.confidence === 'number'
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0;

  if (!level) return null;
  return { busyness: level, confidence };
}

// ─── Kakao-based busyness inference ───────────────────────────────────
//
// Calls Kakao Local keyword search and maps the category_group_code
// to a busyness baseline, then applies a district modifier for known
// high-traffic areas (Myeongdong, Hongdae, Gangnam, Itaewon, etc.).

const KAKAO_CATEGORY_BUSYNESS: Record<string, BusynessLevel> = {
  MT1: 'busy',      // Large mart / hypermarket
  CS2: 'moderate',  // Convenience store
  PS3: 'quiet',     // Kindergarten
  SC4: 'quiet',     // School
  AC5: 'moderate',  // Academic institution
  PK6: 'quiet',     // Parking
  OL7: 'quiet',     // Gas station
  SW8: 'quiet',     // Subway station
  BK9: 'quiet',     // Bank
  CT1: 'moderate',  // Cultural facility
  AG2: 'quiet',     // Real estate
  PO3: 'quiet',     // Public office
  AT4: 'busy',      // Tourist attraction / sightseeing
  AD5: 'moderate',  // Accommodation
  FD6: 'moderate',  // Restaurant
  CE7: 'moderate',  // Cafe
  HP8: 'quiet',     // Hospital
  PM9: 'quiet',     // Pharmacy
};

const BUSY_DISTRICTS = [
  'myeongdong', 'hongdae', 'gangnam', 'itaewon', 'insadong',
  'dongdaemun', 'sinchon', 'jamsil', 'bukchon', 'seongsu',
  'yongsan', 'apgujeong', 'cheongdam', 'haeundae', 'gwangalli',
  'gwangjang', 'namdaemun', 'mapo',
];

function bumped(level: BusynessLevel): BusynessLevel {
  const order: BusynessLevel[] = ['quiet', 'moderate', 'busy', 'very_busy'];
  const idx = order.indexOf(level);
  return idx < order.length - 1 ? order[idx + 1] : level;
}

interface KakaoDocument {
  category_group_code?: string;
  road_address_name?: string;
  address_name?: string;
  place_name?: string;
}

async function inferBusynessFromKakao(
  name: string,
  nameRomanized: string | null,
  city: string | null,
  category: string,
  apiKey: string,
  f: typeof fetch,
): Promise<{ busyness: BusynessLevel; confidence: number } | null> {
  // Try Korean name first (Kakao is KR-native), then English name.
  const queries = [
    nameRomanized && city ? `${nameRomanized} ${city}` : null,
    nameRomanized ?? null,
    city ? `${name} ${city}` : name,
  ].filter((q): q is string => Boolean(q));

  let doc: KakaoDocument | null = null;
  for (const q of queries) {
    try {
      const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
      url.searchParams.set('query', q);
      const r = await f(url.toString(), {
        headers: { Authorization: `KakaoAK ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) continue;
      const data = await r.json() as { documents?: KakaoDocument[] };
      if (data.documents?.length) {
        doc = data.documents[0];
        break;
      }
    } catch {
      continue;
    }
  }

  // Determine busyness from category_group_code, falling back to our
  // own category string.
  let level: BusynessLevel = 'moderate';
  if (doc?.category_group_code) {
    level = KAKAO_CATEGORY_BUSYNESS[doc.category_group_code] ?? categoryFallback(category);
  } else {
    level = categoryFallback(category);
  }

  // Apply district modifier.
  const addressText = [
    doc?.road_address_name ?? '',
    doc?.address_name ?? '',
    city ?? '',
    doc?.place_name ?? '',
  ].join(' ').toLowerCase();
  const inBusyArea = BUSY_DISTRICTS.some((d) => addressText.includes(d));
  if (inBusyArea) level = bumped(level);

  return { busyness: level, confidence: doc ? 0.5 : 0.3 };
}

function categoryFallback(category: string): BusynessLevel {
  switch (category) {
    case 'restaurant':
    case 'cafe':
      return 'moderate';
    case 'bar':
      return 'moderate';
    case 'shopping':
      return 'moderate';
    case 'activity':
    case 'landmark':
      return 'busy';
    case 'hotel':
      return 'quiet';
    default:
      return 'moderate';
  }
}

// ─── Public factory ────────────────────────────────────────────────────

export function createBusynessFetcher(deps: BusynessDeps): BusynessFetcher {
  const f = deps.fetch ?? fetch;
  const model = deps.model ?? GEMINI_MODEL;

  return async (place) => {
    // 1. Try Gemini with Maps grounding when the API key is configured.
    if (deps.geminiApiKey) {
      try {
        const result = await fetchBusynessFromGemini(
          place.name,
          place.name_romanized ?? null,
          place.city,
          place.category,
          deps.geminiApiKey,
          model,
          f,
        );
        if (result && result.confidence >= 0.6) {
          return {
            busyness: result.busyness,
            source: 'gemini-grounded',
            confidence: result.confidence,
          };
        }
        // Low-confidence Gemini result — try Kakao before falling back to it.
        if (result && deps.kakaoApiKey) {
          const kakao = await inferBusynessFromKakao(
            place.name, place.name_romanized ?? null, place.city, place.category,
            deps.kakaoApiKey, f,
          );
          if (kakao) {
            return { busyness: kakao.busyness, source: 'kakao', confidence: kakao.confidence };
          }
        }
        // Return low-confidence Gemini result as inferred.
        if (result) {
          return { busyness: result.busyness, source: 'inferred', confidence: result.confidence };
        }
      } catch {
        // Gemini call failed — fall through to Kakao.
      }
    }

    // 2. Kakao-based inference (when Gemini is absent or failed entirely).
    if (deps.kakaoApiKey) {
      try {
        const kakao = await inferBusynessFromKakao(
          place.name, place.name_romanized ?? null, place.city, place.category,
          deps.kakaoApiKey, f,
        );
        if (kakao) {
          return { busyness: kakao.busyness, source: 'kakao', confidence: kakao.confidence };
        }
      } catch {
        // Kakao also failed — fall through to category-only inference.
      }
    }

    // 3. Pure category + name heuristic when no API is configured or reachable.
    return {
      busyness: categoryFallback(place.category),
      source: 'inferred',
      confidence: 0.2,
    };
  };
}

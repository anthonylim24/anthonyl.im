// Last-resort fallbacks via Google's Gemini API. Two surfaces:
//
//   1. `createGeminiExtractor` — text-based extraction with Maps grounding.
//      Wired into process.ts after the primary (Groq) + comments retry
//      both come back with 0 places. Gemini's Maps grounding can resolve
//      address-less mentions to concrete places ("the chicken place in
//      Hannam") via the live Maps index.
//
//   2. `createGeminiVideoTranscriber` — uploads the downloaded video via
//      Gemini's resumable Files API and asks gemini-3.5-flash for a
//      transcript. Wired into transcribe.ts as the 429 fallback when
//      Groq Whisper rate-limits.
//
// Both functions need only GEMINI_API_KEY — no separate Google Maps key
// (grounding is bundled), no SDK dependency (raw fetch is enough).
import type { ExtractionBundle, RawExtractedPlace, VotedPlace } from './types';
import { RetryableError } from './types';
import { renderBundle, SYSTEM_PROMPT } from './extractPlaces';
import { readFile, stat } from 'node:fs/promises';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_EXTRACT_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_VIDEO_MODEL = 'gemini-3.5-flash';

export interface GeminiExtractorDeps {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
}

export type GeminiExtractor = (bundle: ExtractionBundle) => Promise<VotedPlace[]>;

/**
 * Last-resort text extractor. Gemini 3.1 Flash Lite with Maps grounding so
 * it can confirm whether vague mentions ("the chicken place near Hannam")
 * resolve to a real, addressable venue. Single pass — no self-consistency
 * voting (we're already on the cold fallback path, more API calls aren't
 * worth it). Confidence is taken at face value and mapped to bands.
 */
export function createGeminiExtractor(deps: GeminiExtractorDeps): GeminiExtractor {
  const f = deps.fetch ?? fetch;
  const model = deps.model ?? DEFAULT_EXTRACT_MODEL;
  return async (bundle) => {
    const userMsg = renderBundle(bundle);
    const r = await f(`${GEMINI_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': deps.apiKey,
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${userMsg}` }],
        }],
        tools: [{ googleMaps: {} }],
        generationConfig: {
          temperature: 0.3,
          // `thinkingBudget: 512` gives the model a short reasoning window —
          // tradeoff between latency (lower is faster) and quality (higher
          // resolves ambiguous places better). 512 matches Google's
          // benchmark default and adds <2s vs minimal.
          thinkingConfig: { thinkingBudget: 512 },
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (r.status === 429) {
      const retryAfter = Number(r.headers.get('retry-after')) * 1000 || 60_000;
      throw new RetryableError('gemini extract rate-limited', retryAfter);
    }
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`gemini extract ${r.status}: ${body.slice(0, 200)}`);
    }
    const j = await r.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ?? '';
    return parseGeminiPlaces(text);
  };
}

/** Parse Gemini's text output (often wrapped in ```json fences) into
 *  VotedPlace[]. Tolerates markdown wrappers and minor model variance.
 *  Each extracted place becomes a single-vote VotedPlace with a confidence
 *  band derived from its confidence value. */
function parseGeminiPlaces(text: string): VotedPlace[] {
  // Strip code fences, isolate the first {...} block.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  let parsed: { places?: Array<Partial<RawExtractedPlace> & { confidence?: number | string }> };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  const raw = parsed.places ?? [];
  return raw
    .filter((p) => p.name && typeof p.name === 'string')
    .map((p) => {
      const confidence = typeof p.confidence === 'number'
        ? p.confidence
        : confidenceFromWord(String(p.confidence ?? 'medium'));
      const band: VotedPlace['confidence_band'] =
        confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low';
      return {
        name: p.name!,
        name_romanized: p.name_romanized ?? null,
        city: p.city ?? null,
        address: p.address ?? null,
        category: (p.category ?? 'other') as RawExtractedPlace['category'],
        confidence,
        is_subject: Boolean(p.is_subject),
        supporting_quote: p.supporting_quote ?? '',
        signal_source: p.signal_source ?? 'caption',
        vote_count: 1,
        confidence_band: band,
      } as VotedPlace;
    });
}

function confidenceFromWord(s: string): number {
  const w = s.toLowerCase();
  if (w.includes('high') || w.includes('certain')) return 0.9;
  if (w.includes('medium')) return 0.7;
  if (w.includes('low')) return 0.4;
  return 0.6;
}

// ─── Video transcriber fallback ─────────────────────────────────────────────

export interface GeminiVideoTranscriberDeps {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
}

export type GeminiVideoTranscriber = (videoPath: string, signal?: AbortSignal) => Promise<string>;

/**
 * Uploads a local video file via Gemini's resumable Files API, polls until
 * processed, and asks the model for a verbatim transcript. Returns the
 * transcript text (the extractor pipeline takes it from there).
 *
 * Latency budget: upload ~5-15s for a 5-10 MB reel, processing ~5-15s,
 * generation ~5-15s. Plan on 20-45s total — slower than Groq Whisper
 * (~5s) but only invoked when Groq is rate-limited.
 */
export function createGeminiVideoTranscriber(deps: GeminiVideoTranscriberDeps): GeminiVideoTranscriber {
  const f = deps.fetch ?? fetch;
  const model = deps.model ?? DEFAULT_VIDEO_MODEL;

  return async (videoPath, signal) => {
    const fileUri = await uploadFile(deps.apiKey, videoPath, 'video/mp4', f, signal);

    const r = await f(`${GEMINI_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': deps.apiKey },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: 'Transcribe every spoken word in this video verbatim. ' +
                    'Include Korean Hangul where spoken, English where spoken. ' +
                    'Return ONLY the transcript text — no preamble, no labels, no timestamps.' },
            { file_data: { mime_type: 'video/mp4', file_uri: fileUri } },
          ],
        }],
        generationConfig: { temperature: 0.0 },
      }),
      signal: signal ?? AbortSignal.timeout(120_000),
    });
    if (r.status === 429) {
      const retryAfter = Number(r.headers.get('retry-after')) * 1000 || 60_000;
      throw new RetryableError('gemini video rate-limited', retryAfter);
    }
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`gemini video ${r.status}: ${body.slice(0, 200)}`);
    }
    const j = await r.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ?? '';
    return text.trim();
  };
}

async function uploadFile(
  apiKey: string,
  filePath: string,
  mimeType: string,
  f: typeof fetch,
  signal?: AbortSignal,
): Promise<string> {
  const { size } = await stat(filePath);
  // Step 1: start resumable upload, get the per-upload URL.
  const initR = await f('https://generativelanguage.googleapis.com/upload/v1beta/files', {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(size),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'ig-worker-video' } }),
    signal,
  });
  if (!initR.ok) {
    throw new Error(`gemini upload init ${initR.status}: ${(await initR.text()).slice(0, 200)}`);
  }
  const uploadUrl = initR.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('gemini upload: no upload URL returned');

  // Step 2: stream the bytes.
  const bytes = await readFile(filePath);
  const upR = await f(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(size),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: new Uint8Array(bytes),
    signal,
  });
  if (!upR.ok) throw new Error(`gemini upload ${upR.status}: ${(await upR.text()).slice(0, 200)}`);
  const meta = await upR.json() as { file?: { name?: string; uri?: string; state?: string } };
  if (!meta.file?.uri || !meta.file.name) throw new Error('gemini upload: missing file uri/name');

  // Step 3: poll for ACTIVE. Files are usually ready in 2-10s; cap at 60s.
  let state = meta.file.state;
  const fileName = meta.file.name;
  const deadline = Date.now() + 60_000;
  while (state === 'PROCESSING') {
    if (Date.now() > deadline) throw new Error('gemini upload: file PROCESSING > 60s');
    await new Promise((r) => setTimeout(r, 1500));
    const sR = await f(`${GEMINI_BASE}/${fileName}`, {
      headers: { 'x-goog-api-key': apiKey },
      signal,
    });
    if (!sR.ok) throw new Error(`gemini file poll ${sR.status}`);
    const sJ = await sR.json() as { state?: string };
    state = sJ.state;
  }
  if (state !== 'ACTIVE') throw new Error(`gemini upload: unexpected file state ${state}`);
  return meta.file.uri;
}

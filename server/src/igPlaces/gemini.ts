// Last-resort fallbacks via Google's Gemini API. Two surfaces:
//
//   1. `createGeminiExtractor` — text-based extraction with Maps grounding.
//      Wired into process.ts after the primary (Groq) + comments retry
//      both come back with 0 places. Gemini's Maps grounding can resolve
//      address-less mentions to concrete places ("the chicken place in
//      Hannam") via the live Maps index.
//
//   2. `createGeminiVideoTranscriber` — uploads the downloaded video via
//      Gemini's resumable Files API and asks the configured Gemini model
//      (see GEMINI_MODEL) for a
//      transcript. Wired into transcribe.ts as the 429 fallback when
//      Groq Whisper rate-limits.
//
// Both functions need only GEMINI_API_KEY — no separate Google Maps key
// (grounding is bundled), no SDK dependency (raw fetch is enough).
import type { ExtractionBundle, IgPlaceCategory, IgSignalSource, PostPayload, RawExtractedPlace, VotedPlace } from './types';
import { RetryableError } from './types';
import { renderBundle, SYSTEM_PROMPT } from './extractPlaces';
import { readFile, stat } from 'node:fs/promises';

// ─── Enum coercion ────────────────────────────────────────────────────
//
// Gemini occasionally invents sensible-but-out-of-schema enum values
// like `category: "bakery"` or `signal_source: "image"`. The DB enums
// reject those (Postgres 22P02), which used to kill the entire save
// even though the other 9-of-10 rows were valid. Map common synonyms
// here so the model's intent survives the round trip, falling back to
// the schema's catch-all (`other` / `caption`) for anything we don't
// recognise. Centralised so the carousel + video + text extractors all
// share the same mapping.

const VALID_CATEGORIES = new Set<IgPlaceCategory>([
  'restaurant', 'cafe', 'bar', 'shopping', 'activity', 'hotel', 'landmark', 'other',
]);

const CATEGORY_ALIASES: Record<string, IgPlaceCategory> = {
  // restaurant family
  food: 'restaurant', eatery: 'restaurant', diner: 'restaurant', bistro: 'restaurant',
  steakhouse: 'restaurant', kbbq: 'restaurant', barbecue: 'restaurant', bbq: 'restaurant',
  // cafe family
  bakery: 'cafe', patisserie: 'cafe', coffee: 'cafe', coffeeshop: 'cafe',
  'coffee shop': 'cafe', dessert: 'cafe', teahouse: 'cafe', 'tea house': 'cafe',
  // bar family
  pub: 'bar', speakeasy: 'bar', club: 'bar', nightclub: 'bar', lounge: 'bar',
  cocktail: 'bar', wine: 'bar', winebar: 'bar', brewery: 'bar',
  // shopping family
  store: 'shopping', shop: 'shopping', boutique: 'shopping', mall: 'shopping',
  market: 'shopping', flagship: 'shopping', retail: 'shopping',
  // activity family
  experience: 'activity', attraction: 'activity', spa: 'activity', salon: 'activity',
  clinic: 'activity', studio: 'activity', class: 'activity', workshop: 'activity',
  tour: 'activity',
  // hotel family
  resort: 'hotel', inn: 'hotel', hostel: 'hotel', lodging: 'hotel',
  // landmark family
  museum: 'landmark', gallery: 'landmark', park: 'landmark', temple: 'landmark',
  monument: 'landmark', beach: 'landmark', viewpoint: 'landmark', shrine: 'landmark',
  palace: 'landmark', tower: 'landmark', bridge: 'landmark',
};

export function coerceCategory(input: unknown): IgPlaceCategory {
  if (typeof input !== 'string') return 'other';
  const lower = input.toLowerCase().trim();
  if (VALID_CATEGORIES.has(lower as IgPlaceCategory)) return lower as IgPlaceCategory;
  return CATEGORY_ALIASES[lower] ?? 'other';
}

const VALID_SIGNAL_SOURCES = new Set<IgSignalSource>([
  'caption', 'transcript', 'ocr', 'location_tag', 'multiple', 'comment',
]);

const SIGNAL_SOURCE_ALIASES: Record<string, IgSignalSource> = {
  image: 'ocr', slide: 'ocr', frame: 'ocr', visual: 'ocr', screenshot: 'ocr',
  audio: 'transcript', voice: 'transcript', speech: 'transcript',
  text: 'caption', description: 'caption', post: 'caption',
  tag: 'location_tag', location: 'location_tag',
  combined: 'multiple', merged: 'multiple', mixed: 'multiple',
};

export function coerceSignalSource(input: unknown, fallback: IgSignalSource = 'caption'): IgSignalSource {
  if (typeof input !== 'string') return fallback;
  const lower = input.toLowerCase().trim();
  if (VALID_SIGNAL_SOURCES.has(lower as IgSignalSource)) return lower as IgSignalSource;
  return SIGNAL_SOURCE_ALIASES[lower] ?? fallback;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Single source of truth for which Gemini model every factory in this
 *  module uses (text extraction, video understanding, video transcription).
 *  Flash Lite handles all three workloads (multimodal: text + image + video
 *  + audio + PDF) at $0.25/1M-in / $1.50/1M-out, vs ~6× pricier Flash. To
 *  swap app-wide, change this one line. Per-call `model` overrides on the
 *  factories still work if a specific surface needs a different tier. */
export const GEMINI_MODEL = 'gemini-3.1-flash-lite';

/** Status codes Google documents as transient on Generative Language API.
 *  https://ai.google.dev/gemini-api/docs/troubleshooting */
const TRANSIENT_5XX = new Set([500, 502, 503, 504]);

/** Wraps a generateContent fetch with one retry on transient 5xx. Google's
 *  own "Internal error encountered" 500 is intermittent and the recommended
 *  client behavior is a short backoff + retry rather than failing through
 *  to a slower backup. 429 is NOT retried here — the caller maps it to a
 *  RetryableError so the worker requeues the whole job. */
async function fetchGeminiGenerate(
  f: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const first = await f(url, init);
  if (!TRANSIENT_5XX.has(first.status)) return first;
  // Drain the first body so the socket can be reused, then back off briefly.
  await first.text().catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  return f(url, init);
}

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
  const model = deps.model ?? GEMINI_MODEL;
  return async (bundle) => {
    const userMsg = renderBundle(bundle);
    const r = await fetchGeminiGenerate(f, `${GEMINI_BASE}/models/${model}:generateContent`, {
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
        category: coerceCategory(p.category),
        confidence,
        is_subject: Boolean(p.is_subject),
        supporting_quote: p.supporting_quote ?? '',
        signal_source: coerceSignalSource(p.signal_source, 'caption'),
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
  const model = deps.model ?? GEMINI_MODEL;

  return async (videoPath, signal) => {
    const fileUri = await uploadFile(deps.apiKey, videoPath, 'video/mp4', f, signal);

    const r = await fetchGeminiGenerate(f, `${GEMINI_BASE}/models/${model}:generateContent`, {
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

// ─── Video analyzer (primary path for video posts) ─────────────────────────

export interface GeminiVideoAnalyzeResult {
  transcript: string;
  ocrText: string;
  places: VotedPlace[];
}

export interface GeminiVideoAnalyzerDeps {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
}

export type GeminiVideoAnalyzer = (
  post: PostPayload,
  videoPath: string,
  signal?: AbortSignal,
) => Promise<GeminiVideoAnalyzeResult>;

/**
 * One-shot video understanding: uploads the local video file and asks
 * the configured Gemini model (see GEMINI_MODEL) for transcript +
 * on-screen text (OCR) + structured places in a single generateContent
 * call, with Maps grounding enabled.
 *
 * Wired as the PRIMARY video-processing path in buildBundle.ts. If this
 * call succeeds, we skip the Groq Whisper + ffmpeg-frames + Google Vision
 * OCR pipeline entirely. On failure (429, quota, parse error), the
 * existing pipeline takes over.
 *
 * Latency budget: 15-45s end-to-end (upload + processing + generation).
 * Slower per-call than running the legacy pipeline in parallel, but
 * delivers richer extraction quality — the model sees the video + audio
 * + caption together and can ground place names against Maps.
 */
export function createGeminiVideoAnalyzer(deps: GeminiVideoAnalyzerDeps): GeminiVideoAnalyzer {
  const f = deps.fetch ?? fetch;
  const model = deps.model ?? GEMINI_MODEL;
  return async (post, videoPath, signal) => {
    const fileUri = await uploadFile(deps.apiKey, videoPath, 'video/mp4', f, signal);

    const prompt = buildAnalyzerPrompt(post);
    const r = await fetchGeminiGenerate(f, `${GEMINI_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': deps.apiKey },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { file_data: { mime_type: 'video/mp4', file_uri: fileUri } },
          ],
        }],
        tools: [{ googleMaps: {} }],
        generationConfig: {
          temperature: 0.3,
          // 1024-token reasoning budget so the model can plan across the
          // multimodal inputs (audio + frames + caption + grounding). At
          // 256 it occasionally short-circuits OCR; at 1024 it consistently
          // produces all three sections.
          thinkingConfig: { thinkingBudget: 1024 },
        },
      }),
      signal: signal ?? AbortSignal.timeout(180_000),
    });
    if (r.status === 429) {
      const retryAfter = Number(r.headers.get('retry-after')) * 1000 || 60_000;
      throw new RetryableError('gemini video analyzer rate-limited', retryAfter);
    }
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`gemini video analyzer ${r.status}: ${body.slice(0, 200)}`);
    }
    const j = await r.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ?? '';
    return parseAnalyzerOutput(text);
  };
}

// ─── Carousel analyzer (primary path for multi-image posts) ───────────────

export interface GeminiCarouselAnalyzeResult {
  ocrText: string;
  places: VotedPlace[];
}

export interface GeminiCarouselAnalyzerDeps {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
  /** Hard cap on how many images we'll upload per post. Keeps the API
   *  payload bounded and the call latency tight. Default 12 — wide
   *  enough for typical "Seoul restaurants round-up" carousels (most
   *  have 5-10 slides) and cheap enough that Flash Lite stays under
   *  the 60-second analyzer budget. */
  maxImages?: number;
}

export type GeminiCarouselAnalyzer = (
  post: PostPayload,
  imagePaths: string[],
  signal?: AbortSignal,
) => Promise<GeminiCarouselAnalyzeResult>;

/**
 * One-shot carousel understanding: uploads every (up-to-maxImages) image
 * via the Files API, then asks Gemini to read each slide's on-screen text
 * and return both the joined OCR and a structured list of places, with
 * Maps grounding turned on.
 *
 * Why this exists: many Korea-trip carousels are "10 Seoul restaurants
 * I loved" lists, with the restaurant name + neighborhood burned into
 * each slide. The legacy carousel path (Google Vision OCR per slide →
 * gpt-oss-120b) loses the visual context — the model sees a flat OCR
 * blob with no idea which lines belong to which slide, and no way to
 * infer "these are all Seoul restaurants" from the imagery alone. The
 * Gemini analyzer reads each slide as a unit with the caption + location
 * tag as context and grounds names against Maps.
 *
 * Latency budget: upload ~5-20s (parallel; one Files API call per image),
 * generation ~10-30s. Plan on 20-50s. Slower than parallel Vision OCR
 * but produces much richer place extraction on this post shape.
 */
export function createGeminiCarouselAnalyzer(deps: GeminiCarouselAnalyzerDeps): GeminiCarouselAnalyzer {
  const f = deps.fetch ?? fetch;
  const model = deps.model ?? GEMINI_MODEL;
  const maxImages = deps.maxImages ?? 12;
  return async (post, imagePaths, signal) => {
    const capped = imagePaths.slice(0, maxImages);
    // Upload images in parallel — Files API tolerates concurrent uploads
    // and the limiting factor here is per-image upload latency, not
    // request count.
    const fileUris = await Promise.all(
      capped.map((p) => uploadFile(deps.apiKey, p, 'image/jpeg', f, signal)),
    );

    const prompt = buildCarouselPrompt(post, capped.length);
    const parts: Array<{ text?: string; file_data?: { mime_type: string; file_uri: string } }> = [
      { text: prompt },
    ];
    for (const uri of fileUris) {
      parts.push({ file_data: { mime_type: 'image/jpeg', file_uri: uri } });
    }

    const r = await fetchGeminiGenerate(f, `${GEMINI_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': deps.apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        tools: [{ googleMaps: {} }],
        generationConfig: {
          temperature: 0.3,
          // Same budget as the video analyzer — the model still has
          // to plan across multimodal inputs (N images + caption +
          // grounding).
          thinkingConfig: { thinkingBudget: 1024 },
        },
      }),
      signal: signal ?? AbortSignal.timeout(180_000),
    });
    if (r.status === 429) {
      const retryAfter = Number(r.headers.get('retry-after')) * 1000 || 60_000;
      throw new RetryableError('gemini carousel analyzer rate-limited', retryAfter);
    }
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`gemini carousel analyzer ${r.status}: ${body.slice(0, 200)}`);
    }
    const j = await r.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ?? '';
    const out = parseAnalyzerOutput(text);
    return { ocrText: out.ocrText, places: out.places };
  };
}

function buildCarouselPrompt(post: PostPayload, slideCount: number): string {
  const captionSection = post.caption ? `\n\nCAPTION:\n${post.caption}` : '';
  const locationSection = post.locationTag?.name ? `\n\nLOCATION TAG: ${post.locationTag.name}` : '';
  return `${SYSTEM_PROMPT}

You are analyzing an Instagram carousel with ${slideCount} image${slideCount === 1 ? '' : 's'}. Treat each image as one slide in a sequence. Read every readable text overlay, store sign, menu, banner, or burned-in caption visible on every slide.

Many Korea-trip carousels are "list" posts (e.g. "10 Seoul restaurants I loved", "Cafés in Seongsu"). Each slide typically pictures a SINGLE venue with its name burned into the image. When a clear theme emerges from the caption, hashtags, or repeated visual cues across slides (e.g. all signage in Hangul, all neighborhoods named in Seoul), use that theme to infer the city/neighborhood for slides that don't state it explicitly. Do NOT invent unrelated cities.

Return a single JSON object with EXACTLY these fields:

{
  "transcript": "",
  "ocrText": "<every readable on-screen text from every slide, prefixed with [slide N] markers and joined by newlines>",
  "places": [
    {
      "name": "<English-first venue name; see SYSTEM_PROMPT rule 2>",
      "name_romanized": "<original-script name from rule 3>",
      "city": "<Seoul | Busan | …>",
      "address": "<verbatim address from caption / on-screen text; null if not stated>",
      "category": "<restaurant | cafe | bar | shopping | activity | hotel | landmark | other>",
      "confidence": <0..1>,
      "is_subject": <bool>,
      "supporting_quote": "<verbatim ≤120-char quote from the OCR or caption that grounds this place>",
      "signal_source": "<ocr | caption | location_tag>"
    }
  ]
}

Use Google Maps grounding to confirm place names exist and to add structure. If no places can be confidently extracted, return places: []. Output ONLY the JSON object — no fencing, no preamble.${captionSection}${locationSection}`;
}

function buildAnalyzerPrompt(post: PostPayload): string {
  const captionSection = post.caption ? `\n\nCAPTION:\n${post.caption}` : '';
  const locationSection = post.locationTag?.name ? `\n\nLOCATION TAG: ${post.locationTag.name}` : '';
  return `${SYSTEM_PROMPT}

You are analyzing an Instagram video. Watch every frame, listen to every spoken word, and read every on-screen text overlay. Then return a single JSON object with EXACTLY these three fields:

{
  "transcript": "<verbatim transcript of every spoken word, English where spoken English, Hangul where spoken Korean>",
  "ocrText": "<every readable text overlay, store sign, menu, or burned-in caption visible in any frame, joined by newlines>",
  "places": [
    {
      "name": "<English-first venue name; see SYSTEM_PROMPT rule 2>",
      "name_romanized": "<original-script name from rule 3>",
      "city": "<Seoul | Busan | …>",
      "address": "<verbatim address from caption / transcript / on-screen text; null if not stated>",
      "category": "<restaurant | cafe | bar | shopping | activity | hotel | landmark | other>",
      "confidence": <0..1>,
      "is_subject": <bool>,
      "supporting_quote": "<verbatim ≤120-char quote from transcript, OCR, or caption that grounds this place>",
      "signal_source": "<transcript | ocr | caption | location_tag>"
    }
  ]
}

Use Google Maps grounding to confirm place names exist and to add structure. If no places can be confidently extracted, return places: []. Output ONLY the JSON object, no fencing, no preamble.${captionSection}${locationSection}`;
}

interface AnalyzerJson {
  transcript?: string;
  ocrText?: string;
  ocr?: string;
  places?: Array<Partial<RawExtractedPlace> & { confidence?: number | string }>;
}

function parseAnalyzerOutput(text: string): GeminiVideoAnalyzeResult {
  const empty: GeminiVideoAnalyzeResult = { transcript: '', ocrText: '', places: [] };
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return empty;
  let parsed: AnalyzerJson;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return empty;
  }
  const raw = parsed.places ?? [];
  const places: VotedPlace[] = raw
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
        category: coerceCategory(p.category),
        confidence,
        is_subject: Boolean(p.is_subject),
        supporting_quote: p.supporting_quote ?? '',
        signal_source: coerceSignalSource(p.signal_source, 'transcript'),
        vote_count: 1,
        confidence_band: band,
      } as VotedPlace;
    });
  return {
    transcript: typeof parsed.transcript === 'string' ? parsed.transcript : '',
    ocrText: typeof parsed.ocrText === 'string' ? parsed.ocrText
      : typeof parsed.ocr === 'string' ? parsed.ocr : '',
    places,
  };
}

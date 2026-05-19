// server/src/igPlaces/extractPlaces.ts
import type Groq from 'groq-sdk';
import type { ExtractionBundle, RawExtractedPlace, VotedPlace, IgSignalSource } from './types';

export const SYSTEM_PROMPT = `You extract real-world places from a social-media post about Korea.

Rules:
1. Only include places a human reader would recognize as a specific venue or landmark.
   If the source mentions no specific place, return {"places": []}. Never invent.
2. For each place, copy a verbatim supporting_quote (≤120 chars) from the source.
   Korean stays in Hangul, English stays in English. Do not translate or romanize the
   name field; if the source writes "광장시장", name="광장시장" — put any romanization in name_romanized.
3. is_subject=true only if the place is the main topic of the post. Passing mentions
   ("near 강남", "on the way to Busan") are is_subject=false.
4. confidence ∈ [0,1] reflects how sure you are this is a real, resolvable venue.
5. category is one of: restaurant, cafe, bar, shopping, activity, hotel, landmark, other.
6. signal_source is which input the supporting_quote came from:
   caption | transcript | ocr | location_tag.
Output JSON only, matching the provided schema.`;

const SCHEMA = {
  name: 'place_extraction',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false, required: ['places'],
    properties: {
      places: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['name','name_romanized','city','category','confidence',
                     'is_subject','supporting_quote','signal_source'],
          properties: {
            name:             { type: 'string' },
            name_romanized:   { type: ['string','null'] },
            city:             { type: ['string','null'] },
            category:         { enum: ['restaurant','cafe','bar','shopping',
                                       'activity','hotel','landmark','other'] },
            confidence:       { type: 'number', minimum: 0, maximum: 1 },
            is_subject:       { type: 'boolean' },
            supporting_quote: { type: 'string', maxLength: 160 },
            signal_source:    { enum: ['caption','transcript','ocr','location_tag'] },
          },
        },
      },
    },
  },
} as const;

export interface ExtractorDeps {
  groq: Pick<Groq, 'chat'>;
  runs?: number;
  temperature?: number;
}

export type Extractor = (bundle: ExtractionBundle) => Promise<VotedPlace[]>;

export function createExtractor(deps: ExtractorDeps): Extractor {
  const runs = deps.runs ?? 3;
  const temperature = deps.temperature ?? 0.5;
  return async function extract(bundle) {
    const userMsg = renderBundle(bundle);
    const calls = await Promise.all(Array.from({ length: runs }, () =>
      deps.groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMsg },
        ],
        response_format: { type: 'json_schema', json_schema: SCHEMA } as any,
        temperature,
        max_completion_tokens: 2048,
        reasoning_effort: 'low',
        reasoning_format: 'hidden',
      } as any).then(parseRun).catch(() => [] as RawExtractedPlace[])));
    const source = sourceText(bundle);
    return voteMerge(calls, source);
  };
}

function parseRun(c: any): RawExtractedPlace[] {
  const txt = c.choices?.[0]?.message?.content ?? '{"places":[]}';
  try { return (JSON.parse(txt).places ?? []) as RawExtractedPlace[]; } catch { return []; }
}

function renderBundle(b: ExtractionBundle): string {
  const parts: string[] = [];
  parts.push(`[caption]\n${b.caption || '(none)'}`);
  if (b.transcript) parts.push(`[transcript]\n${b.transcript}`);
  if (b.ocr)        parts.push(`[ocr]\n${b.ocr}`);
  if (b.locationTagName) parts.push(`[location_tag]\n${b.locationTagName}`);
  if (b.hashtags.length) parts.push(`[hashtags]\n${b.hashtags.join(' ')}`);
  if (b.mentions.length) parts.push(`[mentions]\n${b.mentions.join(' ')}`);
  return parts.join('\n\n');
}

function sourceText(b: ExtractionBundle): string {
  return [b.caption, b.transcript ?? '', b.ocr ?? '', b.locationTagName ?? '']
    .filter(Boolean).join('\n');
}

export function canonicalize(s: string): string {
  // NFD decomposes accented chars (é → e + combining acute), then strip combining marks,
  // then NFC re-normalizes the result before lowercasing and stripping punctuation/whitespace.
  return s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC')
    .toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

export function levenshteinNormalized(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const cost = a[i-1] === b[j-1] ? 0 : 1;
    dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost);
  }
  return dp[m][n];
}

function fuzzyEq(a: string, b: string): boolean {
  const ca = canonicalize(a), cb = canonicalize(b);
  if (ca === cb) return true;
  if (ca.includes(cb) || cb.includes(ca)) return true;
  return levenshteinNormalized(ca, cb) <= 2;
}

interface Bucket { reps: RawExtractedPlace[]; signals: Set<IgSignalSource>; }

export function voteMerge(runs: RawExtractedPlace[][], source: string): VotedPlace[] {
  // 1. filter by substring-quote
  const filtered: RawExtractedPlace[][] = runs.map(r =>
    r.filter(p => p.supporting_quote && source.includes(p.supporting_quote)));

  // 2. bucket fuzzy-matched places across runs (one entry per run per bucket)
  const buckets: Bucket[] = [];
  for (const run of filtered) {
    const seenInRun = new Set<Bucket>();
    for (const p of run) {
      const bucket = buckets.find(b => b.reps.some(r => fuzzyEq(r.name, p.name)));
      if (bucket && !seenInRun.has(bucket)) {
        bucket.reps.push(p); bucket.signals.add(p.signal_source); seenInRun.add(bucket);
      } else if (!bucket) {
        const nb: Bucket = { reps: [p], signals: new Set([p.signal_source]) };
        buckets.push(nb); seenInRun.add(nb);
      }
    }
  }

  // 3. score + filter + band
  const total = runs.length;
  const out: VotedPlace[] = [];
  for (const b of buckets) {
    const voteCount = b.reps.length;
    const maxConf = Math.max(...b.reps.map(r => r.confidence));
    if (voteCount === 1 && maxConf < 0.6) continue;

    let band: VotedPlace['confidence_band'];
    if (voteCount === total) band = 'high';
    else if (voteCount >= 2) band = 'medium';
    else band = 'low';

    const longest = [...b.reps].sort((a, c) =>
      c.supporting_quote.length - a.supporting_quote.length)[0];
    const signal_source: IgSignalSource = b.signals.size > 1 ? 'multiple' : longest.signal_source;

    out.push({
      ...longest,
      signal_source,
      vote_count: voteCount,
      confidence_band: band,
      confidence: maxConf,
    });
  }
  return out;
}

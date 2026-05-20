// server/src/igPlaces/process.ts
import type { IgJob, IgJobStep, PostPayload, ExtractionBundle, VotedPlace, EnrichedPlace, LocationTag } from './types';
import { NonRetryableError } from './types';
import type { Queue } from './queue';
import type { IgComment } from './fetchComments';
import { renderCommentsForBundle } from './fetchComments';

export interface ProcessorDeps {
  fetchPost:   (url: string, cached: PostPayload | null) => Promise<PostPayload>;
  upsertPost:  (dedupeKey: string, url: string, p: PostPayload, transcript: string | undefined, ocr: string | undefined) => Promise<number>;
  buildBundle: (p: PostPayload, opts?: { log?: (level: 'info'|'warn'|'error', message: string) => Promise<void> | void }) => Promise<ExtractionBundle>;
  extract:     (b: ExtractionBundle, opts?: { log?: (level: 'info'|'warn'|'error', message: string) => Promise<void> | void }) => Promise<VotedPlace[]>;
  geocode:     (p: VotedPlace, tag: LocationTag | undefined, opts?: { log?: (level: 'info'|'warn'|'error', message: string) => Promise<void> | void }) => Promise<EnrichedPlace>;
  savePlaces:  (postId: number, userId: string, places: EnrichedPlace[]) => Promise<void>;
  complete:    (jobId: number, postId: number) => Promise<void>;
  fail:        (jobId: number, error: Error, retryable: boolean) => Promise<void>;
  setStep:     (jobId: number, step: IgJobStep) => Promise<void>;
  log:         Queue['log'];
  /** Optional: fetches top-liked comments for a post URL. When present and
   *  primary extraction yields 0 places, comments are appended to the bundle
   *  and extraction is retried once. */
  fetchComments?: (igUrl: string, opts?: { limit?: number; signal?: AbortSignal }) => Promise<IgComment[]>;
  /** Optional last-resort extractor (Gemini 3.1 Flash Lite with Maps
   *  grounding). Called only when the primary (+comments) chain yields
   *  0 places. */
  geminiExtract?: (b: ExtractionBundle) => Promise<VotedPlace[]>;
  /** Optional skip-video primary extractor (Gemini 3.5 Flash with Maps
   *  grounding). When a job has `skipVideo: true` the bundle never gets
   *  a video signal — Gemini handles the caption-only extraction directly
   *  with grounding, before the gpt-oss-120b 3-vote backup. */
  geminiPrimaryExtract?: (b: ExtractionBundle) => Promise<VotedPlace[]>;
}

export function createProcessor(deps: ProcessorDeps) {
  return async function process(job: IgJob): Promise<void> {
    let lastStep: IgJobStep = 'queued';
    try {
      lastStep = 'fetching';
      await deps.setStep(job.id, 'fetching');
      await deps.log(job.id, 'fetching', 'info', 'starting fetch').catch(() => {});
      const payload = await deps.fetchPost(job.url, null);
      await deps.log(job.id, 'fetching', 'info',
        `got payload via ${payload.source}; ${payload.mediaItems.length} media item(s)` +
        (payload.locationTag ? `; location_tag="${payload.locationTag.name}"` : ''))
        .catch(() => {});

      lastStep = 'bundling';
      await deps.setStep(job.id, 'bundling');
      await deps.log(job.id, 'bundling', 'info', 'building extraction bundle').catch(() => {});
      const bundle = await deps.buildBundle(payload, {
        log: (level, message) => deps.log(job.id, 'bundling', level, message).catch(() => {}),
        skipVideo: job.skipVideo,
      });
      await deps.log(job.id, 'bundling', 'info',
        `caption=${bundle.caption.length} chars` +
        `; transcript=${bundle.transcript ? bundle.transcript.length + ' chars' : 'none'}` +
        `; ocr=${bundle.ocr ? bundle.ocr.length + ' chars' : 'none'}`)
        .catch(() => {});
      const postId = await deps.upsertPost(job.dedupeKey, job.url, payload, bundle.transcript, bundle.ocr);

      lastStep = 'extracting';
      await deps.setStep(job.id, 'extracting');

      // If Gemini's primary video analyzer already produced places, skip the
      // Groq 3-vote extractor — the analyzer's output is what we'd ask the
      // secondary chain to confirm anyway, and re-running adds latency + cost.
      let voted: VotedPlace[];
      if (bundle.preExtractedPlaces && bundle.preExtractedPlaces.length > 0) {
        voted = bundle.preExtractedPlaces;
        await deps.log(job.id, 'extracting', 'info',
          `using Gemini primary extraction (${voted.length} place(s); bands: ` +
          voted.map(p => p.confidence_band).join(', ') + ')').catch(() => {});
      } else if (job.skipVideo && deps.geminiPrimaryExtract) {
        // Skip-video runs never get a video signal, so the gpt-oss-120b
        // 3-vote extractor has only the caption to work with. Gemini 3.5
        // Flash with Maps grounding is a strictly better primary in that
        // mode — single call, grounded against the live Maps index.
        // gpt-oss-120b stays as the backup when Gemini returns 0.
        await deps.log(job.id, 'extracting', 'info',
          'skipVideo=true → trying Gemini 3.5 Flash w/ Maps grounding (caption-only primary)'
        ).catch(() => {});
        try {
          voted = await deps.geminiPrimaryExtract(bundle);
          if (voted.length > 0) {
            await deps.log(job.id, 'extracting', 'info',
              `Gemini primary returned ${voted.length} place(s); bands: ` +
              voted.map(p => p.confidence_band).join(', ')
            ).catch(() => {});
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await deps.log(job.id, 'extracting', 'warn',
            `Gemini skip-video primary failed: ${msg}; falling back to gpt-oss-120b`
          ).catch(() => {});
          voted = [];
        }
        if (voted.length === 0) {
          await deps.log(job.id, 'extracting', 'info', 'Gemini returned 0 places; calling gpt-oss-120b ×3 backup').catch(() => {});
          voted = await deps.extract(bundle, {
            log: (level, message) => deps.log(job.id, 'extracting', level, message).catch(() => {}),
          });
        }
      } else {
        await deps.log(job.id, 'extracting', 'info', 'calling gpt-oss-120b ×3 in parallel').catch(() => {});
        voted = await deps.extract(bundle, {
          log: (level, message) => deps.log(job.id, 'extracting', level, message).catch(() => {}),
        });
      }

      // LATE-STAGE FALLBACK: when no place extracted from primary signals,
      // fetch comments and re-extract. Only triggers on full 0-result to keep
      // Apify quota usage bounded.
      if (voted.length === 0 && deps.fetchComments && payload.url) {
        await deps.log(job.id, 'extracting', 'info',
          'no places from primary signals; fetching comments as fallback'
        ).catch(() => {});
        try {
          const comments = await deps.fetchComments(payload.url, { limit: 50 });
          if (comments.length === 0) {
            await deps.log(job.id, 'extracting', 'info',
              'no comments available — staying at 0 places'
            ).catch(() => {});
          } else {
            const rendered = renderCommentsForBundle(comments);
            await deps.log(job.id, 'extracting', 'info',
              `${comments.length} comments fetched, ${rendered.split('\n').length} after filter; re-extracting`
            ).catch(() => {});
            bundle.comments = rendered;
            voted = await deps.extract(bundle, {
              log: (l, m) => deps.log(job.id, 'extracting', l, m).catch(() => {}),
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await deps.log(job.id, 'extracting', 'warn',
            `comments fetch failed: ${msg}`
          ).catch(() => {});
        }
      }

      // GEMINI LAST-RESORT FALLBACK: primary + comments retry both came back
      // with 0 places. Try Gemini 3.1 Flash Lite with Maps grounding before
      // giving up — Maps grounding can sometimes resolve a vague mention
      // ("the chicken place near Hannam") to a real venue.
      if (voted.length === 0 && deps.geminiExtract) {
        await deps.log(job.id, 'extracting', 'info',
          'primary chain returned 0 places; trying Gemini with Maps grounding'
        ).catch(() => {});
        try {
          const geminiPlaces = await deps.geminiExtract(bundle);
          if (geminiPlaces.length > 0) {
            voted = geminiPlaces;
            await deps.log(job.id, 'extracting', 'info',
              `gemini fallback found ${voted.length} place(s); bands: ` +
              voted.map(p => p.confidence_band).join(', ')
            ).catch(() => {});
          } else {
            await deps.log(job.id, 'extracting', 'info',
              'gemini fallback also returned 0 places'
            ).catch(() => {});
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await deps.log(job.id, 'extracting', 'warn',
            `gemini fallback failed: ${msg}`
          ).catch(() => {});
        }
      }

      if (voted.length === 0) {
        // No places. This is usually a CORRECT outcome (the post is about an
        // unnamed activity, a generic vibe, a person, etc.). Log a clear note
        // explaining the absence so the user doesn't think the worker broke.
        const why = explainEmptyExtraction(bundle);
        await deps.log(job.id, 'extracting', 'info',
          `extracted 0 places — ${why}`).catch(() => {});
      } else {
        await deps.log(job.id, 'extracting', 'info',
          `voted ${voted.length} place(s); bands: ` +
          voted.map(p => p.confidence_band).join(', '))
          .catch(() => {});
      }

      lastStep = 'geocoding';
      await deps.setStep(job.id, 'geocoding');
      await deps.log(job.id, 'geocoding', 'info', 'querying Google Places + Kakao in parallel').catch(() => {});
      const enriched = await Promise.all(voted.map(v => deps.geocode(v, payload.locationTag, {
        log: (level, message) => deps.log(job.id, 'geocoding', level, message).catch(() => {}),
      })));
      const srcCounts = enriched.reduce((m, p) => {
        const k = p.geocode_source ?? 'none';
        m[k] = (m[k] ?? 0) + 1;
        return m;
      }, {} as Record<string, number>);
      await deps.log(job.id, 'geocoding', 'info',
        `geocode sources: ${Object.entries(srcCounts).map(([k, v]) => `${k}=${v}`).join(' ')}`)
        .catch(() => {});

      lastStep = 'saving';
      await deps.setStep(job.id, 'saving');
      await deps.log(job.id, 'saving', 'info', `saving ${enriched.length} place(s) to post #${postId}`).catch(() => {});
      await deps.savePlaces(postId, job.userId, enriched);

      await deps.complete(job.id, postId);
      await deps.log(job.id, 'done', 'info', 'done').catch(() => {});
      console.log(`[ig-worker] complete id=${job.id} places=${enriched.length} source=${payload.source}`);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      const retryable = !(err instanceof NonRetryableError);
      console.warn(`[ig-worker] fail id=${job.id} retryable=${retryable} err=${e.message}`);
      await deps.log(job.id, lastStep, 'error', e.message).catch(() => {});
      await deps.fail(job.id, e, retryable);
    }
  };
}

/**
 * Heuristic explanation for a zero-place extraction. Surfaced in the worker
 * logs so the user understands WHY nothing was saved — usually the post is
 * about an activity or a person, not a specific venue.
 */
function explainEmptyExtraction(b: ExtractionBundle): string {
  const total =
    (b.caption?.length ?? 0) +
    (b.transcript?.length ?? 0) +
    (b.ocr?.length ?? 0);
  if (total < 30) {
    return 'the post has almost no text content (no caption, transcript, or readable on-screen text).';
  }
  if (!b.transcript && !b.ocr) {
    return 'only the caption was available and it did not name any specific venue or landmark.';
  }
  if (b.transcript && !b.locationTagName) {
    return 'the source mentions no specific named venue or landmark — likely a personal experience, ' +
           'product, or activity rather than a place. The transcript was reviewed.';
  }
  return 'no specific named venue or landmark could be confidently extracted from the available text.';
}

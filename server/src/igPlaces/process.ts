// server/src/igPlaces/process.ts
import type { IgJob, IgJobStep, PostPayload, ExtractionBundle, VotedPlace, EnrichedPlace, LocationTag } from './types';
import { NonRetryableError } from './types';
import type { Queue } from './queue';

export interface ProcessorDeps {
  fetchPost:   (url: string, cached: PostPayload | null) => Promise<PostPayload>;
  upsertPost:  (dedupeKey: string, url: string, p: PostPayload, transcript: string | undefined, ocr: string | undefined) => Promise<number>;
  buildBundle: (p: PostPayload, opts?: { log?: (level: 'info'|'warn'|'error', message: string) => Promise<void> | void }) => Promise<ExtractionBundle>;
  extract:     (b: ExtractionBundle, opts?: { log?: (level: 'info'|'warn'|'error', message: string) => Promise<void> | void }) => Promise<VotedPlace[]>;
  geocode:     (p: VotedPlace, tag: LocationTag | undefined) => Promise<EnrichedPlace>;
  savePlaces:  (postId: number, userId: string, places: EnrichedPlace[]) => Promise<void>;
  complete:    (jobId: number, postId: number) => Promise<void>;
  fail:        (jobId: number, error: Error, retryable: boolean) => Promise<void>;
  setStep:     (jobId: number, step: IgJobStep) => Promise<void>;
  log:         Queue['log'];
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
      });
      await deps.log(job.id, 'bundling', 'info',
        `caption=${bundle.caption.length} chars` +
        `; transcript=${bundle.transcript ? bundle.transcript.length + ' chars' : 'none'}` +
        `; ocr=${bundle.ocr ? bundle.ocr.length + ' chars' : 'none'}`)
        .catch(() => {});
      const postId = await deps.upsertPost(job.dedupeKey, job.url, payload, bundle.transcript, bundle.ocr);

      lastStep = 'extracting';
      await deps.setStep(job.id, 'extracting');
      await deps.log(job.id, 'extracting', 'info', 'calling gpt-oss-120b ×3 in parallel').catch(() => {});
      const voted = await deps.extract(bundle, {
        log: (level, message) => deps.log(job.id, 'extracting', level, message).catch(() => {}),
      });
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
      const enriched = await Promise.all(voted.map(v => deps.geocode(v, payload.locationTag)));
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

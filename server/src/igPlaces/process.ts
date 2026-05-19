// server/src/igPlaces/process.ts
import type { IgJob, PostPayload, ExtractionBundle, VotedPlace, EnrichedPlace, LocationTag } from './types';
import { NonRetryableError } from './types';

export interface ProcessorDeps {
  fetchPost:   (url: string, cached: PostPayload | null) => Promise<PostPayload>;
  upsertPost:  (dedupeKey: string, url: string, p: PostPayload, transcript: string | undefined, ocr: string | undefined) => Promise<number>;
  buildBundle: (p: PostPayload) => Promise<ExtractionBundle>;
  extract:     (b: ExtractionBundle) => Promise<VotedPlace[]>;
  geocode:     (p: VotedPlace, tag: LocationTag | undefined) => Promise<EnrichedPlace>;
  savePlaces:  (postId: number, userId: string, places: EnrichedPlace[]) => Promise<void>;
  complete:    (jobId: number, postId: number) => Promise<void>;
  fail:        (jobId: number, error: Error, retryable: boolean) => Promise<void>;
}

export function createProcessor(deps: ProcessorDeps) {
  return async function process(job: IgJob): Promise<void> {
    try {
      const payload  = await deps.fetchPost(job.url, null);
      const bundle   = await deps.buildBundle(payload);
      const postId   = await deps.upsertPost(job.dedupeKey, job.url, payload, bundle.transcript, bundle.ocr);
      const voted    = await deps.extract(bundle);
      const enriched = await Promise.all(voted.map(v => deps.geocode(v, payload.locationTag)));
      await deps.savePlaces(postId, job.userId, enriched);
      await deps.complete(job.id, postId);
      console.log(`[ig-worker] complete id=${job.id} places=${enriched.length} source=${payload.source}`);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      const retryable = !(err instanceof NonRetryableError);
      console.warn(`[ig-worker] fail id=${job.id} retryable=${retryable} err=${e.message}`);
      await deps.fail(job.id, e, retryable);
    }
  };
}

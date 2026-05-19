// server/src/igPlaces/process.ts
import type { IgJob, IgJobStep, PostPayload, ExtractionBundle, VotedPlace, EnrichedPlace, LocationTag } from './types';
import { NonRetryableError } from './types';
import type { Queue } from './queue';

export interface ProcessorDeps {
  fetchPost:   (url: string, cached: PostPayload | null) => Promise<PostPayload>;
  upsertPost:  (dedupeKey: string, url: string, p: PostPayload, transcript: string | undefined, ocr: string | undefined) => Promise<number>;
  buildBundle: (p: PostPayload, opts?: { log?: (level: 'info'|'warn'|'error', message: string) => Promise<void> | void }) => Promise<ExtractionBundle>;
  extract:     (b: ExtractionBundle) => Promise<VotedPlace[]>;
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
      const voted = await deps.extract(bundle);
      await deps.log(job.id, 'extracting', 'info',
        `voted ${voted.length} place(s); bands: ` +
        voted.map(p => p.confidence_band).join(', '))
        .catch(() => {});

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

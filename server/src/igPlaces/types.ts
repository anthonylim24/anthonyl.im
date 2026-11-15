// server/src/igPlaces/types.ts
/** The four states a job is ever put in. The database enum also holds a
 *  legacy 'failed' that nothing writes; readers fold it into 'dead'. */
export type IgJobStatus = 'pending' | 'running' | 'done' | 'dead';
export type IgJobStep = 'queued'|'fetching'|'bundling'|'extracting'|'geocoding'|'saving'|'done';
export type IgPlaceCategory = 'restaurant'|'cafe'|'bar'|'shopping'|'activity'
                            | 'hotel'|'landmark'|'other';
export type IgSignalSource = 'caption'|'transcript'|'ocr'|'location_tag'|'multiple'|'comment';
export type IgConfidenceBand = 'high'|'medium'|'low';
export type BusynessLevel = 'quiet' | 'moderate' | 'busy' | 'very_busy';
export type BusynessSource = 'gemini-grounded' | 'kakao' | 'inferred';

interface IgJobFields {
  id: number;
  userId: string;
  url: string;
  dedupeKey: string;
  step: IgJobStep;
  stepStartedAt: string | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  scheduledFor: string;
  postId: number | null;
  /** When true the worker skips the video pipeline (download, transcribe,
   *  frame extraction, OCR). Set by the submitter at enqueue time. */
  skipVideo: boolean;
}

/** Only a running job holds a lock; only a done job is sure to have a post. */
export type IgJob =
  | (IgJobFields & { status: 'pending'; lockedAt: null; lockedBy: null })
  | (IgJobFields & { status: 'running'; lockedAt: string; lockedBy: string })
  | (IgJobFields & { status: 'done'; postId: number; lockedAt: null; lockedBy: null })
  | (IgJobFields & { status: 'dead'; lockedAt: null; lockedBy: null });

export type IgJobEvent =
  /** A worker takes a due pending job. Refused once attempts are used up. */
  | { type: 'claim'; workerId: string; now: string }
  /** Progress; doubles as the lock heartbeat the reaper reads. */
  | { type: 'step'; step: IgJobStep; now: string }
  | { type: 'complete'; postId: number }
  /** `retryAt` is when a retryable failure may be claimed again. */
  | { type: 'fail'; error: string; retryable: boolean; retryAt: string }
  /** The worker holding the lock went quiet past the stale threshold. */
  | { type: 'reap' }
  /** The traveller asks to try a dead job again. */
  | { type: 'retry'; now: string }
  /** The traveller asks to read a finished (or dead) post again from scratch. */
  | { type: 'reextract'; now: string }
  /** Another user's places for the same post were copied over. */
  | { type: 'shared'; postId: number };

/**
 * The job state machine, in one place. Returns the next state, or null when
 * the event does not apply to the job's current state (the caller must then
 * leave the row alone). The SQL functions in supabase/schema.sql
 * (ig_claim_job, ig_set_job_step, ig_fail_job, ig_reap_stale, ig_retry_job,
 * ig_reextract_job, ig_share_places_from_other_user) implement these same
 * rules row-side; queue.test.ts holds the table both follow.
 */
export function transition(job: IgJob, event: IgJobEvent): IgJob | null {
  const unlocked = { lockedAt: null, lockedBy: null } as const;
  const fresh = { ...unlocked, attempts: 0, lastError: null, step: 'queued' as const, stepStartedAt: null };
  switch (event.type) {
    case 'claim':
      if (job.status !== 'pending' || job.attempts >= job.maxAttempts) return null;
      return { ...job, status: 'running', attempts: job.attempts + 1, lockedAt: event.now, lockedBy: event.workerId };
    case 'step':
      if (job.status !== 'running') return null;
      return { ...job, step: event.step, stepStartedAt: event.now, lockedAt: event.now };
    case 'complete':
      if (job.status !== 'running') return null;
      return { ...job, ...unlocked, status: 'done', step: 'done', postId: event.postId, lastError: null };
    case 'fail':
      if (job.status !== 'running') return null;
      return event.retryable && job.attempts < job.maxAttempts
        ? { ...job, ...unlocked, status: 'pending', lastError: event.error, scheduledFor: event.retryAt }
        : { ...job, ...unlocked, status: 'dead', lastError: event.error };
    case 'reap':
      if (job.status !== 'running') return null;
      return job.attempts >= job.maxAttempts
        ? { ...job, ...unlocked, status: 'dead', lastError: 'reaped: stale lock' }
        : { ...job, ...unlocked, status: 'pending', lastError: 'reaped: stale lock' };
    case 'retry':
      if (job.status !== 'dead') return null;
      return { ...job, ...fresh, status: 'pending', scheduledFor: event.now };
    case 'reextract':
      if (job.status !== 'done' && job.status !== 'dead') return null;
      return { ...job, ...fresh, status: 'pending', scheduledFor: event.now };
    case 'shared':
      if (job.status !== 'pending') return null;
      return { ...job, ...unlocked, status: 'done', step: 'done', postId: event.postId, lastError: null };
  }
}

export interface MediaItem {
  type: 'image' | 'video';
  url: string;
  thumbnail?: string;
}

export interface LocationTag {
  name: string;
  lat?: number;
  lng?: number;
}

export interface PostPayload {
  shortcode: string;
  /** Canonical IG post URL; used as a yt-dlp fallback target when CDN download stalls. */
  url?: string;
  ownerUsername?: string;
  caption: string;
  mediaItems: MediaItem[];
  locationTag?: LocationTag;
  source: 'apify' | 'yt-dlp' | 'bright-data';
  raw: unknown;
}

export interface ExtractionBundle {
  caption: string;
  transcript?: string;
  ocr?: string;
  locationTagName?: string;
  /** Top-N comments by likesCount, fetched as a late-stage fallback. */
  comments?: string;
  hashtags: string[];
  mentions: string[];
  /** When the Gemini primary video analyzer ran successfully, this holds
   *  the places it extracted directly from the video (transcript + frames
   *  + caption + Maps grounding, single call). When present, process.ts
   *  uses these instead of running the secondary Groq 3-vote extractor. */
  preExtractedPlaces?: VotedPlace[];
}

export interface RawExtractedPlace {
  name: string;
  name_romanized: string | null;
  city: string | null;
  /** Explicit street address pulled from caption/transcript/ocr, if mentioned. Null otherwise. */
  address: string | null;
  category: IgPlaceCategory;
  confidence: number;          // 0..1
  is_subject: boolean;
  supporting_quote: string;
  signal_source: IgSignalSource;
}

export interface VotedPlace extends RawExtractedPlace {
  vote_count: number;          // 1..N
  confidence_band: IgConfidenceBand;
}

export interface EnrichedPlace extends VotedPlace {
  address: string | null;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  phone: string | null;
  rating: number | null;
  business_types: string[];
  geocode_source: 'ig-tag'|'google'|'kakao'|'google+kakao'|'gemini-grounded'|null;
  geocode_kakao_id: string | null;
  geocode_disagree: boolean;
  busyness: BusynessLevel | null;
  busyness_source: BusynessSource | null;
  busyness_confidence: number | null;
}

export class RetryableError extends Error {
  constructor(message: string, public retryAfterMs?: number) { super(message); }
}
export class NonRetryableError extends Error {
  constructor(message: string) { super(message); }
}

/** Sentinel on the "dev-browser binary missing" error message. buildBundle's
 *  downloader chain inspects thrown errors for this token to differentiate
 *  "binary not installed, show install hint" from a real extraction failure.
 *  Lives in types.ts so wire.ts and buildBundle.ts share it without a
 *  circular import. */
export const ENODEVBROWSER = 'ENODEVBROWSER';

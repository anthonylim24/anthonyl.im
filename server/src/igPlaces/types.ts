// server/src/igPlaces/types.ts
export type IgJobStatus = 'pending' | 'running' | 'done' | 'failed' | 'dead';
export type IgJobStep = 'queued'|'fetching'|'bundling'|'extracting'|'geocoding'|'saving'|'done';
export type IgPlaceCategory = 'restaurant'|'cafe'|'bar'|'shopping'|'activity'
                            | 'hotel'|'landmark'|'other';
export type IgSignalSource = 'caption'|'transcript'|'ocr'|'location_tag'|'multiple'|'comment';
export type IgConfidenceBand = 'high'|'medium'|'low';

export interface IgJob {
  id: number;
  userId: string;
  url: string;
  dedupeKey: string;
  status: IgJobStatus;
  step: IgJobStep;
  stepStartedAt: string | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  scheduledFor: string;
  lockedAt: string | null;
  lockedBy: string | null;
  postId: number | null;
  /** When true the worker skips the video pipeline (download, transcribe,
   *  frame extraction, OCR). Set by the submitter at enqueue time. */
  skipVideo: boolean;
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
  source: 'yt-dlp' | 'bright-data';
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
  geocode_source: 'ig-tag'|'google'|'kakao'|'google+kakao'|null;
  geocode_kakao_id: string | null;
  geocode_disagree: boolean;
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

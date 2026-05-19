// server/src/igPlaces/types.ts
export type IgJobStatus = 'pending' | 'running' | 'done' | 'failed' | 'dead';
export type IgJobStep = 'queued'|'fetching'|'bundling'|'extracting'|'geocoding'|'saving'|'done';
export type IgPlaceCategory = 'restaurant'|'cafe'|'bar'|'shopping'|'activity'
                            | 'hotel'|'landmark'|'other';
export type IgSignalSource = 'caption'|'transcript'|'ocr'|'location_tag'|'multiple';
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
  ownerUsername?: string;
  caption: string;
  mediaItems: MediaItem[];
  locationTag?: LocationTag;
  source: 'yt-dlp' | 'apify';
  raw: unknown;
}

export interface ExtractionBundle {
  caption: string;
  transcript?: string;
  ocr?: string;
  locationTagName?: string;
  hashtags: string[];
  mentions: string[];
}

export interface RawExtractedPlace {
  name: string;
  name_romanized: string | null;
  city: string | null;
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
  geocode_source: 'apify-tag'|'google'|'kakao'|'google+kakao'|null;
  geocode_kakao_id: string | null;
  geocode_disagree: boolean;
}

export class RetryableError extends Error {
  constructor(message: string, public retryAfterMs?: number) { super(message); }
}
export class NonRetryableError extends Error {
  constructor(message: string) { super(message); }
}

import { type PostPayload, type MediaItem, type LocationTag,
         RetryableError, NonRetryableError } from './types';

/** Extract the post shortcode from any IG URL form: /p/, /reel/, /tv/.
 *  Handles trailing slashes + query strings without choking. */
function parseShortcode(url: string): string {
  return url.match(/\/(p|reel|tv)\/([^/?#]+)/)?.[2] ?? '';
}

export interface FetchPostDeps {
  spawn?: (cmd: string[], opts?: { timeout?: number }) => {
    stdout: ReadableStream<Uint8Array> | null;
    stderr: ReadableStream<Uint8Array> | null;
    exited: Promise<number>;
  };
  fetch?: typeof fetch;
  brightDataApiKey: string | undefined;
}

export type FetchPost = (url: string, cached: PostPayload | null) => Promise<PostPayload>;

export function createFetchPost(deps: FetchPostDeps): FetchPost {
  const spawn = deps.spawn ?? ((cmd, opts) => Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe', ...opts }) as any);
  const f = deps.fetch ?? fetch;

  return async function fetchPost(url, cached) {
    if (cached) return cached;
    // Bright Data first — more reliable from cloud IPs, surfaces the
    // location tag + richer metadata than yt-dlp. yt-dlp is the free
    // backup when Bright Data is unavailable (key missing, quota hit,
    // transient error).
    const bd = await tryBrightData(url, f, deps.brightDataApiKey);
    if (bd.payload) return bd.payload;
    const local = await tryYtDlp(url, spawn);
    if (local) return local;
    if (bd.error) throw bd.error;
    throw new NonRetryableError('no payload from any extractor');
  };
}

async function tryYtDlp(url: string, spawn: NonNullable<FetchPostDeps['spawn']>): Promise<PostPayload | null> {
  try {
    const proc = spawn(
      ['yt-dlp', '--dump-single-json', '--no-download', '--no-warnings', '--quiet', url],
      { timeout: 20_000 });
    const code = await proc.exited;
    if (code !== 0) return null;
    if (!proc.stdout) return null;
    const text = await new Response(proc.stdout).text();
    try { await new Response(proc.stderr).text(); } catch {}
    if (!text.trim()) return null;
    const json = JSON.parse(text) as Record<string, unknown>;
    return normalizeYtDlp(json, url);
  } catch { return null; }
}

function normalizeYtDlp(j: Record<string, unknown>, url: string): PostPayload | null {
  const id = String(j.id ?? j.display_id ?? '');
  if (!id) return null;
  const caption = String(j.description ?? j.title ?? '');
  const videoUrl = typeof j.url === 'string' ? j.url : undefined;
  const thumbs = Array.isArray(j.thumbnails) ? j.thumbnails as Array<{url: string}> : [];
  const items: MediaItem[] = [];
  if (videoUrl) items.push({ type: 'video', url: videoUrl, thumbnail: thumbs[0]?.url });
  else if (thumbs[0]?.url) items.push({ type: 'image', url: thumbs[0].url });
  if (!items.length) return null;
  return {
    shortcode: id,
    url,
    ownerUsername: typeof j.uploader_id === 'string' ? j.uploader_id : undefined,
    caption,
    mediaItems: items,
    source: 'yt-dlp',
    raw: j,
  };
}

/** Subset of fields Bright Data returns for the IG Posts dataset
 *  (`gd_lk5ns7kz21pck8jpis`). The actor returns many more fields — see
 *  https://docs.brightdata.com/datasets/scrapers/instagram — but these are
 *  the only ones we map into PostPayload. */
interface BrightDataItem {
  url?: string;
  shortcode?: string;
  user_posted?: string;
  description?: string;
  videos?: string[];
  photos?: string[];
  thumbnail?: string;
  content_type?: string;
  product_type?: string;
  location_name?: string;
  location_id?: string | number;
  latitude?: number;
  longitude?: number;
  coordinates?: { latitude?: number; longitude?: number } | { lat?: number; lng?: number };
  hashtags?: string[];
}

interface BrightDataAttempt { payload?: PostPayload; error?: Error }

const BRIGHT_DATA_POSTS_DATASET = 'gd_lk5ns7kz21pck8jpis';

async function tryBrightData(url: string, f: typeof fetch, apiKey: string | undefined): Promise<BrightDataAttempt> {
  if (!apiKey) return { error: new NonRetryableError('BRIGHT_DATA_API_KEY missing') };
  try {
    const r = await f(
      `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${BRIGHT_DATA_POSTS_DATASET}&format=json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ url }]),
        signal: AbortSignal.timeout(180_000),
      });
    if (r.status === 429) return { error: new RetryableError('bright-data rate-limited', 300_000) };
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { error: new Error(`bright-data ${r.status}: ${body.slice(0, 200)}`) };
    }
    const items = (await r.json()) as BrightDataItem[];
    if (!Array.isArray(items) || !items.length) {
      return { error: new NonRetryableError('bright-data returned empty array') };
    }
    return { payload: normalizeBrightData(items[0], url) };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

function normalizeBrightData(it: BrightDataItem, url: string): PostPayload {
  const items: MediaItem[] = [];
  // videos[] is the array of signed CDN URLs; first one is the primary
  // playable. thumbnail is the displayUrl-equivalent (~poster frame).
  if (it.videos?.length && it.videos[0]) {
    items.push({ type: 'video', url: it.videos[0], thumbnail: it.thumbnail });
  }
  if (it.photos?.length) {
    for (const img of it.photos) if (img) items.push({ type: 'image', url: img });
  }
  if (!items.length && it.thumbnail) {
    items.push({ type: 'image', url: it.thumbnail });
  }

  // Bright Data may surface location either as flat `location_name` /
  // `latitude` / `longitude`, OR nested under `coordinates`. Normalize both.
  const lat = it.latitude
    ?? (it.coordinates && 'latitude' in it.coordinates ? it.coordinates.latitude : undefined)
    ?? (it.coordinates && 'lat' in it.coordinates ? it.coordinates.lat : undefined);
  const lng = it.longitude
    ?? (it.coordinates && 'longitude' in it.coordinates ? it.coordinates.longitude : undefined)
    ?? (it.coordinates && 'lng' in it.coordinates ? it.coordinates.lng : undefined);
  const locationTag: LocationTag | undefined = it.location_name
    ? { name: it.location_name, lat, lng }
    : undefined;

  return {
    shortcode: it.shortcode ?? parseShortcode(url),
    url,
    ownerUsername: it.user_posted,
    caption: it.description ?? '',
    mediaItems: items,
    locationTag,
    source: 'bright-data',
    raw: it,
  };
}

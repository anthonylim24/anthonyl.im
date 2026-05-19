import { type PostPayload, type MediaItem, type LocationTag,
         RetryableError, NonRetryableError } from './types';

export interface FetchPostDeps {
  spawn?: (cmd: string[], opts?: { timeout?: number }) => {
    stdout: ReadableStream<Uint8Array> | null;
    stderr: ReadableStream<Uint8Array> | null;
    exited: Promise<number>;
  };
  fetch?: typeof fetch;
  apifyToken: string | undefined;
}

export type FetchPost = (url: string, cached: PostPayload | null) => Promise<PostPayload>;

export function createFetchPost(deps: FetchPostDeps): FetchPost {
  const spawn = deps.spawn ?? ((cmd, opts) => Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe', ...opts }) as any);
  const f = deps.fetch ?? fetch;

  return async function fetchPost(url, cached) {
    if (cached) return cached;
    const local = await tryYtDlp(url, spawn);
    if (local) return local;
    return tryApify(url, f, deps.apifyToken);
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
    if (!text.trim()) return null;
    const json = JSON.parse(text) as Record<string, unknown>;
    return normalizeYtDlp(json);
  } catch { return null; }
}

function normalizeYtDlp(j: Record<string, unknown>): PostPayload | null {
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
    ownerUsername: typeof j.uploader_id === 'string' ? j.uploader_id : undefined,
    caption,
    mediaItems: items,
    source: 'yt-dlp',
    raw: j,
  };
}

interface ApifyItem {
  shortCode?: string;
  ownerUsername?: string;
  caption?: string;
  videoUrl?: string;
  displayUrl?: string;
  images?: string[];
  locationName?: string;
  latitude?: number;
  longitude?: number;
  type?: string;
}

async function tryApify(url: string, f: typeof fetch, token: string | undefined): Promise<PostPayload> {
  if (!token) throw new NonRetryableError('APIFY_TOKEN missing');
  const r = await f(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directUrls: [url], resultsLimit: 1 }),
    });
  if (r.status === 429) throw new RetryableError('apify rate-limited', 300_000);
  if (!r.ok) throw new Error(`apify ${r.status}`);
  const items = (await r.json()) as ApifyItem[];
  if (!items.length) throw new NonRetryableError('apify returned empty');
  return normalizeApify(items[0], url);
}

function normalizeApify(it: ApifyItem, url: string): PostPayload {
  const items: MediaItem[] = [];
  if (it.videoUrl) items.push({ type: 'video', url: it.videoUrl, thumbnail: it.displayUrl });
  if (it.images?.length) for (const img of it.images) items.push({ type: 'image', url: img });
  if (!items.length && it.displayUrl) items.push({ type: 'image', url: it.displayUrl });
  const locationTag: LocationTag | undefined = it.locationName
    ? { name: it.locationName, lat: it.latitude, lng: it.longitude }
    : undefined;
  return {
    shortcode: it.shortCode ?? url.split('/').filter(Boolean).pop() ?? '',
    ownerUsername: it.ownerUsername,
    caption: it.caption ?? '',
    mediaItems: items,
    locationTag,
    source: 'apify',
    raw: it,
  };
}

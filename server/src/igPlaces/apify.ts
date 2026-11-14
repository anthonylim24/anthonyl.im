import { NonRetryableError, RetryableError, type LocationTag, type MediaItem, type PostPayload } from './types';
import type { IgComment } from './fetchComments';

// Apify's Instagram scraper is the first choice for reading a post: it
// answers in a few seconds from any server, returns the caption, author,
// location tag, media and the latest comments in one call, and the free
// plan's monthly credit covers a personal planner many times over (about
// $2.30 per 1,000 posts against $5 of credit). Bright Data and yt-dlp stay
// behind it as fallbacks.

const ACTOR = 'apify~instagram-scraper';
const RUN_TIMEOUT_SECS = 90;

/** The fields of the scraper's post item that the pipeline uses. */
interface ApifyPost {
  type?: string;
  shortCode?: string;
  url?: string;
  caption?: string;
  ownerUsername?: string;
  locationName?: string | null;
  videoUrl?: string | null;
  displayUrl?: string | null;
  images?: string[];
  childPosts?: Array<{ type?: string; videoUrl?: string | null; displayUrl?: string | null }>;
  latestComments?: Array<{ id?: string; text?: string; ownerUsername?: string; likesCount?: number; timestamp?: string; repliesCount?: number }>;
  error?: string;
  errorDescription?: string;
}

export interface ApifyAttempt {
  payload?: PostPayload;
  /** Comments that came with the post (most recent first), for the comments fallback. */
  comments?: IgComment[];
  error?: Error;
}

function shortcodeOf(url: string): string {
  return url.match(/\/(p|reel|reels|tv)\/([^/?#]+)/)?.[2] ?? '';
}

export function normalizeApifyPost(it: ApifyPost, url: string): PostPayload {
  const items: MediaItem[] = [];
  const push = (video: string | null | undefined, image: string | null | undefined) => {
    if (video) items.push({ type: 'video', url: video, thumbnail: image ?? undefined });
    else if (image) items.push({ type: 'image', url: image });
  };
  if (it.childPosts?.length) {
    for (const child of it.childPosts) push(child.videoUrl, child.displayUrl);
  } else {
    push(it.videoUrl, it.displayUrl);
    // Single-image posts repeat displayUrl in images[]; carousels without
    // childPosts list every frame there.
    for (const image of it.images ?? []) {
      if (image && !items.some((item) => item.url === image)) items.push({ type: 'image', url: image });
    }
  }
  const locationTag: LocationTag | undefined = it.locationName ? { name: it.locationName } : undefined;
  return {
    shortcode: it.shortCode ?? shortcodeOf(url),
    url,
    ownerUsername: it.ownerUsername,
    caption: it.caption ?? '',
    mediaItems: items,
    locationTag,
    source: 'apify',
    raw: it,
  };
}

export function normalizeApifyComments(it: ApifyPost): IgComment[] {
  return (it.latestComments ?? [])
    .filter((comment) => typeof comment.text === 'string' && comment.text.trim())
    .map((comment, index) => ({
      id: comment.id ?? `apify-${index}`,
      text: comment.text!,
      ownerUsername: comment.ownerUsername,
      likesCount: comment.likesCount,
      timestamp: comment.timestamp,
      repliesCount: comment.repliesCount,
    }));
}

/** One synchronous scraper run for one post. Never throws: the caller decides what an error means. */
export async function tryApify(url: string, f: typeof fetch, token: string | undefined): Promise<ApifyAttempt> {
  if (!token) return { error: new NonRetryableError('APIFY_TOKEN missing') };
  try {
    const r = await f(
      `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=${RUN_TIMEOUT_SECS}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ directUrls: [url], resultsType: 'posts', resultsLimit: 1, addParentData: false }),
        signal: AbortSignal.timeout((RUN_TIMEOUT_SECS + 20) * 1000),
      },
    );
    if (r.status === 401 || r.status === 403) {
      return { error: new NonRetryableError(`apify auth failed (${r.status})`) };
    }
    if (r.status === 402) {
      return { error: new NonRetryableError('apify monthly credit used up (402)') };
    }
    if (r.status === 429) return { error: new RetryableError('apify rate-limited', 60_000) };
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { error: new Error(`apify ${r.status}: ${body.slice(0, 200)}`) };
    }
    const items = (await r.json()) as ApifyPost[];
    const item = Array.isArray(items) ? items[0] : undefined;
    if (!item) return { error: new NonRetryableError('apify returned no post (private or deleted)') };
    if (item.error) {
      return { error: new NonRetryableError(`apify: post not found (${item.errorDescription ?? item.error})`.slice(0, 200)) };
    }
    const payload = normalizeApifyPost(item, url);
    if (payload.mediaItems.length === 0 && !payload.caption) {
      return { error: new NonRetryableError('apify returned an empty post') };
    }
    return { payload, comments: normalizeApifyComments(item) };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Comments that arrived with a post, kept for the same process to reuse when
 * the caption names no place. Small and short-lived by design: a job reads
 * them seconds after the post is fetched.
 */
const recentComments = new Map<string, IgComment[]>();
const MAX_REMEMBERED = 50;

export function rememberComments(url: string, comments: IgComment[]): void {
  const key = shortcodeOf(url);
  if (!key) return;
  recentComments.delete(key);
  recentComments.set(key, comments);
  while (recentComments.size > MAX_REMEMBERED) recentComments.delete(recentComments.keys().next().value!);
}

export function recallComments(url: string): IgComment[] | undefined {
  return recentComments.get(shortcodeOf(url));
}

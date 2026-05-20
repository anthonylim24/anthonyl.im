import { NonRetryableError, RetryableError } from './types';
// Re-export so callers don't need to import from types for these.
export { NonRetryableError, RetryableError };

/** Source-agnostic normalized comment shape, decoupling callers from
 *  whichever scraper vendor is in use today. */
export interface IgComment {
  id: string;
  text: string;
  ownerUsername?: string;
  likesCount?: number;
  timestamp?: string;
  repliesCount?: number;
}

export interface FetchCommentsDeps {
  fetch?: typeof fetch;
  brightDataApiKey: string | undefined;
}

export type CommentsFetcher = (igUrl: string, opts?: { limit?: number; signal?: AbortSignal }) => Promise<IgComment[]>;

const BRIGHT_DATA_COMMENTS_DATASET = 'gd_ltppn085pokosxh13';

/** Raw Bright Data comments-dataset shape. We rename fields into IgComment
 *  via `normalizeBrightDataComment`. */
interface BrightDataCommentItem {
  comment_id?: string;
  comment?: string;
  comment_user?: string;
  likes_number?: number;
  replies_number?: number;
  comment_date?: string;
}

export function createCommentsFetcher(deps: FetchCommentsDeps): CommentsFetcher {
  const f = deps.fetch ?? fetch;
  return async function fetchComments(igUrl, opts = {}) {
    if (!deps.brightDataApiKey) {
      // Soft-fail: no key configured → no comments. Caller treats this
      // as "no comments available" rather than an error.
      return [];
    }
    const r = await f(
      `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${BRIGHT_DATA_COMMENTS_DATASET}&format=json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${deps.brightDataApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ url: igUrl }]),
        // 3-min default cap so a hung Bright Data response can't pin a worker
        // job indefinitely; mirrors tryBrightData's timeout in fetchPost.ts.
        signal: opts.signal ?? AbortSignal.timeout(180_000),
      });
    if (r.status === 429) throw new RetryableError('bright-data comments rate-limited', 300_000);
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`bright-data comments ${r.status}: ${body.slice(0, 200)}`);
    }
    const items = await r.json() as BrightDataCommentItem[];
    if (!Array.isArray(items)) return [];
    const limit = opts.limit ?? 50;
    return items.slice(0, limit).map(normalizeBrightDataComment);
  };
}

function normalizeBrightDataComment(it: BrightDataCommentItem): IgComment {
  return {
    id: it.comment_id ?? '',
    text: it.comment ?? '',
    ownerUsername: it.comment_user,
    likesCount: it.likes_number,
    repliesCount: it.replies_number,
    timestamp: it.comment_date,
  };
}

/**
 * Render the top-N comments by likesCount into a single string for the LLM
 * bundle. Sorts by likes desc (pinned/creator-favorite comments float up),
 * truncates per-comment to 200 chars, and caps the joined string at 2000
 * chars total so the LLM token budget stays reasonable.
 */
export function renderCommentsForBundle(comments: IgComment[], topN = 30): string {
  const sorted = [...comments].sort((a, b) => (b.likesCount ?? 0) - (a.likesCount ?? 0)).slice(0, topN);
  const lines: string[] = [];
  let total = 0;
  for (const c of sorted) {
    const text = (c.text ?? '').trim();
    if (!text || text.length < 6) continue;          // skip emoji-only / single-word
    if (text.startsWith('@') && text.length < 30) continue; // skip pure @-mentions
    const truncated = text.slice(0, 200);
    const line = `[${c.likesCount ?? 0}♥ @${c.ownerUsername ?? '?'}] ${truncated}`;
    if (total + line.length > 2000) break;
    lines.push(line);
    total += line.length;
  }
  return lines.join('\n');
}

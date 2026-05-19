import { NonRetryableError, RetryableError } from './types';
// Re-export so callers don't need to import from types for these.
export { NonRetryableError, RetryableError };

export interface ApifyComment {
  id: string;
  text: string;
  ownerUsername?: string;
  likesCount?: number;
  timestamp?: string;
  repliesCount?: number;
}

export interface FetchCommentsDeps {
  fetch?: typeof fetch;
  apifyToken: string | undefined;
}

export type CommentsFetcher = (igUrl: string, opts?: { limit?: number; signal?: AbortSignal }) => Promise<ApifyComment[]>;

export function createCommentsFetcher(deps: FetchCommentsDeps): CommentsFetcher {
  const f = deps.fetch ?? fetch;
  return async function fetchComments(igUrl, opts = {}) {
    if (!deps.apifyToken) {
      // Soft-fail: no token configured → no comments. Caller treats this
      // as "no comments available" rather than an error.
      return [];
    }
    const limit = opts.limit ?? 50;
    const r = await f(
      `https://api.apify.com/v2/acts/apify~instagram-comment-scraper/run-sync-get-dataset-items?token=${deps.apifyToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directUrls: [igUrl], resultsLimit: limit }),
        signal: opts.signal,
      });
    if (r.status === 429) throw new RetryableError('apify comments rate-limited', 300_000);
    if (!r.ok) throw new Error(`apify comments ${r.status}`);
    const items = await r.json() as ApifyComment[];
    if (!Array.isArray(items)) return [];
    return items;
  };
}

/**
 * Render the top-N comments by likesCount into a single string for the LLM
 * bundle. Sorts by likes desc (pinned/creator-favorite comments float up),
 * truncates per-comment to 200 chars, and caps the joined string at 2000
 * chars total so the LLM token budget stays reasonable.
 */
export function renderCommentsForBundle(comments: ApifyComment[], topN = 30): string {
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

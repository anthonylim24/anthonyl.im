const IG_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);

// A post lives at /{p|reel|reels|tv}/{shortcode}, optionally behind a
// /share/ redirect prefix or a /{username}/ prefix (newer share links), with
// anything after the shortcode (/embed/, /c/123/, …) being a view of the
// same post.
const POST_PATH = /^\/(?:[A-Za-z0-9._]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)(?:\/.*)?$/;

/** True when the URL names one Instagram post that the importer can read. */
export function isInstagramUrl(input: string): boolean {
  try {
    normalizeInstagramUrl(input);
    return true;
  } catch {
    return false;
  }
}

/**
 * Canonical form of a post URL, used as the job's dedupe key:
 * `https://www.instagram.com/{p|reel|reels|tv}/{shortcode}`. Every query
 * parameter and hash is dropped (they are tracking or view state, and keeping
 * any of them let the same post queue twice). No trailing slash, so keys
 * stored before this canonical form existed still match for clean URLs.
 * Throws for anything that is not one https post: profiles, stories, other
 * hosts.
 */
export function normalizeInstagramUrl(input: string): string {
  const u = new URL(input.trim());
  if (u.protocol !== 'https:') throw new Error(`not an https url: ${input}`);
  if (!IG_HOSTS.has(u.hostname.toLowerCase())) throw new Error(`not an instagram url: ${input}`);
  const match = POST_PATH.exec(u.pathname);
  if (!match) throw new Error(`not an instagram post: ${input}`);
  const [, kind, shortcode] = match;
  return `https://www.instagram.com/${kind}/${shortcode}`;
}

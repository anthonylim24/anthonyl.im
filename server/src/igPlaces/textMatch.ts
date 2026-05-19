// server/src/igPlaces/textMatch.ts
// Shared text-matching utilities used by extractPlaces, geocode, and eval/score.

export function canonicalize(s: string): string {
  // NFD decomposes accented chars (é → e + combining acute), then strip combining marks,
  // then NFC re-normalizes the result before lowercasing and stripping punctuation/whitespace.
  return s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC')
    .toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

/** Returns the raw Levenshtein edit distance between strings a and b. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const cost = a[i-1] === b[j-1] ? 0 : 1;
    dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost);
  }
  return dp[m][n];
}

export function fuzzyEq(a: string, b: string): boolean {
  const ca = canonicalize(a), cb = canonicalize(b);
  if (ca === cb || ca.includes(cb) || cb.includes(ca)) return true;
  return levenshteinDistance(ca, cb) <= 2;
}

// Ported verbatim from server/src/igPlaces/normalizeUrl.ts so client-side
// validation can skip a round-trip. Keep in sync with the server copy.

const IG_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com'])

export function isInstagramUrl(input: string): boolean {
  try {
    const u = new URL(input)
    return IG_HOSTS.has(u.hostname.toLowerCase())
  } catch {
    return false
  }
}

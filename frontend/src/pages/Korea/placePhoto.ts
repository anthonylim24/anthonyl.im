// Real-photo lookup using the Wikipedia REST summary endpoint. CORS-friendly,
// no API key. Falls back gracefully when nothing matches.

const cache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

const WIKI_BASE = "https://en.wikipedia.org/api/rest_v1/page/summary/"

async function fetchOne(title: string): Promise<string | null> {
  const cached = cache.get(title)
  if (cached !== undefined) return cached
  const existing = inflight.get(title)
  if (existing) return existing

  const promise = fetch(WIKI_BASE + encodeURIComponent(title))
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { thumbnail?: { source?: string }; originalimage?: { source?: string } } | null) => {
      const url = j?.originalimage?.source || j?.thumbnail?.source || null
      cache.set(title, url)
      return url
    })
    .catch(() => {
      cache.set(title, null)
      return null
    })
    .finally(() => {
      inflight.delete(title)
    })
  inflight.set(title, promise)
  return promise
}

// Try a series of search terms; return the first photo URL we find.
export async function lookupPhoto(candidates: string[]): Promise<string | null> {
  for (const c of candidates) {
    if (!c) continue
    const url = await fetchOne(c)
    if (url) return url
  }
  return null
}

export function formatWalkingTime(distanceMeters?: number): string | null {
  if (typeof distanceMeters !== "number") return null
  // Average urban walking speed ≈ 1.35 m/s (≈ 4.8 km/h)
  const seconds = distanceMeters / 1.35
  if (seconds < 60) return `${Math.round(seconds)} sec walk`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min walk`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return `${hours}h ${rem}m walk`
}

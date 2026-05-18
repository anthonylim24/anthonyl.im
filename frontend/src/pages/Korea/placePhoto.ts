// Real-photo lookup using MediaWiki's pageimages + generator=search endpoint.
//
// The old approach hit `/api/rest_v1/page/summary/{title}` directly. That
// endpoint 404s when no exact page title matches — fine semantically, but it
// spammed the Network panel and missed every Korean POI that doesn't have a
// dedicated Wikipedia page. The Action API search variant below:
//
//   - never 404s (search returns an empty `pages` object on no match)
//   - finds the best fuzzy match across titles (covers redirects + lemma
//     drift, e.g. "Gyeongbokgung Palace" vs "Gyeongbokgung")
//   - returns the page's thumbnail in the same request via pageimages
//   - works from the browser (origin=*) without an API key
//
// We try ko.wikipedia first for Korean place names (much better coverage of
// neighborhoods, palaces, restaurants), then fall back to en.wikipedia.
//
// Reference: https://www.mediawiki.org/wiki/API:Pageimages

const cache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

const ENDPOINTS = [
  "https://ko.wikipedia.org/w/api.php",
  "https://en.wikipedia.org/w/api.php",
]

interface PageImagesResponse {
  query?: {
    pages?: Record<
      string,
      {
        thumbnail?: { source?: string }
        original?: { source?: string }
      }
    >
  }
}

async function searchOne(endpoint: string, query: string): Promise<string | null> {
  const url =
    endpoint +
    "?" +
    new URLSearchParams({
      action: "query",
      format: "json",
      prop: "pageimages",
      generator: "search",
      gsrsearch: query,
      gsrlimit: "1",
      piprop: "original|thumbnail",
      pithumbsize: "480",
      origin: "*",
    }).toString()

  const r = await fetch(url)
  if (!r.ok) return null
  const j = (await r.json()) as PageImagesResponse
  const pages = j.query?.pages
  if (!pages) return null
  for (const key of Object.keys(pages)) {
    const p = pages[key]
    const src = p.original?.source ?? p.thumbnail?.source
    if (src) return src
  }
  return null
}

async function fetchOne(query: string): Promise<string | null> {
  const cached = cache.get(query)
  if (cached !== undefined) return cached
  const existing = inflight.get(query)
  if (existing) return existing

  const promise = (async () => {
    for (const endpoint of ENDPOINTS) {
      try {
        const url = await searchOne(endpoint, query)
        if (url) {
          cache.set(query, url)
          return url
        }
      } catch {
        /* try next endpoint */
      }
    }
    cache.set(query, null)
    return null
  })().finally(() => {
    inflight.delete(query)
  })

  inflight.set(query, promise)
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

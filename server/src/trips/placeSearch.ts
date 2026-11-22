import { categoryFor, type LatLng, type RawPlace } from "./conciergeTools"

// Type-ahead place search for the planner's place fields (a day's composer,
// the wishlist, a stop's location). Google Places Text Search finds the small
// venues OpenStreetMap lacks, biased toward the trip so the local match comes
// first. The browser merges these with its own OpenStreetMap results.

/** One suggestion, in the shape the client's `PlaceResult` takes. */
export interface PlaceHit {
  id: string
  name: string
  /** The short address: what tells two same-named results apart. */
  context: string
  /** The full postal address, saved on the stop. */
  address?: string
  lat: number
  lng: number
  category?: string
  /** Google place id, kept on the stop for photos and Maps links. */
  placeId?: string
}

export type PlaceTypeahead = (args: { query: string; near: LatLng | null; signal?: AbortSignal }) => Promise<PlaceHit[]>

// Only what a suggestion shows and a pinned stop keeps. Ratings, hours and
// summaries bill at a higher tier and are not needed while typing.
const FIELDS = ["id", "displayName", "formattedAddress", "shortFormattedAddress", "location", "primaryType", "types", "businessStatus"]
  .map((f) => `places.${f}`)
  .join(",")

/** The widest circle Places accepts as a bias. A bias ranks; it never hides a far match. */
const BIAS_RADIUS_M = 50_000
const TIMEOUT_MS = 3_500
const RESULTS = 8

export function toPlaceHit(raw: RawPlace): PlaceHit | null {
  const name = raw.displayName?.text?.trim()
  const lat = raw.location?.latitude
  const lng = raw.location?.longitude
  if (!name || typeof lat !== "number" || typeof lng !== "number") return null
  if (raw.businessStatus === "CLOSED_PERMANENTLY") return null
  const short = raw.shortFormattedAddress?.trim()
  const full = raw.formattedAddress?.trim()
  const hit: PlaceHit = {
    id: raw.id ? `g:${raw.id}` : `g:${name}:${lat.toFixed(5)},${lng.toFixed(5)}`,
    name,
    context: short || full || "",
    lat,
    lng,
    category: categoryFor(raw),
  }
  if (full || short) hit.address = full || short
  if (raw.id) hit.placeId = raw.id
  return hit
}

interface Cached {
  at: number
  hits: PlaceHit[]
}

/**
 * Google Places Text Search, biased to `near`. Answers are cached briefly by
 * query and rounded bias point: deleting a letter and retyping it, or two
 * fields searching the same name, costs one call.
 */
export function createGooglePlaceTypeahead(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  { ttlMs = 10 * 60_000, maxEntries = 400, now = Date.now }: { ttlMs?: number; maxEntries?: number; now?: () => number } = {},
): PlaceTypeahead {
  const cache = new Map<string, Cached>()
  return async ({ query, near, signal }) => {
    const key = `${query.toLowerCase()}|${near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ""}`
    const cached = cache.get(key)
    if (cached && now() - cached.at < ttlMs) return cached.hits
    if (cached) cache.delete(key)

    const body: Record<string, unknown> = { textQuery: query, pageSize: RESULTS, languageCode: "en" }
    if (near) {
      body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: BIAS_RADIUS_M } }
    }
    const deadline = AbortSignal.timeout(TIMEOUT_MS)
    const res = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    })
    if (!res.ok) throw new Error(`places search ${res.status}`)
    const json = (await res.json()) as { places?: RawPlace[] }
    const hits = (json.places ?? []).map(toPlaceHit).filter((hit): hit is PlaceHit => hit !== null)

    // Map order is insertion order, so the first key is the oldest.
    while (cache.size >= maxEntries) {
      const oldest = cache.keys().next().value
      if (oldest === undefined) break
      cache.delete(oldest)
    }
    cache.set(key, { at: now(), hits })
    return hits
  }
}

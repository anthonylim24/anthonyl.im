import { haversineMeters } from "../data/koreaPlaces"
import type { LatLng } from "./conciergeTools"
import { foldName, nameLanguage, PHOTO_NAME, toPlacePhoto, type PlacePhoto, type RawDetails } from "./placeDetails"

// Photos of a neighbourhood, for its card in the Neighborhoods tab: Google
// Places Text Search for "<area>, <city>", the first hit that is an area
// near the trip's stops there, and its first photos with their credits.
//
// The search often answers a landmark that shares the area's name ("Dosan,
// Seoul" is Dosan Park, "Bukchon, Seoul" is Bukchon Hanok Village; measured),
// so a hit counts only when Google files it as a neighbourhood or a part of
// a city, and stands near the stops. No photo beats a photo of the wrong
// place. Key handling is `placeDetails.ts`'s: the key travels only in the
// `X-Goog-Api-Key` header, redirects are refused, and photo media is asked
// for with `skipHttpRedirect=true`, which answers a keyless `photoUri`.

export interface AreaPhotoQuery {
  name: string
  localName?: string
  city: string
  /** The middle of the area's stops. */
  centre: LatLng
  /** How far the furthest stop is from `centre`. */
  reachM: number
}

/** The area's photo, or none when no hit can be trusted. */
export type AreaPhotoLookup = (query: AreaPhotoQuery) => Promise<PlacePhoto[]>

/** Google's types for a part of a city. Not `locality` (the whole city), and not parks or landmarks. */
export const AREA_PLACE_TYPES = new Set([
  "neighborhood",
  "colloquial_area",
  "sublocality",
  "sublocality_level_1",
  "sublocality_level_2",
  "sublocality_level_3",
  "sublocality_level_4",
  "sublocality_level_5",
])

/** The Neighborhoods card shows one photo; each more is a paid media call nobody sees. */
export const AREA_PHOTOS = 1
const PHOTO_WIDTH_PX = 800
/** A district's point can sit a couple of kilometres from where a trip spends its time there (Jongno District, 2.2 km; measured). */
const NEAR_MIN_M = 2_500
const NEAR_SLACK_M = 1_500
const STEP_MS = 4_000

const FIELDS = "places.id,places.displayName,places.types,places.location,places.photos"

export interface RawAreaPlace {
  id?: string
  displayName?: { text?: string }
  types?: string[]
  location?: { latitude?: number; longitude?: number }
  photos?: RawDetails["photos"]
}

/** "Hannam & Itaewon" → Hannam, Itaewon: an area named for two neighbourhoods is looked up by each. */
export function nameParts(name: string): string[] {
  return name
    .split(/\s*(?:&|·|\+|\/|,|\band\b)\s*/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
}

/** The first hit that is a part of a city near the stops, never a park or landmark of the same name. */
export function pickAreaPlace(places: readonly RawAreaPlace[], query: Pick<AreaPhotoQuery, "centre" | "reachM" | "city">): RawAreaPlace | null {
  const limit = Math.max(NEAR_MIN_M, query.reachM + NEAR_SLACK_M)
  const city = foldName(query.city)
  for (const place of places) {
    const lat = place.location?.latitude
    const lng = place.location?.longitude
    if (typeof lat !== "number" || typeof lng !== "number") continue
    if (!place.types?.some((type) => AREA_PLACE_TYPES.has(type))) continue
    if (city && foldName(place.displayName?.text ?? "") === city) continue
    if (haversineMeters(query.centre, { lat, lng }) <= limit) return place
  }
  return null
}

/** A bounded map whose entries lapse; the oldest goes first when full. */
function lapsing<T>(max: number, now: () => number) {
  const entries = new Map<string, { until: number; value: T }>()
  return {
    get(key: string): T | undefined {
      const hit = entries.get(key)
      if (hit && now() < hit.until) return hit.value
      entries.delete(key)
      return undefined
    },
    set(key: string, value: T, ms: number) {
      entries.delete(key)
      while (entries.size >= max) {
        const oldest = entries.keys().next().value
        if (oldest === undefined) break
        entries.delete(oldest)
      }
      entries.set(key, { until: now() + ms, value })
    },
  }
}

export function createGoogleAreaPhotos(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  {
    // Photo URIs carry no documented lifetime; `placeDetails.ts` keeps them half an hour.
    ttlMs = 30 * 60_000,
    // Which place is the area changes far more slowly than its photo links, so the
    // searches (up to four per area) are not repeated each time the links lapse.
    placeTtlMs = 24 * 60 * 60_000,
    now = Date.now,
  }: { ttlMs?: number; placeTtlMs?: number; now?: () => number } = {},
): AreaPhotoLookup {
  const answers = lapsing<PlacePhoto[]>(500, now)
  const places = lapsing<RawAreaPlace | null>(500, now)

  const call = async (url: string, init: RequestInit) => {
    const res = await fetchImpl(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), "X-Goog-Api-Key": apiKey },
      redirect: "error",
      signal: AbortSignal.timeout(STEP_MS),
    })
    if (!res.ok) {
      await res.text().catch(() => {})
      throw new Error(`places ${res.status}`)
    }
    return res
  }

  const search = async (text: string, query: AreaPhotoQuery): Promise<RawAreaPlace | null> => {
    const res = await call("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify({
        textQuery: `${text}, ${query.city}`.replace(/,\s*$/, ""),
        pageSize: 5,
        languageCode: nameLanguage(text, query.centre),
        // A bias only ranks; `pickAreaPlace` is what keeps it local.
        locationBias: { circle: { center: { latitude: query.centre.lat, longitude: query.centre.lng }, radius: Math.min(50_000, Math.max(2_000, query.reachM * 2)) } },
      }),
    })
    const json = (await res.json()) as { places?: RawAreaPlace[] }
    return pickAreaPlace(json.places ?? [], query)
  }

  const photoUri = async (name: string): Promise<string | null> => {
    if (!PHOTO_NAME.test(name)) return null
    try {
      const res = await call(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=${PHOTO_WIDTH_PX}&skipHttpRedirect=true`, { method: "GET" })
      const uri = ((await res.json()) as { photoUri?: string }).photoUri
      if (!uri || uri.includes(apiKey)) return null
      return new URL(uri).protocol === "https:" ? uri : null
    } catch {
      // One photo missing leaves the others.
      return null
    }
  }

  return async (query) => {
    const key = `${foldName(query.name)}|${foldName(query.city)}|${query.centre.lat.toFixed(2)},${query.centre.lng.toFixed(2)}`
    const known = answers.get(key)
    if (known) return known
    let place = places.get(key)
    if (place === undefined) {
      // Each part of a two-name area, in English first, then its local name.
      const texts = [...nameParts(query.name), ...(query.localName ? nameParts(query.localName) : [])]
      place = null
      for (const text of new Set(texts)) {
        place = await search(text, query)
        if (place) break
      }
      places.set(key, place, placeTtlMs)
    }
    const wanted = (place?.photos ?? []).filter((photo) => photo.name).slice(0, AREA_PHOTOS)
    const uris = await Promise.all(wanted.map((photo) => photoUri(photo.name!)))
    const photos = wanted.flatMap((photo, i) => (uris[i] ? [toPlacePhoto(photo, uris[i]!, PHOTO_WIDTH_PX)] : []))
    // A photo that failed to resolve is worth asking for again soon; a place with none is an answer.
    if (photos.length === wanted.length) answers.set(key, photos, ttlMs)
    return photos
  }
}

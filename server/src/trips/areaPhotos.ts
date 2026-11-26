import { haversineMeters } from "../data/koreaPlaces"
import type { LatLng } from "./conciergeTools"
import type { PlacePhoto } from "./apiShapes"
import { foldName, MATCH_RADIUS_M, nameLanguage, PHOTO_NAME, PLACE_ID, plausibleName, sameName, toPlacePhoto, type RawDetails } from "./placeDetails"

// The search often answers a landmark that shares the area's name ("Dosan,
// Seoul" is Dosan Park, "Bukchon, Seoul" is Bukchon Hanok Village; measured),
// so a hit counts only when Google files it as a neighborhood or a part of
// a city, and stands near the stops. No photo beats a photo of the wrong
// place. When no hit is the area, the photo is of the area's stop most likely
// to stand for it (a landmark before a café, never a hotel or a station),
// and says so. Key handling is `placeDetails.ts`'s: the key travels only in
// the `X-Goog-Api-Key` header, redirects are refused, and photo media is
// asked for with `skipHttpRedirect=true`, which answers a keyless `photoUri`.

export interface PhotoStop extends LatLng {
  name: string
  category?: string
  placeId?: string
}

export interface AreaPhotoQuery {
  name: string
  localName?: string
  city: string
  /** The middle of the area's stops. */
  centre: LatLng
  /** How far the furthest stop is from `centre`. */
  reachM: number
  /** The area's stops, in trip order. */
  stops: readonly PhotoStop[]
}

/** The area's photo, or none when no hit can be trusted. `of` names the stop when the photo is of a stop, not the area. */
export interface AreaPhoto {
  photos: PlacePhoto[]
  of?: string
}

export type AreaPhotoLookup = (query: AreaPhotoQuery) => Promise<AreaPhoto>

/** Google's types for a part of a city. Not parks or landmarks; a `locality` only as `pickAreaPlace` allows. */
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

/**
 * The kinds of stop whose photo can stand for the area around it, best
 * first. Hotels and stations are left out: a lobby or a platform says nothing
 * of the neighborhood. A stop with no kind ranks with "venue".
 */
export const STAND_IN_KINDS = ["neighborhood", "landmark", "shrine", "palace", "viewpoint", "market", "park", "museum", "experience", "shopping", "cafe", "restaurant", "bar", "venue"]

/** The Neighborhoods card shows one photo; each more is a paid media call nobody sees. */
export const AREA_PHOTOS = 1
const PHOTO_WIDTH_PX = 800
/** A district's point can sit a couple of kilometres from where a trip spends its time there (Jongno District, 2.2 km; measured). */
const NEAR_MIN_M = 2_500
const NEAR_SLACK_M = 1_500
/** A shrine or park is wide: Google's point for Fushimi Inari Taisha is 600 m from its gate (measured). Only a hit with the stop's own name may be this far. */
const SAME_NAME_RADIUS_M = 1_500
const STEP_MS = 4_000

const FIELDS = "places.id,places.displayName,places.types,places.location,places.photos"

export interface RawAreaPlace {
  id?: string
  displayName?: { text?: string }
  types?: string[]
  location?: { latitude?: number; longitude?: number }
  photos?: RawDetails["photos"]
}

/** "Hannam & Itaewon" → Hannam, Itaewon: an area named for two neighborhoods is looked up by each. */
export function nameParts(name: string): string[] {
  return name
    .split(/\s*(?:&|·|\+|\/|,|\band\b)\s*/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
}

/**
 * Whether a hit is this part of the city. Google files Tokyo's wards
 * ("Shibuya", "Shinjuku City", "渋谷区") only as `locality` (measured), so a
 * locality counts when its name starts with the name searched for and is not
 * the trip's city by another spelling ("Kyoto City" for Kyoto).
 */
function isAreaHit(place: RawAreaPlace, text: string, city: string): boolean {
  const name = foldName(place.displayName?.text ?? "")
  if (city && name === city) return false
  if (place.types?.some((type) => AREA_PLACE_TYPES.has(type))) return true
  if (!place.types?.includes("locality")) return false
  const wanted = foldName(text)
  return wanted !== "" && name.startsWith(wanted) && !(city && (name.includes(city) || city.includes(name)))
}

/** The first hit that is a part of the city near the stops, never a park or landmark of the same name. */
export function pickAreaPlace(places: readonly RawAreaPlace[], query: Pick<AreaPhotoQuery, "centre" | "reachM" | "city"> & { text: string }): RawAreaPlace | null {
  const limit = Math.max(NEAR_MIN_M, query.reachM + NEAR_SLACK_M)
  const city = foldName(query.city)
  for (const place of places) {
    const lat = place.location?.latitude
    const lng = place.location?.longitude
    if (typeof lat !== "number" || typeof lng !== "number") continue
    if (!isAreaHit(place, query.text, city)) continue
    if (haversineMeters(query.centre, { lat, lng }) <= limit) return place
  }
  return null
}

/** The stop whose photo can stand for the area (`STAND_IN_KINDS`), the first visited among the best kind; null when none can. */
export function standInStop<T extends PhotoStop>(stops: readonly T[]): T | null {
  const rank = (stop: PhotoStop) => STAND_IN_KINDS.indexOf(stop.category ?? "venue")
  let best: T | null = null
  for (const stop of stops) {
    const r = rank(stop)
    if (r >= 0 && (!best || r < rank(best))) best = stop
  }
  return best
}

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

/** What stands for an area: a place Google files as the area, or one of its stops (`of`), or nothing. */
type Subject = { place: RawAreaPlace; of?: string } | null

export function createGoogleAreaPhotos(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  {
    // Photo URIs carry no documented lifetime; `placeDetails.ts` keeps them half an hour.
    ttlMs = 30 * 60_000,
    // Which place stands for the area changes far more slowly than its photo links, so the
    // searches (up to four per area) are not repeated each time the links lapse.
    placeTtlMs = 24 * 60 * 60_000,
    now = Date.now,
  }: { ttlMs?: number; placeTtlMs?: number; now?: () => number } = {},
): AreaPhotoLookup {
  const answers = lapsing<AreaPhoto>(500, now)
  const subjects = lapsing<Subject>(500, now)

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

  const searchText = async (textQuery: string, languageCode: string, centre: LatLng, radius: number): Promise<RawAreaPlace[]> => {
    const res = await call("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify({
        textQuery,
        pageSize: 5,
        languageCode,
        // A bias only ranks; the pickers are what keep it local.
        locationBias: { circle: { center: { latitude: centre.lat, longitude: centre.lng }, radius } },
      }),
    })
    return ((await res.json()) as { places?: RawAreaPlace[] }).places ?? []
  }

  const areaPlace = async (query: AreaPhotoQuery): Promise<RawAreaPlace | null> => {
    const texts = [...nameParts(query.name), ...(query.localName ? nameParts(query.localName) : [])]
    for (const text of new Set(texts)) {
      const places = await searchText(`${text}, ${query.city}`.replace(/,\s*$/, ""), nameLanguage(text, query.centre), query.centre, Math.min(50_000, Math.max(2_000, query.reachM * 2)))
      const place = pickAreaPlace(places, { ...query, text })
      if (place) return place
    }
    return null
  }

  const stopPlace = async (stop: PhotoStop): Promise<RawAreaPlace | null> => {
    if (stop.placeId && PLACE_ID.test(stop.placeId)) {
      const res = await call(`https://places.googleapis.com/v1/places/${encodeURIComponent(stop.placeId)}`, {
        method: "GET",
        headers: { "X-Goog-FieldMask": "id,displayName,photos" },
      })
      return (await res.json()) as RawAreaPlace
    }
    const places = await searchText(stop.name, nameLanguage(stop.name, stop), stop, MATCH_RADIUS_M)
    return (
      places.find((place) => {
        const lat = place.location?.latitude
        const lng = place.location?.longitude
        if (typeof lat !== "number" || typeof lng !== "number") return false
        const meters = haversineMeters(stop, { lat, lng })
        const found = place.displayName?.text ?? ""
        return (meters <= MATCH_RADIUS_M && plausibleName(stop.name, found)) || (meters <= SAME_NAME_RADIUS_M && sameName(stop.name, found))
      }) ?? null
    )
  }

  const subjectFor = async (query: AreaPhotoQuery): Promise<Subject> => {
    const place = await areaPlace(query)
    if (place) return { place }
    const stop = standInStop(query.stops)
    const stand = stop ? await stopPlace(stop) : null
    return stand?.photos?.length ? { place: stand, of: stop!.name } : null
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
    let subject = subjects.get(key)
    if (subject === undefined) {
      subject = await subjectFor(query)
      subjects.set(key, subject, placeTtlMs)
    }
    const wanted = (subject?.place.photos ?? []).filter((photo) => photo.name).slice(0, AREA_PHOTOS)
    const uris = await Promise.all(wanted.map((photo) => photoUri(photo.name!)))
    const photos = wanted.flatMap((photo, i) => (uris[i] ? [toPlacePhoto(photo, uris[i]!, PHOTO_WIDTH_PX)] : []))
    const answer: AreaPhoto = photos.length > 0 && subject?.of ? { photos, of: subject.of } : { photos }
    // A photo that failed to resolve is worth asking for again soon; a place with none is an answer.
    if (photos.length === wanted.length) answers.set(key, answer, ttlMs)
    return answer
  }
}

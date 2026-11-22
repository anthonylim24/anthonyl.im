import { Effect, Either } from "effect"
import { HttpStatusError } from "../../effect/errors"
import { bearerHeaders, fetchApi, fetchExternal, parseJson, readAuthToken, type GetToken } from "../../effect/http"
import { runPromise } from "../../effect/runtime"
import { distanceMeters } from "./map/geo"

// Place search for the planner. Cities come from Open-Meteo's geocoder
// (ranked by population, includes the IANA timezone). Points of interest
// come from three searches at once, merged local first:
//   - our server's Google Places search (signed in only), which knows the
//     small venues OpenStreetMap lacks, biased toward the trip;
//   - Photon (OpenStreetMap) inside a box around the trip;
//   - Photon worldwide, biased toward the trip, for anything farther.
// Only the typed query and a coarse bias point leave the browser.

export interface CityResult {
  id: string
  name: string
  region?: string
  country?: string
  countryCode?: string
  lat: number
  lng: number
  timezone?: string
}

export interface PlaceResult {
  id: string
  name: string
  /** "Street 12, District, City" — what distinguishes two same-named results. */
  context: string
  address?: string
  lat: number
  lng: number
  category?: string
  /** Google place id: the result came from Google Maps. */
  placeId?: string
}

interface OpenMeteoRow {
  id: number
  name: string
  latitude: number
  longitude: number
  country?: string
  country_code?: string
  admin1?: string
  timezone?: string
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: {
    osm_id?: number
    osm_type?: string
    osm_key?: string
    osm_value?: string
    name?: string
    street?: string
    housenumber?: string
    district?: string
    locality?: string
    city?: string
    state?: string
    country?: string
  }
}

const searchCitiesEffect = Effect.fn("Geocode.searchCities")(function* (query: string, signal?: AbortSignal) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`
  const res = yield* fetchExternal(url, { signal })
  // A failed search is not "no such place": the field offers Retry for one.
  if (!res.ok) return yield* Effect.fail(new HttpStatusError({ status: res.status, message: "Couldn’t search for places." }))
  const body = yield* parseJson<{ results?: OpenMeteoRow[] }>(res)
  return (body.results ?? []).map(
    (row): CityResult => ({
      id: String(row.id),
      name: row.name,
      region: row.admin1 && row.admin1 !== row.name ? row.admin1 : undefined,
      country: row.country,
      countryCode: row.country_code,
      lat: row.latitude,
      lng: row.longitude,
      timezone: row.timezone,
    }),
  )
})

/** OSM tag → the place categories the itinerary already knows (theme.ts icons). */
function categoryFor(key?: string, value?: string): string | undefined {
  const v = value ?? ""
  if (key === "amenity") {
    if (["restaurant", "fast_food", "food_court"].includes(v)) return "restaurant"
    if (v === "cafe") return "cafe"
    if (["bar", "pub", "nightclub", "biergarten"].includes(v)) return "bar"
    if (v === "marketplace") return "market"
    if (v === "place_of_worship") return "shrine"
    if (["theatre", "cinema", "arts_centre"].includes(v)) return "venue"
  }
  if (key === "tourism") {
    if (["museum", "gallery"].includes(v)) return "museum"
    if (v === "viewpoint") return "viewpoint"
    if (["hotel", "hostel", "guest_house", "apartment", "motel", "resort", "chalet", "alpine_hut"].includes(v)) return "hotel"
    if (["attraction", "theme_park", "zoo", "aquarium"].includes(v)) return "experience"
    return "landmark"
  }
  if (key === "historic") return v === "castle" || v === "palace" ? "palace" : "landmark"
  if (key === "leisure") return v === "resort" ? "hotel" : ["park", "garden", "nature_reserve"].includes(v) ? "park" : "experience"
  if (key === "natural") return v === "peak" || v === "beach" ? "viewpoint" : "park"
  if (key === "building" && ["hotel", "dormitory"].includes(v)) return "hotel"
  if (key === "shop") return "shopping"
  if (key === "railway" || key === "aeroway" || key === "public_transport") return "transit"
  if (key === "place") return "neighborhood"
  return undefined
}

const CLUTTER_KEYS = new Set(["highway", "landuse", "boundary", "aeroway", "power", "barrier", "waterway"])
const CLUTTER_AMENITIES = new Set(["charging_station", "parking", "parking_space", "bicycle_parking", "bench", "atm", "toilets", "waste_basket", "vending_machine"])

/** Map furniture that shares a venue's name. */
export function isClutter(key?: string, value?: string): boolean {
  if (!key) return false
  if (CLUTTER_KEYS.has(key)) return true
  return key === "amenity" && CLUTTER_AMENITIES.has(value ?? "")
}

/** Photon features → results, map furniture dropped unless nothing else matched. */
function photonPlaces(features: PhotonFeature[]): PlaceResult[] {
  const out: PlaceResult[] = []
  // A hotel's name also matches its bus stop, car charger and the street
  // it is on. Those are never what a traveller is adding: keep them only
  // when nothing better matched.
  const useful = features.filter((feature) => !isClutter(feature.properties?.osm_key, feature.properties?.osm_value))
  for (const feature of (useful.length > 0 ? useful : features).slice(0, 10)) {
    const p = feature.properties ?? {}
    const coords = feature.geometry?.coordinates
    if (!p.name || !coords) continue
    const street = [p.street, p.housenumber].filter(Boolean).join(" ")
    const area = [p.district ?? p.locality, p.city, p.country].filter(
      (part, i, all): part is string => Boolean(part) && all.indexOf(part) === i && part !== p.name,
    )
    const context = [street, ...area].filter(Boolean).join(", ")
    out.push({
      id: `${p.osm_type ?? "x"}${p.osm_id ?? out.length}`,
      name: p.name,
      context,
      address: context || undefined,
      lat: coords[1],
      lng: coords[0],
      category: categoryFor(p.osm_key, p.osm_value),
    })
  }
  return out
}

const photonEffect = Effect.fn("Geocode.photon")(function* (url: string, signal?: AbortSignal) {
  const res = yield* fetchExternal(url, { signal })
  if (!res.ok) return [] as PlaceResult[]
  const body = yield* parseJson<{ features?: PhotonFeature[] }>(res)
  return photonPlaces(body.features ?? [])
})

/** Half the side of the "near the trip" box, in degrees of latitude (about 55 km). */
const LOCAL_BOX_DEG = 0.5

/** Photon's `bbox` around `near`: minLon,minLat,maxLon,maxLat. */
export function localBox(near: { lat: number; lng: number }): string {
  const dLng = LOCAL_BOX_DEG / Math.max(0.2, Math.cos((near.lat * Math.PI) / 180))
  const clamp = (n: number, limit: number) => Math.min(limit, Math.max(-limit, n))
  return [clamp(near.lng - dLng, 180), clamp(near.lat - LOCAL_BOX_DEG, 90), clamp(near.lng + dLng, 180), clamp(near.lat + LOCAL_BOX_DEG, 90)]
    .map((n) => n.toFixed(2))
    .join(",")
}

const isPlace = (value: unknown): value is PlaceResult => {
  const p = value as Partial<PlaceResult> | null
  return (
    typeof p === "object" && p !== null &&
    typeof p.id === "string" && typeof p.name === "string" && p.name.trim() !== "" &&
    typeof p.lat === "number" && Number.isFinite(p.lat) && typeof p.lng === "number" && Number.isFinite(p.lng)
  )
}

/** Google Places through our server. Any refusal (no key, rate limit, signed out) is "no extra results". */
const googleEffect = Effect.fn("Geocode.google")(function* (
  query: string,
  near: { lat: number; lng: number } | null,
  getToken: GetToken,
  signal?: AbortSignal,
) {
  const token = yield* readAuthToken(getToken)
  if (!token) return [] as PlaceResult[]
  const params = new URLSearchParams({ q: query })
  if (near) {
    params.set("lat", near.lat.toFixed(2))
    params.set("lng", near.lng.toFixed(2))
  }
  const res = yield* fetchApi(`/api/places/search?${params}`, { headers: bearerHeaders(token), signal, cache: "no-store" })
  if (!res.ok) return [] as PlaceResult[]
  const body = yield* parseJson<{ places?: unknown }>(res)
  if (!Array.isArray(body.places)) return [] as PlaceResult[]
  return body.places.filter(isPlace).map(
    (p): PlaceResult => ({
      id: p.id,
      name: p.name.trim(),
      context: typeof p.context === "string" ? p.context : "",
      address: typeof p.address === "string" && p.address ? p.address : undefined,
      lat: p.lat,
      lng: p.lng,
      category: typeof p.category === "string" ? p.category : undefined,
      placeId: typeof p.placeId === "string" && p.placeId ? p.placeId : undefined,
    }),
  )
})

/** Within this of the trip, a result counts as local and is listed first. */
export const LOCAL_METERS = 80_000
/** Two results this close with the same name are one place. */
const SAME_PLACE_METERS = 300
export const MAX_PLACE_RESULTS = 8

/** "Leonard’s Bakery" and "LEONARDS bakery" are the same name. */
export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .normalize("NFC")
}

/**
 * One list from every source, in the order given (best source first): a
 * place two sources both found appears once, as the first source had it;
 * places near the trip come before far ones, each keeping its source order.
 */
export function rankPlaces(sources: readonly (readonly PlaceResult[])[], near: { lat: number; lng: number } | null, limit = MAX_PLACE_RESULTS): PlaceResult[] {
  const kept: PlaceResult[] = []
  for (const place of sources.flat()) {
    const key = nameKey(place.name)
    const repeat = kept.some(
      (seen) => seen.id === place.id || (nameKey(seen.name) === key && distanceMeters(seen, place) < SAME_PLACE_METERS),
    )
    if (!repeat) kept.push(place)
  }
  if (!near) return kept.slice(0, limit)
  const local = kept.filter((place) => distanceMeters(near, place) <= LOCAL_METERS)
  const far = kept.filter((place) => distanceMeters(near, place) > LOCAL_METERS)
  return [...local, ...far].slice(0, limit)
}

const PHOTON = "https://photon.komoot.io/api/"
/** Google is asked only once a query is specific enough to be worth a paid call. */
const GOOGLE_MIN_LENGTH = 3

const searchPlacesEffect = Effect.fn("Geocode.searchPlaces")(function* (
  query: string,
  near: { lat: number; lng: number } | null,
  signal?: AbortSignal,
  getToken?: GetToken,
) {
  const q = encodeURIComponent(query)
  const bias = near ? `&lat=${near.lat.toFixed(2)}&lon=${near.lng.toFixed(2)}&location_bias_scale=0.1` : ""
  const legs = [
    getToken && query.length >= GOOGLE_MIN_LENGTH ? googleEffect(query, near, getToken, signal) : null,
    near ? photonEffect(`${PHOTON}?q=${q}&limit=10&lang=en&bbox=${localBox(near)}`, signal) : null,
    photonEffect(`${PHOTON}?q=${q}&limit=15&lang=en${bias}`, signal),
  ].filter((leg) => leg !== null)
  const answers = yield* Effect.all(legs.map((leg) => Effect.either(leg)), { concurrency: "unbounded" })
  const found = answers.filter(Either.isRight).map((answer) => answer.right)
  // One source down is fewer results; every source down is a failed search.
  if (found.length === 0) {
    const first = answers.find(Either.isLeft)
    if (first) return yield* Effect.fail(first.left)
  }
  return rankPlaces(found, near)
})

const swallowAbort = <T,>(fallback: T) =>
  (err: unknown): T => {
    if (err instanceof Error && err.name === "AbortError") return fallback
    throw err
  }

/** Cities matching `query`. Rejects when the search itself fails (offline, an error status); an abort resolves to []. */
export function searchCities(query: string, signal?: AbortSignal): Promise<CityResult[]> {
  return runPromise(searchCitiesEffect(query, signal)).catch(swallowAbort<CityResult[]>([]))
}

/**
 * Places matching `query`, the ones near `near` first. With `getToken`, a
 * signed-in search adds Google's results to OpenStreetMap's. Rejects only
 * when every source failed; an abort resolves to [].
 */
export function searchPlaces(
  query: string,
  near: { lat: number; lng: number } | null,
  signal?: AbortSignal,
  getToken?: GetToken,
): Promise<PlaceResult[]> {
  return runPromise(searchPlacesEffect(query, near, signal, getToken)).catch(swallowAbort<PlaceResult[]>([]))
}

export function cityLabel(city: Pick<CityResult, "name" | "region" | "country">): string {
  return [city.name, city.region, city.country].filter(Boolean).join(", ")
}

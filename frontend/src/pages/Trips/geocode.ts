import { Effect } from "effect"
import { fetchExternal, parseJson } from "../../effect/http"
import { runPromise } from "../../effect/runtime"

// Keyless place search for the planner. Cities come from Open-Meteo's
// geocoder (ranked by population, includes the IANA timezone); points of
// interest come from Photon (OpenStreetMap), biased toward the trip.
// Both are public APIs: only the typed query and a coarse bias point are sent.

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
  if (!res.ok) return [] as CityResult[]
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
    if (["hotel", "hostel", "guest_house", "apartment", "motel"].includes(v)) return "hotel"
    if (["attraction", "theme_park", "zoo", "aquarium"].includes(v)) return "experience"
    return "landmark"
  }
  if (key === "historic") return v === "castle" || v === "palace" ? "palace" : "landmark"
  if (key === "leisure") return ["park", "garden", "nature_reserve"].includes(v) ? "park" : "experience"
  if (key === "natural") return v === "peak" || v === "beach" ? "viewpoint" : "park"
  if (key === "shop") return "shopping"
  if (key === "railway" || key === "aeroway" || key === "public_transport") return "transit"
  if (key === "place") return "neighborhood"
  return undefined
}

const searchPlacesEffect = Effect.fn("Geocode.searchPlaces")(function* (
  query: string,
  near: { lat: number; lng: number } | null,
  signal?: AbortSignal,
) {
  const bias = near ? `&lat=${near.lat.toFixed(2)}&lon=${near.lng.toFixed(2)}&location_bias_scale=0.4` : ""
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&lang=en${bias}`
  const res = yield* fetchExternal(url, { signal })
  if (!res.ok) return [] as PlaceResult[]
  const body = yield* parseJson<{ features?: PhotonFeature[] }>(res)
  const out: PlaceResult[] = []
  for (const feature of body.features ?? []) {
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
})

const swallowAbort = <T,>(fallback: T) =>
  (err: unknown): T => {
    if (err instanceof Error && err.name === "AbortError") return fallback
    throw err
  }

export function searchCities(query: string, signal?: AbortSignal): Promise<CityResult[]> {
  return runPromise(searchCitiesEffect(query, signal)).catch(swallowAbort<CityResult[]>([]))
}

export function searchPlaces(
  query: string,
  near: { lat: number; lng: number } | null,
  signal?: AbortSignal,
): Promise<PlaceResult[]> {
  return runPromise(searchPlacesEffect(query, near, signal)).catch(swallowAbort<PlaceResult[]>([]))
}

export function cityLabel(city: Pick<CityResult, "name" | "region" | "country">): string {
  return [city.name, city.region, city.country].filter(Boolean).join(", ")
}

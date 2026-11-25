import { haversineMeters } from "../data/koreaPlaces"
import { nameParts } from "./areaPhotos"
import type { LatLng } from "./conciergeTools"
import { foldName } from "./placeDetails"

// The real outline of a neighbourhood, drawn on the trip map when the
// traveller asks to see the area. OpenStreetMap's Nominatim has one for
// about half the areas a trip names (measured: 청담동, 한남동, 해운대구, Le
// Marais and Bairro Alto have boundaries; Itaewon, Chiado and the West
// Village are points), and sometimes the wrong one (삼성동 first answers the
// Samseong-dong in Gwanak-gu, 10 km from the one in Gangnam). So a shape is
// used only when it is a boundary of a part of a city, not too big, and
// holds at least half of the area's stops; otherwise the answer is null and
// the client draws a soft shape around the stops, labelled as approximate.
//
// Nominatim's usage policy: at most one request a second from the whole
// server, an identifying User-Agent, and results cached. Requests queue
// here one after another; a queue too long to answer in time gives up
// rather than wait, and a failed request is never cached as "no outline".

export type OutlineGeometry = { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] }

export interface OutlineQuery {
  /** The area's names to try, best first (the local name, then the English one). Each may be two names joined ("Hannam & Itaewon"). */
  names: string[]
  city: string
  /** The area's stops. */
  stops: readonly LatLng[]
}

/** The area's outline, or null when there is none worth drawing. Throws when Nominatim could not be asked (busy, down). */
export type AreaOutlineLookup = (query: OutlineQuery) => Promise<OutlineGeometry | null>

/** One Nominatim `jsonv2` result, as far as this module reads it. */
export interface NominatimResult {
  name?: string
  category?: string
  type?: string
  addresstype?: string
  geojson?: { type?: string; coordinates?: unknown }
}

/** Parts of a city, or a town or village of their own. Never a city, county, region or country. */
const AREA_KINDS = new Set(["suburb", "quarter", "neighbourhood", "borough", "city_district", "district", "village", "town", "hamlet"])
export const MAX_VERTICES = 5_000
/** Wider than a district (해운대구 is 20 km tall, measured) is a city. */
export const MAX_DIAGONAL_M = 30_000
/** One second between requests, with room for clock jitter. */
export const NOMINATIM_GAP_MS = 1_100
/** Past this many waiting, a new request gives up at once: it would not be answered in time. */
const MAX_QUEUED = 6
const REQUEST_MS = 6_000
const USER_AGENT = "anthonyl.im trips (https://anthonyl.im)"

type Ring = number[][]

const isPosition = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number" && Number.isFinite(value[0]) && Number.isFinite(value[1])
const isRing = (value: unknown): value is Ring => Array.isArray(value) && value.length >= 4 && value.every(isPosition)
const isPolygon = (value: unknown): value is Ring[] => Array.isArray(value) && value.length > 0 && value.every(isRing)

/** A result's shape as polygons (each a list of rings, outer first), or null when it is a point, a line or malformed. */
export function polygonsOf(geojson: NominatimResult["geojson"]): Ring[][] | null {
  if (geojson?.type === "Polygon" && isPolygon(geojson.coordinates)) return [geojson.coordinates]
  if (geojson?.type === "MultiPolygon" && Array.isArray(geojson.coordinates) && geojson.coordinates.length > 0 && geojson.coordinates.every(isPolygon)) {
    return geojson.coordinates
  }
  return null
}

/** Ray casting on lng/lat: fine at a neighbourhood's scale. */
function inRing(point: LatLng, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if (yi! > point.lat !== yj! > point.lat && point.lng < ((xj! - xi!) * (point.lat - yi!)) / (yj! - yi!) + xi!) inside = !inside
  }
  return inside
}

/** In a polygon's outer ring and none of its holes. */
export function inPolygons(point: LatLng, polygons: readonly Ring[][]): boolean {
  return polygons.some(([outer, ...holes]) => inRing(point, outer!) && !holes.some((hole) => inRing(point, hole)))
}

function diagonalM(polygons: readonly Ring[][]): number {
  let south = Infinity
  let north = -Infinity
  let west = Infinity
  let east = -Infinity
  for (const polygon of polygons) {
    for (const [lng, lat] of polygon[0]!) {
      south = Math.min(south, lat!)
      north = Math.max(north, lat!)
      west = Math.min(west, lng!)
      east = Math.max(east, lng!)
    }
  }
  return haversineMeters({ lat: south, lng: west }, { lat: north, lng: east })
}

/**
 * The first result that can stand for the area: a boundary of a part of a
 * city (`AREA_KINDS`), not the city itself, at most `MAX_DIAGONAL_M` across
 * and `MAX_VERTICES` points, holding at least one of `stops`. Null when none.
 */
export function acceptablePart(results: readonly NominatimResult[], city: string, stops: readonly LatLng[]): Ring[][] | null {
  const cityName = foldName(city)
  for (const result of results) {
    const kind = result.addresstype ?? result.type ?? ""
    if (!AREA_KINDS.has(kind)) continue
    if (cityName && foldName(result.name ?? "") === cityName) continue
    const polygons = polygonsOf(result.geojson)
    if (!polygons) continue
    if (polygons.flat(2).length > MAX_VERTICES || diagonalM(polygons) > MAX_DIAGONAL_M) continue
    if (stops.some((stop) => inPolygons(stop, polygons))) return polygons
  }
  return null
}

/** The parts joined, when together they hold at least half of the stops (and at least one). */
export function joinParts(parts: readonly Ring[][][], stops: readonly LatLng[]): OutlineGeometry | null {
  const polygons = parts.flat()
  if (polygons.length === 0) return null
  const inside = stops.filter((stop) => inPolygons(stop, polygons)).length
  if (inside === 0 || inside < Math.ceil(stops.length / 2)) return null
  return polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0]! } : { type: "MultiPolygon", coordinates: polygons }
}

export interface NominatimOptions {
  fetchImpl?: typeof fetch
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /** How long a search's results are kept. Outlines change rarely; the policy asks for caching. */
  ttlMs?: number
  gapMs?: number
}

export function createNominatimOutlines({
  fetchImpl = fetch,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ttlMs = 7 * 24 * 60 * 60_000,
  gapMs = NOMINATIM_GAP_MS,
}: NominatimOptions = {}): AreaOutlineLookup {
  const results = new Map<string, { until: number; value: NominatimResult[] }>()
  let queue: Promise<unknown> = Promise.resolve()
  let queued = 0
  let lastAt = -Infinity

  /** One search, after the one before it by at least `gapMs`. */
  const searchNow = async (text: string): Promise<NominatimResult[]> => {
    const wait = lastAt + gapMs - now()
    if (wait > 0) await sleep(wait)
    lastAt = now()
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
      q: text,
      format: "jsonv2",
      polygon_geojson: "1",
      // About 30 m: enough for a neighbourhood's edge, a fraction of the points.
      polygon_threshold: "0.0003",
      layer: "address",
      limit: "5",
    })}`
    const res = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
      signal: AbortSignal.timeout(REQUEST_MS),
    })
    if (!res.ok) {
      await res.text().catch(() => {})
      throw new Error(`nominatim ${res.status}`)
    }
    const json = (await res.json()) as unknown
    return Array.isArray(json) ? (json as NominatimResult[]) : []
  }

  const search = async (text: string): Promise<NominatimResult[]> => {
    const key = foldName(text)
    const hit = results.get(key)
    if (hit && now() < hit.until) return hit.value
    if (queued >= MAX_QUEUED) throw new Error("nominatim queue full")
    queued += 1
    const turn = queue.then(() => searchNow(text))
    queue = turn.catch(() => undefined)
    try {
      const value = await turn
      results.delete(key)
      if (results.size >= 1_000) results.delete(results.keys().next().value!)
      results.set(key, { until: now() + ttlMs, value })
      return value
    } finally {
      queued -= 1
    }
  }

  return async ({ names, city, stops }) => {
    if (stops.length === 0) return null
    // Each neighbourhood a two-name area is named for, by each of its names in turn.
    const partNames = names.map(nameParts)
    const count = Math.max(0, ...partNames.map((parts) => parts.length))
    const found: Ring[][][] = []
    for (let i = 0; i < count; i++) {
      for (const parts of partNames) {
        const part = parts[i]
        if (!part) continue
        const polygons = acceptablePart(await search(city ? `${part}, ${city}` : part), city, stops)
        if (polygons) {
          found.push(polygons)
          break
        }
      }
    }
    return joinParts(found, stops)
  }
}

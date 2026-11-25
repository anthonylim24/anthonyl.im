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
// holds most of the area's stops; otherwise the answer is null and
// the client draws a soft shape around the stops, labelled as approximate.
//
// Nominatim's usage policy: at most one request a second from the whole
// server, an identifying User-Agent, and results cached. Requests queue
// here one after another; a queue too long to answer in time gives up
// rather than wait, and a failed request is never cached as "no outline".
// What is cached is the answer for an area (its names, city and stops): the
// accepted shape or "none", never Nominatim's raw results, which carry every
// candidate's full polygon.

export type OutlineGeometry = { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] }

export interface OutlineQuery {
  /** The area's names to try, best first (the local name, then the English one). Each may be two names joined ("Hannam & Itaewon"). */
  names: string[]
  city: string
  /** The area's stops. */
  stops: readonly LatLng[]
}

/** The area's outline, or null when there is none worth drawing. Throws when Nominatim could not be asked (busy, down) or `signal` gave up. */
export type AreaOutlineLookup = (query: OutlineQuery, signal?: AbortSignal) => Promise<OutlineGeometry | null>

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
/** Answers kept, and the points their shapes may hold in all (a shape is at most `MAX_VERTICES`; most are a few hundred). */
const MAX_ANSWERS = 500
const MAX_HELD_POINTS = 250_000
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

/** The parts joined, when together they hold most of the stops: a boundary that leaves half of them out is not this area. */
export function joinParts(parts: readonly Ring[][][], stops: readonly LatLng[]): OutlineGeometry | null {
  const polygons = parts.flat()
  if (polygons.length === 0) return null
  const inside = stops.filter((stop) => inPolygons(stop, polygons)).length
  if (inside * 2 <= stops.length) return null
  return polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0]! } : { type: "MultiPolygon", coordinates: polygons }
}

export interface NominatimOptions {
  fetchImpl?: typeof fetch
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /** How long a search's results are kept. Outlines change rarely; the policy asks for caching. */
  ttlMs?: number
  gapMs?: number
  maxAnswers?: number
  maxHeldPoints?: number
}

const pointCount = (shape: OutlineGeometry | null) => (shape ? (shape.type === "Polygon" ? [shape.coordinates] : shape.coordinates).flat(2).length : 0)

/** The same area asked about again: its names, city and stops, not their order. */
const answerKey = ({ names, city, stops }: OutlineQuery) =>
  [names.map(foldName).join("|"), foldName(city), stops.map((stop) => `${stop.lat.toFixed(4)},${stop.lng.toFixed(4)}`).sort().join(";")].join("#")

const abortedBy = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => {
    if (signal.aborted) reject(signal.reason)
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true })
  })

export function createNominatimOutlines({
  fetchImpl = fetch,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ttlMs = 7 * 24 * 60 * 60_000,
  gapMs = NOMINATIM_GAP_MS,
  maxAnswers = MAX_ANSWERS,
  maxHeldPoints = MAX_HELD_POINTS,
}: NominatimOptions = {}): AreaOutlineLookup {
  const answers = new Map<string, { until: number; value: OutlineGeometry | null; points: number }>()
  let held = 0
  let queue: Promise<unknown> = Promise.resolve()
  let queued = 0
  let lastAt = -Infinity

  const forget = (key: string) => {
    const known = answers.get(key)
    if (!known) return
    held -= known.points
    answers.delete(key)
  }

  const remember = (key: string, value: OutlineGeometry | null) => {
    forget(key)
    const points = pointCount(value)
    for (const oldest of answers.keys()) {
      if (answers.size < maxAnswers && held + points <= maxHeldPoints) break
      forget(oldest)
    }
    answers.set(key, { until: now() + ttlMs, value, points })
    held += points
  }

  /** One search, after the one before it by at least `gapMs`. */
  const searchNow = async (text: string, signal?: AbortSignal): Promise<NominatimResult[]> => {
    const wait = lastAt + gapMs - now()
    if (wait > 0) await sleep(wait)
    // Gave up while queued: no request, and the next one need not wait for it.
    signal?.throwIfAborted()
    lastAt = now()
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
      q: text,
      format: "jsonv2",
      polygon_geojson: "1",
      // About 30 m: enough for a neighborhood's edge, a fraction of the points.
      polygon_threshold: "0.0003",
      layer: "address",
      limit: "5",
    })}`
    const timeout = AbortSignal.timeout(REQUEST_MS)
    const res = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (!res.ok) {
      await res.text().catch(() => {})
      throw new Error(`nominatim ${res.status}`)
    }
    const json = (await res.json()) as unknown
    return Array.isArray(json) ? (json as NominatimResult[]) : []
  }

  const search = async (text: string, signal?: AbortSignal): Promise<NominatimResult[]> => {
    signal?.throwIfAborted()
    if (queued >= MAX_QUEUED) throw new Error("nominatim queue full")
    queued += 1
    const turn = queue.then(() => searchNow(text, signal))
    queue = turn.catch(() => undefined)
    try {
      return await (signal ? Promise.race([turn, abortedBy(signal)]) : turn)
    } finally {
      queued -= 1
    }
  }

  return async (query, signal) => {
    const { names, city, stops } = query
    if (stops.length === 0) return null
    const key = answerKey(query)
    const known = answers.get(key)
    if (known && now() < known.until) return known.value
    // Each neighborhood a two-name area is named for, by each of its names in turn.
    const partNames = names.map(nameParts)
    const count = Math.max(0, ...partNames.map((parts) => parts.length))
    const found: Ring[][][] = []
    for (let i = 0; i < count; i++) {
      for (const parts of partNames) {
        const part = parts[i]
        if (!part) continue
        const polygons = acceptablePart(await search(city ? `${part}, ${city}` : part, signal), city, stops)
        if (polygons) {
          found.push(polygons)
          break
        }
      }
    }
    const outline = joinParts(found, stops)
    remember(key, outline)
    return outline
  }
}

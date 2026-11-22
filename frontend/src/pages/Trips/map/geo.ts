import type { ItineraryItem, Trip, TripDay } from "../types"

// Pure geometry + pin derivation for the Trips map. No MapLibre imports, so
// pages and tests can use it without loading the map chunk.

export interface LngLat {
  lat: number
  lng: number
}

export interface AtlasPin extends LngLat {
  id: string
  title: string
  /** Text inside a stop pin (its order in the day, or the day number). */
  label?: string
  /** `stop`: numbered teardrop. `dot`: small round marker. `trip`: dot + name chip. */
  variant?: "stop" | "dot" | "trip"
  /** Per-pin accent (index globe: each trip keeps its own colour). */
  accent?: string
  /** Just added: plays the drop-in animation once. */
  fresh?: boolean
}

const EARTH_M = 6_371_000
const rad = (deg: number) => (deg * Math.PI) / 180

export function distanceMeters(a: LngLat, b: LngLat): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Diagonal of the points' bounding box, in metres. */
export function spanMeters(points: readonly LngLat[]): number {
  if (points.length < 2) return 0
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const p of points) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng)
    maxLng = Math.max(maxLng, p.lng)
  }
  return distanceMeters({ lat: minLat, lng: minLng }, { lat: maxLat, lng: maxLng })
}

export function centroid(points: readonly LngLat[]): LngLat | null {
  if (points.length === 0) return null
  let lat = 0
  let lng = 0
  for (const p of points) {
    lat += p.lat
    lng += p.lng
  }
  return { lat: lat / points.length, lng: lng / points.length }
}

/**
 * The points worth framing: drops far outliers (one stop across the river)
 * so the camera fits where the trip mostly happens. Falls back to every
 * point when the trip is genuinely spread out.
 */
export function corePoints<T extends LngLat>(points: readonly T[]): T[] {
  if (points.length < 5) return [...points]
  const mid = centroid(points)!
  const distances = points.map((p) => distanceMeters(mid, p))
  const median = [...distances].sort((a, b) => a - b)[Math.floor(distances.length / 2)]!
  const kept = points.filter((_, i) => distances[i]! <= Math.max(median * 2.5, 400))
  return kept.length >= points.length * 0.7 ? kept : [...points]
}

export function isLocated(item: ItineraryItem): item is ItineraryItem & { location: LngLat & { name: string } } {
  return typeof item.location?.lat === "number" && typeof item.location?.lng === "number"
}

/**
 * Heading that parks places the traveller has not fitted into the day yet
 * (Instagram imports land here on a day that runs to a clock). Everything
 * under it is on the day but not on its route.
 */
export const TO_SCHEDULE = "To schedule"

export const isToSchedule = (item: ItineraryItem) => item.kind === "section" && (item.title ?? "").trim() === TO_SCHEDULE

/** The day's plan proper, and the places parked under "To schedule". */
export function splitDay(day: Pick<TripDay, "items">): { planned: ItineraryItem[]; parked: ItineraryItem[] } {
  const at = day.items.findIndex(isToSchedule)
  if (at < 0) return { planned: day.items, parked: [] }
  return { planned: day.items.slice(0, at), parked: day.items.slice(at + 1) }
}

/** A stop the traveller marked skipped: still on the day, never on its route. */
const isSkipped = (item: ItineraryItem) => item.status === "skipped"

/** Pinned stops on the day's route, in order. Parked and skipped places are not on it. */
export function locatedItems(day: TripDay): ItineraryItem[] {
  return splitDay(day).planned.filter((item) => isLocated(item) && !isSkipped(item))
}

/** Numbered stop pins for one day, in itinerary order, then a plain dot for each skipped or parked place. */
export function dayPins(day: TripDay, fresh?: ReadonlySet<string>): AtlasPin[] {
  const stops = locatedItems(day).map(
    (item, index): AtlasPin => ({
      id: item.id,
      lat: item.location!.lat!,
      lng: item.location!.lng!,
      title: item.title || item.location!.name,
      label: String(index + 1),
      variant: "stop",
      fresh: fresh?.has(item.id),
    }),
  )
  const skipped = splitDay(day)
    .planned.filter((item) => isLocated(item) && isSkipped(item))
    .map(
      (item): AtlasPin => ({
        id: item.id,
        lat: item.location!.lat!,
        lng: item.location!.lng!,
        title: `${item.title || item.location!.name} (skipped)`,
        variant: "dot",
      }),
    )
  const parked = splitDay(day)
    .parked.filter(isLocated)
    .map(
      (item): AtlasPin => ({
        id: item.id,
        lat: item.location.lat,
        lng: item.location.lng,
        title: `${item.title || item.location.name} (to schedule)`,
        variant: "dot",
        fresh: fresh?.has(item.id),
      }),
    )
  return [...stops, ...skipped, ...parked]
}

/** Id prefix for the overview's per-day pins. */
export const DAY_PIN = "day:"

/** One pin per day, at the middle of that day's stops, labelled with the day number. */
export function tripPins(trip: Pick<Trip, "days">): AtlasPin[] {
  return trip.days.flatMap((day, dayIndex) => {
    const mid = centroid(dayRoute(day))
    if (!mid) return []
    const count = locatedItems(day).length
    return [
      {
        id: `${DAY_PIN}${day.id}`,
        lat: mid.lat,
        lng: mid.lng,
        title: `Day ${dayIndex + 1}${day.title ? `, ${day.title}` : ""}: ${count} pinned ${count === 1 ? "stop" : "stops"}`,
        label: String(dayIndex + 1),
        variant: "stop" as const,
      },
    ]
  })
}

/** Every located stop on the trip (the overview's small dots). */
export function tripDots(trip: Pick<Trip, "days">): LngLat[] {
  return trip.days.flatMap(dayRoute)
}

export function dayRoute(day: TripDay): LngLat[] {
  return locatedItems(day).map((item) => ({ lat: item.location!.lat!, lng: item.location!.lng! }))
}

/** Everything a pin draws, as one string: equal keys need no map update. */
export function pinsKey(pins: readonly AtlasPin[]): string {
  return pins.map((p) => `${p.id}|${p.lat}|${p.lng}|${p.label ?? ""}|${p.title}|${p.variant ?? ""}|${p.accent ?? ""}|${p.fresh ? 1 : 0}`).join("\n")
}

/** Route geometry as one string, for the same purpose. */
export function routesKey(routes: readonly (readonly LngLat[])[]): string {
  return routes.map((route) => route.map((p) => `${p.lat},${p.lng}`).join(";")).join("|")
}

/** Straight-line length of a day's route, in metres. */
export function routeMeters(points: readonly LngLat[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += distanceMeters(points[i - 1]!, points[i]!)
  return total
}

export function formatCoord(point: LngLat): string {
  const lat = `${Math.abs(point.lat).toFixed(2)}°${point.lat >= 0 ? "N" : "S"}`
  const lng = `${Math.abs(point.lng).toFixed(2)}°${point.lng >= 0 ? "E" : "W"}`
  return `${lat} ${lng}`
}

/**
 * Project points into a `width × height` box for the cover charts. Longitude
 * is scaled by cos(latitude) so a city doesn't look stretched; a lone point
 * (or none) lands in the middle.
 */
export function projectToBox(
  points: readonly LngLat[],
  width: number,
  height: number,
  inset: number,
): Array<{ x: number; y: number }> {
  if (points.length === 0) return []
  const mid = centroid(points)!
  const k = Math.cos(rad(mid.lat))
  const xs = points.map((p) => (p.lng - mid.lng) * k)
  const ys = points.map((p) => -(p.lat - mid.lat))
  const spanX = Math.max(...xs) - Math.min(...xs)
  const spanY = Math.max(...ys) - Math.min(...ys)
  const scale = Math.min((width - inset * 2) / (spanX || 1), (height - inset * 2) / (spanY || 1))
  const usable = spanX === 0 && spanY === 0 ? 0 : scale
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2
  return xs.map((x, i) => ({
    x: width / 2 + (x - cx) * usable,
    y: height / 2 + (ys[i]! - cy) * usable,
  }))
}

/** A pin where the camera puts it on screen, with its place in the day (its number). */
export interface ScreenPin {
  id: string
  x: number
  y: number
  /** The pin's number; pins that share a spot line up in this order. */
  rank: number
}

/**
 * Sideways offsets that keep pins from covering each other. Pins closer than
 * `width` × `height` px form a row, numbered left to right in their own order
 * ("1 2 3 4", never "2 3 4 1"), and centred on where they stand, so a row
 * stays inside the frame the camera fitted to the points.
 */
export function spreadPins(pins: readonly ScreenPin[], width = 30, height = 26): Map<string, number> {
  const placed: Array<{ pin: ScreenPin; x: number; row: number }> = []
  let rows = 0
  for (const pin of [...pins].sort((a, b) => a.x - b.x || a.rank - b.rank)) {
    let x = pin.x
    let row = -1
    for (let pass = 0; pass < 6; pass++) {
      // Half a pixel of slack: a pin moved to exactly `width` past another
      // can measure 29.999… away in floating point and be "hit" by it again,
      // which stacked the fourth pin of a crowd on the third.
      const hit = placed.find((p) => Math.abs(p.x - x) < width - 0.5 && Math.abs(p.pin.y - pin.y) < height)
      if (!hit) break
      x = hit.x + width
      row = hit.row
    }
    placed.push({ pin, x, row: row >= 0 ? row : rows++ })
  }
  const offsets = new Map<string, number>()
  for (let r = 0; r < rows; r++) {
    const members = placed.filter((p) => p.row === r)
    const slots = members.map((p) => p.x).sort((a, b) => a - b)
    const byRank = [...members].sort((a, b) => a.pin.rank - b.pin.rank || a.pin.x - b.pin.x)
    // Move the row so its middle sits over the middle of the pins it holds.
    const shift = (members.reduce((sum, p) => sum + p.pin.x, 0) - slots.reduce((sum, x) => sum + x, 0)) / members.length
    byRank.forEach((p, i) => offsets.set(p.pin.id, Math.round(slots[i]! + shift - p.pin.x)))
  }
  return offsets
}

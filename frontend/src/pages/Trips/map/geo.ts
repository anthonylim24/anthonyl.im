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

export function isLocated(item: ItineraryItem): item is ItineraryItem & { location: LngLat & { name: string } } {
  return typeof item.location?.lat === "number" && typeof item.location?.lng === "number"
}

export function locatedItems(day: TripDay): ItineraryItem[] {
  return day.items.filter(isLocated)
}

/** Numbered stop pins for one day, in itinerary order. */
export function dayPins(day: TripDay, fresh?: ReadonlySet<string>): AtlasPin[] {
  return locatedItems(day).map((item, index) => ({
    id: item.id,
    lat: item.location!.lat!,
    lng: item.location!.lng!,
    title: item.title || item.location!.name,
    label: String(index + 1),
    variant: "stop",
    fresh: fresh?.has(item.id),
  }))
}

/** Every located stop on the trip as a dot labelled with its day number. */
export function tripPins(trip: Pick<Trip, "days">): AtlasPin[] {
  return trip.days.flatMap((day, dayIndex) =>
    locatedItems(day).map((item) => ({
      id: item.id,
      lat: item.location!.lat!,
      lng: item.location!.lng!,
      title: `${item.title || item.location!.name} · Day ${dayIndex + 1}`,
      label: String(dayIndex + 1),
      variant: "dot" as const,
    })),
  )
}

export function dayRoute(day: TripDay): LngLat[] {
  return locatedItems(day).map((item) => ({ lat: item.location!.lat!, lng: item.location!.lng! }))
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

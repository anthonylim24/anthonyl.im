import { distanceMeters, isLocated, type LngLat } from "../map/geo"
import { formatClock } from "../meta"
import type { ItineraryItem, TripDay } from "../types"

// The day as the 3D view sees it: located items in itinerary order, the
// legs between them, and the stepping rules for the tour. Pure.

export interface Stop extends LngLat {
  id: string
  /** 0-based position among the day's located stops. */
  index: number
  /** The number on the pin; matches the day map. */
  label: string
  /** The place's own name ("Jerónimos Monastery"): what a map label should say. */
  title: string
  /** The plan's wording ("Opening entry at Jerónimos Monastery") when it says something different. */
  plan?: string
  item: ItineraryItem
}

export function dayStops(day: TripDay): Stop[] {
  return day.items.filter(isLocated).map((item, index) => ({
    id: item.id,
    index,
    label: String(index + 1),
    title: item.location.name || item.title,
    plan: item.title && item.location.name && item.title.trim() !== item.location.name.trim() ? item.title : undefined,
    lat: item.location.lat,
    lng: item.location.lng,
    item,
  }))
}

/** Straight-line walking pace used across Trips. */
export const WALK_M_PER_MIN = 80
/** Past this a leg is not a walk, and we don't invent a duration for it. */
export const WALK_LIMIT_M = 3000

export interface Leg {
  meters: number
  /** Null when the leg is too long to call a walk. */
  walkMinutes: number | null
  from: string
}

/** The leg that arrives at `index`, or null for the first stop. */
export function legInto(stops: readonly Stop[], index: number): Leg | null {
  const to = stops[index]
  const from = stops[index - 1]
  if (!to || !from) return null
  const meters = distanceMeters(from, to)
  return {
    meters,
    walkMinutes: meters <= WALK_LIMIT_M ? Math.max(1, Math.round(meters / WALK_M_PER_MIN)) : null,
    from: from.title,
  }
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`
}

/** "650 m · 8 min walk" or, for a hop too long to walk, "4.2 km · ride" (no invented duration). */
export function legSummary(leg: Leg): string {
  const distance = formatDistance(leg.meters)
  return leg.walkMinutes === null ? `${distance} · ride` : `${distance} · ${leg.walkMinutes} min walk`
}

export function dayMeters(stops: readonly Stop[]): number {
  let total = 0
  for (let i = 1; i < stops.length; i++) total += distanceMeters(stops[i - 1]!, stops[i]!)
  return total
}

/** "2:30 PM – 4:00 PM", "2:30 PM", or "". */
export function timeRange(item: Pick<ItineraryItem, "time" | "endTime">): string {
  const start = formatClock(item.time)
  if (!start) return ""
  const end = formatClock(item.endTime)
  return end ? `${start} – ${end}` : start
}

/** Previous / next with hard ends. Stepping from "nothing selected" lands on the first or last stop. */
export function stepIndex(current: number | null, delta: 1 | -1, count: number): number | null {
  if (count === 0) return null
  if (current === null) return delta > 0 ? 0 : count - 1
  return Math.min(count - 1, Math.max(0, current + delta))
}

/** Where the tour goes next; null means it has shown the last stop and should stop. */
export function tourNext(current: number | null, count: number): number | null {
  if (count === 0) return null
  if (current === null) return 0
  return current + 1 < count ? current + 1 : null
}

/** Where pressing Play starts: the current stop, or the top when on the last one (or nowhere). */
export function tourStart(current: number | null, count: number): number | null {
  if (count === 0) return null
  if (current === null || current >= count - 1) return 0
  return current
}

export function announcement(stop: Stop, count: number): string {
  const time = formatClock(stop.item.time)
  return `Stop ${stop.index + 1} of ${count}: ${stop.title}${time ? `, ${time}` : ""}`
}

/** Show "you" only when you could plausibly be on this map. */
export const NEARBY_M = 50_000

/** Distance from the traveller to the nearest stop, in metres (Infinity with no stops). */
export function distanceToStops(user: LngLat, stops: readonly LngLat[]): number {
  let nearest = Infinity
  for (const stop of stops) nearest = Math.min(nearest, distanceMeters(user, stop))
  return nearest
}

export function isNearby(user: LngLat, stops: readonly LngLat[]): boolean {
  return distanceToStops(user, stops) <= NEARBY_M
}

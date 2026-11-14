import { distanceMeters, isLocated, locatedItems, splitDay, type LngLat } from "../map/geo"
import { formatClock } from "../meta"
import { formatDistance, formatWalkMinutes } from "../reservationView"
import type { ItineraryItem, TripDay } from "../types"

// The day as the 3D view sees it: located items in itinerary order, the
// legs between them, and the stepping rules for the tour. Pure.

export { formatDistance }

export interface Stop extends LngLat {
  id: string
  /** 0-based position among the day's located stops. */
  index: number
  /** The number on the pin; matches the day map. */
  label: string
  /** What the stop is called everywhere: the same name the day list shows. */
  title: string
  /** A second line, only when the plan's wording says something the name doesn't. */
  plan?: string
  /** On the day but not on its route yet: parked under "To schedule" (Instagram imports land there). */
  parked: boolean
  /** The Instagram post this place was saved from, when it has one. */
  instagram?: string
  item: ItineraryItem
}

/** The first link that is an Instagram post, reel or profile; undefined otherwise. */
export function instagramLink(item: Pick<ItineraryItem, "links">): string | undefined {
  for (const link of item.links ?? []) {
    try {
      const url = new URL(link)
      const host = url.hostname.toLowerCase().replace(/^www\./, "")
      if (url.protocol === "https:" && (host === "instagram.com" || host === "instagr.am")) return url.toString()
    } catch {
      // Not a URL: not a link we can open.
    }
  }
  return undefined
}

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()

/** "Lunch at …", "Sunset from …", "Visit …": a plan for a place rather than the place's name. */
const ACTIVITY = /(\s(at|from)\s)|^(breakfast|brunch|lunch|dinner|coffee|drinks|sunset|sunrise|visit|explore|walk|stroll|browse|tour)\b/i

/**
 * The item's title is the name, as in the day list. Only when the title is
 * an activity phrase about a differently-named place ("Lunch at the market"
 * for "Time Out Market Lisboa") does the place lead and the phrase follow.
 */
export function stopNames(title: string | undefined, place: string | undefined): { title: string; plan?: string } {
  const t = title?.trim() ?? ""
  const p = place?.trim() ?? ""
  if (!t || !p) return { title: t || p }
  const a = fold(t)
  const b = fold(p)
  if (a.includes(b) || b.includes(a)) return { title: t }
  return ACTIVITY.test(t) ? { title: p, plan: t } : { title: t }
}

export function dayStops(day: TripDay): Stop[] {
  // `locatedItems` decides what counts as a stop (and what is merely "to schedule").
  return locatedItems(day).map((item, index) => ({
    id: item.id,
    index,
    label: String(index + 1),
    ...stopNames(item.title, item.location?.name),
    parked: false,
    instagram: instagramLink(item),
    lat: item.location!.lat!,
    lng: item.location!.lng!,
    item,
  }))
}

/**
 * Located places parked under "To schedule". They stand on the map as
 * secondary pins: no number, no leg, and the tour never visits them.
 */
export function parkedStops(day: TripDay): Stop[] {
  return splitDay(day)
    .parked.filter(isLocated)
    .map((item, index) => ({
      id: item.id,
      index,
      label: "",
      ...stopNames(item.title, item.location.name),
      parked: true,
      instagram: instagramLink(item),
      lat: item.location.lat,
      lng: item.location.lng,
      item,
    }))
}

/** The day list's own thresholds for its leg rows (workspace/DayPanel.tsx): keep the two in step. */
const LEG_MIN_M = 40
/** Up to here a leg is a walk; past it the plan surely means a tram, and we say "ride". */
const WALK_LIMIT_M = 2000

export interface Leg {
  meters: number
  /** "18 min walk", from the day list's formatter; null when it stops calling the leg a walk. */
  walk: string | null
  from: string
}

/** The leg that arrives at `index`; null for the first stop or two stops on one spot. */
export function legInto(stops: readonly Stop[], index: number): Leg | null {
  const to = stops[index]
  const from = stops[index - 1]
  if (!to || !from) return null
  const meters = distanceMeters(from, to)
  if (meters < LEG_MIN_M) return null
  return { meters, walk: meters < WALK_LIMIT_M ? formatWalkMinutes(meters) : null, from: from.title }
}

/** "650 m · 8 min walk", exactly as the day list says it; a longer hop is "4.2 km · ride". */
export function legSummary(leg: Leg): string {
  return `${formatDistance(leg.meters)} · ${leg.walk ?? "ride"}`
}

/** One pin standing for several stops that overlap on screen: "4–6", "2·5", "3 +4". */
export function stackLabel(numbers: readonly number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b)
  if (sorted.length < 2) return String(sorted[0] ?? "")
  const run = sorted.every((n, i) => i === 0 || n === sorted[i - 1]! + 1)
  if (run) return `${sorted[0]}–${sorted[sorted.length - 1]}`
  return sorted.length <= 3 ? sorted.join("·") : `${sorted[0]} +${sorted.length - 1}`
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
  if (stop.parked) return `To schedule: ${stop.title}`
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

import { distanceMeters, isLocated, splitDay } from "../map/geo"
import { formatDistance } from "../reservationView"
import { clockMinutes, layoutDay, legEstimate } from "../timeline/timeline"
import type { TravelMode } from "../timeline/travel"
import type { ItineraryItem, TripDay } from "../types"

// The day's list view, worked out once: where the untimed stops start, the
// legs between stops, and where today stands. Read from the same layout the
// timeline draws, so the two views agree on what is timed, past and next.
// The list keeps the itinerary's order: it is the route, and what a drag moves.

/** How a leg is made, or "overlap" when the next stop starts before this one ends. */
export type LegMode = TravelMode | "overlap"

export interface Leg {
  /** "1.5 km · ≈ 19 min walk", or "No time to travel". */
  text: string
  mode: LegMode
}

export interface DayList {
  /**
   * Index in `day.items` of the first stop under the "Anytime" heading: the
   * run of untimed stops after the last timed one. Null when there is none,
   * or when nothing is timed (a plan with no times is a sequence).
   */
  anytimeAt: number | null
  /** The number each pinned stop carries on the map. */
  labels: Map<string, string>
  /** The leg drawn under a stop, toward the next one on the route. None into or between Anytime stops. */
  legs: Map<string, Leg>
  /** Timed stops that ended by `now`. */
  past: Set<string>
  /** The first stop under way at `now`. */
  current: string | null
}

const isStop = (item: ItineraryItem) => item.kind !== "section" && item.kind !== "note"
const isTimed = (item: ItineraryItem) => isStop(item) && clockMinutes(item.time) !== null

/** `now` is minutes from the day's midnight, and only for today. */
export function dayList(day: TripDay, now: number | null): DayList {
  const { planned } = splitDay(day)
  const lastTimed = planned.reduce((last, item, i) => (isTimed(item) ? i : last), -1)
  const firstAnytime = lastTimed < 0 ? -1 : planned.findIndex((item, i) => i > lastTimed && isStop(item))
  const anytimeAt = firstAnytime >= 0 ? firstAnytime : null

  const labels = new Map<string, string>()
  let n = 0
  // Places parked under "To schedule" carry no number, as on the map.
  for (const item of planned) if (isLocated(item)) labels.set(item.id, String((n += 1)))

  const layout = layoutDay(day)
  // Conflict ids run in clock order, the list in itinerary order: match either way.
  const overlaps = new Set<string>()
  for (const { kind, ids } of layout.conflicts) if (kind === "overlap") overlaps.add(`${ids[0]}>${ids[1]}`).add(`${ids[1]}>${ids[0]}`)
  const legs = new Map<string, Leg>()
  const route = planned.filter((item, i) => !(anytimeAt !== null && i >= anytimeAt && isStop(item))).filter(isLocated)
  for (let i = 1; i < route.length; i++) {
    const [from, to] = [route[i - 1]!, route[i]!]
    // Same estimate as the timeline; none out of a flight or train booking.
    const leg = legEstimate(from, to)
    if (!leg) continue
    if (overlaps.has(`${from.id}>${to.id}`)) legs.set(from.id, { text: "No time to travel", mode: "overlap" })
    else legs.set(from.id, { text: `${formatDistance(distanceMeters(from.location, to.location))} · ${leg.label}`, mode: leg.mode })
  }

  const past = new Set<string>()
  let current: string | null = null
  if (now !== null) {
    for (const block of layout.blocks) {
      if (block.end <= now) past.add(block.itemId)
      else if (block.start <= now) current ??= block.itemId
    }
  }

  return { anytimeAt, labels, legs, past, current }
}

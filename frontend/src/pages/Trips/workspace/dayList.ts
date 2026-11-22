import { distanceMeters, isLocated, splitDay } from "../map/geo"
import { formatDistance } from "../reservationView"
import { isOver, layoutDay, leaveAt, legEstimate, legWords, outcomeOf, planStarts, type TimelineGap } from "../timeline/timeline"
import type { TravelMode } from "../timeline/travel"
import type { ItineraryItem, TripDay } from "../types"

// The day's list view, worked out once: where the untimed stops start, the
// legs between stops, and where today stands. Read from the same layout the
// timeline draws, so the two views agree on what is timed, past and next.
// The list keeps the itinerary's order: it is the route, and what a drag moves.

/** How a leg is made, or "overlap" when the next stop starts before this one ends. */
export type LegMode = TravelMode | "overlap"

export interface Leg {
  /** "940 m"; none into an overlapping stop. */
  distance: string | null
  /** "12 min walk", or "No time to travel". */
  travel: string
  /** "1 h 08 free", from the timeline's words. */
  free: string | null
  /** "Leave by 3:18 PM": when to set off, on a line of its own. */
  leave: string | null
  mode: LegMode
  /** Minutes from midnight: from setting off to arriving, to meet the weather with. */
  on: { from: number; to: number } | null
}

/** Today's stops at the head of the list that are over, folded into one row. */
export interface DoneRun {
  /** How many items from the top fold away (headings and notes among the stops go with them). */
  length: number
  /** The stops in it. */
  stops: string[]
  /** How many of `stops` were skipped rather than done. */
  skipped: number
  /** Minutes from midnight: the first start and the last end. */
  from: number
  to: number
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
  /**
   * The leg into a stop from the one before it on the route, drawn above the
   * stop, so Now (drawn before the next stop) always comes before the walk it
   * leads into. None into or between Anytime stops, and none into or out of
   * a skipped stop: the leg runs from the stop before it to the one after.
   */
  legs: Map<string, Leg>
  /** Stops that are over: marked done or skipped (any day), or on today ended by `now`. */
  past: Set<string>
  /** Stops marked skipped: not happening, drawn struck. */
  skipped: Set<string>
  /** The first stop under way at `now`. */
  current: string | null
  /** On today, the leading run of the list that is over; null when the first stop is still to come. */
  done: DoneRun | null
}

const isStop = (item: ItineraryItem) => item.kind !== "section" && item.kind !== "note"

/**
 * `now` is minutes on the day's own clock, and only while the day is under
 * way (`dayNow` in `live/liveTrip.ts`): past 1440 in the small hours after it.
 */
export function dayList(day: TripDay, now: number | null): DayList {
  const { planned } = splitDay(day)
  const starts = planStarts(day)
  const isTimed = (item: ItineraryItem, i: number) => isStop(item) && starts[i] !== null
  const lastTimed = planned.reduce((last, item, i) => (isTimed(item, i) ? i : last), -1)
  const firstAnytime = lastTimed < 0 ? -1 : planned.findIndex((item, i) => i > lastTimed && isStop(item))
  const anytimeAt = firstAnytime >= 0 ? firstAnytime : null

  const labels = new Map<string, string>()
  let n = 0
  // Places parked under "To schedule", and skipped stops, carry no number, as on the map.
  for (const item of planned) if (isLocated(item) && item.status !== "skipped") labels.set(item.id, String((n += 1)))

  const layout = layoutDay(day)
  // Conflicts and gaps run in clock order, the list in itinerary order: match either way.
  const overlaps = new Set<string>()
  for (const { kind, ids } of layout.conflicts) if (kind === "overlap") overlaps.add(`${ids[0]}>${ids[1]}`).add(`${ids[1]}>${ids[0]}`)
  const gaps = new Map<string, TimelineGap>()
  for (const gap of layout.gaps) gaps.set(`${gap.afterId}>${gap.beforeId}`, gap).set(`${gap.beforeId}>${gap.afterId}`, gap)
  const legs = new Map<string, Leg>()
  const route = planned
    .filter((item, i) => !(anytimeAt !== null && i >= anytimeAt && isStop(item)))
    .filter((item) => outcomeOf(item) !== "skipped")
    .filter(isLocated)
  for (let i = 1; i < route.length; i++) {
    const [from, to] = [route[i - 1]!, route[i]!]
    // Same estimate as the timeline; none out of a flight or train booking.
    const leg = legEstimate(from, to)
    if (!leg) continue
    const key = `${from.id}>${to.id}`
    if (overlaps.has(key)) {
      legs.set(to.id, { distance: null, travel: "No time to travel", free: null, leave: null, mode: "overlap", on: null })
      continue
    }
    const gap = gaps.get(key)
    const words = gap ? legWords(gap, now) : { free: null, leave: null }
    legs.set(to.id, {
      distance: formatDistance(distanceMeters(from.location, to.location)),
      travel: leg.label,
      free: words.free,
      leave: words.leave,
      mode: leg.mode,
      on: gap ? { from: leaveAt(gap), to: gap.to } : null,
    })
  }

  const past = new Set<string>()
  const skipped = new Set<string>()
  for (const item of day.items) {
    if (!isStop(item)) continue
    const outcome = outcomeOf(item)
    if (outcome !== "planned") past.add(item.id)
    if (outcome === "skipped") skipped.add(item.id)
  }
  let current: string | null = null
  if (now !== null) {
    for (const block of layout.blocks) {
      if (isOver(block, now)) past.add(block.itemId)
      else if (block.start <= now) current ??= block.itemId
    }
  }

  // The finished head of the list folds only on today; on other days a stop marked done stays in place.
  let length = 0
  if (now !== null) {
    for (const [i, item] of day.items.entries()) {
      if (!isStop(item)) continue
      if (!past.has(item.id)) break
      length = i + 1
    }
  }
  const head = new Set(day.items.slice(0, length).map((item) => item.id))
  const spans = layout.blocks.filter((block) => head.has(block.itemId))
  const done =
    spans.length === 0
      ? null
      : {
          length,
          stops: spans.map((block) => block.itemId),
          skipped: spans.filter((block) => block.outcome === "skipped").length,
          from: Math.min(...spans.map((b) => b.start)),
          to: Math.max(...spans.map((b) => b.end)),
        }

  return { anytimeAt, labels, legs, past, skipped, current, done }
}

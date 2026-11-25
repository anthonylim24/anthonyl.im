import { splitDay } from "../map/geo"
import type { ItineraryItem, TripDay } from "../types"
import { layoutDay, legEstimate, planStarts, stopTitle } from "./timeline"
import { formatMinutes, type TravelEstimate } from "./travel"

/** A start for an untimed stop, read off the day it sits in. */
export interface StartSuggestion {
  /** "HH:mm". */
  time: string
  /** The stop it follows. */
  after: string
  /** Minutes at that stop when its end is a guess from the kind of place, so the reason can say so. */
  guessedStay?: number
  travel?: TravelEstimate
}

const DAY = 24 * 60
/** The shortest visit worth suggesting before the next stop on the clock (timeline's MIN_ESTIMATE). */
const SHORTEST_STAY = 15

const happening = (item: ItineraryItem) => item.kind !== "section" && item.kind !== "note" && item.status !== "skipped"

/**
 * When an untimed place on the route could start: once the stop before it
 * ends, plus the trip over, on the next five minutes. Nothing is invented:
 * the stop before must have a time, and its end is the timeline's (its own,
 * or a length guessed from its kind, which the reason discloses). Offers
 * nothing past midnight, after a flight with no landing time, or when the
 * stop would not fit before the next one on the clock.
 */
export function suggestStart(day: TripDay, itemId: string): StartSuggestion | null {
  const { planned } = splitDay(day)
  const at = planned.findIndex((item) => item.id === itemId)
  const item = planned[at]
  if (!item || item.kind !== "place" || item.time) return null

  const starts = planStarts(day)
  let before = at - 1
  while (before >= 0 && !happening(planned[before]!)) before -= 1
  const previous = planned[before]
  if (!previous || starts[before] == null) return null

  const block = layoutDay(day).blocks.find((b) => b.itemId === previous.id)
  if (!block || block.departs) return null
  const travel = legEstimate(previous, item)
  const start = Math.ceil((block.end + (travel?.minutes ?? 0)) / 5) * 5
  if (start >= DAY) return null

  // Every later stop on the clock, wherever the list has it: a 6 PM dinner listed first still bounds an afternoon.
  const previousStart = starts[before]!
  for (let i = 0; i < planned.length; i++) {
    const next = planned[i]!
    const nextStart = starts[i]
    if (nextStart == null || nextStart <= previousStart || !happening(next)) continue
    if (start + SHORTEST_STAY + (legEstimate(item, next)?.minutes ?? 0) > nextStart) return null
  }

  const hh = String(Math.floor(start / 60)).padStart(2, "0")
  const mm = String(start % 60).padStart(2, "0")
  return {
    time: `${hh}:${mm}`,
    after: stopTitle(previous),
    ...(block.estimated ? { guessedStay: block.end - block.start } : {}),
    ...(travel ? { travel } : {}),
  }
}

/** "after Galleria (about 2 h there), 12 min walk". */
export function startReason({ after, guessedStay, travel }: StartSuggestion): string {
  const stay = guessedStay ? ` (about ${formatMinutes(guessedStay)} there)` : ""
  return `after ${after}${stay}${travel ? `, ${travel.label}` : ""}`
}

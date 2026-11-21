import { directionsLink, MAX_WAYPOINTS, type ExternalMapsLink, type ExternalMapsTarget, type TravelMode } from "@/lib/externalMaps"
import { dayEnd } from "../dayClock"
import { distanceMeters, isLocated, splitDay } from "../map/geo"
import { isJourney, outcomeOf, planStarts } from "../timeline/timeline"
import type { ItineraryItem, Trip, TripDay } from "../types"
import { clockText, WALK_MAX_M } from "./liveTrip"
import { stayFor } from "./stays"

// What the now card offers a traveller on the move: directions, the rest of
// the day as one route, the way back to the hotel, and "running late". Pure,
// so the card stays a view.

/** Where a stop is, for a maps app. */
function target(item: ItineraryItem): ExternalMapsTarget {
  const location = item.location
  return { name: location?.name || item.title, address: location?.address, lat: location?.lat, lng: location?.lng }
}

/** Walk a leg up to `WALK_MAX_M`; anything longer, or a leg of unknown length, by transit. */
export function legMode(from: ItineraryItem | null, to: ItineraryItem): TravelMode {
  if (!from || !isLocated(from) || !isLocated(to)) return "transit"
  return distanceMeters(from.location, to.location) <= WALK_MAX_M ? "walk" : "transit"
}

/**
 * Directions to `to`: from `from` (the stop before it in clock order, or last
 * night's bed) when it has a pin, else from wherever the phone is. Walking or
 * transit by the leg's length. Undefined when `to` has no place to go to.
 */
export function directionsTo(to: ItineraryItem, from: ItineraryItem | null, userAgent?: string): ExternalMapsLink | undefined {
  if (!to.location) return undefined
  const origin = from && isLocated(from) ? target(from) : undefined
  return directionsLink({ destination: target(to), origin, mode: legMode(from, to) }, userAgent)
}

/**
 * The pinned stops still ahead on `day` at `now` (minutes on the day's
 * clock), in clock order: planned, not started, not parked under "To
 * schedule". A flight or train ends the list, since what follows it is
 * somewhere else. `now === null` (a day with no times) takes every stop not
 * yet done, in list order.
 */
export function stopsAhead(day: TripDay, now: number | null): ItineraryItem[] {
  const starts = planStarts(day)
  const open = splitDay(day)
    .planned.map((item, index) => ({ item, index, start: starts[index] ?? null }))
    .filter(({ item, start }) => item.kind !== "section" && item.kind !== "note" && outcomeOf(item) === "planned" && (now === null || (start !== null && start > now)))
    .sort((x, y) => (now === null ? 0 : x.start! - y.start!) || x.index - y.index)
  const out: ItineraryItem[] = []
  for (const { item } of open) {
    if (!isLocated(item)) continue
    out.push(item)
    if (isJourney(item)) break
  }
  return out
}

/**
 * The rest of the day as one route in Google Maps, from where the phone is
 * through each stop ahead. Walking when every leg is a walk; otherwise
 * driving, since Google drops the stops on the way from a transit route.
 * Undefined with fewer than two stops: that is just directions.
 */
export function routeToday(stops: readonly ItineraryItem[], userAgent?: string): (ExternalMapsLink & { stops: number }) | undefined {
  const route = stops.filter(isLocated).slice(0, MAX_WAYPOINTS + 1)
  if (route.length < 2) return undefined
  const walkable = route.every((stop, i) => i === 0 || legMode(route[i - 1]!, stop) === "walk")
  const link = directionsLink(
    { destination: target(route[route.length - 1]!), waypoints: route.slice(0, -1).map(target), mode: walkable ? "walk" : "drive" },
    userAgent,
  )
  return link && { ...link, stops: route.length }
}

/** Tonight's bed on `day` (the latest lodging on or before it), when it has a pin. */
export function hotelTonight(trip: Pick<Trip, "days">, day: TripDay): ItineraryItem | null {
  const index = trip.days.indexOf(day)
  if (index < 0) return null
  const stay = stayFor(trip, index, "tonight")
  return stay && isLocated(stay) ? stay : null
}

/** A booking keeps its time when the day runs late: the table, the train and the ticket do not wait. */
const isFixed = (item: ItineraryItem) => item.kind === "reservation" || item.status === "booked"

/**
 * "Running late": every planned stop that starts at or after `from` (minutes
 * on the day's clock) moves `delta` minutes later, ends included; a stop
 * under way at `from` keeps its start and ends later. Bookings, done and
 * skipped stops, and places parked under "To schedule" stay put. Times are
 * written back on the 24-hour clock, so a stop pushed past midnight reads as
 * the small hours after a late one.
 *
 * Null when nothing would move, or when the new times would not read back as
 * the same day: a lone 23:30 pushed to 00:30 reads as that morning, and a
 * 05:30 after a late night pushed to 06:30 reads as the next day's morning.
 */
export function shiftRemaining(day: TripDay, from: number, delta: number): TripDay | null {
  if (delta === 0) return null
  const planned = splitDay(day).planned.length
  const starts = planStarts(day)
  const expected = starts.slice()
  let moved = false
  const items = day.items.map((item, index) => {
    const start = index < planned ? (starts[index] ?? null) : null
    if (start === null || item.kind === "section" || outcomeOf(item) !== "planned" || isFixed(item)) return item
    const end = dayEnd(start, item.endTime)
    if (start >= from) {
      moved = true
      expected[index] = start + delta
      return { ...item, time: clockText(start + delta), ...(end === null ? {} : { endTime: clockText(end + delta) }) }
    }
    if (end !== null && end > from) {
      moved = true
      return { ...item, endTime: clockText(end + delta) }
    }
    return item
  })
  if (!moved) return null
  const next: TripDay = { ...day, items }
  const reread = planStarts(next)
  return expected.every((start, index) => (reread[index] ?? null) === start) ? next : null
}

/** A copy of `day` with one item's status set. */
export function withStatus(day: TripDay, itemId: string, status: ItineraryItem["status"]): TripDay {
  return { ...day, items: day.items.map((item) => (item.id === itemId ? { ...item, status } : item)) }
}

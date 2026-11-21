import { dayZone, wallClock } from "../dayClock"
import { lodgingEntries } from "../lodging"
import type { Trip } from "../types"

// Where the traveller sleeps tonight, for the "Show to a driver" card. Read
// through `lodgingEntries` (lodging.ts) and nothing else, so when lodging
// learns multi-night stays this is the one function to swap.

export interface Stay {
  dayId: string
  itemId: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  /** The day it was checked into. */
  date: string
  /** "tonight" during the trip; "first" before it (the first night's place, for the ride from the airport). */
  when: "tonight" | "first"
}

/**
 * Tonight's place to sleep: the last lodging on a day that has begun where it
 * is spent (each day read in its own zone). Before the trip, the first night's.
 * After the trip, or with no lodging yet by tonight, none.
 */
export function tonightsStay(trip: Pick<Trip, "days" | "timezone">, now: Date): Stay | null {
  const entries = lodgingEntries(trip)
  if (entries.length === 0 || trip.days.length === 0) return null
  const begun = (day: Trip["days"][number]) => day.date <= wallClock(now.getTime(), dayZone(trip, day)).date
  const last = trip.days[trip.days.length - 1]!
  // The day after the last one has begun: the trip is over.
  if (last.date < wallClock(now.getTime(), dayZone(trip, last)).date) return null
  const lived = new Set(trip.days.filter(begun).map((day) => day.id))
  const entry = lived.size === 0 ? entries[0]! : [...entries].reverse().find((e) => lived.has(e.dayId))
  if (!entry) return null
  const day = trip.days.find((d) => d.id === entry.dayId)!
  const item = day.items.find((i) => i.id === entry.itemId)
  const location = item?.location
  return {
    dayId: entry.dayId,
    itemId: entry.itemId,
    name: entry.name,
    address: location?.address?.trim() || null,
    lat: typeof location?.lat === "number" ? location.lat : null,
    lng: typeof location?.lng === "number" ? location.lng : null,
    date: day.date,
    when: lived.size === 0 ? "first" : "tonight",
  }
}

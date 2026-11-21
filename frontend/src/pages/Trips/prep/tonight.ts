import { dayZone, wallClock } from "../dayClock"
import { nightsByDay } from "../lodging"
import type { Trip } from "../types"

// Where the traveller sleeps tonight, for the "Show to a driver" card. Read
// through `nightsByDay` (lodging.ts), so a stay booked for several nights
// covers each of them, the same as the day header's "Tonight" line.
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
 * Tonight's place to sleep: where the night of the latest day that has begun
 * is spent (each day read in its own zone). Before the trip, the first
 * night's. After the trip, or with nowhere booked for tonight, none.
 */
export function tonightsStay(trip: Pick<Trip, "days" | "timezone">, now: Date): Stay | null {
  if (trip.days.length === 0) return null
  const begun = (day: Trip["days"][number]) => day.date <= wallClock(now.getTime(), dayZone(trip, day)).date
  const last = trip.days[trip.days.length - 1]!
  // The day after the last one has begun: the trip is over.
  if (last.date < wallClock(now.getTime(), dayZone(trip, last)).date) return null
  const nights = nightsByDay(trip)
  const lived = trip.days.filter(begun)
  const today = lived[lived.length - 1]
  const night = today ? nights.get(today.id) : trip.days.map((day) => nights.get(day.id)).find(Boolean)
  if (!night) return null
  const day = trip.days.find((d) => d.id === night.dayId)!
  const location = day.items.find((i) => i.id === night.itemId)?.location
  return {
    dayId: night.dayId,
    itemId: night.itemId,
    name: night.name,
    address: location?.address?.trim() || null,
    lat: typeof location?.lat === "number" ? location.lat : null,
    lng: typeof location?.lng === "number" ? location.lng : null,
    date: day.date,
    when: today ? "tonight" : "first",
  }
}

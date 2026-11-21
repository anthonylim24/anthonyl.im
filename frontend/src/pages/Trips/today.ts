import { dayZone, wallClock } from "./dayClock"
import type { Trip, TripDay } from "./types"

/**
 * The day of the trip that is today where it is lived: each day read in its
 * own zone (`dayZone`), so a day in Tokyo turns over at Tokyo's midnight.
 * Null before the trip, after it, or when no day carries today's date. When
 * a flight across the date line makes two days "today" at once, the earlier
 * one wins: the traveller hasn't left it yet.
 */
export function todayDay(trip: Pick<Trip, "timezone" | "days">, now: number): TripDay | null {
  return trip.days.find((day) => wallClock(now, dayZone(trip, day)).date === day.date) ?? null
}

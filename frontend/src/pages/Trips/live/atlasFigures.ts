import { dayCount } from "../meta"
import type { TripSummary } from "../types"

/** Lifetime figures for the index: every trip, whether planned, under way or done. */
export interface AtlasFigures {
  trips: number
  /** Days across all trips, by their dates. */
  days: number
  /** Stops with a pin on the map. */
  places: number
  /** Distinct destinations, ignoring case and spacing. */
  destinations: number
}

export function atlasFigures(trips: readonly TripSummary[]): AtlasFigures {
  const destinations = new Set<string>()
  let days = 0
  let places = 0
  for (const trip of trips) {
    days += dayCount(trip.startDate, trip.endDate)
    places += trip.placeCount ?? 0
    for (const name of trip.destinations) {
      const key = name.trim().replace(/\s+/g, " ").toLowerCase()
      if (key) destinations.add(key)
    }
  }
  return { trips: trips.length, days, places, destinations: destinations.size }
}

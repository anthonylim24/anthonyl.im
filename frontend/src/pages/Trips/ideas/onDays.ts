import { formatClock, formatTripDate } from "../meta"
import type { ItineraryItem, Trip, TripDay } from "../types"

/** A wishlist place that has a day now, by the traveller's hand or an AI review's. */
export interface ScheduledIdea {
  item: ItineraryItem
  day: TripDay
  /** 1-based, as the trip names its days. */
  dayNumber: number
}

/** Every stop that came off the wishlist, in trip order: by day, then as the day lists them. */
export function wishlistOnDays(trip: Pick<Trip, "days">): ScheduledIdea[] {
  return trip.days.flatMap((day, index) =>
    day.items.filter((item) => item.fromWishlist === true && item.kind !== "section").map((item) => ({ item, day, dayNumber: index + 1 })),
  )
}

/** "Day 2 · Wed Dec 16 · 8:30 AM"; no clock for a stop with no time. */
export function dayChipLabel({ item, day, dayNumber }: ScheduledIdea): string {
  return [`Day ${dayNumber}`, formatTripDate(day.date).replace(",", ""), item.time ? formatClock(item.time) : null].filter(Boolean).join(" · ")
}

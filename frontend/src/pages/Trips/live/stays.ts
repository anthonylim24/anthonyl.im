import { lodgingForNight } from "../lodging"
import type { ItineraryItem, Trip } from "../types"

/**
 * Where the traveller sleeps around a day of the trip (`dayIndex` in
 * `trip.days`): "last" night, the bed they woke up in, or "tonight". A stay
 * with a check-out date covers each night up to it; one without lasts until
 * the next stay (`lodging.ts` `nightsByDay`).
 */
export function stayFor(trip: Pick<Trip, "days">, dayIndex: number, night: "last" | "tonight"): ItineraryItem | null {
  const day = trip.days[night === "tonight" ? dayIndex : dayIndex - 1]
  if (!day) return null
  const stay = lodgingForNight(trip, day.id)
  if (!stay) return null
  return trip.days.find((d) => d.id === stay.dayId)?.items.find((item) => item.id === stay.itemId) ?? null
}

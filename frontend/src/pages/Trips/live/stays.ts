import { lodgingEntries } from "../lodging"
import type { ItineraryItem, Trip } from "../types"

/**
 * Where the traveller sleeps around a day of the trip (`dayIndex` in
 * `trip.days`): "last" night, the bed they woke up in, or "tonight". Read
 * from the latest lodging listed on or before that day.
 *
 * The live card reads hotels only through here. `lodging.ts` is growing
 * multi-night stays; when it does, this is the one function to swap.
 */
export function stayFor(trip: Pick<Trip, "days">, dayIndex: number, night: "last" | "tonight"): ItineraryItem | null {
  const upTo = night === "tonight" ? dayIndex : dayIndex - 1
  const position = new Map(trip.days.map((day, index) => [day.id, index]))
  const stays = lodgingEntries(trip).filter((stay) => (position.get(stay.dayId) ?? Infinity) <= upTo)
  const entry = stays[stays.length - 1]
  if (!entry) return null
  return trip.days[position.get(entry.dayId)!]?.items.find((item) => item.id === entry.itemId) ?? null
}

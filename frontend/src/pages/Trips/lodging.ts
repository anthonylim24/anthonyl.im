import type { ItineraryItem, Trip } from "./types"

// Where the traveller sleeps. The server keeps the same rules
// (server/src/trips/lodging.ts): the planner and reviewer plan around it,
// and the workspace offers to rework the plan when it changes.

const LODGING_TYPE = /hotel|lodging|stay|hostel|resort|airbnb|rental|check[- ]?in/i

/** A place to sleep: a stop in the hotel category, or a lodging booking. */
export function isLodging(item: ItineraryItem): boolean {
  if (item.kind !== "place" && item.kind !== "reservation") return false
  if (item.location?.category === "hotel") return true
  return item.kind === "reservation" && LODGING_TYPE.test(item.reservation?.type ?? "")
}

export interface LodgingEntry {
  dayId: string
  itemId: string
  name: string
  key: string
}

/** Every lodging item on the trip, in day order, with a key that changes when its place does. */
export function lodgingEntries(trip: Pick<Trip, "days">): LodgingEntry[] {
  return trip.days.flatMap((day) =>
    day.items.filter(isLodging).map((item) => {
      const name = (item.location?.name || item.title).trim()
      return {
        dayId: day.id,
        itemId: item.id,
        name,
        key: `${day.id}:${name.toLowerCase()}@${item.location?.lat?.toFixed(3) ?? ""},${item.location?.lng?.toFixed(3) ?? ""}`,
      }
    }),
  )
}

/**
 * The lodging that is new or different since `before`, if any: what the
 * workspace names when it offers to rework the plan.
 */
export function changedLodging(before: readonly LodgingEntry[], after: readonly LodgingEntry[]): LodgingEntry | null {
  const known = new Set(before.map((entry) => entry.key))
  return after.find((entry) => !known.has(entry.key)) ?? null
}

/** What the reviewer is asked when the base changes. */
export function lodgingBrief(name: string): string {
  return (
    `The traveller is now staying at ${name}. Rework the plan around that base: ` +
    `days should start and end within an easy ride of it, far areas should be grouped into single days ` +
    `(swap days or move stops between days where that helps), breakfasts and last stops that are now across ` +
    `town should be replaced with nearby ones, and any long first or last leg needs a getting-there line. ` +
    `Keep bookings and the lodging itself where they are.`
  )
}

import type { TripStore } from "./store"
import type { Trip } from "./types"

/** Compare-and-set attempts before a write gives up on a trip that keeps changing. */
export const PERSIST_RETRIES = 3

/** A new `updatedAt` strictly after `prev`, so two saves in the same
 *  millisecond still read as different versions to a compare-and-set. */
export function nextUpdatedAt(prev: string): string {
  const now = Date.now()
  const prevMs = Date.parse(prev)
  return new Date(Number.isFinite(prevMs) && now <= prevMs ? prevMs + 1 : now).toISOString()
}

/** How a route rewrites a stored trip: re-read it, apply `change` to that
 *  fresh copy, and compare-and-set on `updatedAt`, so a concurrent save is
 *  merged into instead of overwritten. `change` returns the trip untouched
 *  when there is nothing to do. Null when the trip is gone. (A finished AI
 *  review writes the same way, through `TripStore.completeReview`, so the
 *  trip and its run land together.) */
export async function mutateTrip(store: TripStore, tripId: string, change: (trip: Trip) => Trip): Promise<Trip | null> {
  for (let attempt = 0; attempt < PERSIST_RETRIES; attempt++) {
    const fresh = await store.get(tripId)
    if (!fresh) return null
    const changed = change(fresh)
    if (changed === fresh) return fresh
    const next = { ...changed, updatedAt: nextUpdatedAt(fresh.updatedAt) }
    if (await store.updateIfUnchanged(next, fresh.updatedAt)) return next
  }
  throw new Error("Trip kept changing while saving")
}

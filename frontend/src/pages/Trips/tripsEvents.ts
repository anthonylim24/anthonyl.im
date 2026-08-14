import { useEffect } from "react"
import type { Trip } from "./types"

export const TRIP_CHANGED_EVENT = "anthonyl:trip-changed"

export function emitTripChanged(trip: Trip) {
  window.dispatchEvent(new CustomEvent(TRIP_CHANGED_EVENT, { detail: { trip } }))
}

/** Keep the document that was written last. ISO `updatedAt` compares lexicographically. */
export function preferFresherTrip(current: Trip | undefined, incoming: Trip): Trip {
  if (!current || current.id !== incoming.id) return incoming
  return incoming.updatedAt >= current.updatedAt ? incoming : current
}

/** A concierge write can beat an in-flight `getTrip`; keep the live document. */
export function mergeFetchedTrip(fetched: Trip, live: Trip | null | undefined): Trip {
  if (!live || live.id !== fetched.id) return fetched
  return preferFresherTrip(fetched, live)
}

export function useTripChanged(tripId: string | undefined, onTrip: (trip: Trip) => void) {
  useEffect(() => {
    if (!tripId) return
    const handler = (event: Event) => {
      const trip = (event as CustomEvent<{ trip: Trip }>).detail?.trip
      if (trip && trip.id === tripId) onTrip(trip)
    }
    window.addEventListener(TRIP_CHANGED_EVENT, handler)
    return () => window.removeEventListener(TRIP_CHANGED_EVENT, handler)
  }, [tripId, onTrip])
}

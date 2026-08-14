import { useEffect } from "react"
import type { Trip } from "./types"

export const TRIP_CHANGED_EVENT = "anthonyl:trip-changed"

export function emitTripChanged(trip: Trip) {
  window.dispatchEvent(new CustomEvent(TRIP_CHANGED_EVENT, { detail: { trip } }))
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

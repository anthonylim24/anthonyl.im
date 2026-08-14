import { useCallback, useEffect, useRef, useState } from "react"
import { getTrip, type GetToken } from "./tripsApi"
import { mergeFetchedTrip, preferFresherTrip, useTripChanged } from "./tripsEvents"
import type { Trip } from "./types"

export type TripDocumentState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; trip: Trip; editable: boolean }

export function useLoadedTrip(tripId: string | undefined, getToken: GetToken) {
  const [state, setState] = useState<TripDocumentState>({ status: "loading" })
  const [reloadKey, setReloadKey] = useState(0)
  const liveTripRef = useRef<Trip | null>(null)
  const tripIdRef = useRef(tripId)
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken
  if (tripIdRef.current !== tripId) {
    tripIdRef.current = tripId
    liveTripRef.current = null
  }

  const reload = useCallback(() => {
    setState({ status: "loading" })
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (!tripId) return
    let cancelled = false
    void (async () => {
      try {
        const { trip, access } = await getTrip(getTokenRef.current, tripId)
        if (cancelled) return
        setState({
          status: "success",
          trip: mergeFetchedTrip(trip, liveTripRef.current),
          editable: access === "edit" || access === "owner",
        })
      } catch (err) {
        if (!cancelled) {
          setState({ status: "error", message: err instanceof Error ? err.message : String(err) })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tripId, reloadKey])

  useTripChanged(
    tripId,
    useCallback((trip) => {
      liveTripRef.current = trip
      setState((current) => {
        if (current.status !== "success") return current
        const next = preferFresherTrip(current.trip, trip)
        return next === current.trip ? current : { ...current, trip: next }
      })
    }, []),
  )

  return { state, reload }
}

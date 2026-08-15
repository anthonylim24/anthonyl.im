import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useAuthReady } from "@/lib/safeAuth"
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
  const [isRefreshing, startTransition] = useTransition()
  const liveTripRef = useRef<Trip | null>(null)
  const tripIdRef = useRef(tripId)
  const readToken = useLatestCallback(getToken)
  const authReady = useAuthReady()
  if (tripIdRef.current !== tripId) {
    tripIdRef.current = tripId
    liveTripRef.current = null
  }

  const reload = useCallback(() => {
    startTransition(() => setReloadKey((k) => k + 1))
  }, [startTransition])

  useEffect(() => {
    if (!tripId) return
    let cancelled = false
    setState((current) =>
      current.status === "success" && current.trip.id === tripId ? current : { status: "loading" },
    )
    void (async () => {
      try {
        const { trip, access } = await getTrip(readToken, tripId)
        if (cancelled) return
        startTransition(() =>
          setState({
            status: "success",
            trip: mergeFetchedTrip(trip, liveTripRef.current),
            editable: access === "edit" || access === "owner",
          }),
        )
      } catch (err) {
        if (!cancelled) {
          setState({ status: "error", message: err instanceof Error ? err.message : String(err) })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tripId, reloadKey, startTransition, authReady])

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

  return { state, reload, isRefreshing }
}

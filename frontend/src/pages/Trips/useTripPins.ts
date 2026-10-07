import { useEffect, useMemo, useState } from "react"
import { getTrip } from "./tripsApi"
import { resolveAccent } from "./theme"
import { ACCENT_FILL, lookupPlace, type LatLng } from "./scene/worldMap"
import type { GlobePin } from "./scene/TripsGlobe"
import type { TripSummary } from "./types"

type GetToken = Parameters<typeof getTrip>[0]

const guess = (t: TripSummary) => t.destinations.map(lookupPlace).find(Boolean) ?? null

// Summaries carry no coordinates. Destinations the gazetteer knows pin for
// free; for the rest, the trip's first located place is read from its
// document once per revision and remembered across visits.
const located = new Map<string, LatLng | null>()
const inFlight = new Set<string>()
const keyFor = (t: TripSummary) => `${t.id}:${t.updatedAt}`
const MAX_LOOKUPS = 8

/** One pin per trip: a gazetteer hit on its destinations, else its first located place. */
export function useTripPins(trips: readonly TripSummary[] | null, getToken: GetToken): GlobePin[] {
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!trips) return
    const todo = trips
      .filter((t) => !guess(t) && !located.has(keyFor(t)) && !inFlight.has(keyFor(t)))
      .slice(0, MAX_LOOKUPS)
    if (todo.length === 0) return
    for (const t of todo) inFlight.add(keyFor(t))
    // Always bump when done: a run superseded mid-flight still owns these lookups.
    void Promise.allSettled(
      todo.map(async (t) => {
        try {
          const { trip } = await getTrip(getToken, t.id)
          const place = trip.days
            .flatMap((d) => d.items)
            .find((i) => i.location?.lat != null && i.location?.lng != null)?.location
          located.set(keyFor(t), place ? { lat: place.lat!, lng: place.lng! } : null)
        } catch {
          located.set(keyFor(t), null)
        } finally {
          inFlight.delete(keyFor(t))
        }
      }),
    ).then(() => setRevision((r) => r + 1))
  }, [trips, getToken])

  return useMemo(() => {
    void revision
    if (!trips) return []
    return [...trips]
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .flatMap((t) => {
        const at = guess(t) ?? located.get(keyFor(t)) ?? null
        return at ? [{ id: t.id, lat: at.lat, lng: at.lng, fill: ACCENT_FILL[resolveAccent(t.accent)], label: t.name }] : []
      })
  }, [trips, revision])
}

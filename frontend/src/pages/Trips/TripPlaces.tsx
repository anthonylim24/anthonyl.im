import { Link, useParams } from "react-router-dom"
import { useGetToken } from "@/lib/safeAuth"
import { Places } from "../Korea/Places"
import { formatTripDate, resolveAccent } from "./theme"
import { useLoadedTrip } from "./useLoadedTrip"
import { isMissingTripError, TripsNotFound } from "./TripsNotFound"
import { alertErrorClass, inlineLinkClass, pageClass, wrapAnywhereClass } from "./ui"

export function TripPlaces() {
  const { tripId } = useParams<{ tripId: string }>()
  const getToken = useGetToken()
  const { state, reload } = useLoadedTrip(tripId, getToken)

  if (state.status === "loading") {
    return (
      <div className={pageClass()} role="status" aria-label="Loading places">
        <div className="h-10 w-1/2 animate-pulse rounded-xl bg-stone-200/60 dark:bg-stone-900" />
        <div className="mt-8 h-40 animate-pulse rounded-2xl bg-stone-200/60 dark:bg-stone-900" />
      </div>
    )
  }

  if (state.status === "error") {
    if (isMissingTripError(state.message)) return <TripsNotFound />
    return (
      <div className={pageClass()}>
        <div className={alertErrorClass} role="alert">
          <p className={`min-w-0 ${wrapAnywhereClass}`}>
            Couldn’t load places. Check your connection, then try again. ({state.message})
          </p>
          <button type="button" className={`mt-1 font-semibold ${inlineLinkClass}`} onClick={reload}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const { trip } = state
  const days = trip.days.map((day, i) => ({
    n: i + 1,
    date: day.date,
    label: `Day ${i + 1} · ${formatTripDate(day.date, trip.timezone)}`,
    id: day.id,
  }))

  return (
    <div data-trip-accent={resolveAccent(trip.appearance?.accent)}>
      <Places
        days={days}
        ingestTo={`/trips/${trip.slug ?? trip.id}?ingest=1#trip-ingest`}
      />
      <p className="mx-auto max-w-3xl px-4 pb-10 text-sm sm:px-6">
        <Link to={`/trips/${trip.slug ?? trip.id}`} className={inlineLinkClass}>
          Back to {trip.name}
        </Link>
      </p>
    </div>
  )
}

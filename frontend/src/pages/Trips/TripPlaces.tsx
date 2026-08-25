import { Link, useParams } from "react-router-dom"
import { useGetToken } from "@/lib/safeAuth"
import { Places } from "../Korea/Places"
import { formatTripDate, resolveAccent } from "./theme"
import { useLoadedTrip } from "./useLoadedTrip"
import { isMissingTripError, TripsNotFound } from "./TripsNotFound"
import { alertErrorClass, documentClass, inlineLinkClass, skeletonClass, wrapAnywhereClass } from "./ui"
import { sx } from '@/lib/utils'
import { styles } from './trips.stylex'

export function TripPlaces() {
  const { tripId } = useParams<{ tripId: string }>()
  const getToken = useGetToken()
  const { state, reload } = useLoadedTrip(tripId, getToken)

  if (state.status === "loading") {
    return (
      <div {...sx(documentClass)} role="status" aria-label="Loading places">
        <div {...sx('h-10 w-1/2', skeletonClass)} />
        <div {...sx('mt-8 h-40', skeletonClass)} />
      </div>
    )
  }

  if (state.status === "error") {
    if (isMissingTripError(state.message)) return <TripsNotFound />
    return (
      <div {...sx(documentClass)}>
        <div {...sx(alertErrorClass)} role="alert">
          <p {...sx('min-w-0', wrapAnywhereClass)}>
            Couldn’t load places. Check your connection, then try again. ({state.message})
          </p>
          <button type="button" {...sx('mt-1 font-semibold', inlineLinkClass)} onClick={reload}>
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
      <p {...sx(styles.placesFooter)}>
        <Link to={`/trips/${trip.slug ?? trip.id}`} {...sx(inlineLinkClass)}>
          Back to {trip.name}
        </Link>
      </p>
    </div>
  )
}

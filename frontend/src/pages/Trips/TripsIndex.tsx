import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { CalendarDays, MapPin, Plus, Trash2, Users } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { deleteTrip, listTrips } from "./tripsApi"
import type { TripStatus, TripSummary } from "./types"

const STATUS_STYLE: Record<TripStatus, string> = {
  draft: "bg-stone-200/70 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  archived: "bg-stone-200/70 text-stone-500 dark:bg-stone-800 dark:text-stone-500",
  completed: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
}

type LoadState =
  | { status: "loading" }
  | { status: "success"; trips: TripSummary[] }
  | { status: "error"; message: string }

function formatRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return `${fmt(start)} – ${fmt(end)}, ${end.slice(0, 4)}`
}

export function TripsIndex() {
  const getToken = useGetToken()
  const navigate = useNavigate()
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [deleting, setDeleting] = useState<string | null>(null)
  // Bumping this re-runs the load effect (after deletes / manual retry).
  const [reloadKey, setReloadKey] = useState(0)
  const load = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const trips = await listTrips(getToken)
        if (!cancelled) setState({ status: "success", trips })
      } catch (err) {
        if (!cancelled) setState({ status: "error", message: err instanceof Error ? err.message : String(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [getToken, reloadKey])

  const onDelete = async (trip: TripSummary) => {
    if (!window.confirm(`Delete “${trip.name}”? This removes the whole itinerary.`)) return
    setDeleting(trip.id)
    try {
      await deleteTrip(getToken, trip.id)
      load()
    } catch (err) {
      window.alert(`Could not delete trip: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1
            className="font-serif text-4xl text-stone-900 dark:text-stone-100"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Your trips
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Plan, edit, and enhance itineraries — every place lands on the map.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/trips/new")}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New trip
        </button>
      </div>

      <div className="mt-8">
        {state.status === "loading" && (
          <div className="space-y-3" role="status" aria-label="Loading trips">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-stone-200/60 dark:bg-stone-900" />
            ))}
          </div>
        )}

        {state.status === "error" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            Couldn’t load your trips ({state.message}).{" "}
            <button type="button" className="font-semibold underline" onClick={load}>
              Retry
            </button>
          </div>
        )}

        {state.status === "success" && state.trips.length === 0 && (
          <div className="rounded-3xl border border-dashed border-stone-300 p-12 text-center dark:border-stone-700">
            <p className="text-lg text-stone-600 dark:text-stone-300">No trips yet.</p>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Create one from scratch, or let AI draft a starter itinerary you can edit.
            </p>
            <Link
              to="/trips/new"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Plan your first trip
            </Link>
          </div>
        )}

        {state.status === "success" && state.trips.length > 0 && (
          <ul className="space-y-3">
            {state.trips.map((trip) => (
              <li key={trip.id}>
                <div className="group relative rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm transition hover:border-amber-300/70 hover:shadow dark:border-stone-800 dark:bg-stone-900 dark:hover:border-amber-700/50">
                  <Link to={`/trips/${trip.id}`} className="absolute inset-0 rounded-2xl" aria-label={`Open ${trip.name}`} />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-lg font-semibold text-stone-900 dark:text-stone-100">{trip.name}</h2>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[trip.status]}`}>
                          {trip.status}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500 dark:text-stone-400">
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" aria-hidden />
                          {trip.destinations.join(" · ")}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                          {formatRange(trip.startDate, trip.endDate)} · {trip.dayCount} days
                        </span>
                        {(trip.collaborators.length > 0 || trip.sharedWithAllUsers) && (
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5" aria-hidden />
                            {trip.sharedWithAllUsers ? "Shared" : `${trip.collaborators.length} collaborator${trip.collaborators.length === 1 ? "" : "s"}`}
                          </span>
                        )}
                        <span>{trip.itemCount} items</span>
                      </div>
                    </div>
                    {trip.access === "owner" && (
                      <button
                        type="button"
                        onClick={() => void onDelete(trip)}
                        disabled={deleting === trip.id}
                        className="relative z-10 rounded-full p-2 text-stone-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40"
                        aria-label={`Delete ${trip.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

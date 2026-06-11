import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight, CalendarDays, MapPin, Plus, Sparkles, Trash2, Users } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { deleteTrip, listTrips } from "./tripsApi"
import type { TripStatus, TripSummary } from "./types"

const STATUS_DOT: Record<TripStatus, string> = {
  draft: "bg-stone-400",
  active: "bg-emerald-500",
  archived: "bg-stone-300 dark:bg-stone-600",
  completed: "bg-amber-500",
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

/** Stacked month/day block that anchors each trip card. */
function DateBlock({ iso }: { iso: string }) {
  const d = new Date(`${iso}T00:00:00`)
  return (
    <div
      className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-stone-100"
      aria-hidden
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
        {d.toLocaleDateString("en-US", { month: "short" })}
      </span>
      <span className="font-serif text-2xl leading-none" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
        {d.getDate()}
      </span>
    </div>
  )
}

export function TripsIndex() {
  const getToken = useGetToken()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
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
            className="font-serif text-4xl text-stone-900 sm:text-5xl dark:text-stone-100"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Your trips
          </h1>
          <p className="mt-2 max-w-md text-sm text-stone-600 dark:text-stone-400">
            Plan, edit, and enhance itineraries — every place lands on the map.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/trips/new")}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 dark:bg-amber-600 dark:hover:bg-amber-500"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New trip
        </button>
      </div>

      <div className="mt-10">
        {state.status === "loading" && (
          <div className="space-y-3" role="status" aria-label="Loading trips">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 rounded-2xl border border-stone-200/60 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
                <div className="h-16 w-16 animate-pulse rounded-2xl bg-stone-200/70 dark:bg-stone-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-stone-200/70 dark:bg-stone-800" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-stone-200/50 dark:bg-stone-800/70" />
                </div>
              </div>
            ))}
          </div>
        )}

        {state.status === "error" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300" role="alert">
            Couldn’t load your trips ({state.message}).{" "}
            <button type="button" className="font-semibold underline underline-offset-2" onClick={load}>
              Retry
            </button>
          </div>
        )}

        {state.status === "success" && state.trips.length === 0 && (
          <div className="rounded-3xl border border-dashed border-stone-300 px-6 py-16 text-center dark:border-stone-700">
            <CalendarDays className="mx-auto h-8 w-8 text-amber-700/70 dark:text-amber-400/70" aria-hidden />
            <p
              className="mt-4 font-serif text-3xl text-stone-800 dark:text-stone-200"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              Where to next?
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-stone-600 dark:text-stone-400">
              Start a blank itinerary and build it day by day, or let AI draft a structured starting
              point you can reshape — every place it adds lands on the map.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/trips/new"
                className="inline-flex items-center gap-2 rounded-full bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                Plan with AI
              </Link>
              <Link
                to="/trips/new"
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-900 dark:border-stone-700 dark:text-stone-300 dark:hover:text-stone-100"
              >
                Start blank
              </Link>
            </div>
          </div>
        )}

        {state.status === "success" && state.trips.length > 0 && (
          <ul className="space-y-3">
            {state.trips.map((trip, i) => (
              <motion.li
                key={trip.id}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, delay: Math.min(i, 6) * 0.05, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="group relative flex items-center gap-4 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm transition hover:border-amber-300/70 hover:shadow-md sm:p-5 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-amber-700/50">
                  <Link
                    to={`/trips/${trip.slug ?? trip.id}`}
                    className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                    aria-label={`Open ${trip.name}`}
                  />
                  <DateBlock iso={trip.startDate} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <h2 className="truncate text-base font-semibold text-stone-900 sm:text-lg dark:text-stone-100">
                        {trip.name}
                      </h2>
                      <span className="inline-flex items-center gap-1.5 text-xs capitalize text-stone-500 dark:text-stone-400">
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[trip.status]}`} aria-hidden />
                        {trip.status}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-stone-600 dark:text-stone-400">
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
                        <span className="truncate">{trip.destinations.join(" · ")}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
                        {formatRange(trip.startDate, trip.endDate)} · {trip.dayCount} days
                      </span>
                      {(trip.collaborators.length > 0 || trip.sharedWithAllUsers) && (
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
                          {trip.sharedWithAllUsers
                            ? "Shared"
                            : `${trip.collaborators.length} collaborator${trip.collaborators.length === 1 ? "" : "s"}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {trip.access === "owner" && (
                      <button
                        type="button"
                        onClick={() => void onDelete(trip)}
                        disabled={deleting === trip.id}
                        className="relative z-10 rounded-full p-2 text-stone-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50 dark:hover:bg-red-950/40"
                        aria-label={`Delete ${trip.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                    <ArrowRight
                      className="h-4 w-4 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-amber-600 motion-reduce:group-hover:translate-x-0 dark:text-stone-600"
                      aria-hidden
                    />
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight, CalendarDays, MapPin, Plus, Trash2, Users } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { deleteTrip, listTrips } from "./tripsApi"
import type { TripStatus, TripSummary } from "./types"
import { todayIsoIn } from "./theme"
import {
  EASE,
  SERIF,
  TRIP_STATUS_LABEL,
  alertErrorClass,
  dayCountInclusive,
  destructiveBtnClass,
  formatRangeFull,
  ghostBtnClass,
  primaryBtnClass,
  secondaryBtnClass,
  softPanelClass,
} from "./ui"

const STATUS_META: Record<TripStatus, { label: string; dot: string }> = {
  draft: { label: TRIP_STATUS_LABEL.draft, dot: "bg-stone-400" },
  active: { label: TRIP_STATUS_LABEL.active, dot: "bg-emerald-600" },
  archived: { label: TRIP_STATUS_LABEL.archived, dot: "bg-stone-300 dark:bg-stone-600" },
  completed: { label: TRIP_STATUS_LABEL.completed, dot: "bg-amber-700 dark:bg-amber-500" },
}

type LoadState =
  | { status: "loading" }
  | { status: "success"; trips: TripSummary[] }
  | { status: "error"; message: string }

type TripBucket = "current" | "upcoming" | "past"

function bucketFor(trip: TripSummary, today: string): TripBucket {
  if (today >= trip.startDate && today <= trip.endDate) return "current"
  if (today < trip.startDate) return "upcoming"
  return "past"
}

function DateMark({ iso, live }: { iso: string; live?: boolean }) {
  const d = new Date(`${iso}T12:00:00Z`)
  return (
    <div
      className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center text-stone-900 dark:text-stone-100 ${
        live
          ? "rounded-xl border border-amber-700/35 bg-amber-50/80 dark:border-amber-500/40 dark:bg-amber-950/30"
          : "rounded-xl border border-stone-200/70 bg-stone-50/50 dark:border-stone-800 dark:bg-stone-900/40"
      }`}
      aria-hidden
    >
      <span
        className={`text-[10px] font-medium uppercase tracking-[0.14em] ${
          live ? "text-amber-800 dark:text-amber-400" : "text-stone-500 dark:text-stone-400"
        }`}
      >
        {d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
      </span>
      <span className="font-display text-2xl leading-none" style={SERIF}>
        {d.getUTCDate()}
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
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
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

  const grouped = useMemo(() => {
    if (state.status !== "success") return null
    const today = todayIsoIn(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")
    const buckets: Record<TripBucket, TripSummary[]> = { current: [], upcoming: [], past: [] }
    for (const trip of state.trips) {
      buckets[bucketFor(trip, today)].push(trip)
    }
    for (const key of Object.keys(buckets) as TripBucket[]) {
      buckets[key].sort((a, b) => a.startDate.localeCompare(b.startDate) * (key === "past" ? -1 : 1))
    }
    return buckets
  }, [state])

  const onDelete = async (trip: TripSummary) => {
    setDeleting(trip.id)
    setDeleteError(null)
    try {
      await deleteTrip(getToken, trip.id)
      setConfirmId(null)
      load()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleting(null)
    }
  }

  const sections: Array<{ key: TripBucket; title: string }> = [
    { key: "current", title: "In progress" },
    { key: "upcoming", title: "Upcoming" },
    { key: "past", title: "Past" },
  ]

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono-trips text-[11px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">
            Itinerary workspace
          </p>
          <h1
            className="mt-2 font-display text-[clamp(2.25rem,5vw,3.25rem)] leading-[1.05] tracking-tight text-stone-900 dark:text-stone-100"
            style={SERIF}
          >
            Your trips
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            Plan days, keep reservations straight, open Map Mode when you need the ground truth.
          </p>
        </div>
        <button type="button" onClick={() => navigate("/trips/new")} className={primaryBtnClass}>
          <Plus className="h-4 w-4" aria-hidden />
          New trip
        </button>
      </div>

      <div className="mt-12">
        {state.status === "loading" && (
          <div className="space-y-3" role="status" aria-label="Loading trips">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`flex items-center gap-4 p-4 ${softPanelClass}`}>
                <div className="h-14 w-14 animate-pulse rounded-xl bg-stone-200/70 dark:bg-stone-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-stone-200/70 dark:bg-stone-800" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-stone-200/50 dark:bg-stone-800/70" />
                </div>
              </div>
            ))}
          </div>
        )}

        {state.status === "error" && (
          <div className={alertErrorClass} role="alert">
            Couldn’t load your trips ({state.message}).{" "}
            <button type="button" className="font-semibold underline underline-offset-2" onClick={load}>
              Retry
            </button>
          </div>
        )}

        {state.status === "success" && state.trips.length === 0 && (
          <div className="border border-dashed border-stone-300/90 px-6 py-16 text-center dark:border-stone-700">
            <CalendarDays className="mx-auto h-8 w-8 text-amber-800/70 dark:text-amber-400/70" aria-hidden />
            <p className="mt-4 font-display text-3xl text-stone-900 dark:text-stone-100" style={SERIF}>
              Where to next?
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              Start blank and build day by day, or ask AI for a structured draft you can reshape.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link to="/trips/new?mode=ai" className={primaryBtnClass}>
                Plan with AI
              </Link>
              <Link to="/trips/new?mode=blank" className={secondaryBtnClass}>
                Start blank
              </Link>
            </div>
          </div>
        )}

        {state.status === "success" && grouped && state.trips.length > 0 && (
          <div className="space-y-12">
            {sections.map(({ key, title }) => {
              const trips = grouped[key]
              if (trips.length === 0) return null
              const live = key === "current"
              return (
                <section key={key} aria-labelledby={`bucket-${key}`}>
                  <h2
                    id={`bucket-${key}`}
                    className="font-mono-trips text-[11px] uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400"
                  >
                    {title}
                    <span className="ml-2 tabular-nums text-stone-400 dark:text-stone-500">{trips.length}</span>
                  </h2>
                  {live && (
                    <p className="mt-1.5 text-sm text-stone-600 dark:text-stone-400">
                      Open a trip to jump into today&apos;s day and Map Mode.
                    </p>
                  )}
                  <ul className="mt-4 divide-y divide-stone-200/80 border-y border-stone-200/80 dark:divide-stone-800/80 dark:border-stone-800/80">
                    {trips.map((trip, i) => (
                      <motion.li
                        key={trip.id}
                        initial={reduce ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.28, delay: Math.min(i, 8) * 0.04, ease: EASE }}
                      >
                        {confirmId === trip.id ? (
                          <div
                            className="flex flex-wrap items-center justify-between gap-3 bg-red-50 px-3 py-4 dark:bg-red-950/30"
                            role="alertdialog"
                            aria-labelledby={`del-${trip.id}`}
                          >
                            <div className="min-w-0">
                              <p id={`del-${trip.id}`} className="text-sm text-red-900 dark:text-red-200">
                                Delete <span className="font-semibold">{trip.name}</span>? This removes the whole itinerary.
                              </p>
                              {deleteError && (
                                <p className="mt-1 text-xs text-red-800 dark:text-red-300" role="alert">
                                  {deleteError}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className={ghostBtnClass}
                                onClick={() => {
                                  setConfirmId(null)
                                  setDeleteError(null)
                                }}
                                disabled={deleting === trip.id}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className={destructiveBtnClass}
                                onClick={() => void onDelete(trip)}
                                disabled={deleting === trip.id}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                                {deleting === trip.id ? "Deleting…" : "Delete"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="group relative flex items-center gap-4 py-4 sm:gap-5">
                            <Link
                              to={`/trips/${trip.slug ?? trip.id}${live ? "#today" : ""}`}
                              className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-700/50"
                              aria-label={live ? `Open ${trip.name}, jump to today` : `Open ${trip.name}`}
                            />
                            <DateMark iso={trip.startDate} live={live} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                <h3 className="truncate text-base font-semibold text-stone-900 sm:text-lg dark:text-stone-100">
                                  {trip.name}
                                </h3>
                                {live ? (
                                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-400">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-700 dark:bg-amber-400" aria-hidden />
                                    Today
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[trip.status].dot}`} aria-hidden />
                                    {STATUS_META[trip.status].label}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-stone-600 dark:text-stone-400">
                                <span className="inline-flex min-w-0 items-center gap-1.5">
                                  <MapPin className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
                                  <span className="truncate">{trip.destinations.join(" · ")}</span>
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
                                  {formatRangeFull(trip.startDate, trip.endDate)} ·{" "}
                                  {trip.dayCount || dayCountInclusive(trip.startDate, trip.endDate)} days
                                </span>
                                {(trip.collaborators.length > 0 || trip.sharedWithAllUsers) && (
                                  <span className="inline-flex items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
                                    {trip.sharedWithAllUsers
                                      ? "Shared with all users"
                                      : `${trip.collaborators.length} collaborator${trip.collaborators.length === 1 ? "" : "s"}`}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="relative z-10 flex shrink-0 items-center gap-1">
                              {trip.access === "owner" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmId(trip.id)
                                    setDeleteError(null)
                                  }}
                                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-red-800/55 transition hover:bg-red-100 hover:text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 dark:text-red-300/60 dark:hover:bg-red-950/50 dark:hover:text-red-200"
                                  aria-label={`Delete ${trip.name}`}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                </button>
                              )}
                              <ArrowRight
                                className="h-4 w-4 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-amber-800 motion-reduce:group-hover:translate-x-0 dark:text-stone-600 dark:group-hover:text-amber-400"
                                aria-hidden
                              />
                            </div>
                          </div>
                        )}
                      </motion.li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

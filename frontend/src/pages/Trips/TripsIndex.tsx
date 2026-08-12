import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight, CalendarDays, MapPin, Plus, RotateCcw, Trash2, Users } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { deleteTrip, listTrips } from "./tripsApi"
import type { TripSummary } from "./types"
import { todayIsoIn } from "./theme"
import { TripStatusChip } from "./components/StatusChip"
import {
  EASE,
  SERIF,
  accentIconClass,
  alertErrorClass,
  dangerBtnClass,
  dangerIconBtnClass,
  dayCountInclusive,
  focusRingInsetClass,
  formatRangeFull,
  ghostBtnClass,
  primaryBtnClass,
  secondaryBtnClass,
  softPanelClass,
} from "./ui"

/** Page gutters — `<main>` is unconstrained so trip heroes can be full-bleed. */
const pageClass = "mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-10"

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

function DateMark({ iso }: { iso: string }) {
  const d = new Date(`${iso}T12:00:00Z`)
  return (
    <div
      className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-stone-200/80 bg-stone-50/80 text-stone-900 dark:border-stone-800 dark:bg-stone-900/60 dark:text-stone-100"
      aria-hidden
    >
      <span className={`text-[10px] font-medium uppercase tracking-[0.14em] ${accentIconClass}`}>
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
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null)
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
      setDeleteError({ id: trip.id, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setDeleting(null)
    }
  }

  const closeConfirm = () => {
    setConfirmId(null)
    setDeleteError(null)
  }

  const sections: Array<{ key: TripBucket; title: string; empty?: string }> = [
    { key: "current", title: "In progress" },
    { key: "upcoming", title: "Upcoming" },
    { key: "past", title: "Past" },
  ]

  return (
    <div className={pageClass}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono-trips text-[11px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">
            Itinerary workspace
          </p>
          <h1 className="mt-2 font-display text-[clamp(2.25rem,5vw,3.25rem)] leading-[1.05] tracking-tight text-stone-900 dark:text-stone-100" style={SERIF}>
            Your trips
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            Plan days, keep reservations straight, and open Map Mode when you need the ground truth.
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
            <CalendarDays className={`mx-auto h-8 w-8 opacity-70 ${accentIconClass}`} strokeWidth={1.5} aria-hidden />
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
              return (
                <section key={key} aria-labelledby={`bucket-${key}`}>
                  <h2
                    id={`bucket-${key}`}
                    className="font-mono-trips text-[11px] uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400"
                  >
                    {title}
                    <span className="ml-2 tabular-nums text-stone-600 dark:text-stone-400">{trips.length}</span>
                  </h2>
                  <ul className="mt-4 divide-y divide-stone-200/80 border-y border-stone-200/80 dark:divide-stone-800/80 dark:border-stone-800/80">
                    {trips.map((trip, i) => (
                      <motion.li
                        key={trip.id}
                        initial={reduce ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.28, delay: Math.min(i, 8) * 0.04, ease: EASE }}
                      >
                        {deleteError?.id === trip.id ? (
                          <div className={`my-3 ${alertErrorClass}`} role="alert">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <p className="min-w-0">
                                Couldn’t delete <span className="font-semibold">{trip.name}</span> ({deleteError.message}).
                              </p>
                              <div className="flex items-center gap-2">
                                <button type="button" className={ghostBtnClass} onClick={closeConfirm} disabled={deleting === trip.id}>
                                  Dismiss
                                </button>
                                <button
                                  type="button"
                                  className={dangerBtnClass}
                                  onClick={() => void onDelete(trip)}
                                  disabled={deleting === trip.id}
                                >
                                  <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                                  {deleting === trip.id ? "Deleting…" : "Retry delete"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : confirmId === trip.id ? (
                          <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50/60 px-3 py-4 dark:bg-red-950/20" role="alertdialog" aria-labelledby={`del-${trip.id}`}>
                            <p id={`del-${trip.id}`} className="text-sm text-red-900 dark:text-red-200">
                              Delete <span className="font-semibold">{trip.name}</span>? This removes the whole itinerary.
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className={ghostBtnClass}
                                onClick={closeConfirm}
                                disabled={deleting === trip.id}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className={dangerBtnClass}
                                onClick={() => void onDelete(trip)}
                                disabled={deleting === trip.id}
                              >
                                <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                                {deleting === trip.id ? "Deleting…" : "Delete"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="group relative flex items-center gap-4 py-4 sm:gap-5">
                            <Link
                              to={`/trips/${trip.slug ?? trip.id}`}
                              className={`absolute inset-0 ${focusRingInsetClass}`}
                              aria-label={`Open ${trip.name}`}
                            />
                            <DateMark iso={trip.startDate} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                <h3 className="truncate text-base font-semibold text-stone-900 sm:text-lg dark:text-stone-100">
                                  {trip.name}
                                </h3>
                                <TripStatusChip status={trip.status} />
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-stone-600 dark:text-stone-400">
                                <span className="inline-flex min-w-0 items-center gap-1.5">
                                  <MapPin className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" strokeWidth={1.5} aria-hidden />
                                  <span className="truncate">{trip.destinations.join(" · ")}</span>
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" strokeWidth={1.5} aria-hidden />
                                  {formatRangeFull(trip.startDate, trip.endDate)} ·{" "}
                                  {trip.dayCount || dayCountInclusive(trip.startDate, trip.endDate)} days
                                </span>
                                {(trip.collaborators.length > 0 || trip.sharedWithAllUsers) && (
                                  <span className="inline-flex items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" strokeWidth={1.5} aria-hidden />
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
                                    setDeleteError(null)
                                    setConfirmId(trip.id)
                                  }}
                                  className={`${dangerIconBtnClass} sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100`}
                                  aria-label={`Delete ${trip.name}`}
                                >
                                  <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                                </button>
                              )}
                              <ArrowRight
                                className="h-4 w-4 text-stone-500 transition group-hover:translate-x-0.5 group-hover:text-[color:var(--trips-accent)] motion-reduce:group-hover:translate-x-0 dark:text-stone-600"
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

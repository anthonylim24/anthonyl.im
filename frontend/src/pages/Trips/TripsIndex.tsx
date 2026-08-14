import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight, CalendarDays, MapPin, Plus, RotateCcw, Trash2, Users } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { deleteTrip, listTrips } from "./tripsApi"
import type { TripSummary } from "./types"
import { ACCENT, collaboratorSummary, daysUntilIn, todayIsoIn } from "./theme"
import { TripStatusChip } from "./components/StatusChip"
import {
  EASE,
  REVEAL_DURATION,
  SERIF,
  alertErrorClass,
  dangerBtnClass,
  dangerIconBtnClass,
  dayCountInclusive,
  eyebrowClass,
  focusRingInsetClass,
  formatRangeFull,
  ghostBtnClass,
  ghostOnTintBtnClass,
  hoverArrowClass,
  inlineLinkClass,
  mutedInkClass,
  pageClass,
  primaryBtnClass,
  revealDelay,
  secondaryBtnClass,
  wrapAnywhereClass,
} from "./ui"

/** Left column of a trip row and of the loading skeleton. */
const markColumnClass = "w-[4.5rem] shrink-0 sm:w-20"

const captionClass = `font-mono-trips text-[10px] uppercase tracking-[0.16em] ${mutedInkClass}`

const metaIconClass = `h-3.5 w-3.5 shrink-0 ${mutedInkClass}`

const rowListClass =
  "divide-y divide-stone-200/80 border-y border-stone-200/80 dark:divide-stone-800/80 dark:border-stone-800/80"

const skeletonBarClass = "animate-pulse rounded bg-stone-200/70 dark:bg-stone-800"

/** `dark:text-*` is emitted after `group-hover:*` at equal specificity, so the
 *  dark pair has to be spelled out for the accent to win on hover. */
const arrowAccentHoverClass = `${ACCENT.textHover} dark:group-hover:text-[color:var(--ta-strong)]`

type LoadState =
  | { status: "loading" }
  | { status: "success"; trips: TripSummary[] }
  | { status: "error"; message: string }

type TripBucket = "current" | "upcoming" | "past"

/** The one decision-relevant fact per row: how far away the trip is.
 *  `label` is the spoken form — the glyphs read as noise to a screen reader. */
interface TripMark {
  value: string
  caption?: string
  label: string
  accent: boolean
  dot?: boolean
}

interface TripRow {
  trip: TripSummary
  mark: TripMark
  dayCount: number
  range: string
}

function bucketFor(trip: TripSummary, today: string): TripBucket {
  if (today >= trip.startDate && today <= trip.endDate) return "current"
  if (today < trip.startDate) return "upcoming"
  return "past"
}

function markFor(trip: TripSummary, bucket: TripBucket, today: string, dayCount: number, timezone: string): TripMark {
  if (bucket === "past") {
    const year = trip.endDate.slice(0, 4)
    return { value: year, label: `Ended in ${year}`, accent: false }
  }
  if (bucket === "current") {
    const day = Math.min(dayCountInclusive(trip.startDate, today), dayCount)
    return {
      value: `Day ${day}`,
      caption: `of ${dayCount}`,
      label: `Under way, day ${day} of ${dayCount}`,
      accent: true,
      dot: true,
    }
  }
  const days = daysUntilIn(trip.startDate, timezone)
  if (days <= 0) return { value: "Today", caption: "departs", label: "Departs today", accent: true, dot: true }
  return {
    value: `T–${days}`,
    caption: days === 1 ? "day out" : "days out",
    label: `${plural(days, "day", "days")} until departure`,
    accent: true,
  }
}

/** Past rows carry the year in their mark, so repeating it in the range would
 *  state the same fact twice in one row. */
function rangeFor(trip: TripSummary, bucket: TripBucket): string {
  const sameYear = trip.startDate.slice(0, 4) === trip.endDate.slice(0, 4)
  return formatRangeFull(trip.startDate, trip.endDate, { year: !(bucket === "past" && sameYear) })
}

function CountdownMark({ mark }: { mark: TripMark }) {
  return (
    <div className={`${markColumnClass} self-start`}>
      <span className="sr-only">{mark.label}</span>
      <p
        aria-hidden
        className={`flex items-center gap-1.5 font-mono-trips text-base leading-snug tabular-nums sm:text-lg ${
          mark.accent ? ACCENT.text : mutedInkClass
        }`}
      >
        {mark.dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ACCENT.dot}`} />}
        {mark.value}
      </p>
      {mark.caption && (
        <p aria-hidden className={`mt-1 ${captionClass}`}>
          {mark.caption}
        </p>
      )}
    </div>
  )
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

const sections: Array<{ key: TripBucket; title: string }> = [
  { key: "current", title: "In progress" },
  { key: "upcoming", title: "Upcoming" },
  { key: "past", title: "Past" },
]

export function TripsIndex() {
  const getToken = useGetToken()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null)
  const [deletedName, setDeletedName] = useState<string | null>(null)
  // The confirm strip replaces the row, so the delete trigger unmounts while
  // the dialog is open: focus can only return once the trigger remounts.
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const newTripRef = useRef<HTMLButtonElement>(null)
  const load = useCallback(() => setReloadKey((k) => k + 1), [])

  const focusOnMount = useCallback((el: HTMLButtonElement | null) => el?.focus(), [])

  const restoreTriggerFocus = useCallback(
    (el: HTMLButtonElement | null) => {
      if (!el || el.dataset.tripId !== pendingFocusId) return
      el.focus()
      setPendingFocusId(null)
    },
    [pendingFocusId],
  )

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
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    const today = todayIsoIn(timezone)
    const buckets: Record<TripBucket, TripRow[]> = { current: [], upcoming: [], past: [] }
    for (const trip of state.trips) {
      const bucket = bucketFor(trip, today)
      const dayCount = trip.dayCount || dayCountInclusive(trip.startDate, trip.endDate)
      buckets[bucket].push({
        trip,
        dayCount,
        range: rangeFor(trip, bucket),
        mark: markFor(trip, bucket, today, dayCount, timezone),
      })
    }
    for (const key of Object.keys(buckets) as TripBucket[]) {
      buckets[key].sort((a, b) => a.trip.startDate.localeCompare(b.trip.startDate) * (key === "past" ? -1 : 1))
    }
    return buckets
  }, [state])

  const onlyPast = grouped !== null && grouped.past.length > 0 && grouped.current.length + grouped.upcoming.length === 0

  const onDelete = async (trip: TripSummary) => {
    setDeleting(trip.id)
    setDeleteError(null)
    try {
      await deleteTrip(getToken, trip.id)
      setConfirmId(null)
      // The row is gone, so focus moves to the page's primary action rather
      // than falling back to the document.
      newTripRef.current?.focus()
      setDeletedName(trip.name)
      load()
    } catch (err) {
      setDeleteError({ id: trip.id, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setDeleting(null)
    }
  }

  const closeConfirm = (tripId: string) => {
    setConfirmId(null)
    setDeleteError(null)
    setPendingFocusId(tripId)
  }

  return (
    <div className={pageClass()}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className={eyebrowClass}>Itinerary workspace</p>
          <h1
            className="mt-2 font-display text-[clamp(2.25rem,5vw,3.25rem)] leading-[1.05] tracking-tight text-stone-900 dark:text-stone-100"
            style={SERIF}
          >
            Your trips
          </h1>
        </div>
        <button ref={newTripRef} type="button" onClick={() => navigate("/trips/new")} className={primaryBtnClass}>
          <Plus className="h-4 w-4" aria-hidden />
          New trip
        </button>
      </div>

      <p className="sr-only" role="status">
        {deletedName ? `Deleted ${deletedName}.` : ""}
      </p>

      <div className="mt-10">
        {state.status === "loading" && (
          <div className={rowListClass} role="status" aria-label="Loading trips">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 py-5 sm:gap-6">
                <div className={`${markColumnClass} space-y-2`}>
                  <div className={`h-4 w-12 ${skeletonBarClass}`} />
                  <div className={`h-2.5 w-10 opacity-70 ${skeletonBarClass}`} />
                </div>
                <div className="flex-1 space-y-2.5">
                  <div className={`h-4 w-1/3 ${skeletonBarClass}`} />
                  <div className={`h-3 w-1/2 opacity-70 ${skeletonBarClass}`} />
                </div>
              </div>
            ))}
          </div>
        )}

        {state.status === "error" && (
          <div className={alertErrorClass} role="alert">
            <p className={`min-w-0 ${wrapAnywhereClass}`}>
              Couldn’t load your trips. Check your connection, then try again. ({state.message})
            </p>
            <button type="button" className={`mt-1 font-semibold ${inlineLinkClass}`} onClick={load}>
              Retry
            </button>
          </div>
        )}

        {state.status === "success" && state.trips.length === 0 && (
          <div className="relative isolate -mx-4 overflow-hidden px-4 py-10 sm:-mx-6 sm:px-6 sm:py-14">
            <div aria-hidden className={`pointer-events-none absolute inset-0 -z-10 opacity-70 ${ACCENT.bloomA}`} />
            <p className={eyebrowClass}>No trips yet</p>
            <h2
              className="mt-3 font-display text-[clamp(2.25rem,5vw,3.25rem)] leading-[1.05] tracking-tight text-stone-900 dark:text-stone-100"
              style={SERIF}
            >
              Where to next?
            </h2>
            <p className={`mt-3 max-w-[46ch] text-sm leading-relaxed ${mutedInkClass}`}>
              Start blank and build day by day, or ask AI for a structured draft you can reshape.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
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
          <>
            <div className="space-y-10">
              {sections.map(({ key, title }) => {
                const rows = grouped[key]
                if (rows.length === 0) return null
                return (
                  <section key={key} aria-labelledby={`bucket-${key}`}>
                    <h2 id={`bucket-${key}`} className={`flex items-center gap-3 ${eyebrowClass}`}>
                      {title}
                      <span aria-hidden className={`h-px w-8 ${ACCENT.hairline}`} />
                      <span className="tabular-nums">
                        {rows.length}
                        <span className="sr-only"> {rows.length === 1 ? "trip" : "trips"}</span>
                      </span>
                    </h2>
                    <ul className={`mt-4 ${rowListClass}`}>
                      {rows.map(({ trip, mark, dayCount, range }, i) => (
                        <motion.li
                          key={trip.id}
                          initial={reduce ? false : { opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: REVEAL_DURATION, delay: revealDelay(i), ease: EASE }}
                        >
                          {deleteError?.id === trip.id ? (
                            <div
                              className={`my-3 ${alertErrorClass}`}
                              role="alert"
                              onKeyDown={(e) => {
                                if (e.key === "Escape") closeConfirm(trip.id)
                                if (e.key !== "Tab") return
                                const root = e.currentTarget
                                const buttons = [...root.querySelectorAll<HTMLElement>("button:not([disabled])")]
                                if (buttons.length < 2) return
                                const first = buttons[0]!
                                const last = buttons[buttons.length - 1]!
                                if (e.shiftKey && document.activeElement === first) {
                                  e.preventDefault()
                                  last.focus()
                                } else if (!e.shiftKey && document.activeElement === last) {
                                  e.preventDefault()
                                  first.focus()
                                }
                              }}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3 sm:flex-nowrap">
                                <p className={`min-w-0 ${wrapAnywhereClass}`}>
                                  Couldn’t delete <span className="font-semibold">{trip.name}</span>. Nothing was
                                  removed, so you can try again. ({deleteError.message})
                                </p>
                                <div className="flex shrink-0 items-center gap-2">
                                  <button
                                    type="button"
                                    ref={focusOnMount}
                                    className={ghostOnTintBtnClass}
                                    onClick={() => closeConfirm(trip.id)}
                                    disabled={deleting === trip.id}
                                  >
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
                            <div
                              className="flex flex-wrap items-center justify-between gap-3 bg-red-50/60 px-3 py-3 sm:flex-nowrap dark:bg-red-950/20"
                              role="alertdialog"
                              aria-modal="true"
                              aria-labelledby={`del-${trip.id}`}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") closeConfirm(trip.id)
                                if (e.key !== "Tab") return
                                const root = e.currentTarget
                                const buttons = [...root.querySelectorAll<HTMLElement>("button:not([disabled])")]
                                if (buttons.length < 2) return
                                const first = buttons[0]!
                                const last = buttons[buttons.length - 1]!
                                if (e.shiftKey && document.activeElement === first) {
                                  e.preventDefault()
                                  last.focus()
                                } else if (!e.shiftKey && document.activeElement === last) {
                                  e.preventDefault()
                                  first.focus()
                                }
                              }}
                            >
                              <p
                                id={`del-${trip.id}`}
                                className={`min-w-0 text-sm text-red-900 dark:text-red-200 ${wrapAnywhereClass}`}
                              >
                                Delete <span className="font-semibold">{trip.name}</span>? The whole itinerary goes
                                with it.
                              </p>
                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  type="button"
                                  ref={focusOnMount}
                                  className={ghostOnTintBtnClass}
                                  onClick={() => closeConfirm(trip.id)}
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
                            <div className="group relative flex items-center gap-4 py-5 sm:gap-6">
                              <Link
                                to={`/trips/${trip.slug ?? trip.id}`}
                                className={`absolute inset-0 ${focusRingInsetClass}`}
                                aria-label={`Open ${trip.name}`}
                              />
                              <CountdownMark mark={mark} />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                  <h3
                                    className={`min-w-0 text-base font-semibold leading-snug text-stone-900 sm:text-lg dark:text-stone-100 ${wrapAnywhereClass}`}
                                  >
                                    {trip.name}
                                  </h3>
                                  <TripStatusChip status={trip.status} />
                                </div>
                                <div
                                  className={`mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] ${mutedInkClass}`}
                                >
                                  <span className="inline-flex min-w-0 items-center gap-1.5">
                                    <MapPin className={metaIconClass} strokeWidth={1.5} aria-hidden />
                                    <span className={wrapAnywhereClass}>{trip.destinations.join(" · ")}</span>
                                  </span>
                                  <span className="inline-flex items-center gap-1.5">
                                    <CalendarDays className={metaIconClass} strokeWidth={1.5} aria-hidden />
                                    {range}
                                  </span>
                                  <span className="font-mono-trips text-xs tabular-nums">
                                    {plural(dayCount, "day", "days")} · {plural(trip.itemCount, "stop", "stops")}
                                  </span>
                                  {trip.collaborators.length > 0 && (
                                    <span className="inline-flex items-center gap-1.5">
                                      <Users className={metaIconClass} strokeWidth={1.5} aria-hidden />
                                      {collaboratorSummary(trip.collaborators)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="relative z-10 flex shrink-0 items-center gap-1">
                                {trip.access === "owner" && (
                                  <button
                                    type="button"
                                    ref={restoreTriggerFocus}
                                    data-trip-id={trip.id}
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
                                  className={`h-4 w-4 text-stone-500 dark:text-stone-400 ${arrowAccentHoverClass} ${hoverArrowClass}`}
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

            {onlyPast && (
              <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className={`flex items-center gap-3 ${eyebrowClass}`}>
                  Next
                  <span aria-hidden className={`h-px w-8 ${ACCENT.hairline}`} />
                </p>
                <Link to="/trips/new" className={`group ${ghostBtnClass}`}>
                  Plan a new trip
                  <ArrowRight
                    className={`h-4 w-4 ${hoverArrowClass}`}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

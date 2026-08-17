import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight, CalendarDays, MapPin, Plus, RotateCcw, Trash2, Users } from "lucide-react"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useAuthReady, useGetToken } from "@/lib/safeAuth"
import { deleteTrip, listTrips } from "./tripsApi"
import type { TripSummary } from "./types"
import { ACCENT, collaboratorSummary, daysUntilIn, todayIsoIn } from "./theme"
import { TripStatusChip } from "./components/StatusChip"
import {
  EASE,
  ENTER_SPRING,
  LIFT_SPRING,
  REVEAL_DURATION,
  SERIF,
  alertErrorClass,
  dangerBtnClass,
  dangerIconBtnClass,
  dayCountInclusive,
  eyebrowClass,
  focusRingClass,
  focusRingInsetClass,
  formatRangeFull,
  ghostBtnClass,
  ghostOnTintBtnClass,
  hoverArrowClass,
  inlineLinkClass,
  mutedInkClass,
  pageClass,
  pageGutterClass,
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

function trapDialogKeys(onClose: () => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") onClose()
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
  }
}

function DeleteErrorBanner({
  trip,
  message,
  deleting,
  onClose,
  onRetry,
  focusOnMount,
}: {
  trip: TripSummary
  message: string
  deleting: boolean
  onClose: () => void
  onRetry: () => void
  focusOnMount: (el: HTMLButtonElement | null) => void
}) {
  return (
    <div className={`my-3 ${alertErrorClass}`} role="alert" onKeyDown={trapDialogKeys(onClose)}>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:flex-nowrap">
        <p className={`min-w-0 ${wrapAnywhereClass}`}>
          Couldn’t delete <span className="font-semibold">{trip.name}</span>. Nothing was removed, so you can try
          again. ({message})
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            ref={focusOnMount}
            className={ghostOnTintBtnClass}
            onClick={onClose}
            disabled={deleting}
          >
            Dismiss
          </button>
          <button type="button" className={dangerBtnClass} onClick={onRetry} disabled={deleting}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            {deleting ? "Deleting…" : "Retry delete"}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteConfirmBanner({
  trip,
  deleting,
  onClose,
  onDelete,
  focusOnMount,
}: {
  trip: TripSummary
  deleting: boolean
  onClose: () => void
  onDelete: () => void
  focusOnMount: (el: HTMLButtonElement | null) => void
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 bg-red-50/60 px-3 py-3 sm:flex-nowrap dark:bg-red-950/20"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`del-${trip.id}`}
      onKeyDown={trapDialogKeys(onClose)}
    >
      <p id={`del-${trip.id}`} className={`min-w-0 text-sm text-red-900 dark:text-red-200 ${wrapAnywhereClass}`}>
        Delete <span className="font-semibold">{trip.name}</span>? The whole itinerary goes with it.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          ref={focusOnMount}
          className={ghostOnTintBtnClass}
          onClick={onClose}
          disabled={deleting}
        >
          Cancel
        </button>
        <button type="button" className={dangerBtnClass} onClick={onDelete} disabled={deleting}>
          <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  )
}

const sections: Array<{ key: TripBucket; title: string }> = [
  { key: "current", title: "In progress" },
  { key: "upcoming", title: "Upcoming" },
  { key: "past", title: "Past" },
]

export function TripsIndex() {
  const getToken = useGetToken()
  const readToken = useLatestCallback(getToken)
  const authReady = useAuthReady()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [isRefreshing, startTransition] = useTransition()
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
        const trips = await listTrips(readToken)
        if (!cancelled) startTransition(() => setState({ status: "success", trips }))
      } catch (err) {
        if (!cancelled) setState({ status: "error", message: err instanceof Error ? err.message : String(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [readToken, authReady, reloadKey, startTransition])

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

  const featured = grouped?.current[0] ?? null
  const listBuckets: Record<TripBucket, TripRow[]> | null = grouped
    ? { current: grouped.current.slice(featured ? 1 : 0), upcoming: grouped.upcoming, past: grouped.past }
    : null

  const onlyPast =
    grouped !== null && grouped.past.length > 0 && grouped.current.length + grouped.upcoming.length === 0

  const onDelete = (trip: TripSummary) => {
    void (async () => {
      setDeleting(trip.id)
      setDeleteError(null)
      try {
        await deleteTrip(readToken, trip.id)
        setConfirmId(null)
        // The row is gone, so focus moves to the page's primary action rather
        // than falling back to the document.
        newTripRef.current?.focus()
        setDeletedName(trip.name)
        setState((current) =>
          current.status === "success"
            ? { status: "success", trips: current.trips.filter((item) => item.id !== trip.id) }
            : current,
        )
      } catch (err) {
        setDeleteError({ id: trip.id, message: err instanceof Error ? err.message : String(err) })
      } finally {
        setDeleting(null)
      }
    })()
  }

  const closeConfirm = (tripId: string) => {
    setConfirmId(null)
    setDeleteError(null)
    setPendingFocusId(tripId)
  }

  const empty = state.status === "success" && state.trips.length === 0
  const featuredBusy = featured
    ? deleteError?.id === featured.trip.id || confirmId === featured.trip.id
    : false

  return (
    <div>
      <div className={pageClass()}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            {!empty && (
              <>
                <p className={eyebrowClass}>Itinerary workspace</p>
                <h1
                  className={`mt-2 font-display tracking-tight text-stone-900 dark:text-stone-100 ${
                    featured
                      ? "text-2xl leading-tight sm:text-[1.75rem]"
                      : "text-[clamp(2.25rem,5vw,3.25rem)] leading-[1.05]"
                  }`}
                  style={SERIF}
                >
                  Your trips
                </h1>
              </>
            )}
            {empty && <p className={eyebrowClass}>No trips yet</p>}
          </div>
          <button ref={newTripRef} type="button" onClick={() => navigate("/trips/new")} className={primaryBtnClass}>
            <Plus className="h-4 w-4" aria-hidden />
            New trip
          </button>
        </div>

        <p className="sr-only" role="status">
          {deletedName ? `Deleted ${deletedName}.` : ""}
        </p>

        {state.status === "loading" && (
          <div className={`mt-10 ${rowListClass}`} role="status" aria-label="Loading trips">
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
          <div className={`mt-10 ${alertErrorClass}`} role="alert">
            <p className={`min-w-0 ${wrapAnywhereClass}`}>
              Couldn’t load your trips. Check your connection, then try again. ({state.message})
            </p>
            <button type="button" className={`mt-1 font-semibold ${inlineLinkClass}`} onClick={load}>
              Retry
            </button>
          </div>
        )}

        <p
          className="mb-3 mt-8 text-[12px] font-medium uppercase tracking-[0.16em] text-stone-400 empty:mb-0 empty:mt-0"
          aria-live="polite"
        >
          {state.status === "success" && isRefreshing ? "Refreshing…" : ""}
        </p>
      </div>

      {empty && (
        <div className="relative isolate overflow-hidden">
          <div aria-hidden className={`pointer-events-none absolute inset-0 -z-10 opacity-80 ${ACCENT.bloomA}`} />
          <div aria-hidden className={`pointer-events-none absolute inset-0 -z-10 ${ACCENT.bloomB}`} />
          <motion.div
            className={`${pageGutterClass} py-10 sm:py-16`}
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : ENTER_SPRING}
          >
            <h1
              className="font-display text-[clamp(2.5rem,6vw,3.75rem)] leading-[1.02] tracking-tight text-stone-900 dark:text-stone-100"
              style={SERIF}
            >
              Where to next?
            </h1>
            <p className={`mt-4 max-w-[46ch] text-sm leading-relaxed ${mutedInkClass}`}>
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
          </motion.div>
        </div>
      )}

      {featured && (
        <section aria-labelledby={`featured-${featured.trip.id}`} className="relative isolate overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className={`absolute inset-0 ${ACCENT.bloomA} trip-bloom-drift`} />
            <div className={`absolute inset-0 ${ACCENT.bloomB}`} />
          </div>
          <motion.div
            className={`relative ${pageGutterClass} py-10 sm:py-14`}
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={reduce || featuredBusy ? undefined : { y: -4 }}
            transition={reduce ? { duration: 0 } : featuredBusy ? ENTER_SPRING : LIFT_SPRING}
          >
            {deleteError?.id === featured.trip.id ? (
              <>
                <h2
                  id={`featured-${featured.trip.id}`}
                  className={`font-display text-[clamp(2.25rem,6vw,3.75rem)] font-medium leading-[0.98] tracking-[-0.02em] text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}
                  style={SERIF}
                >
                  {featured.trip.name}
                </h2>
                <DeleteErrorBanner
                  trip={featured.trip}
                  message={deleteError.message}
                  deleting={deleting === featured.trip.id}
                  onClose={() => closeConfirm(featured.trip.id)}
                  onRetry={() => void onDelete(featured.trip)}
                  focusOnMount={focusOnMount}
                />
              </>
            ) : confirmId === featured.trip.id ? (
              <>
                <h2
                  id={`featured-${featured.trip.id}`}
                  className={`font-display text-[clamp(2.25rem,6vw,3.75rem)] font-medium leading-[0.98] tracking-[-0.02em] text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}
                  style={SERIF}
                >
                  {featured.trip.name}
                </h2>
                <div className="mt-6">
                  <DeleteConfirmBanner
                    trip={featured.trip}
                    deleting={deleting === featured.trip.id}
                    onClose={() => closeConfirm(featured.trip.id)}
                    onDelete={() => void onDelete(featured.trip)}
                    focusOnMount={focusOnMount}
                  />
                </div>
              </>
            ) : (
              <div className="group relative">
                <Link
                  to={`/trips/${featured.trip.slug ?? featured.trip.id}`}
                  className={`block rounded-xl ${focusRingClass}`}
                  aria-label={`Open ${featured.trip.name}`}
                >
                  <p className={`flex items-center gap-2 font-mono-trips text-[11px] uppercase tracking-[0.22em] ${ACCENT.text}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${ACCENT.dot} trip-pulse`} aria-hidden />
                    <span className="sr-only">{featured.mark.label}</span>
                    <span aria-hidden>
                      {featured.mark.value}
                      {featured.mark.caption ? ` ${featured.mark.caption}` : ""}
                    </span>
                  </p>
                  <h2
                    id={`featured-${featured.trip.id}`}
                    className={`mt-4 font-display text-[clamp(2.25rem,6vw,3.75rem)] font-medium leading-[0.98] tracking-[-0.02em] text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}
                    style={SERIF}
                  >
                    {featured.trip.name}
                  </h2>
                  <p className={`mt-4 max-w-[46ch] text-base leading-relaxed text-stone-700 dark:text-stone-300 ${wrapAnywhereClass}`}>
                    {featured.trip.destinations.join(" · ")}
                  </p>
                  <p className={`mt-2 text-sm ${mutedInkClass}`}>
                    {featured.range}
                    <span className="mx-2 text-stone-300 dark:text-stone-600" aria-hidden>
                      ·
                    </span>
                    {plural(featured.dayCount, "day", "days")}
                    <span className="mx-2 text-stone-300 dark:text-stone-600" aria-hidden>
                      ·
                    </span>
                    {plural(featured.trip.itemCount, "stop", "stops")}
                  </p>
                  <span className={`mt-8 inline-flex ${primaryBtnClass}`}>
                    Open trip
                    <ArrowRight className={`h-4 w-4 ${hoverArrowClass}`} strokeWidth={1.5} aria-hidden />
                  </span>
                </Link>
                {featured.trip.access === "owner" && (
                  <button
                    type="button"
                    ref={restoreTriggerFocus}
                    data-trip-id={featured.trip.id}
                    onClick={() => {
                      setDeleteError(null)
                      setConfirmId(featured.trip.id)
                    }}
                    className={`${dangerIconBtnClass} absolute right-0 top-0 z-10 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100`}
                    aria-label={`Delete ${featured.trip.name}`}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </section>
      )}

      {state.status === "success" && listBuckets && state.trips.length > 0 && (
        <div className={`${pageGutterClass} ${featured ? "mt-4 sm:mt-6" : ""}`}>
          <div className="space-y-10">
            {sections.map(({ key, title }) => {
              const rows = listBuckets[key]
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
                          <DeleteErrorBanner
                            trip={trip}
                            message={deleteError.message}
                            deleting={deleting === trip.id}
                            onClose={() => closeConfirm(trip.id)}
                            onRetry={() => void onDelete(trip)}
                            focusOnMount={focusOnMount}
                          />
                        ) : confirmId === trip.id ? (
                          <DeleteConfirmBanner
                            trip={trip}
                            deleting={deleting === trip.id}
                            onClose={() => closeConfirm(trip.id)}
                            onDelete={() => void onDelete(trip)}
                            focusOnMount={focusOnMount}
                          />
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
                <ArrowRight className={`h-4 w-4 ${hoverArrowClass}`} strokeWidth={1.5} aria-hidden />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

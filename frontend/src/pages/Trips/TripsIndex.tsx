import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight, Plus, RotateCcw, Trash2 } from "lucide-react"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useAuthReady, useGetToken } from "@/lib/safeAuth"
import { deleteTrip, listTrips } from "./tripsApi"
import type { TripSummary } from "./types"
import { daysUntilIn, resolveAccent, todayIsoIn } from "./theme"
import {
  EASE,
  ENTER_SPRING,
  REVEAL_DURATION,
  alertErrorClass,
  dangerBtnClass,
  dangerIconBtnClass,
  dayCountInclusive,
  focusRingInsetClass,
  formatRangeFull,
  ghostBtnClass,
  ghostOnTintBtnClass,
  hoverArrowClass,
  inlineLinkClass,
  documentClass,
  mutedInkClass,
  primaryBtnClass,
  revealDelay,
  secondaryBtnClass,
  wrapAnywhereClass,
} from "./ui"

const skeletonBarClass = "animate-pulse rounded-sm bg-[color:var(--trips-ink)]/10"
const hairlineListClass =
  "divide-y divide-[color:var(--trips-border)] border-y border-[color:var(--trips-border)]"
const sectionTitleClass =
  "font-display text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100"

type LoadState =
  | { status: "loading" }
  | { status: "success"; trips: TripSummary[] }
  | { status: "error"; message: string }

type TripBucket = "current" | "upcoming" | "past"

interface TripMark {
  value: string
  caption?: string
  label: string
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
    return { value: year, label: `Ended in ${year}` }
  }
  if (bucket === "current") {
    const day = Math.min(dayCountInclusive(trip.startDate, today), dayCount)
    return {
      value: `Day ${day} of ${dayCount}`,
      label: `Under way, day ${day} of ${dayCount}`,
    }
  }
  const days = daysUntilIn(trip.startDate, timezone)
  if (days <= 0) return { value: "Today", label: "Departs today" }
  return {
    value: days === 1 ? "Tomorrow" : `In ${days} days`,
    label: `${plural(days, "day", "days")} until departure`,
  }
}

function rangeFor(trip: TripSummary, bucket: TripBucket): string {
  const sameYear = trip.startDate.slice(0, 4) === trip.endDate.slice(0, 4)
  return formatRangeFull(trip.startDate, trip.endDate, { year: !(bucket === "past" && sameYear) })
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
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-red-50/80 px-4 py-3 sm:flex-nowrap dark:bg-red-950/20"
      role="alertdialog"
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

function TripActions({
  trip,
  restoreTriggerFocus,
  onConfirm,
}: {
  trip: TripSummary
  restoreTriggerFocus: (el: HTMLButtonElement | null) => void
  onConfirm: () => void
}) {
  if (trip.access !== "owner") return null
  return (
    <button
      type="button"
      ref={restoreTriggerFocus}
      data-trip-id={trip.id}
      onClick={onConfirm}
      className={`${dangerIconBtnClass} relative z-10 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100`}
      aria-label={`Delete ${trip.name}`}
    >
      <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
    </button>
  )
}

function TimetableRow({
  row,
  restoreTriggerFocus,
  onConfirm,
}: {
  row: TripRow
  restoreTriggerFocus: (el: HTMLButtonElement | null) => void
  onConfirm: () => void
}) {
  const { trip, mark, dayCount, range } = row
  return (
    <div
      className="group relative flex items-start gap-4 py-4"
      data-trip-accent={resolveAccent(trip.accent)}
    >
      <Link
        to={`/trips/${trip.slug ?? trip.id}`}
        className={`absolute inset-0 z-[1] ${focusRingInsetClass}`}
        aria-label={`Open ${trip.name}`}
      />
      <div className="min-w-0 flex-1">
        <h3
          className={`font-display min-w-0 text-xl font-semibold leading-tight tracking-tight text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}
        >
          {trip.name}
        </h3>
        <p className={`mt-1 text-sm ${mutedInkClass}`}>
          <span className={wrapAnywhereClass}>{trip.destinations.join(", ")}</span>
          <span aria-hidden> · </span>
          {range}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-display text-lg font-semibold tabular-nums leading-tight tracking-tight text-stone-900 dark:text-stone-100">
          <span className="sr-only">{mark.label}</span>
          <span aria-hidden>{mark.value}</span>
        </p>
        <p className={`mt-1 text-[13px] tabular-nums ${mutedInkClass}`}>
          {plural(dayCount, "day", "days")} · {plural(trip.itemCount, "stop", "stops")}
        </p>
      </div>
      <div className="relative z-10 flex shrink-0 items-start">
        <TripActions trip={trip} restoreTriggerFocus={restoreTriggerFocus} onConfirm={onConfirm} />
      </div>
    </div>
  )
}

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

  const onlyPast =
    grouped !== null && grouped.past.length > 0 && grouped.current.length + grouped.upcoming.length === 0

  const onDelete = (trip: TripSummary) => {
    void (async () => {
      setDeleting(trip.id)
      setDeleteError(null)
      try {
        await deleteTrip(readToken, trip.id)
        setConfirmId(null)
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

  const renderState = (row: TripRow) => {
    if (deleteError?.id === row.trip.id) {
      return (
        <DeleteErrorBanner
          trip={row.trip}
          message={deleteError.message}
          deleting={deleting === row.trip.id}
          onClose={() => closeConfirm(row.trip.id)}
          onRetry={() => void onDelete(row.trip)}
          focusOnMount={focusOnMount}
        />
      )
    }
    if (confirmId === row.trip.id) {
      return (
        <DeleteConfirmBanner
          trip={row.trip}
          deleting={deleting === row.trip.id}
          onClose={() => closeConfirm(row.trip.id)}
          onDelete={() => void onDelete(row.trip)}
          focusOnMount={focusOnMount}
        />
      )
    }
    return null
  }

  const renderBucket = (id: string, title: string, rows: TripRow[]) => {
    if (rows.length === 0) return null
    return (
      <section aria-labelledby={id}>
        <h2 id={id} className={sectionTitleClass}>
          {title}
        </h2>
        <ul className={`mt-3 ${hairlineListClass}`}>
          {rows.map((row, i) => (
            <motion.li
              key={row.trip.id}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: REVEAL_DURATION, delay: revealDelay(i), ease: EASE }}
            >
              {renderState(row) ?? (
                <TimetableRow
                  row={row}
                  restoreTriggerFocus={restoreTriggerFocus}
                  onConfirm={() => {
                    setDeleteError(null)
                    setConfirmId(row.trip.id)
                  }}
                />
              )}
            </motion.li>
          ))}
        </ul>
      </section>
    )
  }

  const empty = state.status === "success" && state.trips.length === 0

  return (
    <div className={documentClass}>
      <div className="flex flex-wrap items-end justify-between gap-4 pt-8">
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl dark:text-stone-100">
            {empty ? "No trips yet" : "Trips"}
          </h1>
          {!empty && <p className={`mt-2 text-sm ${mutedInkClass}`}>Open a trip to edit it in place.</p>}
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
        <div className={`mt-10 ${hairlineListClass}`} role="status" aria-label="Loading trips">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className={`h-5 w-40 max-w-full ${skeletonBarClass}`} />
                <div className={`h-3 w-56 max-w-full ${skeletonBarClass}`} />
              </div>
              <div className={`h-5 w-24 ${skeletonBarClass}`} />
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

      <p className={`mb-3 mt-8 text-sm ${mutedInkClass} empty:mb-0 empty:mt-0`} aria-live="polite">
        {state.status === "success" && isRefreshing ? "Refreshing…" : ""}
      </p>

      {empty && (
        <motion.div
          className="mt-16"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : ENTER_SPRING}
        >
          <h2 className="font-display text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl dark:text-stone-100">
            Where to next?
          </h2>
          <p className={`mt-3 max-w-[46ch] text-sm leading-relaxed ${mutedInkClass}`}>
            Start blank and build day by day, or ask AI for a structured draft you can reshape.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link to="/trips/new?mode=ai" className={primaryBtnClass}>
              Plan with AI
            </Link>
            <Link to="/trips/new?mode=blank" className={secondaryBtnClass}>
              Start blank
            </Link>
          </div>
        </motion.div>
      )}

      {grouped && state.status === "success" && state.trips.length > 0 && (
        <div className="space-y-12">
          {renderBucket("bucket-current", "Now", grouped.current)}
          {renderBucket("bucket-upcoming", "Upcoming", grouped.upcoming)}
          {renderBucket("bucket-past", "Past", grouped.past)}

          {onlyPast && (
            <Link to="/trips/new" className={`group ${ghostBtnClass}`}>
              Plan a new trip
              <ArrowRight className={`h-4 w-4 ${hoverArrowClass}`} strokeWidth={1.5} aria-hidden />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

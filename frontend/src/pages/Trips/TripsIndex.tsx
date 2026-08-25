import { sx } from '@/lib/utils'
import { styles } from './trips.stylex'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight, Plus, RotateCcw, Trash2 } from "lucide-react"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useAuthReady, useGetToken } from "@/lib/safeAuth"
import { deleteTrip, listTrips } from "./tripsApi"
import type { TripSummary } from "./types"
import { FlipTime } from "./components/FlipTime"
import { daysUntilIn, resolveAccent, todayIsoIn } from "./theme"
import {
  EASE,
  ENTER_SPRING,
  REVEAL_DURATION,
  alertErrorClass,
  dangerBtnClass,
  dangerIconBtnClass,
  dayCountInclusive,
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
  skeletonBarClass,
  typePageTitleClass,
  typeSectionClass,
  wrapAnywhereClass,
} from "./ui"

const sectionTitleClass = typeSectionClass

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
    <div {...sx(styles.my3, alertErrorClass)} role="alert" onKeyDown={trapDialogKeys(onClose)}>
      <div {...sx(styles.deleteErrorRow)}>
        <p {...sx(styles.minW0, wrapAnywhereClass)}>
          Couldn’t delete <span {...sx(styles.fontSemiboldSpan)}>{trip.name}</span>. Nothing was removed, so you can try
          again. ({message})
        </p>
        <div {...sx(styles.deleteActions)}>
          <button
            type="button"
            ref={focusOnMount}
            {...sx(ghostOnTintBtnClass)}
            onClick={onClose}
            disabled={deleting}
          >
            Dismiss
          </button>
          <button type="button" {...sx(dangerBtnClass)} onClick={onRetry} disabled={deleting}>
            <RotateCcw {...sx(styles.iconSm)} strokeWidth={1.5} aria-hidden />
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
      {...sx(styles.deleteConfirmDialog)}
      role="alertdialog"
      aria-labelledby={`del-${trip.id}`}
      onKeyDown={trapDialogKeys(onClose)}
    >
      <p id={`del-${trip.id}`} {...sx(styles.deleteDialogText, wrapAnywhereClass)}>
        Delete <span {...sx(styles.fontSemiboldSpan)}>{trip.name}</span>? The whole itinerary goes with it.
      </p>
      <div {...sx(styles.deleteActions)}>
        <button
          type="button"
          ref={focusOnMount}
          {...sx(ghostOnTintBtnClass)}
          onClick={onClose}
          disabled={deleting}
        >
          Cancel
        </button>
        <button type="button" {...sx(dangerBtnClass)} onClick={onDelete} disabled={deleting}>
          <Trash2 {...sx(styles.iconSm)} strokeWidth={1.5} aria-hidden />
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
      {...sx(dangerIconBtnClass, styles.dangerIconHiddenSm)}
      aria-label={`Delete ${trip.name}`}
    >
      <Trash2 {...sx(styles.iconSm)} strokeWidth={1.5} aria-hidden />
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
      {...sx("group", styles.timetableRow)}
      data-trip-accent={resolveAccent(trip.accent)}
    >
      <Link
        to={`/trips/${trip.slug ?? trip.id}`}
        {...sx(styles.timetableOverlayLink)}
        aria-label={`Open ${trip.name}`}
      />
      <div {...sx(styles.minW0, styles.flex1)}>
        <h3 {...sx(styles.timetableTitle, wrapAnywhereClass)}>
          {trip.name}
        </h3>
        <p {...sx(styles.timetableMeta)}>
          <span {...sx(wrapAnywhereClass)}>{trip.destinations.join(", ")}</span>
          <span aria-hidden> · </span>
          {range}
        </p>
      </div>
      <div {...sx(styles.shrink0, styles.textRight)}>
        <p {...sx(styles.timetableMarkValue)}>
          <span {...sx(styles.srOnly)}>{mark.label}</span>
          <FlipTime value={mark.value} playOnMount {...sx(styles.flipJustifyEnd)} />
        </p>
        <p {...sx(styles.timetableStats)}>
          {plural(dayCount, "day", "days")} · {plural(trip.itemCount, "stop", "stops")}
        </p>
      </div>
      <div {...sx(styles.actionsColZ10)}>
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
        <h2 id={id} {...sx(sectionTitleClass)}>
          {title}
        </h2>
        <ul {...sx(styles.mt3, styles.hairlineList)}>
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
    <div {...sx(documentClass)}>
      <div {...sx(styles.indexHeaderRow)}>
        <div {...sx(styles.minW0)}>
          <h1 {...sx(typePageTitleClass)}>
            {empty ? "No trips yet" : "Trips"}
          </h1>
          {!empty && <p {...sx(styles.indexOpenHint, mutedInkClass)}>Open a trip to edit it in place.</p>}
        </div>
        <button ref={newTripRef} type="button" onClick={() => navigate("/trips/new")} {...sx(primaryBtnClass)}>
          <Plus {...sx(styles.iconSm)} aria-hidden />
          New trip
        </button>
      </div>

      <p {...sx(styles.srOnly)} role="status">
        {deletedName ? `Deleted ${deletedName}.` : ""}
      </p>

      {state.status === "loading" && (
        <div {...sx(styles.mt10, styles.hairlineList)} role="status" aria-label="Loading trips">
          {[0, 1, 2].map((i) => (
            <div key={i} {...sx(styles.indexSkeletonRow)}>
              <div {...sx(styles.skeletonInnerStack)}>
                <div {...sx(styles.skeletonBarH5W40, skeletonBarClass)} />
                <div {...sx(styles.skeletonBarH3W56, skeletonBarClass)} />
              </div>
              <div {...sx(styles.skeletonBarH5W24, skeletonBarClass)} />
            </div>
          ))}
        </div>
      )}

      {state.status === "error" && (
        <div {...sx(styles.alertMt10, alertErrorClass)} role="alert">
          <p {...sx(styles.minW0, wrapAnywhereClass)}>
            Couldn’t load your trips. Check your connection, then try again. ({state.message})
          </p>
          <button type="button" {...sx(styles.linkSemiboldMt1, inlineLinkClass)} onClick={load}>
            Retry
          </button>
        </div>
      )}

      <p {...sx(styles.indexRefreshLine, mutedInkClass)} aria-live="polite">
        {state.status === "success" && isRefreshing ? "Refreshing…" : ""}
      </p>

      {empty && (
        <motion.div
          {...sx(styles.indexEmptyWrap)}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : ENTER_SPRING}
        >
          <h2 {...sx(typePageTitleClass)}>
            Where to next?
          </h2>
          <p {...sx(styles.indexEmptyCopy, mutedInkClass)}>
            Start blank and build day by day, or ask AI for a structured draft you can reshape.
          </p>
          <div {...sx(styles.mt6, styles.flexWrapCenterGap2)}>
            <Link to="/trips/new?mode=ai" {...sx(primaryBtnClass)}>
              Plan with AI
            </Link>
            <Link to="/trips/new?mode=blank" {...sx(secondaryBtnClass)}>
              Start blank
            </Link>
          </div>
        </motion.div>
      )}

      {grouped && state.status === "success" && state.trips.length > 0 && (
        <div {...sx(styles.indexBuckets)}>
          {renderBucket("bucket-current", "Now", grouped.current)}
          {renderBucket("bucket-upcoming", "Upcoming", grouped.upcoming)}
          {renderBucket("bucket-past", "Past", grouped.past)}

          {onlyPast && (
            <Link to="/trips/new" {...sx('group', ghostBtnClass)}>
              Plan a new trip
              <ArrowRight {...sx(styles.iconSm, hoverArrowClass)} strokeWidth={1.5} aria-hidden />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

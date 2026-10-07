import { sx } from '@/lib/utils'
import { styles } from './trips.stylex'
import { index as ix } from './toy.stylex'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight, Plus, RotateCcw, Search, Sparkles, Trash2, X } from "lucide-react"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useAuthReady, useGetToken } from "@/lib/safeAuth"
import { deleteTrip, listTrips } from "./tripsApi"
import type { TripSummary } from "./types"
import { FlipTime } from "./components/FlipTime"
import { TripsGlobe } from "./scene/TripsGlobe"
import { daysUntilIn, resolveAccent, todayIsoIn } from "./theme"
import { useTripPins } from "./useTripPins"
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
  mutedInkClass,
  primaryBtnClass,
  revealDelay,
  secondaryBtnClass,
  skeletonClass,
  typePageTitleClass,
  typeSectionClass,
  wrapAnywhereClass,
} from "./ui"

type LoadState =
  | { status: "loading" }
  | { status: "success"; trips: TripSummary[] }
  | { status: "error"; message: string }

type TripBucket = "current" | "upcoming" | "past"

interface TripMark {
  value: string
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

/** Three-letter luggage code from the first destination ("Tokyo" → "TOK"). */
function tagCode(trip: TripSummary): string {
  const first = trip.destinations[0] ?? trip.name
  const latin = first.normalize("NFKD").replace(/[^A-Za-z]/g, "")
  return (latin || first).slice(0, 3).toUpperCase()
}

function matches(trip: TripSummary, q: string): boolean {
  if (!q) return true
  const hay = [trip.name, ...trip.destinations, ...trip.tags].join(" ").normalize("NFKC").toLowerCase()
  return q
    .normalize("NFKC")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word))
}

function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"]'))
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
    <div {...sx(alertErrorClass)} role="alert" onKeyDown={trapDialogKeys(onClose)}>
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
            <RotateCcw {...sx(styles.iconSm)} strokeWidth={2} aria-hidden />
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
          <Trash2 {...sx(styles.iconSm)} strokeWidth={2} aria-hidden />
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  )
}

/** A luggage tag: pastel stub with an eyelet and code, ticket body with the trip. */
function LuggageTag({
  row,
  restoreTriggerFocus,
  onConfirm,
}: {
  row: TripRow
  restoreTriggerFocus: (el: HTMLButtonElement | null) => void
  onConfirm: () => void
}) {
  const { trip, mark, dayCount, range } = row
  const shared = trip.access !== "owner" || trip.collaborators.length > 0 || trip.sharedWithAllUsers
  return (
    <div {...sx("group", ix.tag)} data-trip-accent={resolveAccent(trip.accent)}>
      <Link to={`/trips/${trip.slug ?? trip.id}`} {...sx(ix.tagLink)} aria-label={`Open ${trip.name}`} />
      <div {...sx(ix.tagStub)} aria-hidden>
        <span {...sx(ix.tagEyelet)} />
        <span {...sx(ix.tagCode)}>{tagCode(trip)}</span>
        <span {...sx(ix.tagStubMeta)}>{plural(dayCount, "day", "days")}</span>
      </div>
      <div {...sx(ix.tagBody)}>
        <p {...sx(ix.tagMark)}>
          <span {...sx(styles.srOnly)}>{mark.label}</span>
          <FlipTime value={mark.value} playOnMount />
        </p>
        <h3 {...sx(ix.tagTitle, wrapAnywhereClass)}>{trip.name}</h3>
        <p {...sx(ix.tagMeta, wrapAnywhereClass)}>
          {trip.destinations.join(", ")}
          <span aria-hidden> · </span>
          {range}
        </p>
        <p {...sx(ix.tagStats)}>
          {plural(trip.itemCount, "stop", "stops")}
          {shared ? <span {...sx(ix.tagShared)}>Shared</span> : null}
        </p>
      </div>
      {trip.access === "owner" && (
        <div {...sx(ix.tagActions)}>
          <button
            type="button"
            ref={restoreTriggerFocus}
            data-trip-id={trip.id}
            onClick={onConfirm}
            {...sx(dangerIconBtnClass, styles.dangerIconHiddenSm)}
            aria-label={`Delete ${trip.name}`}
          >
            <Trash2 {...sx(styles.iconSm)} strokeWidth={2} aria-hidden />
          </button>
        </div>
      )}
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
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query.trim())
  const newTripRef = useRef<HTMLAnchorElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
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

  // "/" finds a trip, "n" packs a new one.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || typingTarget(e.target)) return
      if (e.key === "/") {
        if (!searchRef.current) return
        e.preventDefault()
        searchRef.current.focus()
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault()
        navigate("/trips/new")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [navigate])

  const allTrips = state.status === "success" ? state.trips : null
  const visibleTrips = useMemo(() => allTrips?.filter((t) => matches(t, deferredQuery)) ?? null, [allTrips, deferredQuery])
  const allPins = useTripPins(allTrips, readToken)
  const pins = useMemo(() => {
    const ids = new Set(visibleTrips?.map((t) => t.id))
    return allPins.filter((p) => ids.has(p.id))
  }, [allPins, visibleTrips])

  const grouped = useMemo(() => {
    if (!visibleTrips) return null
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    const today = todayIsoIn(timezone)
    const buckets: Record<TripBucket, TripRow[]> = { current: [], upcoming: [], past: [] }
    for (const trip of visibleTrips) {
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
  }, [visibleTrips])

  const focus = useMemo(() => {
    const next = grouped?.current[0] ?? grouped?.upcoming[0] ?? grouped?.past[0]
    return (next && allPins.find((p) => p.id === next.trip.id)) ?? allPins[0] ?? null
  }, [grouped, allPins])

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

  const renderBucket = (id: string, title: string, rows: TripRow[], offset: number) => {
    if (rows.length === 0) return null
    return (
      <section aria-labelledby={id}>
        <h2 id={id} {...sx(typeSectionClass, ix.bucketTitle)}>
          {title}
          <span {...sx(ix.bucketCount)} aria-hidden>
            {rows.length}
          </span>
        </h2>
        <ul {...sx(ix.tagGrid)}>
          {rows.map((row, i) => (
            <motion.li
              key={row.trip.id}
              initial={reduce ? false : { opacity: 0, y: -14, rotate: i % 2 ? 3 : -3 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 18, delay: revealDelay(offset + i) * 2 }}
            >
              {renderState(row) ?? (
                <LuggageTag
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
  const total = allTrips?.length ?? 0
  const upcomingCount = grouped ? grouped.current.length + grouped.upcoming.length : 0
  const noMatch = !empty && visibleTrips !== null && visibleTrips.length === 0
  const pathFor = (id: string) => {
    const trip = allTrips?.find((t) => t.id === id)
    return trip ? `/trips/${trip.slug ?? trip.id}` : null
  }

  return (
    <div {...sx(ix.page)}>
      <section {...sx(ix.hero)} aria-labelledby="trips-title">
        <motion.div
          {...sx(ix.heroCopy)}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: REVEAL_DURATION * 2, ease: EASE }}
        >
          <p {...sx(ix.heroStamp)}>
            {state.status === "success"
              ? `${plural(total, "trip", "trips")} · ${upcomingCount} ahead`
              : "Trip planner"}
          </p>
          <h1 id="trips-title" {...sx(ix.heroTitle)}>
            {empty ? "No trips yet" : "Trips"}
          </h1>
          <p {...sx(ix.heroLede)}>
            {empty
              ? "Your planet is empty. Pack a bag and a pin drops where you’re going."
              : "Every trip you’re planning, pinned to a squishy little planet. Poke it, stretch it, tap a pin to jump in."}
          </p>
          <div {...sx(ix.heroActions)}>
            <Link ref={newTripRef} to="/trips/new" {...sx(primaryBtnClass)}>
              <Plus {...sx(styles.iconSm)} strokeWidth={2.5} aria-hidden />
              New trip
            </Link>
            {!empty && (
              <Link to="/trips/new?mode=ai" {...sx(secondaryBtnClass)}>
                <Sparkles {...sx(styles.iconSm)} strokeWidth={2} aria-hidden />
                Plan with AI
              </Link>
            )}
          </div>
          {total > 0 && (
            <div {...sx(ix.search)}>
              <Search {...sx(ix.searchIcon)} strokeWidth={2.25} aria-hidden />
              <label htmlFor="trips-search" {...sx(styles.srOnly)}>
                Find a trip
              </label>
              <input
                ref={searchRef}
                id="trips-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.preventDefault()
                    setQuery("")
                  }
                }}
                placeholder="Find a trip, city or tag"
                autoComplete="off"
                {...sx(ix.searchInput)}
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} {...sx(ix.searchClear)} aria-label="Clear search">
                  <X {...sx(styles.iconSm)} strokeWidth={2.25} aria-hidden />
                </button>
              ) : (
                <kbd {...sx(ix.kbd)} aria-hidden>
                  /
                </kbd>
              )}
            </div>
          )}
          <p {...sx(ix.shortcutHint)}>
            <kbd {...sx(ix.kbdInline)}>N</kbd> new trip
            {total > 0 ? (
              <>
                <span aria-hidden> · </span>
                <kbd {...sx(ix.kbdInline)}>/</kbd> search
              </>
            ) : null}
          </p>
        </motion.div>
        <div {...sx(ix.heroGlobe)}>
          <TripsGlobe
            mode="world"
            pins={pins}
            focus={focus}
            onSelect={(id) => {
              const to = pathFor(id)
              if (to) navigate(to)
            }}
            description={
              pins.length
                ? `A clay globe with pins for ${pins.map((p) => p.label).join(", ")}.`
                : "A clay globe, waiting for its first pin."
            }
          />
        </div>
      </section>

      <p {...sx(styles.srOnly)} role="status">
        {deletedName ? `Deleted ${deletedName}.` : ""}
      </p>

      {state.status === "loading" && (
        <div {...sx(ix.tagGrid, ix.listTop)} role="status" aria-label="Loading trips">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} {...sx(ix.tagSkeleton, skeletonClass)} />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <div {...sx(ix.listTop, alertErrorClass)} role="alert">
          <p {...sx(styles.minW0, wrapAnywhereClass)}>
            Couldn’t load your trips. Check your connection, then try again. ({state.message})
          </p>
          <button type="button" {...sx(styles.linkSemiboldMt1, inlineLinkClass)} onClick={load}>
            Retry
          </button>
        </div>
      )}

      <p {...sx(styles.indexRefreshLine, mutedInkClass)} aria-live="polite">
        {state.status === "success" && isRefreshing
          ? "Refreshing…"
          : deferredQuery && visibleTrips
            ? `${plural(visibleTrips.length, "trip matches", "trips match")} “${deferredQuery}”.`
            : ""}
      </p>

      {empty && (
        <motion.div
          {...sx(ix.emptyCard)}
          initial={reduce ? false : { opacity: 0, y: 10, rotate: -2 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={reduce ? { duration: 0 } : ENTER_SPRING}
        >
          <Suitcase />
          <div {...sx(styles.minW0)}>
            <h2 {...sx(typePageTitleClass)}>Where to next?</h2>
            <p {...sx(ix.emptyCopy)}>
              Start blank and build day by day, or ask AI for a structured draft you can reshape.
            </p>
            <div {...sx(ix.emptyActions)}>
              <Link to="/trips/new?mode=ai" {...sx(primaryBtnClass)}>
                <Sparkles {...sx(styles.iconSm)} strokeWidth={2} aria-hidden />
                Plan with AI
              </Link>
              <Link to="/trips/new?mode=blank" {...sx(secondaryBtnClass)}>
                Start blank
              </Link>
            </div>
          </div>
        </motion.div>
      )}

      {noMatch && (
        <div {...sx(ix.noMatch)}>
          <p {...sx(typeSectionClass)}>No trips match “{deferredQuery}”.</p>
          <p {...sx(ix.emptyCopy)}>Try a city, a tag, or part of the trip name.</p>
          <button type="button" onClick={() => setQuery("")} {...sx(ix.noMatchBtn, secondaryBtnClass)}>
            Clear search
          </button>
        </div>
      )}

      {grouped && !empty && !noMatch && (
        <div {...sx(ix.buckets)}>
          {renderBucket("bucket-current", "Now", grouped.current, 0)}
          {renderBucket("bucket-upcoming", "Upcoming", grouped.upcoming, grouped.current.length)}
          {renderBucket("bucket-past", "Past", grouped.past, grouped.current.length + grouped.upcoming.length)}

          {onlyPast && !deferredQuery && (
            <Link to="/trips/new" {...sx('group', ghostBtnClass, ix.planNew)}>
              Plan a new trip
              <ArrowRight {...sx(styles.iconSm, hoverArrowClass)} strokeWidth={2} aria-hidden />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

/** Little clay suitcase for the empty state, covered in stickers. */
function Suitcase() {
  return (
    <svg viewBox="0 0 120 104" {...sx(ix.suitcase, "toy-wobble")} aria-hidden>
      <rect x="44" y="6" width="32" height="16" rx="7" fill="none" stroke="#1f2440" strokeWidth="5" />
      <rect x="10" y="18" width="100" height="78" rx="16" fill="#ffc3a6" stroke="#1f2440" strokeWidth="4" />
      <path d="M10 46 H110" stroke="#1f2440" strokeWidth="3" strokeDasharray="6 5" />
      <circle cx="34" cy="66" r="11" fill="#a9d8f5" stroke="#1f2440" strokeWidth="3" />
      <rect x="62" y="56" width="30" height="20" rx="5" fill="#ffdd7f" stroke="#1f2440" strokeWidth="3" transform="rotate(-8 77 66)" />
      <path d="M78 26 l6 10 l-12 0 z" fill="#a6e5c8" stroke="#1f2440" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="28" cy="98" r="5" fill="#1f2440" />
      <circle cx="92" cy="98" r="5" fill="#1f2440" />
    </svg>
  )
}

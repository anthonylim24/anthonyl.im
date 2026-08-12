import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"
import { Link, useLocation, useParams } from "react-router-dom"
import { Eye, Globe2, X } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { applySuggestions, enhanceTrip, getTrip, updateTrip } from "./tripsApi"
import { insertItemAt, removeItem } from "./tripEdits"
import { SERIF, alertErrorClass, alertNoticeClass, eyebrowClass, focusRingClass, iconBtnClass, secondaryBtnClass, successBtnClass } from "./ui"
import { formatTripDate, resolveAccent } from "./theme"
import { AppearancePanel } from "./editor/AppearancePanel"
import { DayCard } from "./editor/DayCard"
import { DayNavigation } from "./editor/DayNavigation"
import { EnhanceButton } from "./editor/EnhanceButton"
import {
  EditorDock,
  FloatingSaveIndicator,
  UndoToast,
  type PendingUndo,
  type SaveState,
} from "./editor/FloatingSaveIndicator"
import { GeneratePanel } from "./editor/GeneratePanel"
import { SuggestionsPanel } from "./editor/SuggestionsPanel"
import { TripStatusSelect } from "./editor/TripStatusSelect"
import { useDayOptions } from "./editor/hooks"
import type { EnhancementRun, ItineraryItem, Trip, TripAccess, TripDay } from "./types"
import type { GeneratePreferences } from "./types"

// Map Mode pulls in three.js — keep it lazy so the editor stays light.
const MapModeOverlay = lazy(() =>
  import("../Korea/MapModeOverlay").then((m) => ({ default: m.MapModeOverlay })),
)

/** Page gutters — `<main>` is unconstrained so trip heroes can be full-bleed. */
const pageClass = "mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-10"

const UNDO_WINDOW_MS = 6000

/** A global rule pins every input to 16px below 768px so iOS doesn't zoom on
 *  focus. The trip name is the page's display type and never drops below
 *  28px, so it can opt out without reintroducing that zoom. */
const sizeAsDisplayType = (el: HTMLInputElement | null) => {
  el?.style.setProperty("font-size", "clamp(1.75rem, 4vw, 2.5rem)", "important")
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success" }

interface DeletedItem extends PendingUndo {
  dayId: string
  item: ItineraryItem
  index: number
}

export function TripDetail() {
  const { tripId } = useParams<{ tripId: string }>()
  const routerLocation = useLocation()
  const getToken = useGetToken()
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [trip, setTrip] = useState<Trip | null>(null)
  const [access, setAccess] = useState<TripAccess>("view")
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const navState = routerLocation.state as {
    notice?: string
    retryGenerate?: { prompt?: string; preferences?: GeneratePreferences }
  } | null
  const [notice, setNotice] = useState<string | null>(navState?.notice ?? null)
  const [mapDayId, setMapDayId] = useState<string | null>(null)
  // "trip" or a dayId while that enhancement is in flight.
  const [enhancingTarget, setEnhancingTarget] = useState<string | null>(null)
  const [activeRun, setActiveRun] = useState<EnhancementRun | null>(null)
  const [deleted, setDeleted] = useState<DeletedItem | null>(null)
  // Item ids touched by the last applied suggestions — drives the accent
  // "this just changed" flash, cleared after the flash finishes.
  const [recentIds, setRecentIds] = useState<Set<string>>(() => new Set())
  const recentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editable = access === "edit" || access === "owner"
  // Stable across keystrokes (the URL param may be a slug), so every handler
  // below can be a stable identity and memoized day cards stay memoized.
  const tripDocId = trip?.id

  useEffect(() => {
    if (!tripId) return
    void (async () => {
      try {
        const { trip: loaded, access: a } = await getTrip(getToken, tripId)
        setTrip(loaded)
        setAccess(a)
        setState({ status: "success" })
      } catch (err) {
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) })
      }
    })()
  }, [tripId, getToken])

  // Latest pending document for flush-on-leave.
  const pendingPatchRef = useRef<Trip | null>(null)

  const persistTrip = useCallback(
    async (next: Trip) => {
      setSaveState("saving")
      try {
        await updateTrip(getToken, next.id, {
          name: next.name,
          status: next.status,
          slug: next.slug,
          appearance: next.appearance,
          destinations: next.destinations,
          startDate: next.startDate,
          endDate: next.endDate,
          timezone: next.timezone,
          tags: next.tags,
          description: next.description ?? null,
          days: next.days,
        })
        // Ignore stale responses if a newer edit is already queued.
        if (pendingPatchRef.current && pendingPatchRef.current !== next) return
        pendingPatchRef.current = null
        setSaveState("saved")
      } catch (err: unknown) {
        setSaveState("error")
        const message = err instanceof Error ? err.message : String(err)
        if (/permalink|slug|hyphen/i.test(message)) setNotice(message)
      }
    },
    [getToken],
  )

  const editedRef = useRef(false)

  const markEdited = useCallback(() => {
    editedRef.current = true
    setSaveState("dirty")
  }, [])

  const scheduleSave = useCallback(
    (next: Trip) => {
      markEdited()
      setTrip(next)
    },
    [markEdited],
  )

  // Debounced document save: any edit marks the trip dirty; 900ms after the
  // last keystroke metadata + days are PATCHed (including appearance). The
  // timer is armed from an effect rather than from inside a state updater —
  // scheduling there makes the updater impure, and React replays it, which
  // duplicates non-idempotent edits such as insert and add.
  useEffect(() => {
    if (!trip || !editedRef.current) return
    editedRef.current = false
    pendingPatchRef.current = trip
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void persistTrip(trip)
    }, 900)
  }, [trip, persistTrip])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!pendingPatchRef.current) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      const pending = pendingPatchRef.current
      if (pending) {
        pendingPatchRef.current = null
        void updateTrip(getToken, pending.id, {
          name: pending.name,
          status: pending.status,
          slug: pending.slug,
          appearance: pending.appearance,
          destinations: pending.destinations,
          startDate: pending.startDate,
          endDate: pending.endDate,
          timezone: pending.timezone,
          tags: pending.tags,
          description: pending.description ?? null,
          days: pending.days,
        }).catch(() => {
          /* best-effort flush on leave */
        })
      }
    }
  }, [getToken])

  const setDays = useCallback(
    (fn: (days: TripDay[]) => TripDay[]) => {
      markEdited()
      setTrip((t) => (t ? { ...t, days: fn(t.days) } : t))
    },
    [markEdited],
  )

  const dayOptions = useDayOptions(trip?.days ?? [], trip?.timezone ?? "UTC")

  const runEnhance = useCallback(
    async (scope: "day" | "trip", dayId?: string, prompt?: string) => {
      if (!tripDocId) return
      setEnhancingTarget(scope === "day" ? (dayId ?? null) : "trip")
      setActiveRun(null)
      try {
        const { run, trip: refreshed } = await enhanceTrip(getToken, tripDocId, scope, dayId, prompt)
        // The server auto-syncs day.weather from the live forecast during the run.
        if (refreshed) setTrip(refreshed)
        setActiveRun(run)
      } catch (err) {
        setNotice(`Enhancement failed: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        setEnhancingTarget(null)
      }
    },
    [getToken, tripDocId],
  )

  const applyRun = useCallback(
    async (suggestionIds: string[]) => {
      if (!tripDocId || !activeRun) return
      try {
        const { trip: next, applied } = await applySuggestions(getToken, tripDocId, activeRun.id, suggestionIds)
        // Flash the items the accepted suggestions touched (added or edited).
        const touched = new Set<string>()
        for (const id of applied) {
          const s = activeRun.suggestions.find((x) => x.id === id)
          const target = s?.proposedItem?.id ?? s?.itemId
          if (target && (s?.kind === "add" || s?.kind === "edit")) touched.add(target)
        }
        setTrip(next)
        setActiveRun(null)
        setSaveState("saved")
        setRecentIds(touched)
        if (recentTimer.current) clearTimeout(recentTimer.current)
        recentTimer.current = setTimeout(() => setRecentIds(new Set()), 3200)
        setNotice(`Applied ${applied.length} suggestion${applied.length === 1 ? "" : "s"}.`)
      } catch (err) {
        setNotice(`Could not apply suggestions: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [getToken, tripDocId, activeRun],
  )

  const applyActiveRun = useCallback((ids: string[]) => void applyRun(ids), [applyRun])
  const dismissRun = useCallback(() => setActiveRun(null), [])
  const openMap = useCallback((dayId: string) => setMapDayId(dayId), [])
  const enhanceDay = useCallback(
    (dayId: string, prompt?: string) => void runEnhance("day", dayId, prompt),
    [runEnhance],
  )

  // Delete is undoable for six seconds; the item keeps its original index so
  // undo restores the day exactly as it was.
  const deleteItem = useCallback(
    (dayId: string, item: ItineraryItem, index: number) => {
      setDays((days) => removeItem(days, dayId, item.id))
      setDeleted({ dayId, item, index, title: item.title, key: Date.now() })
    },
    [setDays],
  )

  const undoDelete = useCallback(() => {
    if (!deleted) return
    setDays((days) => insertItemAt(days, deleted.dayId, deleted.item, deleted.index))
    setDeleted(null)
  }, [deleted, setDays])

  useEffect(() => {
    if (!deleted) return
    const timer = setTimeout(() => setDeleted(null), UNDO_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [deleted])

  useEffect(() => () => {
    if (recentTimer.current) clearTimeout(recentTimer.current)
  }, [])

  useEffect(() => {
    if (state.status !== "success" || !trip) return
    const hash = routerLocation.hash.replace(/^#/, "")
    if (!hash) return
    // Wait a frame so day sections exist in the DOM after async load.
    const id = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 80)
    return () => window.clearTimeout(id)
  }, [state.status, trip, routerLocation.hash])

  if (state.status === "loading") {
    return (
      <div className={`${pageClass} space-y-4`} role="status" aria-label="Loading trip">
        <div className="h-12 w-2/3 animate-pulse rounded-xl bg-stone-200/60 dark:bg-stone-900" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-stone-200/60 dark:bg-stone-900" />
        ))}
      </div>
    )
  }

  if (state.status === "error" || !trip) {
    return (
      <div className={pageClass}>
        <div className={alertErrorClass} role="alert">
          Couldn’t load this trip{state.status === "error" ? ` (${state.message})` : ""}.
        </div>
      </div>
    )
  }

  const mapDay = mapDayId ? trip.days.find((d) => d.id === mapDayId) : null
  const mapDayIndex = mapDay ? trip.days.findIndex((d) => d.id === mapDay.id) : -1

  return (
    <div className={pageClass} data-trip-accent={resolveAccent(trip.appearance?.accent)}>
      {/* Trip header: identity on the left, the two things you do with a whole
          trip on the right. */}
      <header className="flex flex-col gap-4 border-b border-stone-200/80 pb-6 sm:flex-row sm:items-start sm:justify-between dark:border-stone-800/80">
        <div className="min-w-0 flex-1">
          <p className={eyebrowClass}>Itinerary editor</p>
          <label className="sr-only" htmlFor="trip-editor-name">
            Trip name
          </label>
          <input
            id="trip-editor-name"
            ref={sizeAsDisplayType}
            value={trip.name}
            disabled={!editable}
            onChange={(e) => scheduleSave({ ...trip, name: e.target.value })}
            className={`mt-1 w-full bg-transparent font-display font-medium leading-tight tracking-tight text-stone-900 focus:outline-none dark:text-stone-100 ${focusRingClass}`}
            style={SERIF}
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-stone-600 dark:text-stone-400">
            <TripStatusSelect
              status={trip.status}
              editable={editable}
              onChange={(status) => scheduleSave({ ...trip, status })}
            />
            <span aria-hidden>·</span>
            <span className="break-words">
              {trip.destinations.join(" · ")} · {formatTripDate(trip.startDate, trip.timezone)} →{" "}
              {formatTripDate(trip.endDate, trip.timezone)} · {trip.timezone}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link to={`/trips/${trip.slug ?? trip.id}`} className={secondaryBtnClass}>
            <Eye className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            View
          </Link>
          {editable && trip.status === "draft" && (
            <button
              type="button"
              onClick={() => {
                scheduleSave({ ...trip, status: "active" })
                setNotice("Trip published — it's now active for everyone who can see it.")
              }}
              className={successBtnClass}
            >
              <Globe2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Publish
            </button>
          )}
          {editable && (
            <EnhanceButton
              label="Enhance trip"
              busyLabel="Reviewing trip…"
              busy={enhancingTarget === "trip"}
              disabled={enhancingTarget !== null}
              variant="solid"
              promptPlaceholder="Optional focus — e.g. “tighten the pacing and add more local food”"
              onRun={(prompt) => void runEnhance("trip", undefined, prompt)}
            />
          )}
        </div>
      </header>

      {notice && (
        <div className={`mt-4 flex items-start justify-between gap-3 ${alertNoticeClass}`} role="status">
          <span className="min-w-0 break-words">{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notice"
            className={`-my-2 shrink-0 ${iconBtnClass}`}
          >
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      )}

      {/* AI generation for an empty itinerary — also the retry path when
          generation failed during the create flow. */}
      {editable && trip.days.every((d) => d.items.length === 0) && (
        <GeneratePanel
          getToken={getToken}
          tripId={trip.id}
          initialPrompt={navState?.retryGenerate?.prompt}
          preferences={navState?.retryGenerate?.preferences}
          onGenerated={(next) => {
            setTrip(next)
            setSaveState("saved")
            setNotice(null)
          }}
        />
      )}

      {/* Trip-wide enhancement review stays at the top; day-scoped runs
          render inside their day card. */}
      {activeRun && activeRun.scope === "trip" && (
        <SuggestionsPanel
          run={activeRun}
          dayOptions={dayOptions}
          onApply={applyActiveRun}
          onDismiss={dismissRun}
        />
      )}

      {/* Days, with the day rail on desktop and the chip rail below `lg`. */}
      <div className="mt-6 lg:mt-8 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-8">
        <DayNavigation days={trip.days} timezone={trip.timezone} />
        <div className="space-y-8">
          {trip.days.map((day, idx) => (
            <DayCard
              key={day.id}
              day={day}
              index={idx}
              timezone={trip.timezone}
              editable={editable}
              dayOptions={dayOptions}
              enhancing={enhancingTarget === day.id}
              recentIds={recentIds}
              run={activeRun && activeRun.scope === "day" && activeRun.dayId === day.id ? activeRun : null}
              onApplyRun={applyActiveRun}
              onDismissRun={dismissRun}
              onChange={setDays}
              onOpenMap={openMap}
              onEnhance={enhanceDay}
              onDeleteItem={deleteItem}
            />
          ))}
        </div>
      </div>

      {/* Trip settings: once-per-trip configuration, out of the editing path. */}
      {editable && (
        <section aria-label="Trip settings" className="mt-12 border-t border-stone-200/80 pt-8 dark:border-stone-800/80">
          <p className={eyebrowClass}>Trip settings</p>
          <AppearancePanel
            trip={trip}
            onChange={(appearance) => scheduleSave({ ...trip, appearance })}
            onSlugChange={(slug) => scheduleSave({ ...trip, slug })}
          />
        </section>
      )}

      <EditorDock>
        <UndoToast undo={deleted} onUndo={undoDelete} />
        <FloatingSaveIndicator saveState={saveState} />
      </EditorDock>

      {/* Map Mode */}
      {mapDay && (
        <Suspense
          fallback={
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 text-sm text-stone-300"
              role="status"
            >
              Loading map…
            </div>
          }
        >
          <MapModeOverlay
            daySlug={mapDay.id}
            dayTitle={mapDay.title ?? `Day ${mapDayIndex + 1}`}
            placesUrl={`/api/trips/${encodeURIComponent(trip.id)}/days/${encodeURIComponent(mapDay.id)}/places`}
            onClose={() => setMapDayId(null)}
          />
        </Suspense>
      )}
    </div>
  )
}

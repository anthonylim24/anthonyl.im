import { lazy, Suspense, useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useTransition } from "react"
import { Link, useLocation, useParams } from "react-router-dom"
import { useReducedMotion } from "motion/react"
import { Eye, Globe2 } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { applySuggestions, enhanceTrip, getTrip, updateTrip } from "./tripsApi"
import { insertItemAt, removeItem } from "./tripEdits"
import {
  SERIF,
  alertErrorClass,
  eyebrowClass,
  focusRingClass,
  inlineLinkClass,
  mutedInkClass,
  pageClass,
  secondaryBtnClass,
  successBtnClass,
  wrapAnywhereClass,
} from "./ui"
import { formatTripDate, resolveAccent } from "./theme"
import { AppearancePanel } from "./editor/AppearancePanel"
import { DayCard } from "./editor/DayCard"
import { DayNavigation } from "./editor/DayNavigation"
import { EnhanceButton } from "./editor/EnhanceButton"
import { ExtractedPlacesLibrary } from "./ExtractedPlacesLibrary"
import {
  EditorDock,
  EditorNotice,
  FloatingSaveIndicator,
  UNDO_TOAST_ID,
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

const PAGE = pageClass()

const UNDO_WINDOW_MS = 6000

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

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
  const reduce = useReducedMotion()
  const getToken = useGetToken()
  const readToken = useEffectEvent(getToken)
  const [, startTransition] = useTransition()
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
  const saveGenRef = useRef(0)
  const persistAbortRef = useRef<AbortController | null>(null)
  const persistPromiseRef = useRef<Promise<void> | null>(null)
  const scrolledHashRef = useRef<string | null>(null)
  const restoreScrollRef = useRef<number | null>(null)
  const editable = access === "edit" || access === "owner"
  // Stable across keystrokes (the URL param may be a slug), so every handler
  // below can be a stable identity and memoized day cards stay memoized.
  const tripDocId = trip?.id

  // Latest pending document for flush-on-leave.
  const pendingPatchRef = useRef<Trip | null>(null)
  const editedRef = useRef(false)
  const tripRef = useRef<Trip | null>(null)
  tripRef.current = trip

  useEffect(() => {
    if (!tripId) return
    let cancelled = false
    void (async () => {
      try {
        const { trip: loaded, access: a } = await getTrip(readToken, tripId)
        if (cancelled) return
        // A slower first fetch (Strict Mode remount, CI) must not clobber
        // keystrokes on THIS trip. A different tripId must still load.
        const pending = pendingPatchRef.current ?? (editedRef.current ? tripRef.current : null)
        if (pending && pending.id === loaded.id) {
          setAccess(a)
          setState({ status: "success" })
          return
        }
        pendingPatchRef.current = null
        editedRef.current = false
        startTransition(() => {
          setTrip(loaded)
          setAccess(a)
          setState({ status: "success" })
        })
      } catch (err) {
        if (cancelled) return
        setState({ status: "error", message: errorText(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tripId])

  const cancelPendingSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    pendingPatchRef.current = null
    editedRef.current = false
    saveGenRef.current += 1
    persistAbortRef.current?.abort()
    persistAbortRef.current = null
  }, [])

  const persistTrip = useCallback(
    async (next: Trip) => {
      const gen = saveGenRef.current
      persistAbortRef.current?.abort()
      const ac = new AbortController()
      persistAbortRef.current = ac
      setSaveState("saving")
      const work = (async () => {
        try {
          await updateTrip(
            readToken,
            next.id,
            {
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
            },
            { signal: ac.signal },
          )
          if (saveGenRef.current !== gen) return
          // Ignore stale responses if a newer edit is already queued.
          if (pendingPatchRef.current && pendingPatchRef.current !== next) return
          pendingPatchRef.current = null
          setSaveState("saved")
        } catch (err: unknown) {
          if (ac.signal.aborted || (err instanceof Error && err.name === "AbortError")) return
          if (saveGenRef.current !== gen) return
          setSaveState("error")
          const message = errorText(err)
          // A rejected permalink is a fixable input problem, not a transient
          // failure, so it needs to say so instead of hiding behind the pill.
          if (/permalink|slug|hyphen/i.test(message)) {
            setNotice(`Couldn’t save the permalink. Edit it under Trip settings, then it will save. (${message})`)
          }
          throw err instanceof Error ? err : new Error(message)
        }
      })()
      persistPromiseRef.current = work.then(
        () => undefined,
        () => undefined,
      )
      await work
    },
    [],
  )

  const flushPendingSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    // Always persist the live document. Dirty flags can be false after a
    // remount or a completed debounce while the input still shows the edit;
    // enhance/apply must not run against a stale server copy.
    const latest = tripRef.current ?? pendingPatchRef.current
    if (latest) {
      pendingPatchRef.current = latest
      try {
        await persistTrip(latest)
      } catch (err) {
        pendingPatchRef.current = latest
        editedRef.current = true
        throw new Error(
          `Couldn’t save your latest edits. Nothing in your itinerary changed. (${errorText(err)})`,
        )
      }
      return
    }
    if (persistPromiseRef.current) await persistPromiseRef.current
  }, [persistTrip])

  const markEdited = useCallback(() => {
    editedRef.current = true
    setSaveState("dirty")
  }, [])

  const scheduleSave = useCallback(
    (next: Trip) => {
      markEdited()
      // Write the live document before React re-renders so enhance/apply
      // flush cannot persist the pre-keystroke snapshot.
      tripRef.current = next
      pendingPatchRef.current = next
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
      void persistTrip(trip).catch(() => {
        /* saveState already error */
      })
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
        void updateTrip(readToken, pending.id, {
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
  }, [])

  const setDays = useCallback(
    (fn: (days: TripDay[]) => TripDay[]) => {
      const current = tripRef.current
      if (!current) return
      const next = { ...current, days: fn(current.days) }
      markEdited()
      tripRef.current = next
      pendingPatchRef.current = next
      setTrip(next)
    },
    [markEdited],
  )

  const dayOptions = useDayOptions(trip?.days ?? [], trip?.timezone ?? "UTC")

  const flashTouched = useCallback((ids: Set<string>) => {
    setRecentIds(ids)
    if (recentTimer.current) clearTimeout(recentTimer.current)
    recentTimer.current = setTimeout(() => setRecentIds(new Set()), 3200)
  }, [])

  const holdScroll = useCallback(() => {
    restoreScrollRef.current = window.scrollY
  }, [])

  useLayoutEffect(() => {
    if (restoreScrollRef.current == null) return
    window.scrollTo({ top: restoreScrollRef.current, left: 0, behavior: "instant" })
    restoreScrollRef.current = null
  })

  const runEnhance = useCallback(
    async (scope: "day" | "trip", dayId?: string, prompt?: string) => {
      if (!tripDocId) return
      setEnhancingTarget(scope === "day" ? (dayId ?? null) : "trip")
      setActiveRun(null)
      try {
        // Flush local edits first so enhance sees them and a stale PATCH
        // cannot overwrite the auto-applied adds.
        await flushPendingSave()
        const { run, trip: refreshed, applied, error } = await enhanceTrip(
          readToken,
          tripDocId,
          scope,
          dayId,
          prompt,
        )
        cancelPendingSave()
        // Keep the day the traveler was looking at — a trip refresh plus
        // the review panel must not yank the viewport back to the header.
        holdScroll()
        // Server auto-applies valid add suggestions and may sync day.weather.
        if (refreshed) setTrip(refreshed)
        setSaveState("saved")
        setActiveRun(run)
        const addedIds = new Set<string>()
        for (const id of applied ?? run.appliedSuggestionIds) {
          const s = run.suggestions.find((x) => x.id === id)
          if (s?.kind === "add" && s.proposedItem?.id) addedIds.add(s.proposedItem.id)
        }
        if (addedIds.size > 0) flashTouched(addedIds)
        if (run.status === "error" || error) {
          setNotice(
            run.outcomeReason ??
              `The AI review didn’t finish. Nothing in your itinerary changed, so you can run it again. (${run.error ?? error ?? "unknown error"})`,
          )
        } else if (run.outcomeReason) {
          setNotice(run.outcomeReason)
        }
      } catch (err) {
        const message = errorText(err)
        setNotice(
          message.startsWith("Couldn’t save your latest edits")
            ? message
            : `The AI review didn’t finish. Nothing in your itinerary changed, so you can run it again. (${message})`,
        )
      } finally {
        setEnhancingTarget(null)
      }
    },
    [tripDocId, cancelPendingSave, flashTouched, flushPendingSave, holdScroll],
  )

  const applyRun = useCallback(
    async (suggestionIds: string[]) => {
      if (!tripDocId || !activeRun) return
      setEnhancingTarget("apply")
      try {
        await flushPendingSave()
        const { trip: next, applied, skipped } = await applySuggestions(
          readToken,
          tripDocId,
          activeRun.id,
          suggestionIds,
        )
        cancelPendingSave()
        const touched = new Set<string>()
        for (const id of applied) {
          const s = activeRun.suggestions.find((x) => x.id === id)
          const target = s?.proposedItem?.id ?? s?.itemId
          if (target && (s?.kind === "add" || s?.kind === "edit")) touched.add(target)
        }
        setTrip(next)
        setActiveRun(null)
        setSaveState("saved")
        flashTouched(touched)
        const skipNote = skipped.length > 0 ? ` ${skipped.length} could not be applied.` : ""
        setNotice(`Applied ${applied.length} suggestion${applied.length === 1 ? "" : "s"}.${skipNote}`)
      } catch (err) {
        const message = errorText(err)
        setNotice(
          message.startsWith("Couldn’t save your latest edits")
            ? message
            : `Couldn’t apply those suggestions. They’re still listed below, so you can try again. (${message})`,
        )
      } finally {
        setEnhancingTarget(null)
      }
    },
    [tripDocId, activeRun, cancelPendingSave, flashTouched, flushPendingSave],
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

  /** The toast holds focus while the undo window is open, so hand focus back
   *  to the day the item came from rather than dropping it on the document. */
  const releaseUndoFocus = useCallback((dayId: string) => {
    const toast = document.getElementById(UNDO_TOAST_ID)
    if (!toast?.contains(document.activeElement)) return
    document
      .getElementById(dayId)
      ?.querySelector<HTMLElement>("input, textarea, button, a[href]")
      ?.focus()
  }, [])

  const undoDelete = useCallback(() => {
    if (!deleted) return
    setDays((days) => insertItemAt(days, deleted.dayId, deleted.item, deleted.index))
    setDeleted(null)
    releaseUndoFocus(deleted.dayId)
  }, [deleted, setDays, releaseUndoFocus])

  useEffect(() => {
    if (!deleted) return
    const timer = setTimeout(() => {
      setDeleted(null)
      releaseUndoFocus(deleted.dayId)
    }, UNDO_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [deleted, releaseUndoFocus])

  useEffect(() => () => {
    if (recentTimer.current) clearTimeout(recentTimer.current)
  }, [])

  useEffect(() => {
    if (state.status !== "success" || !trip) return
    const hash = routerLocation.hash.replace(/^#/, "")
    if (!hash) {
      scrolledHashRef.current = null
      return
    }
    // Only on hash change / first arrival — a later enhance refresh of
    // `trip` must not steal the viewport back to the anchored day.
    const scrollKey = `${trip.id}:${hash}`
    if (scrolledHashRef.current === scrollKey) return
    const id = window.setTimeout(() => {
      const el = document.getElementById(hash)
      if (!el) return
      scrolledHashRef.current = scrollKey
      el.scrollIntoView(reduce ? { block: "start" } : { behavior: "smooth", block: "start" })
    }, 80)
    return () => window.clearTimeout(id)
  }, [state.status, trip?.id, routerLocation.hash, reduce])

  if (state.status === "loading") {
    return (
      <div className={`${PAGE} space-y-4`} role="status" aria-label="Loading trip">
        <div className="h-12 w-2/3 animate-pulse rounded-xl bg-stone-200/60 dark:bg-stone-900" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-stone-200/60 dark:bg-stone-900" />
        ))}
      </div>
    )
  }

  if (state.status === "error" || !trip) {
    return (
      <div className={PAGE}>
        <div className={alertErrorClass} role="alert">
          <p className={`min-w-0 ${wrapAnywhereClass}`}>
            Couldn’t open this trip. Check your connection and reload the page.
            {state.status === "error" ? ` (${state.message})` : ""}
          </p>
          <Link to="/trips" className={`mt-1 font-semibold ${inlineLinkClass}`}>
            Back to all trips
          </Link>
        </div>
      </div>
    )
  }

  const mapDay = mapDayId ? trip.days.find((d) => d.id === mapDayId) : null
  const mapDayIndex = mapDay ? trip.days.findIndex((d) => d.id === mapDay.id) : -1
  const editorLocked = enhancingTarget !== null

  return (
    <div className={PAGE} data-trip-accent={resolveAccent(trip.appearance?.accent)}>
      {/* Trip header: identity on the left, the two things you do with a whole
          trip on the right. */}
      <header className="flex flex-col gap-4 border-b border-stone-200/80 pb-6 sm:flex-row sm:items-start sm:justify-between dark:border-stone-800/80">
        <div className="min-w-0 flex-1">
          <p className={eyebrowClass}>Itinerary editor</p>
          {editable ? (
            <>
              <label className="sr-only" htmlFor="trip-editor-name">
                Trip name
              </label>
              <input
                id="trip-editor-name"
                disabled={editorLocked}
                // `trip-display-input` beats the global 16px input floor: this
                // is display type, so the iOS zoom guard doesn't apply.
                className={`trip-display-input mt-1 min-h-11 w-full bg-transparent font-display font-medium leading-tight tracking-tight text-stone-900 focus:outline-none dark:text-stone-100 ${focusRingClass}`}
                value={trip.name}
                onChange={(e) => scheduleSave({ ...trip, name: e.target.value })}
                style={SERIF}
              />
            </>
          ) : (
            <h1
              className={`mt-1 font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-tight tracking-tight text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}
              style={SERIF}
            >
              {trip.name}
            </h1>
          )}
          <div className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm ${mutedInkClass}`}>
            <TripStatusSelect
              status={trip.status}
              editable={editable}
              disabled={editorLocked}
              onChange={(status) => scheduleSave({ ...trip, status })}
            />
            <span aria-hidden>·</span>
            <span className={wrapAnywhereClass}>
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
              disabled={editorLocked}
              onClick={() => {
                scheduleSave({ ...trip, status: "active" })
                setNotice("Trip published. It’s now active for everyone who can see it.")
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
              promptPlaceholder="Optional focus, e.g. “tighten the pacing and add more local food”"
              onRun={(prompt) => void runEnhance("trip", undefined, prompt)}
            />
          )}
        </div>
      </header>

      {/* AI generation for an empty itinerary — also the retry path when
          generation failed during the create flow. */}
      {editable && trip.days.every((d) => d.items.length === 0) && (
        <GeneratePanel
          getToken={getToken}
          tripId={trip.id}
          locked={editorLocked}
          initialPrompt={navState?.retryGenerate?.prompt}
          preferences={navState?.retryGenerate?.preferences}
          onGenerated={(next) => {
            cancelPendingSave()
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

      {editable && (
        <ExtractedPlacesLibrary
          trip={trip}
          locked={editorLocked}
          defaultDayId={routerLocation.hash.replace(/^#/, "") || undefined}
          onDaysChange={setDays}
        />
      )}

      {/* Days: flex so a one-day trip (no day rail) still takes the full
          width. A two-column grid parked the itinerary in the 11rem nav
          track whenever DayNavigation returned null. */}
      <div className="mt-6 lg:mt-8 lg:flex lg:items-start lg:gap-8">
        <DayNavigation days={trip.days} timezone={trip.timezone} />
        <div data-testid="trip-itinerary" className="min-w-0 flex-1 space-y-8">
          {trip.days.map((day, idx) => (
            <DayCard
              key={day.id}
              trip={trip}
              day={day}
              index={idx}
              timezone={trip.timezone}
              editable={editable}
              locked={editorLocked}
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
            locked={editorLocked}
            onChange={(appearance) => scheduleSave({ ...trip, appearance })}
            onSlugChange={(slug) => scheduleSave({ ...trip, slug })}
          />
        </section>
      )}

      <EditorDock>
        <EditorNotice notice={notice} onDismiss={() => setNotice(null)} />
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

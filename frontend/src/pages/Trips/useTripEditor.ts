import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react"
import { useLocation, useParams } from "react-router-dom"
import { useReducedMotion } from "motion/react"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useGetToken } from "@/lib/safeAuth"
import { applySuggestions, enhanceTrip, getTrip, updateTrip } from "./tripsApi"
import { insertItemAt, removeItem } from "./tripEdits"
import { emitTripChanged, preferFresherTrip, useTripChanged } from "./tripsEvents"
import { useDayOptions } from "./editor/hooks"
import { UNDO_TOAST_ID, type PendingUndo, type SaveState } from "./editor/FloatingSaveIndicator"
import type { EnhancementRun, GeneratePreferences, ItineraryItem, Trip, TripAccess, TripDay } from "./types"

const UNDO_WINDOW_MS = 6000

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success" }

export interface DeletedItem extends PendingUndo {
  dayId: string
  item: ItineraryItem
  index: number
}

export function useTripEditor() {
  const { tripId } = useParams<{ tripId: string }>()
  const routerLocation = useLocation()
  const reduce = useReducedMotion()
  const getToken = useGetToken()
  const readToken = useLatestCallback(getToken)
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
  const [enhancingTarget, setEnhancingTarget] = useState<string | null>(null)
  const [activeRun, setActiveRun] = useState<EnhancementRun | null>(null)
  const [deleted, setDeleted] = useState<DeletedItem | null>(null)
  const [recentIds, setRecentIds] = useState<Set<string>>(() => new Set())
  const recentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveGenRef = useRef(0)
  const persistAbortRef = useRef<AbortController | null>(null)
  const persistPromiseRef = useRef<Promise<void> | null>(null)
  const scrolledHashRef = useRef<string | null>(null)
  const restoreScrollRef = useRef<number | null>(null)
  const editable = access === "edit" || access === "owner"
  const tripDocId = trip?.id

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

  useTripChanged(
    tripDocId,
    useCallback((incoming) => {
      if (editedRef.current || pendingPatchRef.current) return
      setTrip((current) => {
        if (!current) return incoming
        return preferFresherTrip(current, incoming)
      })
    }, []),
  )

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

  const persistTrip = useCallback(async (next: Trip) => {
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
        if (pendingPatchRef.current && pendingPatchRef.current !== next) return
        pendingPatchRef.current = null
        setSaveState("saved")
        emitTripChanged(next)
      } catch (err: unknown) {
        if (ac.signal.aborted || (err instanceof Error && err.name === "AbortError")) return
        if (saveGenRef.current !== gen) return
        setSaveState("error")
        const message = errorText(err)
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
  }, [])

  const flushPendingSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
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
      tripRef.current = next
      pendingPatchRef.current = next
      setTrip(next)
    },
    [markEdited],
  )

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
        await flushPendingSave()
        const { run, trip: refreshed, applied, error } = await enhanceTrip(
          readToken,
          tripDocId,
          scope,
          dayId,
          prompt,
        )
        cancelPendingSave()
        holdScroll()
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

  const deleteItem = useCallback(
    (dayId: string, item: ItineraryItem, index: number) => {
      setDays((days) => removeItem(days, dayId, item.id))
      setDeleted({ dayId, item, index, title: item.title, key: Date.now() })
    },
    [setDays],
  )

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

  useEffect(
    () => () => {
      if (recentTimer.current) clearTimeout(recentTimer.current)
    },
    [],
  )

  useEffect(() => {
    if (state.status !== "success" || !trip) return
    const hash = routerLocation.hash.replace(/^#/, "")
    if (!hash) {
      scrolledHashRef.current = null
      return
    }
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

  const publish = useCallback(() => {
    const current = tripRef.current
    if (!current) return
    scheduleSave({ ...current, status: "active" })
    setNotice("Trip published. It’s now active for everyone who can see it.")
  }, [scheduleSave])

  return {
    tripId,
    routerLocation,
    reduce,
    readToken,
    state,
    trip,
    access,
    editable,
    saveState,
    notice,
    setNotice,
    mapDayId,
    setMapDayId,
    enhancingTarget,
    activeRun,
    deleted,
    recentIds,
    editorLocked: enhancingTarget !== null,
    dayOptions,
    navState,
    scheduleSave,
    setDays,
    cancelPendingSave,
    setTrip,
    setSaveState,
    runEnhance,
    applyActiveRun,
    dismissRun,
    openMap,
    enhanceDay,
    deleteItem,
    undoDelete,
    publish,
  }
}

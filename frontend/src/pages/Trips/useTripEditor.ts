import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useTransition } from "react"
import { useLocation, useParams } from "react-router-dom"
import { useReducedMotion } from "motion/react"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useGetToken } from "@/lib/safeAuth"
import { applySuggestions, enhanceTrip, generateItinerary, getTrip, updateTrip } from "./tripsApi"
import { isTripConflict } from "./tripConflict"
import { saveFailure } from "./offline/network"
import { removeItem } from "./tripEdits"
import { emitTripChanged, useTripChanged } from "./tripsEvents"
import { formatTripDate, plural } from "./meta"
import {
  canEdit,
  canWrite,
  editorReducer,
  initialEditor,
  savePatch,
  type AiRun,
  type Editor,
  type EditorEvent,
  type Sync,
  type UndoMark,
} from "./editorMachine"
import type { EnhancementRun, GeneratePreferences, ItineraryItem, Trip, TripCollaborator, TripDay } from "./types"

// The thin shell around `editorMachine`: it loads, saves and runs AI calls,
// and turns their results into events. Rules about what may happen when
// belong in the machine, not here.

const SAVE_DEBOUNCE_MS = 900
/** Starts every notice about a save the server refused, so a later good save can take it down. */
const REFUSED_PREFIX = "Couldn’t save your latest edits."

export interface DayOption {
  id: string
  label: string
}

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

const isAbort = (err: unknown) => err instanceof Error && err.name === "AbortError"

/** What an AI call hands back: the machine's `AI_DONE` payload plus work to do with it. */
interface AiOutcome {
  trip?: Trip
  run: EnhancementRun | null
  undo?: UndoMark
  /** Runs in the same update as the new document (flash, notice, scroll hold). */
  onLand?: () => void
}

export function useTripEditor() {
  const { tripId } = useParams<{ tripId: string }>()
  const routerLocation = useLocation()
  const reduce = useReducedMotion()
  const getToken = useGetToken()
  const readToken = useLatestCallback(getToken)
  const [, startTransition] = useTransition()
  const [state, dispatch] = useReducer(editorReducer, initialEditor)
  const [loadKey, setLoadKey] = useState(0)
  const navState = routerLocation.state as {
    notice?: string
    retryGenerate?: { prompt?: string; preferences?: GeneratePreferences }
  } | null
  const [notice, setNotice] = useState<string | null>(navState?.notice ?? null)
  const [recentIds, setRecentIds] = useState<Set<string>>(() => new Set())
  const recentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoreScrollRef = useRef<number | null>(null)
  /** The committed state, for callbacks and cleanups that outlive a render. */
  const stateRef = useRef<Editor>(state)
  useLayoutEffect(() => {
    stateRef.current = state
  }, [state])
  /** The PATCH on its way (one per `saving` state), resolving to the saved trip (null on failure). */
  const inflightRef = useRef<{ for: Sync; work: Promise<Trip | null> } | null>(null)
  const aiAbortRef = useRef<AbortController | null>(null)
  /** Set once the trip is deleted: nothing left to save. */
  const discardedRef = useRef(false)
  /** The document an AI run last put in place, so its changes aren't read as the traveller's. */
  const aiTripRef = useRef<Trip | null>(null)
  const settleWaiters = useRef(new Set<(s: Editor) => boolean>())

  const ready = state.s === "ready" ? state : null
  const trip = ready?.doc ?? null
  const access = ready?.access ?? "view"
  const editable = canWrite(access)
  const tripDocId = trip?.id

  useEffect(() => {
    if (!tripId) return
    let cancelled = false
    getTrip(readToken, tripId).then(
      ({ trip: loaded, access: a }) => {
        if (!cancelled) startTransition(() => dispatch({ type: "LOADED", trip: loaded, access: a }))
      },
      (err: unknown) => {
        if (!cancelled) dispatch({ type: "LOAD_FAILED", message: errorText(err) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [tripId, loadKey, readToken])

  const reload = useCallback(() => {
    dispatch({ type: "RELOAD" })
    setLoadKey((k) => k + 1)
  }, [])

  // The concierge (and any other writer on this page) announces what it saved.
  useTripChanged(
    tripDocId,
    useCallback((incoming: Trip) => dispatch({ type: "EXTERNAL_CHANGE", trip: incoming }), []),
  )

  // Back to the tab after a while: a collaborator may have changed the trip.
  useEffect(() => {
    if (!tripDocId) return
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      const now = stateRef.current
      if (now.s !== "ready" || now.sync.k !== "clean" || !(now.ai.k === "idle" || now.ai.k === "review")) return
      getTrip(readToken, tripDocId).then(
        ({ trip: fresh, access: a }) => dispatch({ type: "LOADED", trip: fresh, access: a }),
        () => undefined, // a missed refresh changes nothing; the next save still checks
      )
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [tripDocId, readToken])

  // Debounce: every edit replaces `doc`, which restarts the wait.
  const dirtyDoc = ready?.sync.k === "dirty" ? ready.doc : null
  useEffect(() => {
    if (!dirtyDoc) return
    const timer = setTimeout(() => dispatch({ type: "DEBOUNCE_ELAPSED" }), SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [dirtyDoc])

  // Send each save the machine asks for, once. Never aborted: see editorMachine.
  const saving = ready?.sync.k === "saving" ? ready.sync : null
  useEffect(() => {
    if (!saving || inflightRef.current?.for === saving) return
    const { sent, against, fitted } = saving
    const work = updateTrip(readToken, sent.id, savePatch(sent, against)).then(
      (saved) => {
        dispatch({ type: "SAVE_OK", sent, saved })
        emitTripChanged(saved)
        // Say what had to be cut to fit; a problem a refusal named is fixed now.
        setNotice((current) => fitted ?? (current?.startsWith(REFUSED_PREFIX) ? null : current))
        return saved
      },
      (err: unknown) => {
        if (isTripConflict(err)) {
          dispatch({ type: "SAVE_CONFLICT", sent, theirs: err.trip })
          return null
        }
        const message = errorText(err)
        const failure = saveFailure(err)
        dispatch({ type: "SAVE_FAILED", sent, message, failure })
        // Phones show only "Not saved": the reason, and what to do, go in the dock.
        if (failure === "refused") setNotice(`${REFUSED_PREFIX} ${message} Change it and your edits will save.`)
        return null
      },
    )
    inflightRef.current = { for: saving, work }
  }, [saving, readToken])

  // Resolve `flush()` callers once the save they waited for has settled.
  useEffect(() => {
    for (const settle of [...settleWaiters.current]) if (settle(state)) settleWaiters.current.delete(settle)
  }, [state])

  /** Save now; resolves once nothing is unsaved, rejects if the save fails or needs a decision. */
  const flush = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        const settle = (now: Editor) => {
          if (now.s !== "ready" || now.sync.k === "clean") resolve()
          else if (now.sync.k === "saveError") reject(new Error(`Couldn’t save your latest edits. Nothing in your itinerary changed. (${now.sync.message})`))
          else if (now.sync.k === "conflict") reject(new Error("Couldn’t save your latest edits: someone else changed the same thing. Choose whose version to keep first."))
          else return false
          return true
        }
        const now = stateRef.current
        if (now.s !== "ready" || now.sync.k === "clean" || now.sync.k === "conflict") {
          settle(now)
          return
        }
        settleWaiters.current.add(settle)
        dispatch({ type: "FLUSH" })
      }),
    [],
  )

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const now = stateRef.current
      if (discardedRef.current || now.s !== "ready" || now.sync.k === "clean") return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  // Leaving the trip: stop any AI wait, and send what isn't saved yet (after
  // the save in flight, so the two can't land out of order).
  useEffect(
    () => () => {
      aiAbortRef.current?.abort()
      const now = stateRef.current
      if (discardedRef.current || now.s !== "ready" || !canWrite(now.access)) return
      const { sync, doc, base } = now
      const unsaved = sync.k === "dirty" || sync.k === "saveError" || (sync.k === "saving" && sync.queued)
      if (!unsaved) return
      const before = sync.k === "saving" ? inflightRef.current?.work : undefined
      void (async () => {
        const saved = before ? await before : null
        const written = await updateTrip(readToken, doc.id, savePatch(doc, (saved ?? base).updatedAt))
        emitTripChanged(written)
      })().catch(() => undefined) // best effort: the page is gone, there is no one to tell
    },
    [readToken],
  )

  const edit = useCallback((fn: (doc: Trip) => Trip, undo?: UndoMark) => dispatch({ type: "EDIT", fn, undo }), [])
  const setDays = useCallback(
    (fn: (days: TripDay[]) => TripDay[], undo?: UndoMark) => edit((doc) => ({ ...doc, days: fn(doc.days) }), undo),
    [edit],
  )

  const dayKey = (trip?.days ?? []).map((d) => `${d.id}|${d.date}`).join(",")
  const timezone = trip?.timezone ?? "UTC"
  const dayOptions = useMemo<DayOption[]>(
    () =>
      dayKey
        ? dayKey.split(",").map((record, i) => {
            const [id, date] = record.split("|")
            return { id: id!, label: `Day ${i + 1} · ${formatTripDate(date!, timezone)}` }
          })
        : [],
    [dayKey, timezone],
  )

  const flashTouched = useCallback((ids: Set<string>) => {
    setRecentIds(ids)
    if (recentTimer.current) clearTimeout(recentTimer.current)
    recentTimer.current = setTimeout(() => setRecentIds(new Set()), 3200)
  }, [])

  useEffect(
    () => () => {
      if (recentTimer.current) clearTimeout(recentTimer.current)
    },
    [],
  )

  const holdScroll = useCallback(() => {
    restoreScrollRef.current = window.scrollY
  }, [])

  useLayoutEffect(() => {
    if (restoreScrollRef.current == null) return
    window.scrollTo({ top: restoreScrollRef.current, left: 0, behavior: "instant" })
    restoreScrollRef.current = null
  })

  /**
   * One AI call: lock editing (`start`), save what's unsaved, run `work`,
   * then put its document in place. Stopping (or leaving) aborts the wait
   * and drops the answer.
   */
  const runAi = useCallback(
    async (start: EditorEvent, work: (signal: AbortController["signal"]) => Promise<AiOutcome>, fail: (err: unknown) => void) => {
      const ac = new AbortController()
      aiAbortRef.current?.abort()
      aiAbortRef.current = ac
      dispatch(start)
      try {
        await flush()
        if (ac.signal.aborted) return
        const outcome = await work(ac.signal)
        if (ac.signal.aborted) return
        if (outcome.trip) aiTripRef.current = outcome.trip
        outcome.onLand?.()
        dispatch({ type: "AI_DONE", trip: outcome.trip, run: outcome.run, undo: outcome.undo })
      } catch (err) {
        if (ac.signal.aborted || isAbort(err)) return
        dispatch({ type: "AI_FAILED" })
        fail(err)
      } finally {
        if (aiAbortRef.current === ac) aiAbortRef.current = null
      }
    },
    [flush],
  )

  const startAi = useCallback(
    (run: AiRun, work: (signal: AbortSignal) => Promise<AiOutcome>, fail: (err: unknown) => void) => {
      if (!canEdit(stateRef.current)) return Promise.resolve()
      return runAi({ type: "AI_START", run }, work, fail)
    },
    [runAi],
  )

  const reviewFailed = useCallback((err: unknown) => {
    const message = errorText(err)
    setNotice(
      message.startsWith("Couldn’t save your latest edits")
        ? message
        : `The AI review didn’t finish. Nothing in your itinerary changed, so you can run it again. (${message})`,
    )
  }, [])

  const runEnhance = useCallback(
    (scope: "day" | "trip", dayId?: string, prompt?: string) => {
      if (!tripDocId) return Promise.resolve()
      setNotice(null)
      return startAi(
        scope === "day" ? { day: dayId ?? "" } : "trip",
        async (signal) => {
          const { run, trip: refreshed, applied, error } = await enhanceTrip(readToken, tripDocId, scope, dayId, prompt, signal)
          return {
            trip: refreshed,
            run,
            onLand: () => {
              holdScroll()
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
            },
          }
        },
        reviewFailed,
      )
    },
    [tripDocId, startAi, readToken, holdScroll, flashTouched, reviewFailed],
  )

  /** Draft the itinerary with AI. Resolves to the ids of every stop it placed (empty if it didn't land). */
  const draft = useCallback(
    async (input: { prompt?: string; preferences?: GeneratePreferences }, replaceExisting: boolean): Promise<string[]> => {
      if (!tripDocId) return []
      setNotice(null)
      let added: string[] = []
      await startAi(
        "draft",
        async (signal) => {
          const { trip: next, summary, incompleteDays } = await generateItinerary(readToken, tripDocId, { ...input, replaceExisting }, signal)
          added = next.days.flatMap((d) => d.items.map((i) => i.id))
          return {
            trip: next,
            run: null,
            undo: replaceExisting ? { label: "Replaced your itinerary with a draft", toast: true } : undefined,
            onLand: () => {
              flashTouched(new Set(added))
              const thin =
                incompleteDays.length > 0
                  ? ` ${incompleteDays.length === 1 ? `Day ${incompleteDays[0]} needs` : `Days ${incompleteDays.join(", ")} need`} another go: open ${incompleteDays.length === 1 ? "it" : "each"} and use “Ideas for this day”.`
                  : ""
              setNotice(
                added.length > 0
                  ? incompleteDays.length > 0
                    ? `Drafted ${plural(added.length, "stop")}, but not every day.${thin}`
                    : (summary ?? `Drafted ${plural(added.length, "stop")} across ${plural(next.days.length, "day")}. Edit anything.`)
                  : "The draft came back empty. Try again with a little more detail.",
              )
            },
          }
        },
        (err) => {
          added = []
          const message = errorText(err)
          setNotice(
            message.startsWith("Couldn’t save your latest edits")
              ? message
              : /GEMINI|GROQ|ai_not_configured|503/i.test(message)
                ? "AI isn’t switched on for this server yet, so drafts are unavailable. You can still add stops yourself."
                : `The draft didn’t finish, so nothing changed. Try again in a moment. (${message})`,
          )
        },
      )
      return added
    },
    [tripDocId, startAi, readToken, flashTouched],
  )

  const activeRun = ready && (ready.ai.k === "review" || ready.ai.k === "applying") ? ready.ai.run : null

  const applyActiveRun = useCallback(
    (suggestionIds: string[]) => {
      const now = stateRef.current
      if (!tripDocId || now.s !== "ready" || now.ai.k !== "review") return
      const run = now.ai.run
      void runAi(
        { type: "APPLY" },
        async () => {
          const { trip: next, applied, skipped } = await applySuggestions(readToken, tripDocId, run.id, suggestionIds)
          return {
            trip: next,
            run: null,
            onLand: () => {
              const touched = new Set<string>()
              for (const id of applied) {
                const s = run.suggestions.find((x) => x.id === id)
                const target = s?.proposedItem?.id ?? s?.itemId
                if (target && (s?.kind === "add" || s?.kind === "edit")) touched.add(target)
              }
              flashTouched(touched)
              const skipNote = skipped.length > 0 ? ` ${skipped.length} could not be applied.` : ""
              setNotice(`Applied ${applied.length} suggestion${applied.length === 1 ? "" : "s"}.${skipNote}`)
            },
          }
        },
        (err) => {
          const message = errorText(err)
          setNotice(
            message.startsWith("Couldn’t save your latest edits")
              ? message
              : `Couldn’t apply those suggestions. They’re still listed below, so you can try again. (${message})`,
          )
        },
      )
    },
    [tripDocId, runAi, readToken, flashTouched],
  )

  /** Stop waiting for the AI and unlock editing. The server may still finish; its result arrives like any other change. */
  const stopAi = useCallback(() => {
    aiAbortRef.current?.abort()
    aiAbortRef.current = null
    dispatch({ type: "AI_FAILED" })
  }, [])

  const dismissRun = useCallback(() => dispatch({ type: "DISMISS_RUN" }), [])
  const enhanceDay = useCallback((dayId: string, prompt?: string) => void runEnhance("day", dayId, prompt), [runEnhance])

  const deleteItem = useCallback(
    (dayId: string, item: ItineraryItem) =>
      setDays((days) => removeItem(days, dayId, item.id), { label: `Removed “${item.title || "Untitled"}”`, toast: true }),
    [setDays],
  )

  const undo = useCallback(() => dispatch({ type: "UNDO" }), [])
  const redo = useCallback(() => dispatch({ type: "REDO" }), [])
  const retrySave = useCallback(() => dispatch({ type: "RETRY" }), [])
  const resolveConflict = useCallback((keep: "mine" | "theirs") => dispatch({ type: "RESOLVE", keep }), [])
  const setCollaborators = useCallback(
    (collaborators: TripCollaborator[]) => dispatch({ type: "SERVER_FIELDS", patch: { collaborators } }),
    [],
  )
  /** The trip is gone (deleted): drop unsaved edits instead of sending them. */
  const discard = useCallback(() => {
    discardedRef.current = true
  }, [])

  const publish = useCallback(() => {
    edit((doc) => ({ ...doc, status: "active" }))
    setNotice("Trip published. It’s now active for everyone who can see it.")
  }, [edit])

  const ai = ready?.ai ?? { k: "idle" as const }
  return {
    tripId,
    routerLocation,
    reduce,
    readToken,
    state,
    trip,
    access,
    editable,
    sync: ready?.sync ?? { k: "clean" as const },
    ai,
    history: ready?.history ?? null,
    /** An AI run owns the document: edits wait. */
    locked: ai.k === "running" || ai.k === "applying",
    notice,
    setNotice,
    activeRun,
    recentIds,
    dayOptions,
    navState,
    edit,
    setDays,
    flush,
    reload,
    flashTouched,
    aiTripRef,
    runEnhance,
    draft,
    applyActiveRun,
    stopAi,
    dismissRun,
    enhanceDay,
    deleteItem,
    undo,
    redo,
    retrySave,
    resolveConflict,
    setCollaborators,
    discard,
    publish,
  }
}

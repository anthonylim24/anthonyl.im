import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useTransition } from "react"
import { useLocation, useParams } from "react-router-dom"
import { useReducedMotion } from "motion/react"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { useReloadBlock } from "@/hooks/useReloadBlock"
import { useGetToken } from "@/lib/safeAuth"
import { HttpStatusError, PollTimeoutError } from "@/effect/errors"
import {
  applySuggestions,
  cancelEnhancement,
  enhanceTrip,
  followEnhancement,
  generateItinerary,
  getTrip,
  listEnhancements,
  updateTrip,
  type EnhanceTripResult,
} from "./tripsApi"
import { isTripConflict } from "./tripConflict"
import { READ_TIMEOUT_MS, isNetworkError, isOffline, saveFailure, useOnline } from "./offline/network"
import { dropDraft, keepDraft, keepDraftNow, keepTrip, readDraft, readTrip, type TripDraft } from "./offline/tripCopies"
import { saveOnLeave } from "./offline/leaveSave"
import { useShowCopy, useTripsDevice } from "./offline/tripsDevice"
import { removeItem } from "./tripEdits"
import { emitTripChanged, useTripChanged } from "./tripsEvents"
import { formatTripDate, plural } from "./meta"
import { diffPlan, touchedStops, type AppliedChanges, type SkippedSuggestion } from "./changes/planDiff"
import {
  canEdit,
  canResume,
  canWrite,
  draftOutcome,
  editorReducer,
  initialEditor,
  savePatch,
  type AiRun,
  type Editor,
  type EditorEvent,
  type UndoMark,
} from "./editorMachine"
import type { EnhancementRun, GeneratePreferences, ItineraryItem, Trip, TripCollaborator, TripDay } from "./types"

// The thin shell around `editorMachine`: it loads, saves and runs AI calls,
// and turns their results into events. Rules about what may happen when
// belong in the machine, not here.

const SAVE_DEBOUNCE_MS = 900
/** Unsaved edits are written to the device this long after the last keystroke (and at once when the page hides). */
const DRAFT_DEBOUNCE_MS = 400
const REPLAYING = "Brought back edits made on this device that hadn’t been saved. Saving them now."
const REPLAYED = "Saved the edits brought back from this device."

/** The server's copy is kept on the device this long after it last changed. */
const KEEP_COPY_MS = 1_500
/** A save that failed for want of an answer is tried again after 5 s, doubling to a minute. */
const retryDelay = (attempt: number) => Math.min(60_000, 5_000 * 2 ** attempt)

/** What went wrong with a save the traveller left behind, in a few words. */
function leftReason(err: unknown): string {
  if (isTripConflict(err)) return "someone else changed the same thing"
  if (isNetworkError(err)) return "there was no connection"
  return errorText(err)
}

export interface DayOption {
  id: string
  label: string
}

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

const isAbort = (err: unknown) => err instanceof Error && err.name === "AbortError"

/** For a skip an older server gave no reason for. */
const SKIP_FALLBACK = "It no longer fits the trip as it is now."

/** The dock's line after an apply: how many landed, and what didn't, by name when it is one. */
function appliedNotice(applied: number, skipped: readonly SkippedSuggestion[]): string {
  const done = applied > 0 ? `Applied ${plural(applied, "change")}.` : ""
  const [only] = skipped
  const missed = !only ? "" : skipped.length === 1 ? `Couldn’t apply “${only.title}”: ${only.reason}` : `Couldn’t apply ${skipped.length}: see the review.`
  return [done, missed].filter(Boolean).join(" ") || "Nothing needed applying."
}

/** What an AI call hands back: the machine's `AI_DONE` payload plus work to do with it. */
interface AiOutcome {
  trip?: Trip
  run: EnhancementRun | null
  undo?: UndoMark
  /** Runs in the same update as the new document (flash, notice, scroll hold). */
  onLand?: () => void
}

const STOPPING = "Stopping the AI review…"
const STOP_UNCONFIRMED = "Stopped waiting for the AI review. It may still finish on the server and add places to your trip."

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
  /** The last apply, for the "What changed" sheet; null once it is closed. */
  const [changes, setChanges] = useState<AppliedChanges | null>(null)
  /** Why each suggestion of the run in review couldn't be applied, so the review can say so. */
  const [skips, setSkips] = useState<{ runId: string; reasons: Record<string, string> } | null>(null)
  const recentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoreScrollRef = useRef<number | null>(null)
  /** The committed state, for callbacks and cleanups that outlive a render. */
  const stateRef = useRef<Editor>(state)
  useLayoutEffect(() => {
    stateRef.current = state
  }, [state])
  /** The PATCH on its way (one per save request, named by its `sent`), resolving to the saved trip (null on failure). */
  const inflightRef = useRef<{ sent: Trip; work: Promise<Trip | null> } | null>(null)
  const aiAbortRef = useRef<AbortController | null>(null)
  /** AI runs started on this page, so a late answer to Stop knows whether one has begun since. */
  const aiStartsRef = useRef(0)
  /** The review this page follows, once the server has named it. */
  const followingRef = useRef<string | null>(null)
  /** Reviews this page stopped following (Stop, or the cap): a resume leaves them be. */
  const setAsideRef = useRef(new Set<string>())
  /** Each look for a review under way; only the newest one may act on its answer. */
  const lookRef = useRef(0)
  /** Set once the trip is deleted: nothing left to save. */
  const discardedRef = useRef(false)
  /** The document an AI run last put in place, so its changes aren't read as the traveller's. */
  const aiTripRef = useRef<Trip | null>(null)
  const settleWaiters = useRef(new Set<(s: Editor) => boolean>())
  const device = useTripsDevice()
  const { store, owner, mode } = device
  /** The device as of the last render, for cleanups that must not re-run when it changes. */
  const deviceRef = useRef(device)
  useLayoutEffect(() => {
    deviceRef.current = device
  }, [device])
  const online = useOnline()
  /** The save-problem notice on screen, so the next good save can take it down. */
  const saveNoticeRef = useRef<string | null>(null)

  const ready = state.s === "ready" ? state : null
  const copy = state.s === "copy" ? state : null
  const trip = ready?.doc ?? copy?.doc ?? null
  const access = ready?.access ?? "view"
  const editable = canWrite(access)
  const tripDocId = ready?.doc.id

  // Open the trip: from the server (waiting `READ_TIMEOUT_MS` at most), with
  // any edits this device kept that never reached it; from the device when
  // there is no connection or sign-in can't load.
  useEffect(() => {
    if (!tripId) return
    let cancelled = false
    const fromDevice = async (err: unknown) => {
      const kept = owner ? await readTrip(store, owner, tripId) : { copy: null, draft: null }
      if (cancelled) return
      if (kept.copy) {
        const doc = kept.draft && kept.draft.doc.id === kept.copy.trip.id ? kept.draft.doc : kept.copy.trip
        dispatch({ type: "COPY_LOADED", trip: doc, savedAt: kept.copy.savedAt, unsaved: doc !== kept.copy.trip })
      } else {
        dispatch({ type: "LOAD_FAILED", message: errorText(err) })
      }
    }
    if (mode === "copy" || isOffline()) {
      void fromDevice(new Error("You’re offline, and this trip isn’t saved on this device yet."))
    } else {
      getTrip(readToken, tripId, { timeoutMs: READ_TIMEOUT_MS }).then(
        async ({ trip: loaded, access: a }) => {
          const draft = owner && canWrite(a) ? await readDraft(store, owner, loaded.id) : null
          if (cancelled) return
          const outcome = draft ? draftOutcome(loaded, draft) : "nothing"
          startTransition(() => {
            dispatch({ type: "LOADED", trip: loaded, access: a })
            if (draft && outcome !== "nothing") dispatch({ type: "RESTORE_DRAFT", doc: draft.doc, base: draft.base })
          })
          if (draft && outcome === "nothing" && owner) void dropDraft(store, owner, loaded.id)
          if (outcome === "replay") {
            // The save that sends them turns this into REPLAYED, like a save problem's notice is taken down.
            saveNoticeRef.current = REPLAYING
            setNotice(REPLAYING)
          }
          if (outcome === "conflict") setNotice("Edits made on this device weren’t saved, and someone has since changed the same thing. Choose whose version to keep.")
        },
        (err: unknown) => {
          if (cancelled) return
          if (isNetworkError(err)) void fromDevice(err)
          else dispatch({ type: "LOAD_FAILED", message: errorText(err) })
        },
      )
    }
    return () => {
      cancelled = true
    }
  }, [tripId, loadKey, readToken, store, owner, mode])

  const reload = useCallback(() => {
    dispatch({ type: "RELOAD" })
    setLoadKey((k) => k + 1)
  }, [])

  useShowCopy(copy ? { what: "trip", savedAt: copy.savedAt, unsaved: copy.unsaved } : null)

  // Keep the server's latest copy on this device, to open with no connection.
  const keptBase = ready?.base ?? null
  useEffect(() => {
    if (!owner || !keptBase) return
    const timer = setTimeout(() => void keepTrip(store, owner, keptBase), KEEP_COPY_MS)
    return () => clearTimeout(timer)
  }, [keptBase, owner, store])

  // Edits not stored yet go to the device too, so a closed tab, a crash or
  // a dead battery loses nothing; they are dropped once the server has them.
  const pendingDraft = useRef<TripDraft | null>(null)
  const draftDoc = ready && canWrite(ready.access) ? ready.doc : null
  const draftBase = ready?.base ?? null
  const unsaved = !!ready && ready.sync.k !== "clean"
  useEffect(() => {
    if (!owner || !draftDoc || !draftBase) return
    if (!unsaved) {
      pendingDraft.current = null
      void dropDraft(store, owner, draftDoc.id)
      return
    }
    const draft = { doc: draftDoc, base: draftBase, savedAt: Date.now() }
    pendingDraft.current = draft
    const timer = setTimeout(() => {
      pendingDraft.current = null
      void keepDraft(store, owner, draft)
    }, DRAFT_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draftDoc, draftBase, unsaved, owner, store])

  useEffect(() => {
    if (!owner) return
    // Phones may never come back to a hidden tab: write the draft now.
    const writeNow = () => {
      const draft = pendingDraft.current
      if (!draft) return
      pendingDraft.current = null
      void keepDraft(store, owner, draft)
    }
    const onHidden = () => {
      if (document.visibilityState === "hidden") writeNow()
    }
    // The page is going away: an IndexedDB write may not finish in time, so
    // anything unsaved is also written synchronously (`keepDraftNow`).
    const onLeave = () => {
      const now = stateRef.current
      if (now.s === "ready" && canWrite(now.access) && now.sync.k !== "clean" && !discardedRef.current) {
        keepDraftNow(owner, { doc: now.doc, base: now.base, savedAt: Date.now() })
      }
      writeNow()
    }
    window.addEventListener("pagehide", onLeave)
    document.addEventListener("visibilitychange", onHidden)
    return () => {
      window.removeEventListener("pagehide", onLeave)
      document.removeEventListener("visibilitychange", onHidden)
    }
  }, [owner, store])

  // An app update waits while anything is unsaved or an AI run is out.
  const aiBusy = ready?.ai.k === "running" || ready?.ai.k === "applying"
  useReloadBlock("trips-editor", unsaved || aiBusy)

  // Back online: send what failed, or open what couldn't be opened.
  useEffect(() => {
    const onOnline = () => {
      const now = stateRef.current
      if (now.s === "ready" && now.sync.k === "saveError") dispatch({ type: "RETRY" })
      else if ((now.s === "loadError" || now.s === "copy") && deviceRef.current.mode === "live") reload()
    }
    window.addEventListener("online", onOnline)
    return () => window.removeEventListener("online", onOnline)
  }, [reload])

  // A save that got no answer, or a server error, is tried again by itself
  // (backing off) while the browser says it is online.
  const failedSave = ready?.sync.k === "saveError" && ready.sync.failure !== "refused" ? ready.sync : null
  const retries = useRef(0)
  useEffect(() => {
    if (!failedSave || !online) return
    const timer = setTimeout(() => {
      retries.current += 1
      dispatch({ type: "RETRY" })
    }, retryDelay(retries.current))
    return () => clearTimeout(timer)
  }, [failedSave, online])

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
      getTrip(readToken, tripDocId, { timeoutMs: READ_TIMEOUT_MS }).then(
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
    if (!saving || inflightRef.current?.sent === saving.sent) return
    const { sent, against, fitted } = saving
    const work = updateTrip(readToken, sent.id, savePatch(sent, against)).then(
      (saved) => {
        dispatch({ type: "SAVE_OK", sent, saved })
        emitTripChanged(saved)
        retries.current = 0
        // Say what had to be cut to fit; the problem an earlier notice named is over.
        const stale = saveNoticeRef.current
        saveNoticeRef.current = null
        setNotice((current) => fitted ?? (current !== null && current === stale ? (current === REPLAYING ? REPLAYED : null) : current))
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
        // Phones show only a word and Retry: the reason, and what to do, go in the dock.
        const kept = deviceRef.current.owner ? "on this device" : "on this page"
        const text =
          failure === "refused"
            ? `Couldn’t save your latest edits. ${message} Change it and your edits will save.`
            : isOffline()
              ? `You’re offline. Your edits are kept ${kept} and will save when you’re back online.`
              : failure === "network"
                ? `Couldn’t save your latest edits: the server didn’t answer. They’re kept ${kept}, and saving will try again by itself.`
                : `Couldn’t save your latest edits: the server had a problem (${message}). Saving will try again by itself.`
        saveNoticeRef.current = text
        setNotice(text)
        return null
      },
    )
    inflightRef.current = { sent, work }
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

  // Leaving the trip: stop any AI wait, keep what isn't saved on the device,
  // and send it (after the save in flight, so the two can't land out of
  // order). If it can't be stored, the layout says so, and the next visit
  // brings the edits back.
  useEffect(
    () => () => {
      aiAbortRef.current?.abort()
      const now = stateRef.current
      if (discardedRef.current || now.s !== "ready" || !canWrite(now.access) || now.sync.k === "clean") return
      const { sync, doc, base } = now
      const { store: kept, owner: whose, leftUnsaved } = deviceRef.current
      pendingDraft.current = null
      const drafted = whose ? keepDraft(kept, whose, { doc, base, savedAt: Date.now() }) : Promise.resolve()
      if (sync.k === "conflict") {
        leftUnsaved(doc.name, "someone else changed the same thing")
        return
      }
      const before = sync.k === "saving" ? inflightRef.current?.work : undefined
      void (async () => {
        await drafted // written before the save that would drop it
        const written = await saveOnLeave({ doc, base, before, update: (t, against) => updateTrip(readToken, t.id, savePatch(t, against)) })
        if (whose) await Promise.all([dropDraft(kept, whose, doc.id), keepTrip(kept, whose, written)])
        emitTripChanged(written)
      })().catch((err: unknown) => leftUnsaved(doc.name, leftReason(err)))
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
      aiStartsRef.current += 1
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

  /**
   * A review that ended here without a result. Only a start the server
   * refused can promise nothing changed; once the server has named the run
   * (`started`) it may still finish, and the error carries words that say so.
   */
  const reviewFailed = useCallback((err: unknown, started: boolean) => {
    const message = errorText(err)
    if (err instanceof PollTimeoutError && followingRef.current) setAsideRef.current.add(followingRef.current)
    if (started || message.startsWith("Couldn’t save your latest edits")) setNotice(message)
    else if (err instanceof HttpStatusError) {
      setNotice(
        err.status >= 500
          ? `The AI review couldn’t start: the server had a problem. Try again in a moment. (${message})`
          : `The AI review couldn’t start, so nothing in your itinerary changed. (${message})`,
      )
    } else if (isNetworkError(err)) setNotice("Couldn’t reach the server to start the AI review. Check your connection and try again.")
    else setNotice(message)
  }, [])

  /** The server's word on the run being followed, until the wait is stopped. */
  const follow = useCallback(
    (signal: AbortSignal) => (live: EnhancementRun) => {
      if (signal.aborted) return
      followingRef.current = live.id
      dispatch({ type: "AI_PROGRESS", live })
    },
    [],
  )

  /** How a finished review lands, whether it started here or was taken up: its trip, the stops it added flashed, its words. */
  const landReview = useCallback(
    ({ run, trip: refreshed, applied, error }: EnhanceTripResult): AiOutcome => ({
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
          // A run the server settled as failed wrote nothing: the one time this can be promised.
          const why = run.outcomeReason ?? `The AI review didn’t finish (${run.error ?? error ?? "unknown error"}).`
          setNotice(`${why} Nothing in your itinerary changed, so you can run it again.`)
        } else if (run.outcomeReason) {
          setNotice(run.outcomeReason)
        }
      },
    }),
    [holdScroll, flashTouched],
  )

  const runEnhance = useCallback(
    (scope: "day" | "trip", dayId?: string, prompt?: string) => {
      if (!tripDocId) return Promise.resolve()
      setNotice(null)
      followingRef.current = null
      let started = false
      return startAi(
        scope === "day" ? { day: dayId ?? "" } : "trip",
        async (signal) => {
          const heard = follow(signal)
          const result = await enhanceTrip(readToken, tripDocId, scope, dayId, prompt, signal, (live) => {
            started = true
            heard(live)
          })
          return landReview(result)
        },
        (err) => reviewFailed(err, started),
      )
    },
    [tripDocId, startAi, readToken, follow, landReview, reviewFailed],
  )

  /**
   * Take up a review already under way on the server (this page was
   * reloaded, or it was started on another device): the same busy line,
   * Stop and landing as one started here. Never a second follow of a run,
   * and never one this page set aside.
   */
  const resumeReview = useCallback(async () => {
    if (!tripDocId || aiAbortRef.current || !canResume(stateRef.current)) return
    const look = ++lookRef.current
    const runs = await listEnhancements(readToken, tripDocId, { timeoutMs: READ_TIMEOUT_MS }).catch(
      (): EnhancementRun[] => [], // a missed look changes nothing; the next one sees the run
    )
    // A newer look, or the page left, while this one was out.
    if (look !== lookRef.current) return
    const live = runs[0]
    if (!live || live.status !== "running" || setAsideRef.current.has(live.id)) return
    // Asked again: a run may have started here, or an edit begun, meanwhile.
    if (aiAbortRef.current || !canResume(stateRef.current)) return
    followingRef.current = live.id
    await runAi(
      { type: "AI_RESUME", live },
      async (signal) => landReview(await followEnhancement(readToken, tripDocId, live, signal, follow(signal))),
      (err) => reviewFailed(err, true),
    )
  }, [tripDocId, readToken, runAi, landReview, follow, reviewFailed])

  // Look for a review under way when the trip opens and when the tab comes back.
  useEffect(() => {
    if (!tripDocId || !editable) return
    void resumeReview()
    const onVisible = () => {
      if (document.visibilityState === "visible") void resumeReview()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      lookRef.current += 1
    }
  }, [tripDocId, editable, resumeReview])

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
                    : (summary ?? `Drafted ${plural(added.length, "stop")} across ${plural(next.days.length, "day")}.`)
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
          // Read after the flush: the copy the server applies to.
          const settled = stateRef.current
          const before = settled.s === "ready" ? settled.doc : now.doc
          const { trip: next, applied, skipped, skipReasons } = await applySuggestions(readToken, tripDocId, run.id, suggestionIds)
          const failed = skipped.map((id): SkippedSuggestion => {
            const reason = skipReasons?.[id]?.trim() || SKIP_FALLBACK
            return {
              id,
              title: run.suggestions.find((s) => s.id === id)?.title ?? "A suggestion",
              reason: /[.!?]$/.test(reason) ? reason : `${reason}.`,
            }
          })
          // What couldn't be applied stays in review, to tick and try again;
          // what was applied leaves the list. Not an undo step: apply never was.
          const kept = failed.length > 0 ? { ...run, appliedSuggestionIds: [...new Set([...run.appliedSuggestionIds, ...applied])] } : null
          return {
            trip: next,
            run: kept,
            onLand: () => {
              // From the two documents: the server also sorts and re-times what it touches.
              const diff = diffPlan(before, next)
              flashTouched(touchedStops(diff))
              if (diff.days.length > 0 || failed.length > 0) setChanges({ before, after: next, skipped: failed })
              setSkips(kept ? { runId: run.id, reasons: Object.fromEntries(failed.map((f) => [f.id, f.reason])) } : null)
              setNotice(appliedNotice(applied.length, failed))
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

  /**
   * Stop the AI and unlock editing. A review the server has named is stopped
   * there too, and the notice says how it ended; one it finished first (or
   * could not stop) lands like any other change.
   */
  const stopAi = useCallback(() => {
    const now = stateRef.current
    const reviewing = now.s === "ready" && now.ai.k === "running" && now.ai.run !== "draft"
    aiAbortRef.current?.abort()
    aiAbortRef.current = null
    dispatch({ type: "AI_FAILED" })
    if (!reviewing) return
    const runId = followingRef.current
    // Coming back to the tab must not take up the run this page just let go of.
    if (runId) setAsideRef.current.add(runId)
    if (!runId || !tripDocId) return setNotice(STOP_UNCONFIRMED)
    setNotice(STOPPING)
    const starts = aiStartsRef.current
    void cancelEnhancement(readToken, tripDocId, runId)
      .catch(() => null)
      .then((answer) => {
        // An AI run started since, or another trip opened, has the say now.
        const open = stateRef.current
        if (aiStartsRef.current !== starts || open.s !== "ready" || open.doc.id !== tripDocId) return
        const run = answer?.run
        if (run?.status === "complete" && answer?.trip) dispatch({ type: "EXTERNAL_CHANGE", trip: answer.trip })
        const said =
          run?.status === "error"
            ? "Stopped the AI review. Nothing in your itinerary changed."
            : run?.status === "complete"
              ? "The AI review finished before it could stop. Anything it added is on your trip."
              : STOP_UNCONFIRMED
        setNotice(said)
      })
  }, [tripDocId, readToken])

  const dismissRun = useCallback(() => dispatch({ type: "DISMISS_RUN" }), [])
  const closeChanges = useCallback(() => setChanges(null), [])
  const skipReasons = activeRun && skips?.runId === activeRun.id ? skips.reasons : undefined
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
    /** False while the browser says there is no connection (for `SaveIndicator`). */
    online,
    /** Showing the copy kept on this device, read-only: when it was taken, and whether it has unsaved edits. */
    copy: copy ? { savedAt: copy.savedAt, unsaved: copy.unsaved } : null,
    sync: ready?.sync ?? { k: "clean" as const },
    ai,
    history: ready?.history ?? null,
    /** An AI run owns the document: edits wait. */
    locked: ai.k === "running" || ai.k === "applying",
    notice,
    setNotice,
    activeRun,
    /** Why suggestions of the run in review couldn't be applied, by id. */
    skipReasons,
    /** What the last apply changed, while its sheet is open. */
    changes,
    closeChanges,
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

import { describeSanitized, sanitizeForSave } from "./offline/sanitize"
import { mergeDays, mergeItems, rebaseTrip, resolveTrip, sameJson } from "./tripMerge"
import type { UpdateTripPatch } from "./tripsApi"
import type { EnhancementRun, Trip, TripAccess } from "./types"

// The itinerary editor as one pure state machine. `useTripEditor` performs
// the I/O (load, PATCH, AI calls) and feeds results back in as events; every
// rule about what may happen when lives here, where a test can reach it.
//
// Saving: an edit makes the document dirty; 900 ms of quiet starts a save.
// Saves are serialised: an edit while one is in flight queues the next, and
// an in-flight PATCH is never aborted (the server would finish it anyway, so
// an older PATCH could land last). Each PATCH names the `updatedAt` it was
// made against; when someone else wrote first the server answers 409 with
// its copy, and the traveller's changes are replayed on top of it
// (`rebaseTrip`). Only when that can't be done safely does the editor stop
// and ask: keep mine, or use theirs (`resolveTrip`, which still keeps
// everything that doesn't clash).
//
// What a save sends is first brought inside the server's limits
// (`sanitizeForSave`). A save the server still refuses is not sent again
// until the document changes: the same content would only be refused again.

/** The part of a trip that Undo restores. Dates travel with days: shortening a trip drops days. */
export type Plan = Pick<Trip, "days" | "startDate" | "endDate" | "ideas">

/**
 * Why a save didn't land, which decides what helps:
 * - `network`: no answer (offline, a dropped connection). The same save can
 *   go again as is: it names its base, so a repeat can't overwrite anyone.
 * - `server`: the server answered with an error. Retry may help.
 * - `refused`: the server can't store this content. Only a change will help.
 */
export type SaveFailure = "network" | "server" | "refused"

export type Sync =
  | { k: "clean" }
  | { k: "dirty" }
  /**
   * `against`: the `updatedAt` the PATCH names as its base. `queued`: edits
   * since, to send next. `fitted`: what had to change to fit the server's
   * limits, as a notice (null when nothing did).
   */
  | { k: "saving"; sent: Trip; against: string; queued: boolean; fitted: string | null }
  | { k: "saveError"; message: string; failure: "network" | "server" }
  /** `refused`: what the server turned away, so the same content isn't sent again. */
  | { k: "saveError"; message: string; failure: "refused"; refused: Trip }
  | { k: "conflict"; theirs: Trip }

export type AiRun = "draft" | "trip" | { day: string }

export type Ai =
  | { k: "idle" }
  /**
   * `live`: a review as the server last described it (its place in the
   * queue); null until the server has answered, and always for a draft.
   */
  | { k: "running"; run: AiRun; live: EnhancementRun | null }
  | { k: "review"; run: EnhancementRun }
  | { k: "applying"; run: EnhancementRun }

/** Marks an edit for the undo history. `key`: consecutive edits with the same key are one step. */
export interface UndoMark {
  label: string
  key?: string
  /** Offer a toast with an Undo button (destructive changes). */
  toast?: boolean
}

export interface HistoryEntry {
  id: number
  before: Plan
  after: Plan
  /** What the step did, in words; null for plain typing. */
  label: string | null
  key: string | null
  toast: boolean
}

export interface History {
  past: HistoryEntry[]
  future: HistoryEntry[]
  seq: number
}

export type Editor =
  | { s: "loading" }
  | { s: "loadError"; message: string }
  /**
   * The server couldn't be reached, so the page shows the copy kept on this
   * device, read-only: nothing can be edited, so nothing is queued.
   * `savedAt`: when that copy was taken (ms). `unsaved`: it includes edits
   * that were never saved, which are saved once the trip opens online.
   */
  | { s: "copy"; doc: Trip; savedAt: number; unsaved: boolean }
  | {
      s: "ready"
      /** The working copy the page shows. */
      doc: Trip
      /** The server's copy that `doc`'s unsaved changes were made against. */
      base: Trip
      access: TripAccess
      sync: Sync
      ai: Ai
      history: History
    }

export type Ready = Extract<Editor, { s: "ready" }>

export type EditorEvent =
  | { type: "LOADED"; trip: Trip; access: TripAccess }
  | { type: "LOAD_FAILED"; message: string }
  /** The load failed (or couldn't start) and this device has a copy to show instead. */
  | { type: "COPY_LOADED"; trip: Trip; savedAt: number; unsaved: boolean }
  | { type: "RELOAD" }
  | { type: "EDIT"; fn: (doc: Trip) => Trip; undo?: UndoMark }
  | { type: "DEBOUNCE_ELAPSED" }
  /** Save now rather than after the debounce (before an AI run, a copy, leaving). */
  | { type: "FLUSH" }
  | { type: "SAVE_OK"; sent: Trip; saved: Trip }
  | { type: "SAVE_FAILED"; sent: Trip; message: string; failure: SaveFailure }
  | { type: "SAVE_CONFLICT"; sent: Trip; theirs: Trip }
  /** Send a failed save again (the Retry button, or the connection coming back). */
  | { type: "RETRY" }
  /**
   * Unsaved edits kept on this device from an earlier visit (a closed tab,
   * a reload, a save that failed on the way out), made against `base`.
   */
  | { type: "RESTORE_DRAFT"; doc: Trip; base: Trip }
  | { type: "RESOLVE"; keep: "mine" | "theirs" }
  | { type: "EXTERNAL_CHANGE"; trip: Trip }
  /** Server-owned fields (collaborators) changed: no save, no history. */
  | { type: "SERVER_FIELDS"; patch: Pick<Partial<Trip>, "collaborators"> }
  | { type: "AI_START"; run: AiRun }
  /**
   * A review already under way on the server (the page was reloaded, or it
   * was started on another device): followed as if it had started here.
   */
  | { type: "AI_RESUME"; live: EnhancementRun }
  /** The server's latest word on the review being followed. */
  | { type: "AI_PROGRESS"; live: EnhancementRun }
  | { type: "AI_DONE"; trip?: Trip; run: EnhancementRun | null; undo?: UndoMark }
  | { type: "AI_FAILED" }
  | { type: "APPLY" }
  | { type: "DISMISS_RUN" }
  | { type: "UNDO" }
  | { type: "REDO" }

export const HISTORY_LIMIT = 30
/** Plain typing coalesces into one undo step under this key. */
const TYPING = "~typing"

export const initialEditor: Editor = { s: "loading" }

const EMPTY_HISTORY: History = { past: [], future: [], seq: 0 }

export const canWrite = (access: TripAccess) => access === "edit" || access === "owner"

/** Edits (and Undo) are open unless an AI run owns the document. */
export function canEdit(state: Editor): state is Ready {
  return state.s === "ready" && canWrite(state.access) && (state.ai.k === "idle" || state.ai.k === "review")
}

/**
 * A review found running on the server may be taken up: nothing else is
 * going, no review is open to read, and nothing is unsaved (its landing
 * puts the server's trip in place).
 */
export function canResume(state: Editor): state is Ready {
  return canEdit(state) && state.ai.k === "idle" && state.sync.k === "clean"
}

/** The part of the trip a review covers, as the editor names a run. */
export const reviewOf = (run: EnhancementRun): AiRun => (run.scope === "day" && run.dayId ? { day: run.dayId } : "trip")

const plan = (trip: Trip): Plan => ({ days: trip.days, startDate: trip.startDate, endDate: trip.endDate, ideas: trip.ideas })
const samePlanRefs = (a: Trip, b: Trip) =>
  a.days === b.days && a.startDate === b.startDate && a.endDate === b.endDate && a.ideas === b.ideas

/** Same content as far as a save is concerned (the server stamps `updatedAt`). */
export const sameContent = (a: Trip, b: Trip) => sameJson({ ...a, updatedAt: "" }, { ...b, updatedAt: "" })

/** Turn `doc` from one plan to another, keeping anything that changed since on other days. */
function replayPlan(doc: Trip, from: Plan, to: Plan): Trip {
  const days = mergeDays(from.days, to.days, doc.days) ?? to.days
  // The wishlist: a stop moved onto a day comes back to it on undo.
  const ideas = from.ideas === to.ideas ? doc.ideas : mergeItems(from.ideas ?? [], to.ideas ?? [], doc.ideas ?? [])
  return { ...doc, days, startDate: to.startDate, endDate: to.endDate, ideas }
}

function record(history: History, prev: Trip, next: Trip, undo: UndoMark | undefined): History {
  if (samePlanRefs(prev, next)) return history
  const key = undo ? (undo.key ?? null) : TYPING
  const top = history.past[history.past.length - 1]
  if (top && key !== null && top.key === key && history.future.length === 0) {
    const merged: HistoryEntry = { ...top, after: plan(next), label: undo?.label ?? top.label, toast: undo?.toast ?? top.toast }
    return { ...history, past: [...history.past.slice(0, -1), merged] }
  }
  const entry: HistoryEntry = {
    id: history.seq + 1,
    before: plan(prev),
    after: plan(next),
    label: undo?.label ?? null,
    key,
    toast: undo?.toast ?? false,
  }
  return { past: [...history.past, entry].slice(-HISTORY_LIMIT), future: [], seq: entry.id }
}

/**
 * Wishlist ideas a review put on a day are off the server's wishlist once
 * its trip lands. Undo steps from before the review still name them, and
 * replaying one that edited an idea would bring it back (in a merge an edit
 * beats a delete), so the history forgets them too.
 */
function forgetScheduled(history: History, run: EnhancementRun | null, landed: Trip): History {
  if (!run) return history
  const kept = new Set((landed.ideas ?? []).map((idea) => idea.id))
  const gone = new Set(run.suggestions.flatMap((s) => (s.kind === "add" && s.fromIdeaId && !kept.has(s.fromIdeaId) ? [s.fromIdeaId] : [])))
  if (gone.size === 0) return history
  const strip = (p: Plan): Plan => (p.ideas?.some((idea) => gone.has(idea.id)) ? { ...p, ideas: p.ideas.filter((idea) => !gone.has(idea.id)) } : p)
  const forget = (entry: HistoryEntry): HistoryEntry => ({ ...entry, before: strip(entry.before), after: strip(entry.after) })
  return { ...history, past: history.past.map(forget), future: history.future.map(forget) }
}

/** Where saving goes after the document changed locally. */
function afterEdit(sync: Sync): Sync {
  switch (sync.k) {
    case "clean":
    case "dirty":
    case "saveError":
      return { k: "dirty" }
    case "saving":
      return sync.queued ? sync : { ...sync, queued: true }
    case "conflict":
      return sync
  }
}

/** What a save of `doc` against `base` would send: `doc` inside the server's limits. */
const fit = (doc: Trip, base: Trip) => sanitizeForSave(doc, base)

/** A save of the working copy, made against `base` (whose name stands in for a blank one). */
function send(state: Ready, base: Trip = state.base): Sync {
  const fitted = fit(state.doc, base)
  return { k: "saving", sent: fitted.trip, against: base.updatedAt, queued: false, fitted: describeSanitized(fitted) }
}

/** The server refused this very content: sending it again can't help until it changes. */
const stuck = (state: Ready) =>
  state.sync.k === "saveError" && state.sync.failure === "refused" && sameContent(fit(state.doc, state.base).trip, state.sync.refused)

/** Start a save now if there is anything to save. */
function flush(state: Ready): Ready {
  if (state.sync.k === "dirty" || (state.sync.k === "saveError" && !stuck(state))) return { ...state, sync: send(state) }
  return state
}

/**
 * What a restored draft would do to the server's copy `server`: nothing
 * (no edits, or they were saved after all), a replay, or a conflict to ask about.
 */
export function draftOutcome(server: Trip, draft: { doc: Trip; base: Trip }): "nothing" | "replay" | "conflict" {
  if (draft.doc.id !== server.id || sameContent(draft.doc, draft.base)) return "nothing"
  const rebased = rebaseTrip(draft.base, draft.doc, server)
  if (!rebased) return "conflict"
  return sameContent(rebased, server) ? "nothing" : "replay"
}

/**
 * Someone else's newer copy arrived. Take it, carrying over whatever the
 * traveller hasn't saved; stop and ask only when that can't be done safely.
 */
function rebaseOnto(state: Ready, theirs: Trip): Ready {
  if (state.sync.k === "clean") return { ...state, doc: theirs, base: theirs }
  const rebased = rebaseTrip(state.base, state.doc, theirs)
  if (state.sync.k === "saving") {
    // The PATCH in flight was made against the old base, so it will 409 (or,
    // on an older server, overwrite): either way its answer brings us back
    // here. Carry the merge if it is safe and send it once that answer lands.
    if (!rebased) return state
    return { ...state, doc: rebased, base: theirs, sync: { ...state.sync, queued: true } }
  }
  if (!rebased) return { ...state, sync: { k: "conflict", theirs } }
  if (sameContent(rebased, theirs)) return { ...state, doc: theirs, base: theirs, sync: { k: "clean" } }
  return { ...state, doc: rebased, base: theirs, sync: { k: "dirty" } }
}

const isNewer = (incoming: Trip, than: Trip) => incoming.id === than.id && incoming.updatedAt > than.updatedAt

export function editorReducer(state: Editor, event: EditorEvent): Editor {
  switch (event.type) {
    case "LOADED":
      if (state.s !== "ready") {
        return {
          s: "ready",
          doc: event.trip,
          base: event.trip,
          access: event.access,
          sync: { k: "clean" },
          ai: { k: "idle" },
          history: EMPTY_HISTORY,
        }
      }
      // A refetch (tab came back into view): same as any newer copy.
      return isNewer(event.trip, state.base) ? { ...rebaseOnto(state, event.trip), access: event.access } : { ...state, access: event.access }

    case "LOAD_FAILED":
      return state.s === "loading" ? { s: "loadError", message: event.message } : state

    case "COPY_LOADED":
      // A live copy is never swapped for an older one from the device.
      return state.s === "loading" || state.s === "loadError" || state.s === "copy"
        ? { s: "copy", doc: event.trip, savedAt: event.savedAt, unsaved: event.unsaved }
        : state

    case "RELOAD":
      return state.s === "loadError" ? { s: "loading" } : state
  }

  if (state.s !== "ready") return state

  switch (event.type) {
    case "EDIT": {
      if (!canEdit(state)) return state
      const next = event.fn(state.doc)
      if (next === state.doc) return state
      return { ...state, doc: next, sync: afterEdit(state.sync), history: record(state.history, state.doc, next, event.undo) }
    }

    case "DEBOUNCE_ELAPSED":
      return state.sync.k === "dirty" ? flush(state) : state

    case "FLUSH":
      return flush(state)

    case "SAVE_OK": {
      if (state.sync.k !== "saving" || state.sync.sent !== event.sent) return state
      if (state.sync.queued) {
        // An older server may have written over a copy we merged in meanwhile;
        // the queued send carries it back. Keep the newer of the two bases.
        const base = event.saved.updatedAt >= state.base.updatedAt ? event.saved : state.base
        return { ...state, base, sync: send(state, base) }
      }
      // A blank name is one being typed: the server kept the last one, but
      // the field stays empty until the traveller writes the new name.
      const doc = state.doc.name.trim() ? event.saved : { ...event.saved, name: state.doc.name }
      return { ...state, doc, base: event.saved, sync: { k: "clean" } }
    }

    case "SAVE_FAILED": {
      if (state.sync.k !== "saving" || state.sync.sent !== event.sent) return state
      if (event.failure !== "refused") return { ...state, sync: { k: "saveError", message: event.message, failure: event.failure } }
      // Edits made while it was out may be the fix: they go once more.
      if (state.sync.queued && !sameContent(fit(state.doc, state.base).trip, event.sent)) return { ...state, sync: { k: "dirty" } }
      return { ...state, sync: { k: "saveError", message: event.message, failure: "refused", refused: event.sent } }
    }

    case "SAVE_CONFLICT": {
      if (state.sync.k !== "saving" || state.sync.sent !== event.sent) return state
      const theirs = event.theirs
      // The server has nothing newer than what we sent against: retrying would only loop.
      if (theirs.updatedAt <= state.sync.against) return { ...state, sync: { k: "conflict", theirs } }
      // Their copy already reached us (and was merged) while the PATCH was out.
      if (theirs.updatedAt <= state.base.updatedAt) return { ...state, sync: send(state) }
      const rebased = rebaseTrip(state.base, state.doc, theirs)
      if (!rebased) return { ...state, sync: { k: "conflict", theirs } }
      if (sameContent(rebased, theirs)) return { ...state, doc: theirs, base: theirs, sync: { k: "clean" } }
      const next = { ...state, doc: rebased, base: theirs }
      return { ...next, sync: send(next) }
    }

    case "RETRY":
      return state.sync.k === "saveError" ? flush(state) : state

    case "RESOLVE": {
      if (state.sync.k !== "conflict") return state
      const theirs = state.sync.theirs
      // Only what truly clashes goes to the chosen side; everything else
      // both sides did is kept. The next PATCH is made against their copy.
      const resolved = resolveTrip(state.base, state.doc, theirs, event.keep)
      if (sameContent(resolved, theirs)) return { ...state, doc: theirs, base: theirs, sync: { k: "clean" } }
      const next = { ...state, doc: resolved, base: theirs }
      return { ...next, sync: send(next) }
    }

    case "RESTORE_DRAFT": {
      if (!canEdit(state) || state.sync.k !== "clean" || draftOutcome(state.base, event) === "nothing") return state
      // The draft's edits, made against its own base, meet the server's copy
      // like any newer copy would: replayed, or asked about.
      return rebaseOnto({ ...state, doc: event.doc, base: event.base, sync: { k: "dirty" } }, state.base)
    }

    case "EXTERNAL_CHANGE":
      if (!isNewer(event.trip, state.base)) return state
      if (state.sync.k === "conflict") {
        // A newer copy may make the merge possible again; if not, ask about this one.
        return rebaseOnto({ ...state, sync: { k: "dirty" } }, event.trip)
      }
      return rebaseOnto(state, event.trip)

    case "SERVER_FIELDS":
      return { ...state, doc: { ...state.doc, ...event.patch }, base: { ...state.base, ...event.patch } }

    case "AI_START":
      if (!canEdit(state)) return state
      // The run reads the server's copy, so unsaved edits go first.
      return flush({ ...state, ai: { k: "running", run: event.run, live: null } })

    case "AI_RESUME":
      if (!canResume(state)) return state
      return { ...state, ai: { k: "running", run: reviewOf(event.live), live: event.live } }

    case "AI_PROGRESS":
      // A 409 may hand over a review of another part of the trip: name what is really running.
      if (state.ai.k !== "running" || state.ai.run === "draft") return state
      return { ...state, ai: { k: "running", run: reviewOf(event.live), live: event.live } }

    case "APPLY":
      if (state.ai.k !== "review" || !canWrite(state.access)) return state
      return flush({ ...state, ai: { k: "applying", run: state.ai.run } })

    case "AI_DONE": {
      if (state.ai.k !== "running" && state.ai.k !== "applying") return state
      const ai: Ai = event.run ? { k: "review", run: event.run } : { k: "idle" }
      const trip = event.trip
      if (!trip || trip.id !== state.doc.id || trip.updatedAt < state.base.updatedAt) return { ...state, ai }
      const recorded = event.undo ? record(state.history, state.doc, trip, event.undo) : state.history
      const reviewed = event.run ?? (state.ai.k === "applying" ? state.ai.run : null)
      return { ...state, ai, doc: trip, base: trip, sync: { k: "clean" }, history: forgetScheduled(recorded, reviewed, trip) }
    }

    case "AI_FAILED":
      if (state.ai.k === "running") return { ...state, ai: { k: "idle" } }
      if (state.ai.k === "applying") return { ...state, ai: { k: "review", run: state.ai.run } }
      return state

    case "DISMISS_RUN":
      return state.ai.k === "review" ? { ...state, ai: { k: "idle" } } : state

    case "UNDO": {
      if (!canEdit(state)) return state
      const entry = state.history.past[state.history.past.length - 1]
      if (!entry) return state
      const doc = replayPlan(state.doc, entry.after, entry.before)
      const history = { ...state.history, past: state.history.past.slice(0, -1), future: [...state.history.future, entry] }
      return { ...state, doc, sync: afterEdit(state.sync), history }
    }

    case "REDO": {
      if (!canEdit(state)) return state
      const entry = state.history.future[state.history.future.length - 1]
      if (!entry) return state
      const doc = replayPlan(state.doc, entry.before, entry.after)
      const history = { ...state.history, past: [...state.history.past, entry], future: state.history.future.slice(0, -1) }
      return { ...state, doc, sync: afterEdit(state.sync), history }
    }
  }
}

/** Fields a save sends. `days` and the rest; never server-owned ones like collaborators. */
export function savePatch(trip: Trip, baseUpdatedAt: string): UpdateTripPatch {
  return {
    name: trip.name,
    status: trip.status,
    slug: trip.slug,
    appearance: trip.appearance,
    destinations: trip.destinations,
    startDate: trip.startDate,
    endDate: trip.endDate,
    timezone: trip.timezone,
    tags: trip.tags,
    description: trip.description ?? null,
    days: trip.days,
    center: trip.center,
    budget: trip.budget ?? null,
    party: trip.party,
    expenses: trip.expenses,
    checklist: trip.checklist,
    ideas: trip.ideas,
    baseUpdatedAt,
  }
}

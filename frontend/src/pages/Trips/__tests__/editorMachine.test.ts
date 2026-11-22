import { describe, expect, it } from "vitest"
import {
  HISTORY_LIMIT,
  canEdit,
  canResume,
  draftOutcome,
  editorReducer,
  initialEditor,
  savePatch,
  type Editor,
  type EditorEvent,
  type Ready,
  type UndoMark,
} from "../editorMachine"
import type { EnhancementRun, ItineraryItem, Trip, TripAccess } from "../types"
import { makeItem, makeTrip } from "./tripFixtures"

const T0 = "2026-01-01T00:00:00Z"
const T1 = "2026-01-01T00:01:00Z"
const T2 = "2026-01-01T00:02:00Z"

const market = makeItem({ id: "market", title: "Market" })
const museum = makeItem({ id: "museum", title: "Museum" })

function trip(overrides: Partial<Trip> = {}): Trip {
  return makeTrip({
    updatedAt: T0,
    days: [
      { id: "day-1", date: "2026-07-10", items: [market] },
      { id: "day-2", date: "2026-07-11", items: [museum] },
    ],
    ...overrides,
  })
}

const run = (events: EditorEvent[], from: Editor = initialEditor) => events.reduce(editorReducer, from)

function loaded(doc: Trip = trip(), access: TripAccess = "owner"): Ready {
  return run([{ type: "LOADED", trip: doc, access }]) as Ready
}

const rename = (name: string): EditorEvent => ({ type: "EDIT", fn: (doc) => ({ ...doc, name }) })
const addTo = (dayId: string, it: ItineraryItem, undo?: UndoMark): EditorEvent => ({
  type: "EDIT",
  fn: (doc) => ({ ...doc, days: doc.days.map((d) => (d.id === dayId ? { ...d, items: [...d.items, it] } : d)) }),
  undo,
})
const removeFrom = (dayId: string, id: string): EditorEvent => ({
  type: "EDIT",
  fn: (doc) => ({ ...doc, days: doc.days.map((d) => (d.id === dayId ? { ...d, items: d.items.filter((i) => i.id !== id) } : d)) }),
  undo: { label: `Removed ${id}`, toast: true },
})
const itemIds = (state: Editor, dayIndex: number) => (state as Ready).doc.days[dayIndex]!.items.map((i) => i.id)

/** A dirty editor that has started its save; returns the state and what it sent. */
function saving(state: Editor): { state: Ready; sent: Trip } {
  const next = editorReducer(state, { type: "DEBOUNCE_ELAPSED" }) as Ready
  if (next.sync.k !== "saving") throw new Error(`expected saving, got ${next.sync.k}`)
  return { state: next, sent: next.sync.sent }
}

const enhancement: EnhancementRun = { id: "run-1", tripId: "lisbon", scope: "trip", status: "complete", suggestions: [], appliedSuggestionIds: [], createdAt: T0 }

describe("loading", () => {
  it("starts loading, then is ready, clean and idle", () => {
    expect(initialEditor).toEqual({ s: "loading" })
    const state = loaded()
    expect(state).toMatchObject({ s: "ready", access: "owner", sync: { k: "clean" }, ai: { k: "idle" } })
    expect(state.base).toBe(state.doc)
  })

  it("can fail and be retried", () => {
    const failed = run([{ type: "LOAD_FAILED", message: "Failed to fetch" }])
    expect(failed).toEqual({ s: "loadError", message: "Failed to fetch" })
    expect(editorReducer(failed, { type: "RELOAD" })).toEqual({ s: "loading" })
  })

  it("ignores a failed refetch once ready", () => {
    const state = loaded()
    expect(editorReducer(state, { type: "LOAD_FAILED", message: "x" })).toBe(state)
  })

  it("treats a refetch with a newer copy like any other change, and an older one as nothing", () => {
    const state = loaded()
    const newer = trip({ updatedAt: T1, name: "Theirs" })
    expect((editorReducer(state, { type: "LOADED", trip: newer, access: "owner" }) as Ready).doc).toBe(newer)
    const same = editorReducer(state, { type: "LOADED", trip: trip({ name: "Stale" }), access: "edit" }) as Ready
    expect(same.doc.name).toBe("Lisbon Long Weekend")
    expect(same.access).toBe("edit")
  })

  it("drops every other event until loaded", () => {
    expect(run([rename("x"), { type: "UNDO" }, { type: "DEBOUNCE_ELAPSED" }])).toEqual({ s: "loading" })
  })
})

describe("the copy kept on this device", () => {
  const copy = (doc: Trip = trip()): EditorEvent => ({ type: "COPY_LOADED", trip: doc, savedAt: 1000, unsaved: false })

  it("stands in, read-only, when the trip can't be loaded", () => {
    const shown = run([copy()])
    expect(shown).toMatchObject({ s: "copy", savedAt: 1000, doc: { name: "Lisbon Long Weekend" } })
    expect(run([{ type: "LOAD_FAILED", message: "Failed to fetch" }, copy()]).s).toBe("copy")
    // Nothing can be edited, undone or saved from it.
    expect(run([rename("x"), { type: "UNDO" }, { type: "FLUSH" }, { type: "RETRY" }], shown)).toBe(shown)
    expect(canEdit(shown)).toBe(false)
  })

  it("gives way to the server's copy, and stays when a retry fails", () => {
    const shown = run([copy()])
    expect(editorReducer(shown, { type: "LOAD_FAILED", message: "x" })).toBe(shown)
    expect(editorReducer(shown, { type: "LOADED", trip: trip({ updatedAt: T1 }), access: "owner" })).toMatchObject({ s: "ready", sync: { k: "clean" } })
  })

  it("never replaces a live trip", () => {
    const state = loaded()
    expect(editorReducer(state, copy(trip({ name: "Old" })))).toBe(state)
  })
})

describe("unsaved edits restored from this device", () => {
  const draftOf = (base: Trip, edit: (doc: Trip) => Trip) => ({ type: "RESTORE_DRAFT" as const, base, doc: edit(base) })

  it("replays them onto the server's copy and saves", () => {
    const state = editorReducer(loaded(), draftOf(trip(), (d) => ({ ...d, name: "Typed offline" }))) as Ready
    expect(state.sync.k).toBe("dirty")
    expect(state.doc.name).toBe("Typed offline")
    expect(saving(state).state.sync).toMatchObject({ against: T0 })
  })

  it("keeps what others saved since the draft was made", () => {
    const server = trip({ updatedAt: T1, days: [{ id: "day-1", date: "2026-07-10", items: [market, makeItem({ id: "theirs" })] }, trip().days[1]!] })
    const draft = draftOf(trip(), (d) => ({ ...d, days: [d.days[0]!, { ...d.days[1]!, items: [museum, makeItem({ id: "mine" })] }] }))
    const state = editorReducer(loaded(server), draft) as Ready
    expect(itemIds(state, 0)).toEqual(["market", "theirs"])
    expect(itemIds(state, 1)).toEqual(["museum", "mine"])
    expect(state.base.updatedAt).toBe(T1)
  })

  it("asks when the draft and the server's copy clash", () => {
    const state = editorReducer(loaded(trip({ updatedAt: T1, name: "Theirs" })), draftOf(trip(), (d) => ({ ...d, name: "Mine" }))) as Ready
    expect(state.sync).toMatchObject({ k: "conflict", theirs: { name: "Theirs" } })
    expect(state.doc.name).toBe("Mine")
    expect((editorReducer(state, { type: "RESOLVE", keep: "mine" }) as Ready).sync).toMatchObject({ k: "saving", against: T1, sent: { name: "Mine" } })
  })

  it("does nothing for a draft that was saved after all, for a viewer, or once editing started", () => {
    const saved = trip({ updatedAt: T1, name: "Typed offline" })
    const state = loaded(saved)
    expect(editorReducer(state, draftOf(trip(), (d) => ({ ...d, name: "Typed offline" })))).toBe(state)
    const viewer = loaded(trip(), "view")
    expect(editorReducer(viewer, draftOf(trip(), (d) => ({ ...d, name: "x" })))).toBe(viewer)
    const editing = run([rename("Now")], loaded())
    expect(editorReducer(editing, draftOf(trip(), (d) => ({ ...d, name: "x" })))).toBe(editing)
  })

  it("tells the shell what a draft would do", () => {
    const server = trip({ updatedAt: T1, name: "Theirs" })
    expect(draftOutcome(server, { base: trip(), doc: trip() })).toBe("nothing")
    expect(draftOutcome(server, { base: trip(), doc: trip({ name: "Mine" }) })).toBe("conflict")
    expect(draftOutcome(server, { base: trip(), doc: trip({ description: "Mine" }) })).toBe("replay")
    expect(draftOutcome(server, { base: trip(), doc: trip({ id: "porto", name: "x" }) })).toBe("nothing")
  })
})

describe("editing and saving", () => {
  it("makes the trip dirty, then saves after the debounce against the base it was edited from", () => {
    const dirty = run([rename("Lisbon, renamed")], loaded())
    expect(dirty).toMatchObject({ sync: { k: "dirty" }, doc: { name: "Lisbon, renamed" } })
    const { state, sent } = saving(dirty)
    expect(state.sync).toEqual({ k: "saving", sent, against: T0, queued: false, fitted: null })
    expect(sent.name).toBe("Lisbon, renamed")
  })

  it("does nothing for an edit that changes nothing", () => {
    const state = loaded()
    expect(editorReducer(state, { type: "EDIT", fn: (doc) => doc })).toBe(state)
  })

  it("does not let a viewer edit", () => {
    const state = loaded(trip(), "view")
    expect(canEdit(state)).toBe(false)
    expect(editorReducer(state, rename("x"))).toBe(state)
  })

  it("ignores the debounce when nothing is dirty", () => {
    const state = loaded()
    expect(editorReducer(state, { type: "DEBOUNCE_ELAPSED" })).toBe(state)
  })

  it("comes back clean with the server's copy", () => {
    const { state, sent } = saving(run([rename("New")], loaded()))
    const saved = { ...sent, updatedAt: T1 }
    const done = editorReducer(state, { type: "SAVE_OK", sent, saved }) as Ready
    expect(done.sync).toEqual({ k: "clean" })
    expect(done.doc).toBe(saved)
    expect(done.base).toBe(saved)
  })

  it("queues an edit made while a save is out, and sends it against the new base once that save lands", () => {
    const { state, sent } = saving(run([rename("One")], loaded()))
    const queued = editorReducer(state, rename("Two")) as Ready
    expect(queued.sync).toMatchObject({ k: "saving", sent, queued: true })
    const next = editorReducer(queued, { type: "SAVE_OK", sent, saved: { ...sent, updatedAt: T1 } }) as Ready
    expect(next.sync).toMatchObject({ k: "saving", against: T1, queued: false })
    expect(next.sync.k === "saving" && next.sync.sent.name).toBe("Two")
    expect(next.doc.name).toBe("Two")
  })

  it("ignores an answer to a save it is no longer waiting for", () => {
    const { state, sent } = saving(run([rename("One")], loaded()))
    const stale = { ...sent }
    expect(editorReducer(state, { type: "SAVE_OK", sent: stale, saved: stale })).toBe(state)
    expect(editorReducer(state, { type: "SAVE_FAILED", sent: stale, message: "x", failure: "server" })).toBe(state)
    expect(editorReducer(state, { type: "SAVE_CONFLICT", sent: stale, theirs: stale })).toBe(state)
  })

  it("shows a failed save until Retry or the next edit, which save again", () => {
    const { state, sent } = saving(run([rename("One")], loaded()))
    const failed = editorReducer(state, { type: "SAVE_FAILED", sent, message: "HTTP 500", failure: "server" }) as Ready
    expect(failed.sync).toEqual({ k: "saveError", message: "HTTP 500", failure: "server" })
    // No timer is pending for a failed save: the debounce does not resend it.
    expect(editorReducer(failed, { type: "DEBOUNCE_ELAPSED" })).toBe(failed)
    expect((editorReducer(failed, { type: "RETRY" }) as Ready).sync).toMatchObject({ k: "saving", against: T0 })
    expect((editorReducer(failed, rename("Two")) as Ready).sync).toEqual({ k: "dirty" })
  })

  it("sends a save that never got an answer again as it was", () => {
    const { state, sent } = saving(run([rename("One")], loaded()))
    const failed = editorReducer(state, { type: "SAVE_FAILED", sent, message: "Failed to fetch", failure: "network" }) as Ready
    expect(failed.sync).toMatchObject({ k: "saveError", failure: "network" })
    const again = editorReducer(failed, { type: "RETRY" }) as Ready
    expect(again.sync).toMatchObject({ k: "saving", against: T0, sent: { name: "One" } })
  })

  describe("a save the server refuses", () => {
    const refuse = (state: Ready, sent: Trip) =>
      editorReducer(state, { type: "SAVE_FAILED", sent, message: "The trip’s dates can’t be saved.", failure: "refused" }) as Ready

    it("is not sent again until the trip changes", () => {
      const { state, sent } = saving(run([rename("One")], loaded()))
      const refused = refuse(state, sent)
      expect(refused.sync).toMatchObject({ k: "saveError", failure: "refused", refused: sent })
      expect(editorReducer(refused, { type: "RETRY" })).toBe(refused)
      expect(editorReducer(refused, { type: "FLUSH" })).toBe(refused)
      const edited = editorReducer(refused, rename("Two")) as Ready
      expect(edited.sync.k).toBe("dirty")
      expect(saving(edited).sent.name).toBe("Two")
    })

    it("tries the edits made while it was out, once", () => {
      const { state, sent } = saving(run([rename("One")], loaded()))
      const queued = editorReducer(state, rename("Two")) as Ready
      expect(refuse(queued, sent).sync).toEqual({ k: "dirty" })
    })
  })

  describe("fitting a save inside the server's limits", () => {
    it("sends the last saved name for a blank one, and keeps the field blank on screen", () => {
      const { state, sent } = saving(run([rename("   ")], loaded()))
      expect(sent.name).toBe("Lisbon Long Weekend")
      expect(state.sync.k === "saving" && state.sync.fitted).toMatch(/A trip needs a name/)
      const saved = editorReducer(state, { type: "SAVE_OK", sent, saved: { ...sent, updatedAt: T1 } }) as Ready
      expect(saved.sync.k).toBe("clean")
      expect(saved.doc.name).toBe("   ")
      expect(saved.base.name).toBe("Lisbon Long Weekend")
    })

    it("cuts text that is too long and says so", () => {
      const long = "x".repeat(400)
      const { state, sent } = saving(run([addTo("day-1", makeItem({ id: "long", title: long, time: "9am" }))], loaded()))
      const item = sent.days[0]!.items.find((i) => i.id === "long")!
      expect(item.title).toHaveLength(300)
      expect(item.time).toBeUndefined()
      expect(state.sync.k === "saving" && state.sync.fitted).toMatch(/the title of “x+…” \(day 1\)/)
    })
  })

  it("flushes a dirty or failed save at once, and leaves a clean one alone", () => {
    const clean = loaded()
    expect(editorReducer(clean, { type: "FLUSH" })).toBe(clean)
    expect((editorReducer(run([rename("x")], clean), { type: "FLUSH" }) as Ready).sync.k).toBe("saving")
  })

  it("names only the fields a save writes, with the base it was made against", () => {
    const patch = savePatch(trip({ description: undefined }), T1)
    expect(patch).toMatchObject({ baseUpdatedAt: T1, description: null, name: "Lisbon Long Weekend" })
    expect(patch).not.toHaveProperty("collaborators")
    expect(patch).not.toHaveProperty("updatedAt")
  })

  it("updates server-owned fields without saving", () => {
    const state = editorReducer(loaded(), { type: "SERVER_FIELDS", patch: { collaborators: [{ userId: "u2", role: "viewer" }] } }) as Ready
    expect(state.sync.k).toBe("clean")
    expect(state.doc.collaborators).toHaveLength(1)
    expect(state.base.collaborators).toHaveLength(1)
  })
})

describe("someone else's changes", () => {
  const added = makeItem({ id: "concierge", title: "Ichiran" })
  const theirsWithAdd = (updatedAt = T1) => trip({ updatedAt, days: [{ id: "day-1", date: "2026-07-10", items: [market, added] }, trip().days[1]!] })

  it("takes a newer copy straight away when nothing is unsaved", () => {
    const theirs = theirsWithAdd()
    const state = editorReducer(loaded(), { type: "EXTERNAL_CHANGE", trip: theirs }) as Ready
    expect(state.doc).toBe(theirs)
    expect(state.sync.k).toBe("clean")
  })

  it("ignores a copy that is not newer (our own save echoing back) or is another trip", () => {
    const state = loaded()
    expect(editorReducer(state, { type: "EXTERNAL_CHANGE", trip: trip({ name: "Echo" }) })).toBe(state)
    expect(editorReducer(state, { type: "EXTERNAL_CHANGE", trip: trip({ id: "porto", updatedAt: T2 }) })).toBe(state)
  })

  it("keeps the concierge's stop and the traveller's unsaved edit", () => {
    const dirty = run([addTo("day-2", makeItem({ id: "mine", title: "Mine" }))], loaded())
    const state = editorReducer(dirty, { type: "EXTERNAL_CHANGE", trip: theirsWithAdd() }) as Ready
    expect(itemIds(state, 0)).toEqual(["market", "concierge"])
    expect(itemIds(state, 1)).toEqual(["museum", "mine"])
    expect(state.base.updatedAt).toBe(T1)
    expect(state.sync.k).toBe("dirty")
    // The next save is made against their copy, so it doesn't erase it.
    expect(saving(state).state.sync).toMatchObject({ against: T1 })
  })

  it("is clean when the traveller's change is already in their copy", () => {
    const theirs = theirsWithAdd()
    const dirty = run([addTo("day-1", added)], loaded())
    const state = editorReducer(dirty, { type: "EXTERNAL_CHANGE", trip: theirs }) as Ready
    expect(state.sync.k).toBe("clean")
    expect(state.doc).toBe(theirs)
  })

  it("asks when both renamed the trip, and keeps working on a newer copy that resolves it", () => {
    const dirty = run([rename("Mine")], loaded())
    const conflicted = editorReducer(dirty, { type: "EXTERNAL_CHANGE", trip: trip({ updatedAt: T1, name: "Theirs" }) }) as Ready
    expect(conflicted.sync).toMatchObject({ k: "conflict", theirs: { name: "Theirs" } })
    expect(conflicted.doc.name).toBe("Mine")
    // Edits stay open while the question is up, and do not start a save.
    const edited = editorReducer(conflicted, addTo("day-1", makeItem({ id: "x" }))) as Ready
    expect(edited.sync.k).toBe("conflict")
    expect(editorReducer(edited, { type: "DEBOUNCE_ELAPSED" })).toBe(edited)
  })

  it("on “Use theirs” drops the traveller's version", () => {
    const conflicted = run([rename("Mine"), { type: "EXTERNAL_CHANGE", trip: trip({ updatedAt: T1, name: "Theirs" }) }], loaded())
    const state = editorReducer(conflicted, { type: "RESOLVE", keep: "theirs" }) as Ready
    expect(state).toMatchObject({ doc: { name: "Theirs" }, sync: { k: "clean" } })
  })

  it("on “Keep mine” writes the traveller's version over theirs", () => {
    const conflicted = run([rename("Mine"), { type: "EXTERNAL_CHANGE", trip: trip({ updatedAt: T1, name: "Theirs" }) }], loaded())
    const state = editorReducer(conflicted, { type: "RESOLVE", keep: "mine" }) as Ready
    expect(state.sync).toMatchObject({ k: "saving", against: T1, sent: { name: "Mine" } })
  })

  it("on “Keep mine” still keeps the stop they added on another day", () => {
    const dirty = run([rename("Mine")], loaded())
    const theirs = { ...theirsWithAdd(), name: "Theirs" }
    const conflicted = editorReducer(dirty, { type: "EXTERNAL_CHANGE", trip: theirs }) as Ready
    expect(conflicted.sync.k).toBe("conflict")
    const state = editorReducer(conflicted, { type: "RESOLVE", keep: "mine" }) as Ready
    expect(state.sync).toMatchObject({ k: "saving", against: T1, sent: { name: "Mine" } })
    expect(itemIds(state, 0)).toEqual(["market", "concierge"])
    expect(state.sync.k === "saving" && state.sync.sent.days[0]!.items.map((i) => i.id)).toEqual(["market", "concierge"])
  })

  it("on “Use theirs” still saves the traveller's edits that clash with nothing", () => {
    const dirty = run([rename("Mine"), addTo("day-2", makeItem({ id: "mine" }))], loaded())
    const conflicted = editorReducer(dirty, { type: "EXTERNAL_CHANGE", trip: trip({ updatedAt: T1, name: "Theirs" }) }) as Ready
    const state = editorReducer(conflicted, { type: "RESOLVE", keep: "theirs" }) as Ready
    expect(state.doc.name).toBe("Theirs")
    expect(itemIds(state, 1)).toEqual(["museum", "mine"])
    expect(state.sync).toMatchObject({ k: "saving", against: T1 })
  })

  it("ignores RESOLVE without a conflict", () => {
    const state = loaded()
    expect(editorReducer(state, { type: "RESOLVE", keep: "mine" })).toBe(state)
  })

  describe("a 409 from the server", () => {
    it("replays the traveller's changes onto the server's copy and sends again", () => {
      const { state, sent } = saving(run([addTo("day-2", makeItem({ id: "mine" }))], loaded()))
      const next = editorReducer(state, { type: "SAVE_CONFLICT", sent, theirs: theirsWithAdd() }) as Ready
      expect(next.sync).toMatchObject({ k: "saving", against: T1, queued: false })
      expect(itemIds(next, 0)).toEqual(["market", "concierge"])
      expect(itemIds(next, 1)).toEqual(["museum", "mine"])
    })

    it("asks when the replay is unsafe", () => {
      const { state, sent } = saving(run([rename("Mine")], loaded()))
      const next = editorReducer(state, { type: "SAVE_CONFLICT", sent, theirs: trip({ updatedAt: T1, name: "Theirs" }) }) as Ready
      expect(next.sync.k).toBe("conflict")
    })

    it("asks rather than loop when the server's copy is no newer than the one we sent against", () => {
      const { state, sent } = saving(run([rename("Mine")], loaded()))
      expect((editorReducer(state, { type: "SAVE_CONFLICT", sent, theirs: trip() }) as Ready).sync.k).toBe("conflict")
    })

    it("resends when their copy already reached us while the save was out", () => {
      const { state, sent } = saving(run([addTo("day-2", makeItem({ id: "mine" }))], loaded()))
      const merged = editorReducer(state, { type: "EXTERNAL_CHANGE", trip: theirsWithAdd() }) as Ready
      expect(merged.sync).toMatchObject({ k: "saving", sent, queued: true })
      expect(itemIds(merged, 0)).toEqual(["market", "concierge"])
      const next = editorReducer(merged, { type: "SAVE_CONFLICT", sent, theirs: theirsWithAdd() }) as Ready
      expect(next.sync).toMatchObject({ k: "saving", against: T1 })
      expect(next.sync.k === "saving" && next.sync.sent).toBe(next.doc)
    })

    it("heals an older server that overwrote the concierge: the merged copy is sent next", () => {
      const { state, sent } = saving(run([addTo("day-2", makeItem({ id: "mine" }))], loaded()))
      const merged = editorReducer(state, { type: "EXTERNAL_CHANGE", trip: theirsWithAdd() }) as Ready
      const next = editorReducer(merged, { type: "SAVE_OK", sent, saved: { ...sent, updatedAt: T2 } }) as Ready
      expect(next.sync).toMatchObject({ k: "saving", against: T2 })
      expect(next.sync.k === "saving" && next.sync.sent.days[0]!.items.map((i) => i.id)).toEqual(["market", "concierge"])
    })
  })
})

describe("AI runs", () => {
  it("lock editing while running, and flush unsaved edits first", () => {
    const state = run([rename("Mine"), { type: "AI_START", run: "trip" }], loaded()) as Ready
    expect(state.ai).toEqual({ k: "running", run: "trip", live: null })
    expect(state.sync.k).toBe("saving")
    expect(canEdit(state)).toBe(false)
    expect(editorReducer(state, rename("Blocked"))).toBe(state)
    expect(editorReducer(state, { type: "UNDO" })).toBe(state)
    expect(editorReducer(state, { type: "AI_START", run: "draft" })).toBe(state)
  })

  it("put their document in place and open the review", () => {
    const fromAi = trip({ updatedAt: T1, name: "Reviewed" })
    const state = run([{ type: "AI_START", run: { day: "day-1" } }, { type: "AI_DONE", trip: fromAi, run: enhancement }], loaded()) as Ready
    expect(state.ai).toEqual({ k: "review", run: enhancement })
    expect(state.doc).toBe(fromAi)
    expect(state.base).toBe(fromAi)
    expect(canEdit(state)).toBe(true)
  })

  it("leave the document alone when they bring back an older copy or none", () => {
    const external = trip({ updatedAt: T2, name: "Newer" })
    const state = run(
      [{ type: "AI_START", run: "trip" }, { type: "EXTERNAL_CHANGE", trip: external }, { type: "AI_DONE", trip: trip({ updatedAt: T1 }), run: null }],
      loaded(),
    ) as Ready
    expect(state.doc).toBe(external)
    expect(state.ai.k).toBe("idle")
  })

  it("ignore an answer when no run is waiting (stopped)", () => {
    const stopped = run([{ type: "AI_START", run: "draft" }, { type: "AI_FAILED" }], loaded())
    expect((stopped as Ready).ai.k).toBe("idle")
    expect(editorReducer(stopped, { type: "AI_DONE", trip: trip({ updatedAt: T1, name: "Late" }), run: null })).toBe(stopped)
  })

  it("apply a review: flush, lock, then back to idle; a failure returns to the review", () => {
    const review = run([{ type: "AI_START", run: "trip" }, { type: "AI_DONE", run: enhancement }], loaded())
    const edited = editorReducer(review, rename("Mine")) as Ready
    const applying = editorReducer(edited, { type: "APPLY" }) as Ready
    expect(applying.ai).toEqual({ k: "applying", run: enhancement })
    expect(applying.sync.k).toBe("saving")
    expect((editorReducer(applying, { type: "AI_FAILED" }) as Ready).ai).toEqual({ k: "review", run: enhancement })
    expect((editorReducer(applying, { type: "AI_DONE", trip: trip({ updatedAt: T1 }), run: null }) as Ready).ai.k).toBe("idle")
  })

  it("only apply or dismiss from a review", () => {
    const state = loaded()
    expect(editorReducer(state, { type: "APPLY" })).toBe(state)
    expect(editorReducer(state, { type: "DISMISS_RUN" })).toBe(state)
    expect(editorReducer(state, { type: "AI_FAILED" })).toBe(state)
    const review = run([{ type: "AI_START", run: "trip" }, { type: "AI_DONE", run: enhancement }], state)
    expect((editorReducer(review, { type: "DISMISS_RUN" }) as Ready).ai.k).toBe("idle")
  })

  it("hold the server's word on a review while it runs, naming what is really under review", () => {
    const queued: EnhancementRun = { ...enhancement, status: "running", queue: { state: "queued", attempt: 0, maxAttempts: 3 } }
    const started = run([{ type: "AI_START", run: { day: "day-1" } }, { type: "AI_PROGRESS", live: queued }], loaded()) as Ready
    // A 409 handed over the whole-trip review already going.
    expect(started.ai).toEqual({ k: "running", run: "trip", live: queued })
    const retrying: EnhancementRun = { ...queued, scope: "day", dayId: "day-2", queue: { state: "queued", attempt: 1, maxAttempts: 3 } }
    expect((editorReducer(started, { type: "AI_PROGRESS", live: retrying }) as Ready).ai).toEqual({ k: "running", run: { day: "day-2" }, live: retrying })
    const done = editorReducer(started, { type: "AI_DONE", run: enhancement }) as Ready
    expect(done.ai).toEqual({ k: "review", run: enhancement })
  })

  it("ignore progress for a draft, or once the wait is over", () => {
    const live: EnhancementRun = { ...enhancement, status: "running", queue: { state: "working", attempt: 1, maxAttempts: 3 } }
    const drafting = run([{ type: "AI_START", run: "draft" }], loaded())
    expect(editorReducer(drafting, { type: "AI_PROGRESS", live })).toBe(drafting)
    const stopped = run([{ type: "AI_START", run: "trip" }, { type: "AI_FAILED" }], loaded())
    expect(editorReducer(stopped, { type: "AI_PROGRESS", live })).toBe(stopped)
  })

  it("take up a review running on the server only when nothing else is going and nothing is unsaved", () => {
    const live: EnhancementRun = { ...enhancement, status: "running", scope: "day", dayId: "day-2", queue: { state: "working", attempt: 1, maxAttempts: 3 } }
    const resumed = editorReducer(loaded(), { type: "AI_RESUME", live }) as Ready
    expect(resumed.ai).toEqual({ k: "running", run: { day: "day-2" }, live })
    expect(resumed.sync.k).toBe("clean")
    expect(canEdit(resumed)).toBe(false)
    expect(canResume(resumed)).toBe(false)
    expect(editorReducer(resumed, { type: "AI_RESUME", live })).toBe(resumed)

    const dirty = run([rename("Mine")], loaded())
    expect(canResume(dirty)).toBe(false)
    expect(editorReducer(dirty, { type: "AI_RESUME", live })).toBe(dirty)
    const reading = run([{ type: "AI_START", run: "trip" }, { type: "AI_DONE", run: enhancement }], loaded())
    expect(editorReducer(reading, { type: "AI_RESUME", live })).toBe(reading)
    const viewer = loaded(trip(), "view")
    expect(editorReducer(viewer, { type: "AI_RESUME", live })).toBe(viewer)

    // It lands like a run started here.
    const landed = editorReducer(resumed, { type: "AI_DONE", trip: trip({ updatedAt: T1, name: "Reviewed" }), run: enhancement }) as Ready
    expect(landed.doc.name).toBe("Reviewed")
    expect(landed.ai).toEqual({ k: "review", run: enhancement })
  })

  it("take a scheduled wishlist idea off the wishlist for good: Undo of an edit to it doesn't bring it back", () => {
    const idea = makeItem({ id: "idea", title: "Sintra" })
    const start = loaded(trip({ ideas: [idea, makeItem({ id: "other", title: "Cascais" })] }))
    const edited = editorReducer(start, {
      type: "EDIT",
      fn: (doc) => ({ ...doc, ideas: doc.ideas!.map((i) => (i.id === "idea" ? { ...i, notes: "Go early" } : i)) }),
      undo: { label: "Edited Sintra" },
    }) as Ready
    const saved = run([{ type: "DEBOUNCE_ELAPSED" }], edited) as Ready
    const sent = saved.sync.k === "saving" ? saved.sync.sent : edited.doc
    const clean = editorReducer(saved, { type: "SAVE_OK", sent, saved: { ...sent, updatedAt: T1 } }) as Ready

    const scheduled = makeItem({ id: "sintra-stop", title: "Sintra" })
    const reviewed: EnhancementRun = {
      ...enhancement,
      suggestions: [{ id: "s1", kind: "add", dayId: "day-1", title: "Sintra", detail: "", confidence: "high", proposedItem: scheduled, fromIdeaId: "idea" }],
      appliedSuggestionIds: ["s1"],
    }
    const fromServer = trip({
      updatedAt: T2,
      ideas: [makeItem({ id: "other", title: "Cascais" })],
      days: [
        { id: "day-1", date: "2026-07-10", items: [market, scheduled] },
        { id: "day-2", date: "2026-07-11", items: [museum] },
      ],
    })
    const landed = run([{ type: "AI_START", run: "trip" }, { type: "AI_DONE", trip: fromServer, run: reviewed }], clean) as Ready
    expect(landed.doc.ideas?.map((i) => i.id)).toEqual(["other"])

    const undone = editorReducer(landed, { type: "UNDO" }) as Ready
    expect(undone.doc.ideas?.map((i) => i.id)).toEqual(["other"])
    expect(itemIds(undone, 0)).toEqual(["market", "sintra-stop"])
    const redone = editorReducer(undone, { type: "REDO" }) as Ready
    expect(redone.doc.ideas?.map((i) => i.id)).toEqual(["other"])
  })

  describe("a review that finished after Stop (no run to tell the editor)", () => {
    const idea = makeItem({ id: "idea", title: "Sintra" })
    const other = makeItem({ id: "other", title: "Cascais" })
    // The server's scheduled stop keeps the idea's id.
    const stop = { ...idea, time: "09:00", status: "needs_review" as const, createdBy: "ai" as const }
    const fromServer = (updatedAt: string) =>
      trip({
        updatedAt,
        ideas: [other],
        days: [
          { id: "day-1", date: "2026-07-10", items: [market, stop] },
          { id: "day-2", date: "2026-07-11", items: [museum] },
        ],
      })
    const editIdea: EditorEvent = {
      type: "EDIT",
      fn: (doc) => ({ ...doc, ideas: doc.ideas!.map((i) => (i.id === "idea" ? { ...i, notes: "Go early" } : i)) }),
      undo: { label: "Edited Sintra" },
    }

    it("an unsaved edit to the idea moves onto the stop when the server's copy arrives", () => {
      const dirty = run([editIdea], loaded(trip({ ideas: [idea, other] })))
      const state = editorReducer(dirty, { type: "EXTERNAL_CHANGE", trip: fromServer(T1) }) as Ready
      expect(state.doc.ideas?.map((i) => i.id)).toEqual(["other"])
      expect(state.doc.days[0]!.items.find((i) => i.id === "idea")).toMatchObject({ notes: "Go early", time: "09:00" })
    })

    it("a save refused as a conflict lands the same way", () => {
      const { state, sent } = saving(run([editIdea], loaded(trip({ ideas: [idea, other] }))))
      const after = editorReducer(state, { type: "SAVE_CONFLICT", sent, theirs: fromServer(T1) }) as Ready
      expect(after.doc.ideas?.map((i) => i.id)).toEqual(["other"])
      expect(after.doc.days[0]!.items.filter((i) => i.id === "idea")).toHaveLength(1)
    })

    it("Undo of the edit does not bring the idea back", () => {
      const edited = run([editIdea], loaded(trip({ ideas: [idea, other] })))
      const { state, sent } = saving(edited)
      const clean = editorReducer(state, { type: "SAVE_OK", sent, saved: { ...sent, updatedAt: T1 } }) as Ready
      const landed = editorReducer(clean, { type: "EXTERNAL_CHANGE", trip: fromServer(T2) }) as Ready
      const undone = editorReducer(landed, { type: "UNDO" }) as Ready
      expect(undone.doc.ideas?.map((i) => i.id)).toEqual(["other"])
      expect(undone.doc.days[0]!.items.filter((i) => i.id === "idea")).toHaveLength(1)
      const redone = editorReducer(undone, { type: "REDO" }) as Ready
      expect(redone.doc.ideas?.map((i) => i.id)).toEqual(["other"])
    })
  })

  it("make “replace my itinerary” undoable", () => {
    const drafted = trip({ updatedAt: T1, days: [{ id: "day-1", date: "2026-07-10", items: [] }, { id: "day-2", date: "2026-07-11", items: [] }] })
    const state = run(
      [{ type: "AI_START", run: "draft" }, { type: "AI_DONE", trip: drafted, run: null, undo: { label: "Replaced", toast: true } }, { type: "UNDO" }],
      loaded(),
    ) as Ready
    expect(itemIds(state, 0)).toEqual(["market"])
    expect(state.sync.k).toBe("dirty")
  })
})

describe("undo and redo", () => {
  it("take a wishlist place back off the day it was moved to, and redo moves it again", () => {
    const idea = makeItem({ id: "idea", title: "Sintra" })
    const start = loaded(trip({ ideas: [idea] }))
    const moved = editorReducer(start, {
      type: "EDIT",
      fn: (doc) => ({
        ...doc,
        ideas: [],
        days: doc.days.map((d) => (d.id === "day-1" ? { ...d, items: [...d.items, idea] } : d)),
      }),
      undo: { label: "Moved Sintra to day 1", toast: true },
    })
    expect(itemIds(moved, 0)).toEqual(["market", "idea"])
    const undone = editorReducer(moved, { type: "UNDO" }) as Ready
    expect(itemIds(undone, 0)).toEqual(["market"])
    expect(undone.doc.ideas?.map((i) => i.id)).toEqual(["idea"])
    const redone = editorReducer(undone, { type: "REDO" }) as Ready
    expect(itemIds(redone, 0)).toEqual(["market", "idea"])
    expect(redone.doc.ideas).toEqual([])
  })

  it("undo a wishlist edit as its own step", () => {
    const later = makeItem({ id: "later", title: "Later" })
    const state = run(
      [addTo("day-1", makeItem({ id: "added" }), { label: "Added", toast: true }), { type: "EDIT", fn: (doc) => ({ ...doc, ideas: [later] }) }],
      loaded(),
    )
    const once = editorReducer(state, { type: "UNDO" }) as Ready
    expect(once.doc.ideas ?? []).toEqual([])
    expect(itemIds(once, 0)).toEqual(["market", "added"])
    const twice = editorReducer(once, { type: "UNDO" }) as Ready
    expect(itemIds(twice, 0)).toEqual(["market"])
  })

  it("steps back and forward through structural edits", () => {
    const a = makeItem({ id: "a" })
    const state = run([addTo("day-1", a, { label: "Added a" }), removeFrom("day-1", "market")], loaded())
    expect(itemIds(state, 0)).toEqual(["a"])
    const once = editorReducer(state, { type: "UNDO" })
    expect(itemIds(once, 0)).toEqual(["market", "a"])
    const twice = editorReducer(once, { type: "UNDO" })
    expect(itemIds(twice, 0)).toEqual(["market"])
    expect(editorReducer(twice, { type: "UNDO" })).toBe(twice)
    const redone = editorReducer(twice, { type: "REDO" })
    expect(itemIds(redone, 0)).toEqual(["market", "a"])
    expect((redone as Ready).sync.k).toBe("dirty")
  })

  it("clears Redo after a new edit", () => {
    const state = run([removeFrom("day-1", "market"), { type: "UNDO" }, addTo("day-2", makeItem({ id: "x" }))], loaded()) as Ready
    expect(state.history.future).toEqual([])
    expect(editorReducer(state, { type: "REDO" })).toBe(state)
  })

  it("folds a run of typing, or of steps sharing a key, into one step", () => {
    const typed = run([rename("L"), rename("Li"), rename("Lis")], loaded()) as Ready
    // A rename doesn't touch the plan, so it isn't an undo step at all.
    expect(typed.history.past).toHaveLength(0)
    const titled = (title: string): EditorEvent => ({ type: "EDIT", fn: (doc) => ({ ...doc, days: doc.days.map((d, i) => (i === 0 ? { ...d, title } : d)) }) })
    const state = run([titled("A"), titled("Ar"), titled("Arr")], loaded()) as Ready
    expect(state.history.past).toHaveLength(1)
    expect(state.history.past[0]!.label).toBeNull()
    const ig = (id: string, n: number) => addTo("day-2", makeItem({ id }), { label: `Added ${n}`, key: "instagram:1", toast: true })
    const imported = run([ig("p1", 1), ig("p2", 2)], loaded()) as Ready
    expect(imported.history.past).toHaveLength(1)
    expect(imported.history.past[0]!.label).toBe("Added 2")
    expect(itemIds(editorReducer(imported, { type: "UNDO" }), 1)).toEqual(["museum"])
  })

  it("keeps what someone else added since when undoing", () => {
    const concierge = makeItem({ id: "concierge" })
    const theirs = trip({ updatedAt: T1, days: [trip().days[0]!, { id: "day-2", date: "2026-07-11", items: [museum, concierge] }] })
    const state = run([removeFrom("day-1", "market"), { type: "EXTERNAL_CHANGE", trip: theirs }, { type: "UNDO" }], loaded())
    expect(itemIds(state, 0)).toEqual(["market"])
    expect(itemIds(state, 1)).toEqual(["museum", "concierge"])
  })

  it("restores the dates with the days (shortening a trip is undoable)", () => {
    const shorten: EditorEvent = {
      type: "EDIT",
      fn: (doc) => ({ ...doc, endDate: "2026-07-10", days: doc.days.slice(0, 1) }),
      undo: { label: "Changed the trip dates", toast: true },
    }
    const state = run([shorten, { type: "UNDO" }], loaded()) as Ready
    expect(state.doc.endDate).toBe("2026-07-11")
    expect(state.doc.days).toHaveLength(2)
  })

  it(`keeps the last ${HISTORY_LIMIT} steps`, () => {
    const events = Array.from({ length: HISTORY_LIMIT + 5 }, (_, i) => addTo("day-1", makeItem({ id: `x${i}` }), { label: `Added ${i}` }))
    const state = run(events, loaded()) as Ready
    expect(state.history.past).toHaveLength(HISTORY_LIMIT)
    expect(state.history.past[0]!.label).toBe("Added 5")
  })
})

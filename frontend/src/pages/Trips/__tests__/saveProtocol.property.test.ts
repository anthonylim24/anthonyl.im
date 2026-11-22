import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { editorReducer, initialEditor, sameContent, savePatch, type Editor, type EditorEvent } from "../editorMachine"
import type { ItineraryItem, Trip } from "../types"
import { makeItem, makeTrip } from "./tripFixtures"

// Property check of the save protocol: the real editor reducer, driven
// through every interleaving fast-check generates with
//   - the traveller editing (stop notes, day titles, new stops, undo / redo),
//   - another writer (a second device, the concierge) saving straight to the server,
//   - the network losing a request, losing an answer, or answering out of order,
//   - the editor hearing of the other copy by a 409, a refetch or a trip-changed event.
// The server is `PATCH /api/trips/:id` reduced to what decides the outcome:
// compare-and-set on `baseUpdatedAt`, 409 with its copy otherwise
// (server/src/routes/trips.ts). The shell is `useTripEditor`'s save effect:
// it sends each save request the machine asks for exactly once.
//
// Run: cd frontend && bunx vitest run src/pages/Trips/__tests__/saveProtocol.property.test.ts
// More runs: SAVE_PROTOCOL_RUNS=20000 (same command).

const RUNS = Number(process.env.SAVE_PROTOCOL_RUNS ?? 5000)
const DAYS = 2
const STOPS = 2

const stamp = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 1000).toISOString()
const stopId = (day: number, stop: number) => `s${day}${stop}`
const dayId = (day: number) => `day-${day}`

function startTrip(): Trip {
  return makeTrip({
    updatedAt: stamp(0),
    days: Array.from({ length: DAYS }, (_, d) => ({
      id: dayId(d),
      date: `2026-07-1${d}`,
      items: Array.from({ length: STOPS }, (_, s) => makeItem({ id: stopId(d, s), title: `Stop ${d}${s}` })),
    })),
  })
}

const editItem = (trip: Trip, id: string, change: Partial<ItineraryItem>): Trip => ({
  ...trip,
  days: trip.days.map((d) => (d.items.some((i) => i.id === id) ? { ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...change } : i)) } : d)),
})
const editDay = (trip: Trip, day: number, title: string): Trip => ({
  ...trip,
  days: trip.days.map((d) => (d.id === dayId(day) ? { ...d, title } : d)),
})
const addItem = (trip: Trip, day: number, item: ItineraryItem): Trip => ({
  ...trip,
  days: trip.days.map((d) => (d.id === dayId(day) ? { ...d, items: [...d.items, item] } : d)),
})

class Server {
  trip = startTrip()
  private clock = 0
  private next() {
    this.clock += 1
    return stamp(this.clock)
  }
  patch(sent: Trip, against: string): { ok: Trip } | { conflict: Trip } {
    if (this.trip.updatedAt !== against) return { conflict: this.trip }
    const patch: Partial<ReturnType<typeof savePatch>> = savePatch(sent, against)
    delete patch.baseUpdatedAt
    const { description, budget, ...fields } = patch
    const defined = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))
    this.trip = {
      ...this.trip,
      ...defined,
      description: description === null ? undefined : (description ?? this.trip.description),
      budget: budget === null ? undefined : (budget ?? this.trip.budget),
      updatedAt: this.next(),
    }
    return { ok: this.trip }
  }
  write(change: (trip: Trip) => Trip) {
    this.trip = { ...change(this.trip), updatedAt: this.next() }
  }
}

/**
 * What happens to one request: `answered` (the server handles it and the
 * answer arrives), `handled` (the server handles it; the answer is still on
 * its way and arrives at a later step, so answers can overtake each other),
 * `requestLost`, `answerLost`.
 */
type Fate = "answered" | "handled" | "requestLost" | "answerLost"
type Step =
  | { k: "mineNotes"; day: number; stop: number }
  | { k: "mineDayTitle"; day: number }
  | { k: "mineAdd"; day: number }
  | { k: "debounce" }
  | { k: "undo" }
  | { k: "redo" }
  | { k: "theirsTitle"; day: number; stop: number }
  | { k: "theirsDayTitle"; day: number }
  | { k: "theirsAdd"; day: number }
  | { k: "hear"; how: "trip-changed" | "refetch" }
  | { k: "network"; pick: number; fate: Fate }
  | { k: "retry" }
  | { k: "resolve"; keep: "mine" | "theirs" }

const day = fc.integer({ min: 0, max: DAYS - 1 })
const stop = fc.integer({ min: 0, max: STOPS - 1 })
interface Mix {
  undo: boolean
  theirs: boolean
  /** The network may lose a request or its answer (not only answer late or out of order). */
  lossy: boolean
}

const stepsArb = (mix: Mix) => fc.array(stepArb(mix), { maxLength: 40 })
const stepArb = ({ undo, theirs, lossy }: Mix): fc.Arbitrary<Step> =>
  fc.oneof(
    { weight: 4, arbitrary: fc.record({ k: fc.constant("mineNotes" as const), day, stop }) },
    { weight: 3, arbitrary: fc.record({ k: fc.constant("mineDayTitle" as const), day }) },
    { weight: 2, arbitrary: fc.record({ k: fc.constant("mineAdd" as const), day }) },
    { weight: 4, arbitrary: fc.constant({ k: "debounce" as const }) },
    { weight: undo ? 2 : 0, arbitrary: fc.constant({ k: "undo" as const }) },
    { weight: undo ? 1 : 0, arbitrary: fc.constant({ k: "redo" as const }) },
    { weight: theirs ? 2 : 0, arbitrary: fc.record({ k: fc.constant("theirsTitle" as const), day, stop }) },
    { weight: theirs ? 2 : 0, arbitrary: fc.record({ k: fc.constant("theirsDayTitle" as const), day }) },
    { weight: theirs ? 1 : 0, arbitrary: fc.record({ k: fc.constant("theirsAdd" as const), day }) },
    { weight: 2, arbitrary: fc.record({ k: fc.constant("hear" as const), how: fc.constantFrom("trip-changed" as const, "refetch" as const) }) },
    {
      weight: 6,
      arbitrary: fc.record({
        k: fc.constant("network" as const),
        pick: fc.nat(3),
        fate: lossy
          ? fc.constantFrom<Fate>("answered", "answered", "handled", "requestLost", "answerLost")
          : fc.constantFrom<Fate>("answered", "answered", "handled"),
      }),
    },
    { weight: 2, arbitrary: fc.constant({ k: "retry" as const }) },
    { weight: 1, arbitrary: fc.record({ k: fc.constant("resolve" as const), keep: fc.constantFrom("mine" as const, "theirs" as const) }) },
  )

/** What each side wrote, to judge the end state against. */
interface Ledger {
  /** Slot → the token the traveller last wrote there. Slots: `<stop>.notes`, `<day>.title`. */
  mine: Map<string, string>
  theirs: Map<string, string>
  /** Stops whose fields the traveller ever changed. */
  mineTouched: Set<string>
  mineAdded: Set<string>
  theirsAdded: Set<string>
  /** The other writer saved something at some point. */
  theirsWrote: boolean
  /** The editor asked "Keep mine / Use theirs" at some point. */
  asked: boolean
  /** The traveller once chose their copy over the traveller's own. */
  choseTheirs: boolean
}

interface InFlight {
  sent: Trip
  against: string
  /** The server's answer, once it has handled the request. */
  result?: { ok: Trip } | { conflict: Trip }
}

class World {
  editor: Editor = initialEditor
  server = new Server()
  inflight: InFlight[] = []
  private lastFor: unknown = null
  private tokens = 0
  ledger: Ledger = {
    mine: new Map(),
    theirs: new Map(),
    mineTouched: new Set(),
    mineAdded: new Set(),
    theirsAdded: new Set(),
    theirsWrote: false,
    asked: false,
    choseTheirs: false,
  }

  constructor() {
    this.dispatch({ type: "LOADED", trip: this.server.trip, access: "owner" })
  }

  private token(side: "m" | "t") {
    this.tokens += 1
    return `${side}${this.tokens}`
  }

  get ready() {
    return this.editor.s === "ready" ? this.editor : null
  }

  dispatch(event: EditorEvent) {
    this.editor = editorReducer(this.editor, event)
    const sync = this.ready?.sync
    // useTripEditor's save effect: every request the machine asks for goes out once.
    if (sync?.k === "saving" && sync !== this.lastFor) {
      this.lastFor = sync
      this.inflight.push({ sent: sync.sent, against: sync.against })
    }
    if (sync?.k === "conflict") this.ledger.asked = true
  }

  private edit(fn: (doc: Trip) => Trip, onApplied: () => void) {
    const before = this.editor
    this.dispatch({ type: "EDIT", fn })
    if (this.editor !== before) onApplied()
  }

  step(step: Step) {
    const l = this.ledger
    switch (step.k) {
      case "mineNotes": {
        const id = stopId(step.day, step.stop)
        const notes = this.token("m")
        return this.edit(
          (doc) => editItem(doc, id, { notes }),
          () => {
            l.mine.set(`${id}.notes`, notes)
            l.mineTouched.add(id)
          },
        )
      }
      case "mineDayTitle": {
        const title = this.token("m")
        return this.edit(
          (doc) => editDay(doc, step.day, title),
          () => l.mine.set(`${dayId(step.day)}.title`, title),
        )
      }
      case "mineAdd": {
        const id = this.token("m")
        return this.edit(
          (doc) => addItem(doc, step.day, makeItem({ id, title: id })),
          () => l.mineAdded.add(id),
        )
      }
      case "debounce":
        return this.dispatch({ type: "DEBOUNCE_ELAPSED" })
      case "undo":
        return this.dispatch({ type: "UNDO" })
      case "redo":
        return this.dispatch({ type: "REDO" })
      case "theirsTitle": {
        const id = stopId(step.day, step.stop)
        const title = this.token("t")
        this.server.write((t) => editItem(t, id, { title }))
        l.theirs.set(`${id}.title`, title)
        l.theirsWrote = true
        return
      }
      case "theirsDayTitle": {
        const title = this.token("t")
        this.server.write((t) => editDay(t, step.day, title))
        l.theirs.set(`${dayId(step.day)}.title`, title)
        l.theirsWrote = true
        return
      }
      case "theirsAdd": {
        const id = this.token("t")
        this.server.write((t) => addItem(t, step.day, makeItem({ id, title: id })))
        l.theirsAdded.add(id)
        l.theirsWrote = true
        return
      }
      case "hear":
        return this.dispatch(
          step.how === "trip-changed"
            ? { type: "EXTERNAL_CHANGE", trip: this.server.trip }
            : { type: "LOADED", trip: this.server.trip, access: "owner" },
        )
      case "network": {
        if (this.inflight.length === 0) return
        const at = step.pick % this.inflight.length
        const req = this.inflight[at]!
        if (step.fate === "handled" && !req.result) {
          req.result = this.server.patch(req.sent, req.against)
          return
        }
        this.inflight.splice(at, 1)
        return this.answer(req, step.fate)
      }
      case "retry":
        return this.dispatch({ type: "RETRY" })
      case "resolve":
        if (this.ready?.sync.k !== "conflict") return
        if (step.keep === "theirs") l.choseTheirs = true
        return this.dispatch({ type: "RESOLVE", keep: step.keep })
    }
  }

  private answer(req: InFlight, fate: Fate) {
    if (fate === "requestLost" && !req.result) {
      return this.dispatch({ type: "SAVE_FAILED", sent: req.sent, message: "offline", failure: "network" })
    }
    const result = req.result ?? this.server.patch(req.sent, req.against)
    if (fate === "answerLost" || fate === "requestLost") {
      return this.dispatch({ type: "SAVE_FAILED", sent: req.sent, message: "offline", failure: "network" })
    }
    return this.dispatch(
      "ok" in result ? { type: "SAVE_OK", sent: req.sent, saved: result.ok } : { type: "SAVE_CONFLICT", sent: req.sent, theirs: result.conflict },
    )
  }

  /**
   * The connection is good from here on: answer, save, retry, and refetch on
   * the next tab return, until nothing is left. A conflict is settled with the
   * traveller's copy.
   */
  drain() {
    for (let i = 0; i < 200; i++) {
      const ready = this.ready
      if (!ready) return
      if (this.inflight.length > 0) this.answer(this.inflight.shift()!, "answered")
      else if (ready.sync.k === "dirty") this.dispatch({ type: "DEBOUNCE_ELAPSED" })
      else if (ready.sync.k === "saveError") this.dispatch({ type: "RETRY" })
      else if (ready.sync.k === "conflict") this.dispatch({ type: "RESOLVE", keep: "mine" })
      else if (this.server.trip.updatedAt > ready.base.updatedAt) this.dispatch({ type: "LOADED", trip: this.server.trip, access: "owner" })
      else return
    }
  }
}

const notesOf = (trip: Trip, id: string) => trip.days.flatMap((d) => d.items).find((i) => i.id === id)?.notes
const titleOf = (trip: Trip, id: string) => trip.days.flatMap((d) => d.items).find((i) => i.id === id)?.title
const dayTitleOf = (trip: Trip, id: string) => trip.days.find((d) => d.id === id)?.title
const countOf = (trip: Trip, id: string) => trip.days.flatMap((d) => d.items).filter((i) => i.id === id).length

function play(steps: Step[]): World {
  const world = new World()
  for (const step of steps) world.step(step)
  world.drain()
  return world
}

function settles(world: World) {
  const ready = world.ready
  expect(ready, "the editor is open").not.toBeNull()
  expect(ready!.sync.k, "once the network is good, every edit ends saved").toBe("clean")
  expect(world.inflight, "no save left unanswered").toEqual([])
  expect(sameContent(ready!.doc, world.server.trip), "the page shows what the server stores").toBe(true)
}

/** A change the other writer saved, to a stop or day title the traveller never wrote, is never overwritten. */
function keepsTheirs(world: World) {
  const { ledger, server } = world
  for (const [slot, token] of ledger.theirs) {
    const [id, field] = slot.split(".") as [string, string]
    if (field === "title" && id.startsWith("s")) {
      if (ledger.mineTouched.has(id)) continue
      expect(titleOf(server.trip, id), `their title on ${id}`).toBe(token)
    } else {
      if (ledger.mine.has(slot)) continue
      expect(dayTitleOf(server.trip, id), `their title on ${id}`).toBe(token)
    }
  }
  for (const id of ledger.theirsAdded) expect(countOf(server.trip, id), `their stop ${id}, once`).toBe(1)
}

/** Every edit the traveller made is on the server, unless the other writer wrote the same slot. */
function keepsMine(world: World) {
  const { ledger, server } = world
  for (const [slot, token] of ledger.mine) {
    const [id, field] = slot.split(".") as [string, string]
    const stored = field === "notes" ? notesOf(server.trip, id) : dayTitleOf(server.trip, id)
    const theirs = ledger.theirs.get(slot)
    if (theirs === undefined) expect(stored, `my ${field} on ${id}`).toBe(token)
    else expect([token, theirs], `${field} on ${id} is one side's latest`).toContain(stored)
  }
  for (const id of ledger.mineAdded) expect(countOf(server.trip, id), `my stop ${id}, once`).toBe(1)
}

// Shrunk counterexamples the property found once; each runs first, every time.
const typedTwiceWhileSaving: Step[] = [
  { k: "mineDayTitle", day: 0 },
  { k: "debounce" },
  { k: "mineDayTitle", day: 0 },
  { k: "network", pick: 1, fate: "handled" },
]
const answerLostThenTyped: Step[] = [
  { k: "mineDayTitle", day: 0 },
  { k: "debounce" },
  { k: "network", pick: 0, fate: "answerLost" },
  { k: "mineDayTitle", day: 0 },
]
const undoAcrossTheirCopy: Step[] = [
  { k: "theirsTitle", day: 0, stop: 1 },
  { k: "mineNotes", day: 0, stop: 0 },
  { k: "hear", how: "trip-changed" },
  { k: "mineDayTitle", day: 0 },
  { k: "undo" },
]

describe("save protocol (property)", () => {
  const params = (...examples: Step[][]) => ({ numRuns: RUNS, examples: examples.map((steps): [Step[]] => [steps]) })

  // DEFECT: an edit while a save is out sends that save twice; when the copy
  // answers 409 before its twin's 200 arrives, the traveller is asked to
  // choose between two of their own versions.
  it.fails("a traveller alone is never asked to choose between two copies", () => {
    fc.assert(
      fc.property(stepsArb({ undo: true, theirs: false, lossy: false }), (steps) => {
        const world = play(steps)
        expect(world.ledger.asked, "no Keep mine / Use theirs prompt").toBe(false)
        settles(world)
      }),
      params(typedTwiceWhileSaving),
    )
  })

  // DEFECT: a save that landed but whose answer was lost comes back as a 409
  // on the retry, and the traveller's newer typing clashes with it.
  it.fails("a traveller alone is never asked to choose, even when a save's answer is lost", () => {
    fc.assert(
      fc.property(stepsArb({ undo: true, theirs: false, lossy: true }), (steps) => {
        const world = play(steps)
        expect(world.ledger.asked, "no Keep mine / Use theirs prompt").toBe(false)
        settles(world)
      }),
      params(answerLostThenTyped),
    )
  })

  it("every edit saves and no one else's change is lost", () => {
    fc.assert(
      fc.property(stepsArb({ undo: false, theirs: true, lossy: true }), (steps) => {
        const world = play(steps)
        settles(world)
        keepsTheirs(world)
        if (!world.ledger.choseTheirs) keepsMine(world)
      }),
      params(typedTwiceWhileSaving, answerLostThenTyped, undoAcrossTheirCopy.filter((s) => s.k !== "undo")),
    )
  })

  // DEFECT: typing coalesces into one undo step across a merge of someone
  // else's copy, so undoing it also reverts their change.
  it.fails("undo and redo never take back someone else's change", () => {
    fc.assert(
      fc.property(stepsArb({ undo: true, theirs: true, lossy: true }), (steps) => {
        const world = play(steps)
        settles(world)
        keepsTheirs(world)
      }),
      params(undoAcrossTheirCopy),
    )
  })
})

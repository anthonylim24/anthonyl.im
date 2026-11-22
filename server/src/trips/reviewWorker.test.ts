import { afterEach, describe, expect, test } from "bun:test"
import { createReviewWorker, type ReviewWorker, type ReviewWorkerDeps, type RunReview } from "./reviewWorker"
import { MemoryTripStore } from "./store"
import {
  emptyDays,
  finishRun,
  RUN_FAILED_REASON,
  type CompleteEnhancementRun,
  type EnhancementRun,
  type FailedEnhancementRun,
  type RunningEnhancementRun,
  type Trip,
} from "./types"

// The store runs on a fake clock (`advance`), so leases lapse and retries
// fall due on command. Timers the worker sets itself (heartbeat, deadline)
// are real but tiny where a test needs them.

const T0 = Date.parse("2026-11-21T09:00:00.000Z")
const LEASE_MS = 1_000

function makeTrip(id: string): Trip {
  return {
    id,
    ownerId: "user-1",
    name: "Tokyo",
    destinations: ["Tokyo"],
    startDate: "2026-07-10",
    endDate: "2026-07-11",
    timezone: "Asia/Tokyo",
    status: "draft",
    tags: [],
    collaborators: [],
    days: emptyDays("2026-07-10", "2026-07-11"),
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  }
}

/** What `enhanceTrip` returns for a review that adds one place to day 1. */
function reviewAdding(trip: Trip, place: string): CompleteEnhancementRun {
  return finishRun(
    {
      id: "run-minted-by-the-review",
      tripId: trip.id,
      scope: "trip",
      createdAt: new Date().toISOString(),
      appliedSuggestionIds: [],
      suggestions: [
        {
          id: `sug-${place}`,
          kind: "add",
          dayId: "day-1",
          title: `Add ${place}`,
          detail: "No lunch on day 1.",
          confidence: "high",
          proposedItem: {
            id: `it-${place}`,
            kind: "place",
            title: place,
            status: "needs_review",
            createdBy: "ai",
            location: { name: place, lat: 35.66, lng: 139.7, category: "restaurant", source: "ai" },
          },
        },
      ],
    },
    { status: "complete", outcome: "added_places", outcomeReason: "Day 1 had no lunch." },
  )
}

async function setup(tripIds: string[] = ["trip-1"], maxAttempts = 3) {
  let clock = T0
  const store = new MemoryTripStore(() => clock)
  const runIds: string[] = []
  for (const tripId of tripIds) {
    await store.create(makeTrip(tripId))
    const pending: RunningEnhancementRun = {
      id: `run-${tripId}`,
      tripId,
      scope: "trip",
      status: "running",
      suggestions: [],
      appliedSuggestionIds: [],
      createdAt: new Date(T0).toISOString(),
    }
    const queued = await store.enqueueReview(pending, { scope: "trip" }, maxAttempts)
    if (!queued.inserted) throw new Error("not queued")
    runIds.push(pending.id)
  }
  return {
    store,
    tripId: tripIds[0]!,
    runId: runIds[0]!,
    runIds,
    advance: (ms: number) => {
      clock += ms
    },
    run: async (runId = runIds[0]!) => (await store.getRun(runId.replace(/^run-/, ""), runId)) as EnhancementRun,
    titles: async (tripId = tripIds[0]!) => (await store.get(tripId))!.days[0]!.items.map((i) => i.title),
  }
}

const workers: ReviewWorker[] = []
afterEach(async () => {
  for (const w of workers.splice(0)) await w.drain(0)
})

function worker(store: MemoryTripStore, runReview: RunReview, overrides: Partial<ReviewWorkerDeps> = {}) {
  const lines: string[] = []
  const w = createReviewWorker({
    store,
    workerId: `worker-${workers.length + 1}`,
    runReview,
    leaseMs: LEASE_MS,
    heartbeatMs: 60_000,
    attemptDeadlineMs: 60_000,
    backoffMs: [1_000],
    random: () => 0.5,
    log: (line) => lines.push(line),
    ...overrides,
  })
  workers.push(w)
  return { w, lines }
}

async function until(check: () => boolean | Promise<boolean>, what: string) {
  for (let i = 0; i < 500; i++) {
    if (await check()) return
    await Bun.sleep(1)
  }
  throw new Error(`timed out waiting for ${what}`)
}

const idle = (w: ReviewWorker) => until(() => w.inflight() === 0, "the worker to go idle")

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/** A review that runs until its signal aborts it, as `enhanceTrip` does. */
const untilAborted: RunReview = (_trip, _request, signal) =>
  new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))

/** A review that never answers and ignores its signal: a hung call, or a dead process. */
const never: RunReview = () => new Promise(() => {})

describe("review worker: one attempt", () => {
  test("claims a queued run, adds its places to the trip, and saves run and trip together", async () => {
    const { store, runId, tripId, run, titles } = await setup()
    const { w, lines } = worker(store, async (trip) => reviewAdding(trip, "Ichiran"))
    w.kick(runId)
    await idle(w)

    expect(await run()).toMatchObject({
      id: runId,
      createdAt: new Date(T0).toISOString(),
      status: "complete",
      outcome: "added_places",
      appliedSuggestionIds: ["sug-Ichiran"],
      queue: { state: "done", attempt: 1, maxAttempts: 3 },
    })
    expect(await titles()).toEqual(["Ichiran"])
    expect((await store.get(tripId))!.updatedAt > "2026-11-01T00:00:00.000Z").toBe(true)
    expect(lines).toEqual([
      "[trips/review] run=run-trip-1 trip=trip-1 attempt=1/3 start",
      expect.stringMatching(/^\[trips\/review\] run=run-trip-1 trip=trip-1 attempt=1\/3 complete, 1 added \d+ms$/),
    ])
  })

  test("a returned failed run is final: saved as is, never retried", async () => {
    const { store, runId, advance, run } = await setup()
    let calls = 0
    const { w } = worker(store, async (trip) => {
      calls++
      return finishRun(
        { id: "x", tripId: trip.id, scope: "day", dayId: "day-9", suggestions: [], appliedSuggestionIds: [], createdAt: "" },
        { status: "error", error: "day not found", outcomeReason: "That day is not on this trip, so nothing was added." },
      )
    })
    w.kick(runId)
    await idle(w)
    expect(await run()).toMatchObject({
      id: runId,
      status: "error",
      error: "day not found",
      outcomeReason: "That day is not on this trip, so nothing was added.",
      queue: { state: "done", attempt: 1 },
    })
    advance(60_000)
    await w.sweep()
    await idle(w)
    expect(calls).toBe(1)
  })

  test("a thrown error is retried after a jittered backoff, then succeeds", async () => {
    const { store, runId, advance, run, titles } = await setup()
    let calls = 0
    const { w } = worker(
      store,
      async (trip) => {
        calls++
        if (calls === 1) throw new Error("The AI service is busy. Try again in a minute.")
        return reviewAdding(trip, "Ichiran")
      },
      { backoffMs: [1_000, 8_000], random: () => 0 },
    )
    w.kick(runId)
    await idle(w)
    // Backoff 1 s for the first retry, jittered by 0.5 (random 0).
    expect(await run()).toMatchObject({
      status: "running",
      queue: {
        state: "queued",
        attempt: 1,
        lastError: "The AI service is busy. Try again in a minute.",
        nextAttemptAt: new Date(T0 + 500).toISOString(),
      },
    })

    await w.sweep()
    expect(w.inflight()).toBe(0) // not due yet
    advance(500)
    await w.sweep()
    await idle(w)
    expect(calls).toBe(2)
    expect(await run()).toMatchObject({ status: "complete", queue: { state: "done", attempt: 2 } })
    expect(await titles()).toEqual(["Ichiran"])
  })

  test("a thrown error the classifier calls permanent fails the run at once", async () => {
    const { store, runId, run } = await setup()
    const { w } = worker(
      store,
      async () => {
        throw new Error("This trip is too long to review in one go.")
      },
      { isRetryable: () => false },
    )
    w.kick(runId)
    await idle(w)
    expect(await run()).toMatchObject({
      status: "error",
      error: "This trip is too long to review in one go.",
      outcomeReason: RUN_FAILED_REASON,
      queue: { state: "done", attempt: 1 },
    })
  })

  test("the last attempt's error is the run's error", async () => {
    const { store, runId, advance, run } = await setup(["trip-1"], 2)
    const { w } = worker(store, async () => {
      throw new Error("The AI service is down.")
    })
    w.kick(runId)
    await idle(w)
    advance(1_000)
    await w.sweep()
    await idle(w)
    expect(await run()).toMatchObject({
      status: "error",
      error: "The AI service is down.",
      outcome: "no_adds_possible",
      queue: { state: "done", attempt: 2, maxAttempts: 2 },
    })
  })

  test("a review past its deadline is stopped and retried, even one that ignores its signal", async () => {
    const { store, runId, run } = await setup()
    let signal: AbortSignal | undefined
    const { w } = worker(
      store,
      (_trip, _request, s) => {
        signal = s
        return new Promise(() => {})
      },
      { attemptDeadlineMs: 10 },
    )
    w.kick(runId)
    await idle(w)
    expect(signal?.aborted).toBe(true)
    expect(await run()).toMatchObject({
      status: "running",
      queue: { state: "queued", attempt: 1, lastError: "The AI review took too long." },
    })
  })

  test("a trip that is gone fails the run for good, without asking the model", async () => {
    const { store, runId, run } = await setup()
    store.get = async () => null
    let calls = 0
    const { w } = worker(store, async (trip) => {
      calls++
      return reviewAdding(trip, "Ichiran")
    })
    w.kick(runId)
    await idle(w)
    expect(calls).toBe(0)
    expect(await run()).toMatchObject({ status: "error", error: "This trip was deleted.", queue: { state: "done", attempt: 1 } })
  })
})

describe("review worker: saving onto a trip that moved on", () => {
  /** Someone saves the trip just before each of the worker's first `times` saves. */
  function editBeforeSave(store: MemoryTripStore, tripId: string, times: number) {
    const complete = store.completeReview.bind(store)
    let saves = 0
    store.completeReview = async (claim, run, tripWrite) => {
      saves++
      if (saves <= times) {
        const trip = (await store.get(tripId))!
        await store.update({ ...trip, name: `Tokyo (edit ${saves})`, updatedAt: new Date(Date.parse(trip.updatedAt) + 1).toISOString() })
      }
      return complete(claim, run, tripWrite)
    }
    return () => saves
  }

  test("applies the review again onto the newer trip, keeping the other edit", async () => {
    const { store, runId, tripId, run, titles } = await setup()
    const saves = editBeforeSave(store, tripId, 1)
    const { w } = worker(store, async (trip) => reviewAdding(trip, "Ichiran"))
    w.kick(runId)
    await idle(w)
    expect(saves()).toBe(2)
    expect((await store.get(tripId))!.name).toBe("Tokyo (edit 1)")
    expect(await titles()).toEqual(["Ichiran"])
    expect(await run()).toMatchObject({ status: "complete", appliedSuggestionIds: ["sug-Ichiran"] })
  })

  test("a trip that keeps changing is given up on after five saves, and the review retried later", async () => {
    const { store, runId, tripId, run, titles } = await setup()
    const saves = editBeforeSave(store, tripId, Infinity)
    const { w } = worker(store, async (trip) => reviewAdding(trip, "Ichiran"))
    w.kick(runId)
    await idle(w)
    expect(saves()).toBe(5)
    expect(await titles()).toEqual([])
    expect(await run()).toMatchObject({
      status: "running",
      queue: { state: "queued", attempt: 1, lastError: expect.stringMatching(/kept changing/) },
    })
  })
})

describe("review worker: restarts, leases and fencing", () => {
  test("a worker that dies mid-review: once its lease lapses, another finishes the run", async () => {
    const { store, runId, advance, run, titles } = await setup()
    const { w: dead } = worker(store, never)
    dead.kick(runId)
    await until(async () => (await run()).queue?.state === "working", "the first claim")

    const { w: next } = worker(store, async (trip) => reviewAdding(trip, "Ichiran"))
    await next.sweep()
    expect(next.inflight()).toBe(0) // the lease still holds
    advance(LEASE_MS + 1)
    await next.sweep()
    await idle(next)
    expect(await run()).toMatchObject({ status: "complete", queue: { state: "done", attempt: 2 } })
    expect(await titles()).toEqual(["Ichiran"])
  })

  test("a lapsed worker's late answer writes nothing", async () => {
    const { store, runId, advance, run, titles } = await setup()
    const late = deferred<CompleteEnhancementRun>()
    const { w: slow, lines } = worker(store, () => late.promise)
    slow.kick(runId)
    await until(async () => (await run()).queue?.state === "working", "the first claim")

    advance(LEASE_MS + 1)
    const { w: next } = worker(store, async (trip) => reviewAdding(trip, "Ichiran"))
    await next.sweep()
    await idle(next)

    late.resolve(reviewAdding((await store.get("trip-1"))!, "Afuri"))
    await idle(slow)
    expect(await titles()).toEqual(["Ichiran"])
    expect(await run()).toMatchObject({ status: "complete", appliedSuggestionIds: ["sug-Ichiran"], queue: { attempt: 2 } })
    expect(lines.at(-1)).toMatch(/attempt=1\/3 lost/)
  })

  test("a heartbeat that finds the claim taken stops the attempt and writes nothing", async () => {
    const { store, runId, advance, run } = await setup()
    let signal: AbortSignal | undefined
    const { w: first, lines } = worker(
      store,
      (_trip, _request, s) => {
        signal = s
        return new Promise(() => {})
      },
      { heartbeatMs: 5 },
    )
    first.kick(runId)
    await until(async () => (await run()).queue?.state === "working", "the first claim")

    // The clock jumps past the lease and another worker claims before the
    // next beat (both in this tick).
    advance(LEASE_MS + 1)
    const { w: second } = worker(store, untilAborted)
    await second.sweep()
    await idle(first)
    expect(signal?.aborted).toBe(true)
    expect(lines.at(-1)).toMatch(/attempt=1\/3 lost/)
    expect(await run()).toMatchObject({ status: "running", queue: { state: "working", attempt: 2 } })
  })

  test("drain hands the run back without spending its attempt", async () => {
    const { store, runId, run } = await setup()
    let signal: AbortSignal | undefined
    const { w: leaving } = worker(store, (trip, request, s) => {
      signal = s
      return untilAborted(trip, request, s)
    })
    leaving.kick(runId)
    await until(async () => (await run()).queue?.state === "working", "the claim")

    await leaving.drain(1_000)
    expect(signal?.aborted).toBe(true)
    expect(leaving.inflight()).toBe(0)
    expect(await run()).toMatchObject({ status: "running", queue: { state: "queued", attempt: 0 } })
    leaving.kick(runId)
    expect(leaving.inflight()).toBe(0) // a drained worker claims nothing

    const { w: next } = worker(store, async (trip) => reviewAdding(trip, "Ichiran"))
    await next.sweep()
    await idle(next)
    expect(await run()).toMatchObject({ status: "complete", queue: { state: "done", attempt: 1 } })
  })
})

describe("review worker: draining", () => {
  test("a claim that comes back after drain began is handed back before drain returns", async () => {
    const { store, runId, run } = await setup()
    const claim = store.claimReview.bind(store)
    const slowNetwork = deferred<void>()
    store.claimReview = async (...args) => {
      const claimed = await claim(...args)
      await slowNetwork.promise
      return claimed
    }
    const { w } = worker(store, untilAborted)
    w.kick(runId)
    const draining = w.drain(1_000)
    slowNetwork.resolve()
    await draining
    expect(await run()).toMatchObject({ status: "running", queue: { state: "queued", attempt: 0 } })
  })
})

describe("review worker: slots", () => {
  test("overlapping sweeps and kicks never take more than the free slots; a kicked run takes the next free one", async () => {
    const { store, runIds } = await setup(["trip-1", "trip-2", "trip-3"])
    const reviews = new Map<string, ReturnType<typeof deferred<CompleteEnhancementRun | FailedEnhancementRun>>>()
    const { w } = worker(
      store,
      (trip) => {
        const answer = deferred<CompleteEnhancementRun | FailedEnhancementRun>()
        reviews.set(trip.id, answer)
        return answer.promise
      },
      { concurrency: 2 },
    )
    // Kicks land while the sweep's claim is still in flight.
    const sweeps = Promise.all([w.sweep(), w.sweep()])
    w.kick(runIds[2])
    w.kick(runIds[1])
    w.kick()
    await sweeps
    expect(w.inflight()).toBe(2)
    await until(() => reviews.size === 2, "two reviews")
    expect([...reviews.keys()].sort()).toEqual(["trip-1", "trip-3"])
    expect((await store.getRun("trip-2", "run-trip-2"))?.queue?.state).toBe("queued")

    reviews.get("trip-1")!.resolve(reviewAdding((await store.get("trip-1"))!, "Ichiran"))
    await until(() => reviews.has("trip-2"), "the kicked run to take the freed slot")
    expect(w.inflight()).toBe(2)
  })

  test("a requeued run is kicked again once due, with no sweep", async () => {
    // Real clock: the retry kick is a real timer.
    const store = new MemoryTripStore()
    await store.create(makeTrip("trip-1"))
    const pending: RunningEnhancementRun = {
      id: "run-1",
      tripId: "trip-1",
      scope: "trip",
      status: "running",
      suggestions: [],
      appliedSuggestionIds: [],
      createdAt: new Date().toISOString(),
    }
    await store.enqueueReview(pending, { scope: "trip" }, 3)
    let calls = 0
    const { w } = worker(
      store,
      async (trip) => {
        calls++
        if (calls === 1) throw new Error("The AI service is busy.")
        return reviewAdding(trip, "Ichiran")
      },
      { backoffMs: [0] },
    )
    w.kick("run-1")
    await until(async () => (await store.getRun("trip-1", "run-1"))?.status === "complete", "the retry to finish")
    expect(calls).toBe(2)
  })

  test("a store that cannot claim is reported once, not on every sweep", async () => {
    const { store } = await setup()
    store.claimReview = async () => {
      throw new Error("not implemented")
    }
    const { w, lines } = worker(store, never)
    await w.sweep()
    await w.sweep()
    await w.sweep()
    expect(lines).toEqual(["[trips/review] claim failed: not implemented"])
    expect(w.inflight()).toBe(0)
  })
})

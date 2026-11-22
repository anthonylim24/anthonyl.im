import { describe, expect, test } from "bun:test"
import { createSupabaseClient, type SupabaseClient } from "../igPlaces/supabase"
import { isNotProvisionedError, MemoryTripStore, type ReviewClaim, SupabaseTripStore } from "./store"
import { finishRun, QUEUED_RUN_MAX_MS, RUN_FAILED_REASON, type RunningEnhancementRun, type Trip } from "./types"

const T0 = Date.parse("2026-11-21T10:00:00.000Z")
const iso = (ms: number) => new Date(ms).toISOString()
const LEASE = 90_000

function trip(id: string, updatedAt = iso(T0)): Trip {
  return {
    id,
    ownerId: "u",
    name: id,
    destinations: ["Tokyo"],
    startDate: "2026-07-10",
    endDate: "2026-07-10",
    timezone: "Asia/Tokyo",
    status: "draft",
    tags: [],
    collaborators: [],
    days: [],
    createdAt: iso(T0),
    updatedAt,
  }
}

function pending(id: string, tripId = "t1"): RunningEnhancementRun {
  return { id, tripId, scope: "trip", status: "running", suggestions: [], appliedSuggestionIds: [], createdAt: iso(T0) }
}

const failedDoc = (claim: ReviewClaim, error: string) => finishRun(claim.run, { status: "error", error })
const completeDoc = (claim: ReviewClaim) =>
  finishRun(claim.run, { status: "complete", outcome: "no_adds_needed", outcomeReason: "Looks good." })

/** A memory store on a clock the test moves. */
function queueAt() {
  const clock = { now: T0 }
  const store = new MemoryTripStore(() => clock.now)
  return { store, clock }
}

async function claimed(store: MemoryTripStore, worker = "w1"): Promise<ReviewClaim> {
  const claim = await store.claimReview(worker, LEASE)
  if (!claim) throw new Error("expected a claim")
  return claim
}

describe("MemoryTripStore review queue", () => {
  test("enqueue keeps one live review per trip and hands back the live one", async () => {
    const { store } = queueAt()
    const first = await store.enqueueReview(pending("r1"), { scope: "trip" }, 3)
    expect(first).toMatchObject({ inserted: true, run: { id: "r1" } })

    const again = await store.enqueueReview(pending("r2"), { scope: "trip" }, 3)
    expect(again).toMatchObject({ inserted: false, live: { id: "r1" } })
    expect(await store.getRun("t1", "r2")).toBeNull()

    expect(await store.enqueueReview(pending("r3", "t2"), { scope: "trip" }, 3)).toMatchObject({ inserted: true })

    // Once the live one is done, the trip can queue another.
    await store.create(trip("t1"))
    const claim = await store.claimReview("w1", LEASE, "r1")
    if (!claim) throw new Error("expected r1")
    expect(await store.completeReview(claim, completeDoc(claim), null)).toBe("ok")
    expect(await store.enqueueReview(pending("r4"), { scope: "trip" }, 3)).toMatchObject({ inserted: true })
  })

  test("a live review no worker finished in QUEUED_RUN_MAX_MS fails and stops blocking new ones", async () => {
    const { store, clock } = queueAt()
    await store.enqueueReview(pending("r1"), { scope: "trip" }, 3)
    clock.now += QUEUED_RUN_MAX_MS - 1
    expect(await store.enqueueReview(pending("r2"), { scope: "trip" }, 3)).toMatchObject({ inserted: false, live: { id: "r1" } })

    clock.now += 1
    expect(await store.enqueueReview(pending("r3"), { scope: "trip" }, 3)).toMatchObject({ inserted: true, run: { id: "r3" } })
    expect(await store.getRun("t1", "r1")).toMatchObject({ status: "error", queue: { state: "done" } })
  })

  test("doc.queue mirrors each step on the stored run", async () => {
    const { store, clock } = queueAt()
    const { run } = (await store.enqueueReview(pending("r1"), { scope: "day", dayId: "d1" }, 3)) as {
      run: RunningEnhancementRun
    }
    expect(run.queue).toEqual({ state: "queued", attempt: 0, maxAttempts: 3, nextAttemptAt: iso(T0) })
    expect((await store.getRun("t1", "r1"))?.queue).toEqual(run.queue)

    const claim = await claimed(store)
    expect(claim).toMatchObject({ request: { scope: "day", dayId: "d1" }, workerId: "w1", attempt: 1, maxAttempts: 3 })
    expect(claim.run.queue).toEqual({ state: "working", attempt: 1, maxAttempts: 3 })
    expect((await store.listRuns("t1"))[0]?.queue).toEqual({ state: "working", attempt: 1, maxAttempts: 3 })

    clock.now += 1_000
    expect(await store.failReview(claim, "model timed out", 5_000, failedDoc(claim, "x"))).toBe("requeued")
    expect((await store.getRun("t1", "r1"))?.queue).toEqual({
      state: "queued",
      attempt: 1,
      maxAttempts: 3,
      nextAttemptAt: iso(T0 + 6_000),
      lastError: "model timed out",
    })
  })

  test("claim waits for run_after", async () => {
    const { store, clock } = queueAt()
    await store.enqueueReview(pending("r1"), { scope: "trip" }, 3)
    const first = await claimed(store)
    expect(await store.failReview(first, "boom", 5_000, failedDoc(first, "boom"))).toBe("requeued")

    expect(await store.claimReview("w1", LEASE)).toBeNull()
    clock.now += 4_999
    expect(await store.claimReview("w1", LEASE)).toBeNull()
    clock.now += 1
    expect((await store.claimReview("w1", LEASE))?.attempt).toBe(2)
  })

  test("claim with a run id takes only that run", async () => {
    const { store } = queueAt()
    await store.enqueueReview(pending("r1"), { scope: "trip" }, 3)
    await store.enqueueReview(pending("r2", "t2"), { scope: "trip" }, 3)
    expect((await store.claimReview("w1", LEASE, "r2"))?.run.id).toBe("r2")
    expect(await store.claimReview("w1", LEASE, "r2")).toBeNull()
    expect(await store.claimReview("w1", LEASE, "nope")).toBeNull()
  })

  test("a lapsed lease is claimed again and the old claim can no longer write", async () => {
    const { store, clock } = queueAt()
    await store.create(trip("t1"))
    await store.enqueueReview(pending("r1"), { scope: "trip" }, 3)
    const stale = await claimed(store, "w1")

    clock.now += LEASE
    expect(await store.claimReview("w2", LEASE)).toBeNull() // the lease has not lapsed yet
    clock.now += 1
    const fresh = await claimed(store, "w2")
    expect(fresh.attempt).toBe(2)

    expect(await store.heartbeatReview(stale, LEASE)).toBe(false)
    expect(await store.completeReview(stale, completeDoc(stale), { trip: trip("t1"), expectedUpdatedAt: iso(T0) })).toBe(
      "lost",
    )
    expect(await store.failReview(stale, "late", 5_000, failedDoc(stale, "late"))).toBe("lost")
    await store.releaseReview(stale)
    expect((await store.getRun("t1", "r1"))?.queue).toEqual({ state: "working", attempt: 2, maxAttempts: 3 })

    // The same worker id coming back after its lease lapsed is fenced by the attempt.
    const sameWorker = { ...stale, workerId: "w2" }
    expect(await store.heartbeatReview(sameWorker, LEASE)).toBe(false)
    expect(await store.heartbeatReview(fresh, LEASE)).toBe(true)
  })

  test("a heartbeat keeps the lease from lapsing", async () => {
    const { store, clock } = queueAt()
    await store.enqueueReview(pending("r1"), { scope: "trip" }, 3)
    const claim = await claimed(store)
    clock.now += LEASE - 1
    expect(await store.heartbeatReview(claim, LEASE)).toBe(true)
    clock.now += LEASE - 1
    expect(await store.claimReview("w2", LEASE)).toBeNull()
  })

  test("fail requeues until the attempts run out, then fails the run", async () => {
    const { store } = queueAt()
    await store.enqueueReview(pending("r1"), { scope: "trip" }, 3)
    for (const attempt of [1, 2]) {
      const claim = await claimed(store)
      expect(claim.attempt).toBe(attempt)
      expect(await store.failReview(claim, `boom ${attempt}`, 0, failedDoc(claim, "x"))).toBe("requeued")
    }
    const last = await claimed(store)
    expect(last.attempt).toBe(3)
    expect(await store.failReview(last, "boom 3", 0, failedDoc(last, "Gemini gave up"))).toBe("failed")

    const run = await store.getRun("t1", "r1")
    expect(run).toMatchObject({ status: "error", error: "Gemini gave up", outcome: "no_adds_possible" })
    expect(run?.queue).toEqual({ state: "done", attempt: 3, maxAttempts: 3, lastError: "boom 3" })
    expect(await store.claimReview("w1", LEASE)).toBeNull()
  })

  test("fail without a retry fails at once, attempts left or not", async () => {
    const { store } = queueAt()
    await store.enqueueReview(pending("r1"), { scope: "trip" }, 3)
    const claim = await claimed(store)
    expect(await store.failReview(claim, "bad request", null, failedDoc(claim, "bad request"))).toBe("failed")
    expect((await store.getRun("t1", "r1"))?.queue).toEqual({
      state: "done",
      attempt: 1,
      maxAttempts: 3,
      lastError: "bad request",
    })
  })

  test("a lapsed lease out of attempts becomes an error run carrying the last error", async () => {
    const { store, clock } = queueAt()
    await store.enqueueReview(pending("r1"), { scope: "trip" }, 2)
    const first = await claimed(store)
    expect(await store.failReview(first, "Gemini 503", 0, failedDoc(first, "x"))).toBe("requeued")
    await claimed(store) // attempt 2, then the worker dies
    clock.now += LEASE + 1

    expect(await store.claimReview("w2", LEASE)).toBeNull()
    const run = await store.getRun("t1", "r1")
    expect(run).toMatchObject({
      status: "error",
      error: "Gemini 503",
      outcome: "no_adds_possible",
      outcomeReason: RUN_FAILED_REASON,
    })
    expect(run?.queue).toEqual({ state: "done", attempt: 2, maxAttempts: 2, lastError: "Gemini 503" })
    // No longer live: the trip can queue a new review.
    expect(await store.enqueueReview(pending("r2"), { scope: "trip" }, 2)).toMatchObject({ inserted: true })
  })

  test("a lapsed lease out of attempts with no error recorded says the review stopped", async () => {
    const { store, clock } = queueAt()
    await store.enqueueReview(pending("r1"), { scope: "trip" }, 1)
    await claimed(store)
    clock.now += LEASE + 1
    expect(await store.claimReview("w1", LEASE)).toBeNull()
    const run = await store.getRun("t1", "r1")
    expect(run).toMatchObject({ status: "error", error: "The AI review stopped before it finished." })
    expect(run?.queue).toEqual({ state: "done", attempt: 1, maxAttempts: 1 })
  })

  test("release hands the run back without spending an attempt", async () => {
    const { store } = queueAt()
    await store.enqueueReview(pending("r1"), { scope: "trip" }, 1)
    const claim = await claimed(store)
    await store.releaseReview(claim)
    expect((await store.getRun("t1", "r1"))?.queue).toEqual({
      state: "queued",
      attempt: 0,
      maxAttempts: 1,
      nextAttemptAt: iso(T0),
    })
    expect(await store.heartbeatReview(claim, LEASE)).toBe(false)
    expect((await claimed(store)).attempt).toBe(1)
  })

  test("complete writes nothing when the trip moved on, and both together when it has not", async () => {
    const { store } = queueAt()
    await store.create(trip("t1"))
    await store.enqueueReview(pending("r1"), { scope: "trip" }, 3)
    const claim = await claimed(store)

    const edited = trip("t1", iso(T0 + 1_000))
    await store.update(edited)
    const reviewed = { ...trip("t1", iso(T0 + 2_000)), name: "reviewed" }
    expect(await store.completeReview(claim, completeDoc(claim), { trip: reviewed, expectedUpdatedAt: iso(T0) })).toBe(
      "trip_changed",
    )
    expect(await store.get("t1")).toEqual(edited)
    expect(await store.getRun("t1", "r1")).toMatchObject({ status: "running", queue: { state: "working" } })

    // The claim still holds: recompute on the fresh trip and finish.
    expect(
      await store.completeReview(claim, completeDoc(claim), { trip: reviewed, expectedUpdatedAt: edited.updatedAt }),
    ).toBe("ok")
    expect((await store.get("t1"))?.name).toBe("reviewed")
    const run = await store.getRun("t1", "r1")
    expect(run).toMatchObject({ status: "complete", outcome: "no_adds_needed" })
    expect(run?.queue).toEqual({ state: "done", attempt: 1, maxAttempts: 3 })
    expect(await store.completeReview(claim, completeDoc(claim), null)).toBe("lost")
  })

  test("deleting the trip drops its queued review", async () => {
    const { store } = queueAt()
    await store.create(trip("t1"))
    await store.enqueueReview(pending("r1"), { scope: "trip" }, 3)
    await store.delete("t1")
    expect(await store.claimReview("w1", LEASE)).toBeNull()
  })
})

// ── SupabaseTripStore: each method is one rpc, mapped both ways ─────────

function fakeSupabase(responses: unknown[]) {
  const calls: Array<{ fn: string; args: object }> = []
  const unused = () => Promise.reject(new Error("only rpc is expected"))
  const sb: SupabaseClient = {
    select: unused,
    insert: unused,
    update: unused,
    delete: unused,
    async rpc<T>(fn: string, args: object = {}) {
      calls.push({ fn, args })
      return responses.shift() as T
    },
  }
  return { store: new SupabaseTripStore(sb), calls }
}

const claimRow = {
  id: "r1",
  trip_id: "t1",
  doc: { ...pending("r1"), queue: { state: "working", attempt: 2, maxAttempts: 3 } },
  request: { scope: "day", dayId: "d1", prompt: "more food" },
  attempts: 2,
  max_attempts: 3,
  locked_by: "w1",
  queue_state: "working",
}

const heldClaim: ReviewClaim = {
  run: pending("r1"),
  request: { scope: "trip" },
  workerId: "w1",
  attempt: 2,
  maxAttempts: 3,
}
const fenceArgs = { p_id: "r1", p_worker: "w1", p_attempt: 2 }

describe("SupabaseTripStore review queue", () => {
  test("enqueue sends the run and request, and maps inserted or live", async () => {
    const live: RunningEnhancementRun = { ...pending("r0"), queue: { state: "working", attempt: 1, maxAttempts: 3 } }
    const { store, calls } = fakeSupabase([
      { inserted: true, doc: { ...pending("r1"), queue: { state: "queued", attempt: 0, maxAttempts: 3 } } },
      { inserted: false, doc: live },
    ])
    const request = { scope: "trip" as const, prompt: "slower mornings" }
    expect(await store.enqueueReview(pending("r1"), request, 3)).toEqual({
      inserted: true,
      run: { ...pending("r1"), queue: { state: "queued", attempt: 0, maxAttempts: 3 } },
    })
    expect(calls[0]).toEqual({
      fn: "trip_review_enqueue",
      args: { p_id: "r1", p_trip_id: "t1", p_doc: pending("r1"), p_request: request, p_max_attempts: 3 },
    })
    expect(await store.enqueueReview(pending("r2"), request, 3)).toEqual({ inserted: false, live })
  })

  test("enqueue with no row back is an error, not a silent success", async () => {
    const { store } = fakeSupabase([null])
    await expect(store.enqueueReview(pending("r1"), { scope: "trip" }, 3)).rejects.toThrow("trip_review_enqueue")
  })

  test("claim rounds the lease up to seconds and builds the claim from the row", async () => {
    const { store, calls } = fakeSupabase([[claimRow], [], null])
    expect(await store.claimReview("w1", 90_500)).toEqual({
      run: claimRow.doc as RunningEnhancementRun,
      request: { scope: "day", dayId: "d1", prompt: "more food" },
      workerId: "w1",
      attempt: 2,
      maxAttempts: 3,
    })
    expect(calls[0]).toEqual({ fn: "trip_review_claim", args: { p_worker: "w1", p_lease_sec: 91, p_run_id: null } })

    expect(await store.claimReview("w1", LEASE, "r9")).toBeNull()
    expect(calls[1]?.args).toEqual({ p_worker: "w1", p_lease_sec: 90, p_run_id: "r9" })
    expect(await store.claimReview("w1", LEASE)).toBeNull()
  })

  test("heartbeat and release send the claim's fence", async () => {
    const { store, calls } = fakeSupabase([true, false, null, null])
    expect(await store.heartbeatReview(heldClaim, LEASE)).toBe(true)
    expect(await store.heartbeatReview(heldClaim, 1)).toBe(false)
    expect(await store.heartbeatReview(heldClaim, LEASE)).toBe(false)
    await store.releaseReview(heldClaim)
    expect(calls).toEqual([
      { fn: "trip_review_heartbeat", args: { ...fenceArgs, p_lease_sec: 90 } },
      { fn: "trip_review_heartbeat", args: { ...fenceArgs, p_lease_sec: 1 } },
      { fn: "trip_review_heartbeat", args: { ...fenceArgs, p_lease_sec: 90 } },
      { fn: "trip_review_release", args: fenceArgs },
    ])
  })

  test("fail sends the error, a whole-millisecond retry and the failed run", async () => {
    const failed = failedDoc(heldClaim, "Gemini gave up")
    const { store, calls } = fakeSupabase(["requeued", "failed", "lost", "maybe"])
    expect(await store.failReview(heldClaim, "boom", 5_000.4, failed)).toBe("requeued")
    expect(calls[0]).toEqual({
      fn: "trip_review_fail",
      args: { ...fenceArgs, p_error: "boom", p_retry_in_ms: 5_001, p_failed_doc: failed },
    })
    expect(await store.failReview(heldClaim, "boom", null, failed)).toBe("failed")
    expect(calls[1]?.args).toMatchObject({ p_retry_in_ms: null })
    expect(await store.failReview(heldClaim, "boom", 0, failed)).toBe("lost")
    await expect(store.failReview(heldClaim, "boom", 0, failed)).rejects.toThrow('trip_review_fail returned "maybe"')
  })

  test("complete sends the run with or without the trip write", async () => {
    const done = completeDoc(heldClaim)
    const reviewed = trip("t1", iso(T0 + 2_000))
    const { store, calls } = fakeSupabase(["ok", "trip_changed", "lost", null])
    expect(await store.completeReview(heldClaim, done, { trip: reviewed, expectedUpdatedAt: iso(T0) })).toBe("ok")
    expect(calls[0]).toEqual({
      fn: "trip_review_complete",
      args: {
        ...fenceArgs,
        p_run_doc: done,
        p_trip_id: "t1",
        p_trip_doc: reviewed,
        p_expected_updated_at: iso(T0),
        p_trip_updated_at: iso(T0 + 2_000),
      },
    })
    expect(await store.completeReview(heldClaim, done, { trip: reviewed, expectedUpdatedAt: iso(T0) })).toBe(
      "trip_changed",
    )
    expect(await store.completeReview(heldClaim, done, null)).toBe("lost")
    expect(calls[2]?.args).toEqual({
      ...fenceArgs,
      p_run_doc: done,
      p_trip_id: "t1",
      p_trip_doc: null,
      p_expected_updated_at: null,
      p_trip_updated_at: null,
    })
    await expect(store.completeReview(heldClaim, done, null)).rejects.toThrow("trip_review_complete returned null")
  })
})

describe("isNotProvisionedError", () => {
  /** The error the real client throws for a PostgREST error body. */
  async function clientError(status: number, body: object): Promise<unknown> {
    const fetch = (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof globalThis.fetch
    const sb = createSupabaseClient({ url: "https://h.supabase.co", serviceKey: "k", fetch })
    return sb.rpc("trip_review_claim", { p_worker: "w1", p_lease_sec: 90, p_run_id: null }).catch((err: unknown) => err)
  }

  test("a missing queue function counts, even with the message cut off", async () => {
    const err = await clientError(404, {
      code: "PGRST202",
      details:
        "Searched for the function public.trip_review_claim with parameters p_lease_sec, p_run_id, p_worker or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.",
      hint: null,
      message: "Could not find the function public.trip_review_claim(p_lease_sec, p_run_id, p_worker) in the schema cache",
    })
    expect(String(err)).not.toContain("Could not find the function")
    expect(isNotProvisionedError(err)).toBe(true)
  })

  test("a missing table still counts; other errors do not", async () => {
    expect(isNotProvisionedError(new Error('→ 404: {"code":"PGRST205","message":"Could not find the table"}'))).toBe(true)
    expect(isNotProvisionedError(await clientError(500, { code: "XX000", message: "boom" }))).toBe(false)
    expect(isNotProvisionedError(new Error("fetch failed"))).toBe(false)
  })
})

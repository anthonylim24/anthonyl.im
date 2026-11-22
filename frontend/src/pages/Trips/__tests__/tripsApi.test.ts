import { afterEach, describe, expect, it, vi } from "vitest"
import { PollTimeoutError, TimeoutError } from "../../../effect/errors"
import {
  FOLLOW_CAP_MS,
  STILL_RUNNING,
  enhanceTrip,
  followEnhancement,
  generateItinerary,
  getTrip,
  listEnhancements,
  updateTrip,
} from "../tripsApi"
import { isTripConflict, isTripRefused } from "../tripConflict"
import { READ_TIMEOUT_MS } from "../offline/network"
import type { EnhancementRun, RunQueueInfo } from "../types"
import { makeTrip } from "./tripFixtures"

const getToken = async () => "test-token"

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function makeRun(overrides: Partial<EnhancementRun> = {}): EnhancementRun {
  return {
    id: "run-1",
    tripId: "trip-1",
    scope: "trip",
    status: "error",
    outcome: "no_adds_possible",
    outcomeReason: "The AI review failed before it could add places.",
    suggestions: [],
    appliedSuggestionIds: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    error: "no JSON object found in model output",
    ...overrides,
  }
}

describe("enhanceTrip", () => {
  it("returns the run from a 502 so the editor can show why nothing was added", async () => {
    const run = makeRun()
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          run,
          trip: { id: "trip-1", days: [] },
          error: "enhancement_failed",
          message: "no JSON object found in model output",
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      ),
    )

    const result = await enhanceTrip(getToken, "trip-1", "trip")
    expect(result.run.outcomeReason).toMatch(/failed before/i)
    expect(result.error).toBe("enhancement_failed")
    expect(result.trip?.id).toBe("trip-1")
  })

  it("throws when a 502 body is not an object", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("null", { status: 502, headers: { "Content-Type": "application/json" } }),
    )
    await expect(enhanceTrip(getToken, "trip-1", "trip")).rejects.toThrow(/HTTP 502/)
  })

  it("throws a normal HTTP error when 502 has no run body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "enhancement_failed", message: "down" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }),
    )
    await expect(enhanceTrip(getToken, "trip-1", "trip")).rejects.toThrow(/down/)
  })

  it("polls a 202 running run until it completes", async () => {
    const running = makeRun({
      status: "running",
      outcome: undefined,
      outcomeReason: undefined,
      error: undefined,
    })
    const done = makeRun({
      status: "complete",
      outcome: "added_places",
      outcomeReason: "Added lunch.",
      error: undefined,
      appliedSuggestionIds: ["sug-1"],
    })
    const spy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ run: running }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ run: running, trip: { id: "trip-1" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ run: done, trip: { id: "trip-1" }, applied: ["sug-1"] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )

    const result = await enhanceTrip(getToken, "trip-1", "trip")
    expect(result.run.status).toBe("complete")
    expect(result.applied).toEqual(["sug-1"])
    expect(spy).toHaveBeenCalledTimes(3)
    expect(String(spy.mock.calls[1]![0])).toContain("/enhancements/run-1")
  })

  it("stops polling when the session expires", async () => {
    const running = makeRun({
      status: "running",
      outcome: undefined,
      outcomeReason: undefined,
      error: undefined,
    })
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ run: running }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )

    await expect(enhanceTrip(getToken, "trip-1", "trip")).rejects.toThrow(/sign in again/i)
  })
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const running = (queue?: RunQueueInfo): EnhancementRun =>
  makeRun({ status: "running", outcome: undefined, outcomeReason: undefined, error: undefined, ...(queue ? { queue } : {}) })
const finished = makeRun({
  status: "complete",
  outcome: "added_places",
  outcomeReason: "Added lunch.",
  error: undefined,
  appliedSuggestionIds: ["sug-1"],
  queue: { state: "done", attempt: 1, maxAttempts: 3 },
})
const queued = (attempt: number, more: Partial<RunQueueInfo> = {}): RunQueueInfo => ({ state: "queued", attempt, maxAttempts: 3, ...more })
const working = (attempt: number): RunQueueInfo => ({ state: "working", attempt, maxAttempts: 3 })

/**
 * The review endpoints: `start` answers the POST, and `look(n)` the n-th GET
 * of the run (a fresh Response each time: a body reads once).
 */
function reviewServer(start: () => Response, look: (n: number, init?: RequestInit) => Response | Promise<Response>) {
  let n = 0
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => (init?.method === "POST" ? start() : look(n++, init)))
}

/** A GET that never answers, until its own signal gives up on it. */
const hang = (init?: RequestInit) =>
  new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))

/** Whether a promise has settled yet, without waiting for it. */
function watch<T>(promise: Promise<T>) {
  const state: { settled: boolean; value?: T; error?: unknown } = { settled: false }
  promise.then(
    (value) => Object.assign(state, { settled: true, value }),
    (error: unknown) => Object.assign(state, { settled: true, error }),
  )
  return state
}

describe("following a review", () => {
  it("keeps following well past three minutes, until the server settles the run", async () => {
    vi.useFakeTimers()
    let settled = false
    const spy = reviewServer(
      () => json({ run: running(queued(0)) }, 202),
      () => json(settled ? { run: finished, trip: { id: "trip-1" } } : { run: running(working(1)) }),
    )
    const result = watch(enhanceTrip(getToken, "trip-1", "trip"))

    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(result.settled).toBe(false)
    // Every 3 s or so once it has backed off: still asking, without hammering.
    expect(spy.mock.calls.length).toBeGreaterThan(150)
    expect(spy.mock.calls.length).toBeLessThan(250)

    settled = true
    await vi.advanceTimersByTimeAsync(3_000)
    expect(result.value?.run.status).toBe("complete")
    expect(result.value?.applied).toEqual(["sug-1"])
  })

  it("looks again after a 502, a 503, a dropped connection and a proxy's page", async () => {
    vi.useFakeTimers()
    const answers: Array<() => Response | Promise<Response>> = [
      () => json({ error: "bad gateway" }, 502),
      () => new Response("<html>Service unavailable</html>", { status: 503 }),
      () => Promise.reject(new TypeError("Failed to fetch")),
      () => new Response("<html>Gateway</html>", { status: 504 }),
      () => new Response("<html>Signing you in</html>", { status: 200 }),
      () => json({ run: finished, trip: { id: "trip-1" }, applied: ["sug-1"] }),
    ]
    const spy = reviewServer(() => json({ run: running() }, 202), (n) => answers[Math.min(n, answers.length - 1)]!())
    const result = watch(enhanceTrip(getToken, "trip-1", "trip"))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(result.error).toBeUndefined()
    expect(result.value).toMatchObject({ run: { status: "complete" }, applied: ["sug-1"] })
    expect(spy).toHaveBeenCalledTimes(1 + answers.length)
  })

  it("gives up on a look that never answers and asks again, without ending the follow", async () => {
    vi.useFakeTimers()
    const spy = reviewServer(
      () => json({ run: running() }, 202),
      (n, init) => (n === 0 ? hang(init) : json({ run: finished, trip: { id: "trip-1" } })),
    )
    const result = watch(enhanceTrip(getToken, "trip-1", "trip"))
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1_000)
    expect(result.settled).toBe(false)
    expect(spy).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(result.error).toBeUndefined()
    expect(result.value?.run.status).toBe("complete")
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it("ends on a run the server settled as failed, with the server's words", async () => {
    vi.useFakeTimers()
    const failed = makeRun({ queue: { state: "done", attempt: 3, maxAttempts: 3, lastError: "deadline" } })
    const spy = reviewServer(
      () => json({ run: running(queued(0)) }, 202),
      (n) => (n < 2 ? json({ run: running(working(1)) }) : json({ run: failed, trip: { id: "trip-1" }, error: "enhancement_failed", message: failed.error })),
    )
    const result = watch(enhanceTrip(getToken, "trip-1", "trip"))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(result.value?.run).toMatchObject({ status: "error", outcomeReason: "The AI review failed before it could add places." })
    expect(result.value?.applied).toEqual([])
    expect(spy).toHaveBeenCalledTimes(4)
  })

  it("tells the page each time the run's place in the queue moves, once per change", async () => {
    vi.useFakeTimers()
    const looks = [
      running(queued(0)),
      running(working(1)),
      running(working(1)),
      running(queued(1, { nextAttemptAt: "2026-06-01T00:00:35.000Z", lastError: "The attempt ran out of time." })),
      running(working(2)),
      finished,
    ]
    reviewServer(
      () => json({ run: running(queued(0)) }, 202),
      (n) => json({ run: looks[Math.min(n, looks.length - 1)] }),
    )
    const heard: string[] = []
    const result = watch(
      enhanceTrip(getToken, "trip-1", "trip", undefined, undefined, undefined, (run) => heard.push(`${run.queue?.state} ${run.queue?.attempt}`)),
    )
    await vi.advanceTimersByTimeAsync(30_000)
    expect(result.value?.run.status).toBe("complete")
    expect(heard).toEqual(["queued 0", "working 1", "queued 1", "working 2"])
  })

  it("follows the review already running when the server answers 409", async () => {
    vi.useFakeTimers()
    const live = { ...running(working(1)), id: "run-live", scope: "day" as const, dayId: "day-2" }
    const spy = reviewServer(
      () => json({ error: "enhancement_running", message: "An AI review of this trip is already running.", run: live }, 409),
      () => json({ run: { ...finished, id: "run-live" }, trip: { id: "trip-1" } }),
    )
    const heard: EnhancementRun[] = []
    const result = watch(enhanceTrip(getToken, "trip-1", "trip", undefined, undefined, undefined, (run) => heard.push(run)))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(result.value?.run).toMatchObject({ id: "run-live", status: "complete" })
    expect(heard).toEqual([live])
    expect(String(spy.mock.calls[1]![0])).toContain("/enhancements/run-live")
  })

  it("waits for the connection to come back before looking again", async () => {
    vi.useFakeTimers()
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    const spy = reviewServer(() => json({ run: running() }, 202), () => json({ run: finished, trip: { id: "trip-1" } }))
    const result = watch(enhanceTrip(getToken, "trip-1", "trip"))
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(result.settled).toBe(false)

    onLine.mockReturnValue(true)
    window.dispatchEvent(new Event("online"))
    await vi.advanceTimersByTimeAsync(0)
    expect(result.value?.run.status).toBe("complete")
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it("stops waiting offline as soon as it is stopped", async () => {
    vi.useFakeTimers()
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    const spy = reviewServer(() => json({ run: running() }, 202), () => json({ run: finished }))
    const ac = new AbortController()
    const result = watch(enhanceTrip(getToken, "trip-1", "trip", undefined, undefined, ac.signal))
    await vi.advanceTimersByTimeAsync(10_000)
    ac.abort()
    await vi.advanceTimersByTimeAsync(0)
    expect(result.error).toMatchObject({ name: "AbortError" })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("stops following after 32 minutes with words that say the review may still finish", async () => {
    vi.useFakeTimers()
    reviewServer(() => json({ run: running(queued(0)) }, 202), () => json({ run: running(working(1)) }))
    const result = watch(enhanceTrip(getToken, "trip-1", "trip"))
    await vi.advanceTimersByTimeAsync(FOLLOW_CAP_MS - 60_000)
    expect(result.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(2 * 60_000)
    expect(result.error).toBeInstanceOf(PollTimeoutError)
    expect((result.error as Error).message).toBe(STILL_RUNNING)
    expect(STILL_RUNNING).toBe("The AI review is still running on the server. Its changes will show up here when it finishes.")
    expect(FOLLOW_CAP_MS).toBe(32 * 60_000)
  })

  it("ends with a clear message when the run is no longer on the server", async () => {
    vi.useFakeTimers()
    reviewServer(() => json({ run: running() }, 202), () => json({ error: "run not found" }, 404))
    const result = watch(enhanceTrip(getToken, "trip-1", "trip"))
    await vi.advanceTimersByTimeAsync(1_000)
    expect((result.error as Error).message).toBe("This AI review isn’t on the server any more. Reload to see where your trip stands.")
  })

  it("follows a run found already going (a reload, another device) the same way", async () => {
    vi.useFakeTimers()
    const live = running(working(2))
    const spy = reviewServer(
      () => json({}, 500),
      (n) => (n === 0 ? json({ error: "busy" }, 503) : json({ run: finished, trip: { id: "trip-1" } })),
    )
    const heard: EnhancementRun[] = []
    const result = watch(followEnhancement(getToken, "trip-1", live, undefined, (run) => heard.push(run)))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(result.value?.run.status).toBe("complete")
    expect(heard).toEqual([live])
    expect(spy.mock.calls.every(([, init]) => (init as RequestInit).method !== "POST")).toBe(true)
  })

  it("lists a trip's reviews, newest first as the server sends them", async () => {
    const newest = running(working(1))
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({ runs: [newest, finished] }))
    await expect(listEnhancements(getToken, "trip-1")).resolves.toEqual([newest, finished])
    expect(String(spy.mock.calls[0]![0])).toContain("/api/trips/trip-1/enhancements")
  })
})

describe("updateTrip", () => {
  it("sends the base it was made against and returns the saved trip", async () => {
    const saved = makeTrip({ updatedAt: "2026-01-02T00:00:00Z" })
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ trip: saved }))
    await expect(updateTrip(getToken, "lisbon", { name: "New", baseUpdatedAt: "2026-01-01T00:00:00Z" })).resolves.toEqual(saved)
    const init = spy.mock.calls[0]![1] as RequestInit
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body as string)).toEqual({ name: "New", baseUpdatedAt: "2026-01-01T00:00:00Z" })
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-token")
  })

  it("rejects with the server's copy when someone else wrote first", async () => {
    const theirs = makeTrip({ name: "Theirs", updatedAt: "2026-01-02T00:00:00Z" })
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: "conflict", trip: theirs }, 409))
    const err = await updateTrip(getToken, "lisbon", { name: "Mine" }).catch((e: unknown) => e)
    expect(isTripConflict(err)).toBe(true)
    expect(isTripConflict(err) && err.trip).toEqual(theirs)
  })

  it("keeps other 409s (a taken link name) as refusals with their message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: "slug_taken", message: "The permalink “x” is already in use." }, 409))
    const err = await updateTrip(getToken, "lisbon", { slug: "x" }).catch((e: unknown) => e)
    expect(isTripConflict(err)).toBe(false)
    expect(isTripRefused(err)).toBe(true)
    expect((err as Error).message).toMatch(/already in use/)
  })

  it("turns a 400 into a refusal that says which field to fix", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ error: "invalid update", issues: [{ origin: "string", code: "too_big", maximum: 120, path: ["days", 0, "items", 1, "reservation", "confirmation"] }] }, 400),
    )
    const err = await updateTrip(getToken, "lisbon", { name: "x" }).catch((e: unknown) => e)
    expect(isTripRefused(err)).toBe(true)
    expect((err as Error).message).toBe("The confirmation number of a stop on day 1 is too long (120 characters at most).")
  })
})

describe("reading with a deadline", () => {
  it("gives up on a trip that doesn't come, and aborts the request", async () => {
    let signal: AbortSignal | undefined
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      signal = (init as RequestInit).signal ?? undefined
      return new Promise<Response>(() => undefined)
    })
    const err = await getTrip(getToken, "lisbon", { timeoutMs: 20 }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TimeoutError)
    expect((err as Error).message).toBe("Couldn’t reach the server.")
    expect(signal?.aborted).toBe(true)
  })

  it("counts the sign-in token read against the deadline", async () => {
    const stuck = () => new Promise<string | null>(() => undefined)
    const spy = vi.spyOn(globalThis, "fetch")
    await expect(getTrip(stuck, "lisbon", { timeoutMs: 20 })).rejects.toBeInstanceOf(TimeoutError)
    expect(spy).not.toHaveBeenCalled()
  })

  it("waits as before without one", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ trip: makeTrip(), access: "owner" }))
    await expect(getTrip(getToken, "lisbon")).resolves.toMatchObject({ access: "owner" })
  })
})

describe("cancelling AI calls", () => {
  it("stops polling an enhancement when its signal is aborted", async () => {
    const running = makeRun({ status: "running", outcome: undefined, outcomeReason: undefined, error: undefined })
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ run: running }, 202))
    const ac = new AbortController()
    const pending = enhanceTrip(getToken, "trip-1", "trip", undefined, undefined, ac.signal)
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    ac.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(spy).toHaveBeenCalledTimes(1)
    expect((spy.mock.calls[0]![1] as RequestInit).signal).toBe(ac.signal)
  })

  it("passes the draft's signal to fetch", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ trip: makeTrip() }))
    const ac = new AbortController()
    await generateItinerary(getToken, "lisbon", {}, ac.signal)
    expect((spy.mock.calls[0]![1] as RequestInit).signal).toBe(ac.signal)
  })
})

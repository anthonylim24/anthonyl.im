import { afterEach, describe, expect, it, vi } from "vitest"
import { TimeoutError } from "../../../effect/errors"
import { enhanceTrip, generateItinerary, getTrip, updateTrip } from "../tripsApi"
import { isTripConflict, isTripRefused } from "../tripConflict"
import type { EnhancementRun } from "../types"
import { makeTrip } from "./tripFixtures"

const getToken = async () => "test-token"

afterEach(() => {
  vi.restoreAllMocks()
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

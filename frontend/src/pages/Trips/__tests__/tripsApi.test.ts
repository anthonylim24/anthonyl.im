import { afterEach, describe, expect, it, vi } from "vitest"
import { enhanceTrip } from "../tripsApi"
import type { EnhancementRun } from "../types"

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

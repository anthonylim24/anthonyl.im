import { afterEach, describe, expect, it, vi } from "vitest"
import { TimeoutError } from "../../../../effect/errors"
import { makeItem } from "../../__tests__/tripFixtures"
import { withDeadline } from "../deadline"
import { formatKm, suggestDays } from "../suggestDaysApi"

const getToken = async () => "token"
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
const tram = makeItem({ id: "idea-tram", title: "Tram 28" })

/** A server that never answers, and lets go when the request is aborted. */
function hangingFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")))
      }),
  )
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("withDeadline", () => {
  it("works where AbortSignal.any does not exist (Safari before 17.4)", () => {
    const any = Object.getOwnPropertyDescriptor(AbortSignal, "any")
    Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true })
    try {
      const parent = new AbortController()
      const deadline = withDeadline(parent.signal, 1_000)
      expect(deadline.signal.aborted).toBe(false)
      parent.abort()
      expect(deadline.signal.aborted).toBe(true)
      expect(deadline.timedOut()).toBe(false)
      deadline.release()
    } finally {
      if (any) Object.defineProperty(AbortSignal, "any", any)
    }
  })

  it("aborts at the deadline and says so", () => {
    vi.useFakeTimers()
    const deadline = withDeadline(undefined, 1_000)
    vi.advanceTimersByTime(999)
    expect(deadline.signal.aborted).toBe(false)
    vi.advanceTimersByTime(1)
    expect(deadline.signal.aborted).toBe(true)
    expect(deadline.timedOut()).toBe(true)
  })

  it("starts aborted under a parent that already is, and stops the clock on release", () => {
    vi.useFakeTimers()
    const parent = new AbortController()
    parent.abort()
    expect(withDeadline(parent.signal, 1_000).signal.aborted).toBe(true)
    const live = withDeadline(undefined, 1_000)
    live.release()
    vi.advanceTimersByTime(5_000)
    expect(live.signal.aborted).toBe(false)
  })
})

describe("suggestDays", () => {
  it("answers the server's picks", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ picks: [{ dayId: "day-1", reason: "Close by" }, { nope: true }], source: "ai" }))
    expect(await suggestDays(getToken, "lisbon", tram)).toEqual({ picks: [{ dayId: "day-1", reason: "Close by" }], source: "ai" })
  })

  it("gives up on a server that never answers, even with the caller's own signal", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const spy = hangingFetch()
    const caller = new AbortController()
    const pending = suggestDays(getToken, "lisbon", tram, caller.signal).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(12_000)
    const err = await pending
    expect(err).toBeInstanceOf(TimeoutError)
    // The request itself was called off, not left running.
    expect((spy.mock.calls[0]![1]?.signal as AbortSignal).aborted).toBe(true)
    expect(caller.signal.aborted).toBe(false)
  })

  it("calls the request off when the caller does", async () => {
    const spy = hangingFetch()
    const caller = new AbortController()
    const pending = suggestDays(getToken, "lisbon", tram, caller.signal).catch((e: unknown) => e)
    await vi.waitFor(() => expect(spy).toHaveBeenCalled())
    caller.abort()
    const err = await pending
    expect(err).not.toBeInstanceOf(TimeoutError)
    expect((spy.mock.calls[0]![1]?.signal as AbortSignal).aborted).toBe(true)
  })
})

describe("formatKm", () => {
  it.each([
    [0.01, "50 m"],
    [0.648, "650 m"],
    [0.999, "1.0 km"],
    [1.24, "1.2 km"],
    [9.94, "9.9 km"],
    [9.95, "10 km"],
    [9.99, "10 km"],
    [14.4, "14 km"],
  ])("%d km reads %s", (km, text) => {
    expect(formatKm(km)).toBe(text)
  })
})

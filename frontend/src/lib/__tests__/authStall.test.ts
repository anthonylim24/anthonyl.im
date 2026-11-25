import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { runPromise } from "@/effect/runtime"
import { PROBE_DEADLINE_MS, STALL_AFTER_MS, diagnose, probeDelay, reloadToRecover, useAuthStall } from "../authStall"
import { reloadOnce } from "../lazyRetry"
import { resetClientEvents } from "../telemetry"

vi.mock("../clerk", () => ({ CLERK_PROXY_URL: "https://anthonyl.im/__clerk" }))
vi.mock("../lazyRetry", async (original) => ({
  ...(await original<typeof import("../lazyRetry")>()),
  reloadOnce: vi.fn(() => true),
}))

const PROXY = "https://anthonyl.im/__clerk"

function stubFetch(answers: { health?: number | Error; auth?: number | Error }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes("/api/telemetry")) return new Response(null, { status: 204 })
    const answer = url.includes("/v1/environment") ? answers.auth : answers.health
    if (answer instanceof Error) throw answer
    return new Response("{}", { status: answer ?? 200 })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.mocked(reloadOnce).mockClear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  sessionStorage.clear()
  resetClientEvents()
})

describe("diagnose", () => {
  it("blames the sign-in service when only it is unreachable", async () => {
    stubFetch({ auth: new TypeError("Failed to fetch") })
    await expect(runPromise(diagnose(PROXY))).resolves.toBe("auth")
  })

  it("blames the network when a request to our own origin gets no answer", async () => {
    const fetchMock = stubFetch({ health: new TypeError("Failed to fetch") })
    await expect(runPromise(diagnose(PROXY))).resolves.toBe("network")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("blames the network when our own origin never answers, once the probe deadline passes", async () => {
    const deadline = new AbortController()
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal)
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
      ),
    )
    const found = runPromise(diagnose(PROXY))
    expect(timeout).toHaveBeenCalledWith(PROBE_DEADLINE_MS)
    deadline.abort(new DOMException("signal timed out", "TimeoutError"))
    await expect(found).resolves.toBe("network")
  })

  it("blames the site when our own origin answers with a 5xx", async () => {
    const fetchMock = stubFetch({ health: 502 })
    await expect(runPromise(diagnose(PROXY))).resolves.toBe("site")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("treats a 5xx as unreachable", async () => {
    stubFetch({ auth: 502 })
    await expect(runPromise(diagnose(PROXY))).resolves.toBe("auth")
  })

  it("reports offline without probing", async () => {
    const fetchMock = stubFetch({})
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    await expect(runPromise(diagnose(PROXY))).resolves.toBe("offline")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns null when everything answers", async () => {
    stubFetch({})
    await expect(runPromise(diagnose(PROXY))).resolves.toBeNull()
  })

  it("cannot probe Clerk's own host, so a healthy site means sign-in failed", async () => {
    stubFetch({})
    await expect(runPromise(diagnose(""))).resolves.toBe("auth")
  })
})

describe("probeDelay", () => {
  it("doubles from 4 s to a 30 s ceiling", () => {
    expect([0, 1, 2, 3, 9].map(probeDelay)).toEqual([4_000, 8_000, 16_000, 30_000, 30_000])
  })
})

describe("reloadToRecover", () => {
  it("spends the reload budget only when a reload happens", () => {
    vi.mocked(reloadOnce).mockReturnValueOnce(false)
    expect(reloadToRecover()).toBe(false)
    expect(sessionStorage.getItem("auth-reloads")).toBeNull()

    expect(reloadToRecover()).toBe(true)
    expect(sessionStorage.getItem("auth-reloads")).toBe("1")
  })

  it("keeps both reloads available across the one-minute window", () => {
    vi.mocked(reloadOnce).mockReturnValueOnce(true).mockReturnValueOnce(false).mockReturnValueOnce(true)
    expect([reloadToRecover(), reloadToRecover(), reloadToRecover(), reloadToRecover()]).toEqual([
      true,
      false,
      true,
      false,
    ])
    expect(sessionStorage.getItem("auth-reloads")).toBe("2")
    expect(reloadOnce).toHaveBeenCalledTimes(3)
  })
})

describe("useAuthStall", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it("stays quiet while Clerk loads in time", async () => {
    stubFetch({})
    const { result, rerender } = renderHook(({ loaded }) => useAuthStall(loaded, false), {
      initialProps: { loaded: false },
    })
    rerender({ loaded: true })
    await act(() => vi.advanceTimersByTimeAsync(STALL_AFTER_MS * 2))
    expect(result.current).toEqual({ stalled: false, cause: null })
  })

  it("names the cause once the load stalls, and reports it", async () => {
    const fetchMock = stubFetch({ health: new TypeError("Failed to fetch") })
    const { result } = renderHook(() => useAuthStall(false, false))
    expect(result.current.stalled).toBe(false)
    await act(() => vi.advanceTimersByTimeAsync(STALL_AFTER_MS + 50))
    expect(result.current).toEqual({ stalled: true, cause: "network" })
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/telemetry"))).toBe(true)
  })

  it("does not wait for the timeout when Clerk says it failed", async () => {
    stubFetch({ health: new TypeError("Failed to fetch") })
    const { result } = renderHook(() => useAuthStall(false, true))
    await act(() => vi.advanceTimersByTimeAsync(50))
    expect(result.current.cause).toBe("network")
  })

  it("reloads once when everything answers again", async () => {
    stubFetch({})
    const { result } = renderHook(() => useAuthStall(false, true))
    await act(() => vi.advanceTimersByTimeAsync(50))
    expect(reloadOnce).toHaveBeenCalledTimes(1)
    expect(result.current.cause).toBeNull()
  })

  it("stops reloading after two tries and says sign-in is the problem", async () => {
    stubFetch({})
    sessionStorage.setItem("auth-reloads", "2")
    const { result } = renderHook(() => useAuthStall(false, true))
    await act(() => vi.advanceTimersByTimeAsync(50))
    expect(reloadOnce).not.toHaveBeenCalled()
    expect(result.current.cause).toBe("auth")
  })
})

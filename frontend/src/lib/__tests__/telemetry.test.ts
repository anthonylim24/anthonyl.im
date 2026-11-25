import { afterEach, describe, expect, it, vi } from "vitest"
import { installErrorReporting, reportClientEvent, resetClientEvents, sendUnsentEvents } from "../telemetry"

function stubFetch() {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async () => new Response(null, { status: 204 }),
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const bodies = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as { kind: string; message: string })

afterEach(() => {
  vi.unstubAllGlobals()
  resetClientEvents()
  localStorage.clear()
})

describe("reportClientEvent", () => {
  it("posts the event to our own origin", async () => {
    const fetchMock = stubFetch()
    reportClientEvent("auth_stalled", "Clerk did not load", { cause: "auth" })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/telemetry")
    expect(bodies(fetchMock)[0]).toMatchObject({ kind: "auth_stalled", detail: { cause: "auth" } })
  })

  it("drops repeats and stops at ten events a page", async () => {
    const fetchMock = stubFetch()
    reportClientEvent("js_error", "same")
    reportClientEvent("js_error", "same")
    for (let i = 0; i < 20; i++) reportClientEvent("js_error", `error ${i}`)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10))
  })

  it("swallows a failed send", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch") }))
    expect(() => reportClientEvent("js_error", "boom")).not.toThrow()
  })

  it("keeps a report the network would not carry, and sends it late on the next load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch") }))
    reportClientEvent("auth_stalled", "Clerk did not load", { cause: "network" })
    await vi.waitFor(() => expect(localStorage.getItem("telemetry-unsent")).toContain("auth_stalled"))

    const fetchMock = stubFetch()
    const stored = JSON.parse(localStorage.getItem("telemetry-unsent")!) as { at: number }[]
    sendUnsentEvents(stored[0].at + 90_000)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(bodies(fetchMock)[0]).toMatchObject({
      kind: "auth_stalled",
      detail: { cause: "network", late: true, ageS: 90 },
    })
    expect(localStorage.getItem("telemetry-unsent")).toBeNull()
  })

  it("does not keep a report the server answered, even with an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 400 })))
    reportClientEvent("js_error", "rejected by the server")
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(localStorage.getItem("telemetry-unsent")).toBeNull()
  })

  it("drops stale and malformed leftovers", async () => {
    const fetchMock = stubFetch()
    const now = Date.UTC(2026, 10, 25)
    localStorage.setItem(
      "telemetry-unsent",
      JSON.stringify([
        { at: now - 8 * 24 * 3600_000, event: { kind: "old", message: "m", route: "/" } },
        { at: now, event: { kind: "bad", message: 3, route: "/" } },
        { at: now, event: { kind: "bad_detail", message: "m", route: "/", detail: { nested: {} } } },
        { at: now - 1000, event: { kind: "kept", message: "m", route: "/trips" } },
      ]),
    )
    sendUnsentEvents(now)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(bodies(fetchMock)[0]).toMatchObject({ kind: "kept", route: "/trips", detail: { late: true, ageS: 1 } })
  })
})

describe("installErrorReporting", () => {
  it("reports our own errors and ignores extensions and noise", async () => {
    const fetchMock = stubFetch()
    installErrorReporting()
    window.dispatchEvent(new ErrorEvent("error", { message: "x", error: new TypeError("ours"), filename: `${window.location.origin}/assets/a.js` }))
    window.dispatchEvent(new ErrorEvent("error", { message: "theirs", filename: "chrome-extension://abc/x.js" }))
    window.dispatchEvent(new ErrorEvent("error", { message: "ResizeObserver loop limit exceeded" }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(bodies(fetchMock)[0]).toMatchObject({ kind: "js_error", message: "TypeError: ours" })
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { installErrorReporting, reportClientEvent, resetClientEvents } from "../telemetry"

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

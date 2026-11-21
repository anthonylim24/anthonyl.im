import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// rates.ts memoises per session, so each test imports a fresh copy.
async function freshRates() {
  vi.resetModules()
  return (await import("../rates")).loadRates
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const row = (base: string, quote: string, rate: number) => ({ date: "2026-11-20", base, quote, rate })

describe("loadRates", () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
  })

  it("asks Frankfurter for the budget currency's rates once per session", async () => {
    const loadRates = await freshRates()
    fetchMock.mockResolvedValueOnce(json([row("EUR", "JPY", 174.35), row("EUR", "USD", 1.099)]))

    expect(await loadRates("EUR", ["usd", "JPY", "EUR"])).toEqual({ JPY: 174.35, USD: 1.099 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.frankfurter.dev/v2/rates?base=EUR&quotes=JPY,USD")

    expect(await loadRates("EUR", ["JPY"])).toEqual({ JPY: 174.35 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("only asks for the codes it doesn't have yet", async () => {
    const loadRates = await freshRates()
    fetchMock.mockResolvedValueOnce(json([row("EUR", "JPY", 170)]))
    await loadRates("EUR", ["JPY"])
    fetchMock.mockResolvedValueOnce(json([row("EUR", "KRW", 1500)]))
    expect(await loadRates("EUR", ["JPY", "KRW"])).toEqual({ JPY: 170, KRW: 1500 })
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://api.frankfurter.dev/v2/rates?base=EUR&quotes=KRW")
  })

  it("shares one request between callers asking at once", async () => {
    const loadRates = await freshRates()
    fetchMock.mockResolvedValueOnce(json([row("USD", "JPY", 150)]))
    const [first, second] = await Promise.all([loadRates("USD", ["JPY"]), loadRates("USD", ["JPY"])])
    expect(first).toEqual({ JPY: 150 })
    expect(second).toEqual({ JPY: 150 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("sets aside a code the service rejects and asks again without it", async () => {
    const loadRates = await freshRates()
    fetchMock
      .mockResolvedValueOnce(json({ status: 422, message: "invalid currency: XTS" }, 422))
      .mockResolvedValueOnce(json([row("EUR", "JPY", 170)]))

    expect(await loadRates("EUR", ["JPY", "XTS"])).toEqual({ JPY: 170 })
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://api.frankfurter.dev/v2/rates?base=EUR&quotes=JPY")

    // Known to be unsupported: not asked again.
    expect(await loadRates("EUR", ["XTS"])).toEqual({})
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("gives up on a base the service doesn't know", async () => {
    const loadRates = await freshRates()
    fetchMock.mockResolvedValueOnce(json({ status: 422, message: "invalid currency: XTS" }, 422))
    expect(await loadRates("XTS", ["EUR"])).toEqual({})
    expect(await loadRates("XTS", ["JPY"])).toEqual({})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("resolves to what it has when the lookup fails, and tries again next time", async () => {
    const loadRates = await freshRates()
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    expect(await loadRates("EUR", ["JPY"])).toEqual({})

    fetchMock.mockResolvedValueOnce(json({ message: "unavailable" }, 503))
    expect(await loadRates("EUR", ["JPY"])).toEqual({})

    fetchMock.mockResolvedValueOnce(json([row("EUR", "JPY", 170)]))
    expect(await loadRates("EUR", ["JPY"])).toEqual({ JPY: 170 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("ignores rates that aren't usable", async () => {
    const loadRates = await freshRates()
    fetchMock.mockResolvedValueOnce(
      json([row("EUR", "JPY", 0), row("EUR", "USD", Number.NaN), row("GBP", "KRW", 1700), { quote: "THB" }, row("EUR", "CHF", 0.93)]),
    )
    expect(await loadRates("EUR", ["JPY", "USD", "KRW", "THB", "CHF"])).toEqual({ CHF: 0.93 })
    // The ones left unanswered aren't asked for again.
    expect(await loadRates("EUR", ["JPY", "CHF"])).toEqual({ CHF: 0.93 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("answers at once when nothing foreign is asked for", async () => {
    const loadRates = await freshRates()
    expect(await loadRates("EUR", ["EUR"])).toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, test } from "bun:test"
import {
  resetGeminiToolFallback,
  CHAT_TOOL_ATTEMPTS,
  describeGeminiTools,
  fetchGeminiStreamWithToolFallback,
  GEMINI_TOOLS_SEARCH_AND_MAPS,
  mapsRetrievalConfig,
  toolsIncludeMaps,
} from "./geminiTools"

beforeEach(() => resetGeminiToolFallback())

describe("gemini tool helpers", () => {
  test("chat attempts start with Maps and never pair it with Search", () => {
    expect(CHAT_TOOL_ATTEMPTS[0]).toEqual([{ googleMaps: {} }])
    expect(CHAT_TOOL_ATTEMPTS).not.toContainEqual(GEMINI_TOOLS_SEARCH_AND_MAPS)
    expect(describeGeminiTools(GEMINI_TOOLS_SEARCH_AND_MAPS)).toBe("search+maps")
    expect(toolsIncludeMaps(GEMINI_TOOLS_SEARCH_AND_MAPS)).toBe(true)
    expect(toolsIncludeMaps(undefined)).toBe(false)
  })

  test("omits invalid retrieval coords", () => {
    expect(mapsRetrievalConfig(null)).toBeUndefined()
    expect(mapsRetrievalConfig({ latitude: 999, longitude: 139.7 })).toBeUndefined()
    expect(mapsRetrievalConfig({ latitude: 35.6, longitude: 139.7 })).toEqual({
      retrievalConfig: { latLng: { latitude: 35.6, longitude: 139.7 } },
    })
  })
})

describe("fetchGeminiStreamWithToolFallback", () => {
  test("returns the first OK response and sends Maps", async () => {
    const calls: Array<Record<string, unknown>> = []
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return new Response("ok", { status: 200 })
    }) as typeof fetch

    const res = await fetchGeminiStreamWithToolFallback({
      apiKey: "k",
      baseBody: { contents: [] },
      toolConfig: mapsRetrievalConfig({ latitude: 1, longitude: 2 }),
      signal: AbortSignal.timeout(1000),
      logLabel: "test",
      fetchImpl,
    })
    expect(res.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.tools).toEqual([{ googleMaps: {} }])
    expect(calls[0]!.toolConfig).toEqual({ retrievalConfig: { latLng: { latitude: 1, longitude: 2 } } })
  })

  test("steps down tools after a 400, then succeeds", async () => {
    const tools: Array<unknown> = []
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { tools?: unknown }
      tools.push(body.tools)
      if (tools.length === 1) return new Response("cannot combine", { status: 400 })
      return new Response("ok", { status: 200 })
    }) as typeof fetch

    const res = await fetchGeminiStreamWithToolFallback({
      apiKey: "k",
      baseBody: { contents: [] },
      signal: AbortSignal.timeout(1000),
      logLabel: "test",
      fetchImpl,
    })
    expect(res.status).toBe(200)
    expect(tools[0]).toEqual([{ googleMaps: {} }])
    expect(tools[1]).toEqual([{ googleSearch: {} }])
  })

  test("aborts the 5xx retry delay instead of starting a second fetch", async () => {
    const controller = new AbortController()
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      controller.abort()
      return new Response("boom", { status: 503 })
    }) as typeof fetch

    await expect(
      fetchGeminiStreamWithToolFallback({
        apiKey: "k",
        baseBody: {},
        signal: controller.signal,
        logLabel: "test",
        fetchImpl,
      }),
    ).rejects.toBeDefined()
    expect(calls).toBe(1)
  })

  test("does not fallback on a non-400 error", async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      return new Response("nope", { status: 429 })
    }) as typeof fetch
    const res = await fetchGeminiStreamWithToolFallback({
      apiKey: "k",
      baseBody: {},
      signal: AbortSignal.timeout(1000),
      logLabel: "test",
      fetchImpl,
    })
    expect(res.status).toBe(429)
    expect(calls).toBe(1)
  })

  test("remembers the tool set that worked and starts there next time", async () => {
    const sent: string[] = []
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const tools = (JSON.parse(String(init?.body)) as { tools?: unknown[] }).tools
      sent.push(JSON.stringify(tools ?? null))
      return tools && "googleMaps" in (tools[0] as object) ? new Response("{}", { status: 400 }) : new Response("ok", { status: 200 })
    }) as unknown as typeof fetch
    const call = () =>
      fetchGeminiStreamWithToolFallback({ apiKey: "k", baseBody: {}, signal: new AbortController().signal, logLabel: "t", fetchImpl })
    expect((await call()).ok).toBe(true)
    expect((await call()).ok).toBe(true)
    expect(sent).toEqual([
      JSON.stringify([{ googleMaps: {} }]),
      JSON.stringify([{ googleSearch: {} }]),
      JSON.stringify([{ googleSearch: {} }]),
    ])
  })
})

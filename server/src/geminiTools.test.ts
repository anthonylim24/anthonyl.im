import { describe, expect, test } from "bun:test"
import {
  fetchGeminiWithTransientRetry,
  GEMINI_TOOLS_MAPS,
  mapsRetrievalConfig,
  toolsIncludeMaps,
} from "./geminiTools"

describe("gemini tool helpers", () => {
  test("knows when a tool list includes Maps", () => {
    expect(toolsIncludeMaps(GEMINI_TOOLS_MAPS)).toBe(true)
    expect(toolsIncludeMaps([{ googleSearch: {} }])).toBe(false)
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

describe("fetchGeminiWithTransientRetry", () => {
  test("aborts the 5xx retry delay instead of starting a second fetch", async () => {
    const controller = new AbortController()
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      controller.abort()
      return new Response("boom", { status: 503 })
    }) as typeof fetch

    await expect(
      fetchGeminiWithTransientRetry("https://example.invalid/models/x:generateContent", { signal: controller.signal }, fetchImpl),
    ).rejects.toBeDefined()
    expect(calls).toBe(1)
  })

  test("returns a non-transient error as is, without a retry", async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      return new Response("bad", { status: 400 })
    }) as typeof fetch
    const res = await fetchGeminiWithTransientRetry("https://example.invalid/models/x:generateContent", {}, fetchImpl)
    expect(res.status).toBe(400)
    expect(calls).toBe(1)
  })
})

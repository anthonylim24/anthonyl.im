import { describe, expect, test } from "bun:test"
import { geminiText, geminiTextStream } from "./geminiText"
import { GEMINI_FALLBACK_MODEL, GEMINI_MODEL, resetGeminiModelFallback } from "./igPlaces/gemini"

const sse = (chunks: unknown[]) =>
  new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(""), { status: 200 })
const part = (text: string, thought = false) => ({ candidates: [{ content: { parts: [{ text, thought }] } }] })

describe("geminiText", () => {
  test("asks the app model, maps assistant turns to model turns, hides thoughts", async () => {
    let seen: { url: string; body: Record<string, any> } | null = null
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, body: JSON.parse(String(init.body)) }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text: '{"a":1}' }] } }] }))
    }) as unknown as typeof fetch
    const out = await geminiText({
      apiKey: "K",
      system: "SYS",
      messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }, { role: "user", content: "again" }],
      json: true,
      fetchImpl,
    })
    expect(out).toBe('{"a":1}')
    expect(seen!.url).toContain(`${GEMINI_MODEL}:generateContent`)
    expect(seen!.body.contents.map((c: { role: string }) => c.role)).toEqual(["user", "model", "user"])
    expect(seen!.body.systemInstruction.parts[0].text).toBe("SYS")
    expect(seen!.body.generationConfig.responseMimeType).toBe("application/json")
  })

  test("throws on an error or an empty answer so the caller can use its backup", async () => {
    const bad = (async () => new Response("quota", { status: 429 })) as unknown as typeof fetch
    await expect(geminiText({ apiKey: "K", system: "s", messages: [{ role: "user", content: "x" }], fetchImpl: bad })).rejects.toThrow(/429/)
    const empty = (async () => new Response(JSON.stringify({ candidates: [] }))) as unknown as typeof fetch
    await expect(geminiText({ apiKey: "K", system: "s", messages: [{ role: "user", content: "x" }], fetchImpl: empty })).rejects.toThrow(/empty/)
  })

  test("streams visible text only, and fails before yielding when the stream cannot open", async () => {
    const fetchImpl = (async () => sse([part("Hel"), part("hidden", true), part("lo")])) as unknown as typeof fetch
    const chunks: string[] = []
    for await (const text of await geminiTextStream({ apiKey: "K", system: "s", messages: [{ role: "user", content: "x" }], fetchImpl })) chunks.push(text)
    expect(chunks).toEqual(["Hel", "lo"])
    const down = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch
    await expect(geminiTextStream({ apiKey: "K", system: "s", messages: [{ role: "user", content: "x" }], fetchImpl: down })).rejects.toThrow(/503/)
  })

  test("the backup Gemini model is the newer Flash", async () => {
    resetGeminiModelFallback()
    const urls: string[] = []
    const fetchImpl = (async (url: string) => {
      urls.push(url)
      return url.includes(`/${GEMINI_MODEL}:`)
        ? new Response(JSON.stringify({ error: { message: `models/${GEMINI_MODEL} is not found` } }), { status: 404 })
        : new Response(JSON.stringify(part("ok")))
    }) as unknown as typeof fetch
    try {
      expect(await geminiText({ apiKey: "K", system: "s", messages: [{ role: "user", content: "x" }], fetchImpl })).toBe("ok")
      expect(GEMINI_FALLBACK_MODEL).toBe("gemini-3.8-flash")
      expect(urls[1]).toContain(`/${GEMINI_FALLBACK_MODEL}:`)
    } finally {
      resetGeminiModelFallback()
    }
  })
})

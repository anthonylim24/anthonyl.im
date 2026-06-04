import { test, expect, describe, afterEach } from "bun:test"
import { Hono } from "hono"
import koreaChat from "./koreaChat"

// Helper: mount the router exactly as app.ts does (at /api/korea/chat).
function makeApp() {
  return new Hono().route("/api/korea/chat", koreaChat)
}

// Build a fake Gemini SSE Response body from a list of text deltas.
function geminiSseResponse(deltas: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const d of deltas) {
        const chunk = { candidates: [{ content: { parts: [{ text: d }] } }] }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
      }
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } })
}

// Build a raw Gemini SSE Response from pre-serialized chunk objects.
function geminiRawSse(chunks: unknown[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const ch of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify(ch)}\n\n`))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } })
}

const realFetch = globalThis.fetch
const realKey = process.env.GEMINI_API_KEY

afterEach(() => {
  globalThis.fetch = realFetch
  if (realKey === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = realKey
})

describe("POST /api/korea/chat", () => {
  test("503 when GEMINI_API_KEY is not configured", async () => {
    delete process.env.GEMINI_API_KEY
    const res = await makeApp().request("/api/korea/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    })
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe("gemini_not_configured")
  })

  test("400 when prompt is missing", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    const res = await makeApp().request("/api/korea/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    })
    expect(res.status).toBe(400)
  })

  test("relays Gemini SSE deltas as JSON-encoded chunks ending with [DONE]", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    let capturedUrl = ""
    let capturedBody: any = null
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      capturedUrl = String(url)
      capturedBody = JSON.parse(String(init.body))
      return geminiSseResponse(["Hello", " there"])
    }) as unknown as typeof fetch

    const res = await makeApp().request("/api/korea/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "What's for dinner?", slug: "day-3" }),
    })

    expect(res.status).toBe(200)
    const text = await res.text()
    // Frontend parses `data: <json-string>` and the `[DONE]` sentinel.
    expect(text).toContain(`data: ${JSON.stringify("Hello")}`)
    expect(text).toContain(`data: ${JSON.stringify(" there")}`)
    expect(text).toContain("data: [DONE]")

    // Hit the streaming endpoint with system instruction + the user prompt.
    expect(capturedUrl).toContain(":streamGenerateContent?alt=sse")
    expect(capturedBody.systemInstruction.parts[0].text).toContain("trip concierge")
    // Focused-day context made it into the system prompt.
    expect(capturedBody.systemInstruction.parts[0].text).toContain("FOCUSED DAY")
    expect(capturedBody.contents.at(-1)).toEqual({
      role: "user",
      parts: [{ text: "What's for dinner?" }],
    })
  })

  test("maps prior assistant turns to Gemini 'model' role", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    let capturedBody: any = null
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(String(init.body))
      return geminiSseResponse(["ok"])
    }) as unknown as typeof fetch

    await makeApp().request("/api/korea/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "and lunch?",
        messages: [
          { role: "user", content: "dinner?" },
          { role: "assistant", content: "Try Mingles." },
        ],
      }),
    })

    expect(capturedBody.contents[0]).toEqual({ role: "user", parts: [{ text: "dinner?" }] })
    expect(capturedBody.contents[1]).toEqual({ role: "model", parts: [{ text: "Try Mingles." }] })
  })

  test("emits a fallback reply when Gemini returns 200 with no text (safety block)", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    globalThis.fetch = (async () =>
      geminiRawSse([{ promptFeedback: { blockReason: "SAFETY" } }])) as unknown as typeof fetch

    const res = await makeApp().request("/api/korea/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    })
    const text = await res.text()
    // A real reply is sent so the client never hangs on a typing indicator.
    expect(text).toContain("outside what I can help with")
    expect(text).toContain("data: [DONE]")
  })

  test("appends a 'trimmed for length' note on MAX_TOKENS", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    globalThis.fetch = (async () =>
      geminiRawSse([
        { candidates: [{ content: { parts: [{ text: "A long answer" }] } }] },
        { candidates: [{ finishReason: "MAX_TOKENS" }] },
      ])) as unknown as typeof fetch

    const res = await makeApp().request("/api/korea/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "plan my whole day" }),
    })
    const text = await res.text()
    expect(text).toContain("trimmed for length")
  })

  test("surfaces a friendly error when Gemini responds non-OK", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    globalThis.fetch = (async () =>
      new Response("upstream boom", { status: 500 })) as unknown as typeof fetch

    const res = await makeApp().request("/api/korea/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    })

    expect(res.status).toBe(200) // SSE stream already opened
    const text = await res.text()
    expect(text).toContain("unavailable")
    expect(text).toContain("data: [DONE]")
  })
})

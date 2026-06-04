import { describe, it, expect, vi, afterEach } from "vitest"
import { streamKoreaChat } from "../koreaChatApi"

function sseResponse(lines: string[], status = 200): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(encoder.encode(l))
      controller.close()
    },
  })
  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("streamKoreaChat", () => {
  it("accumulates JSON-encoded deltas and resolves on [DONE]", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        `data: ${JSON.stringify("Hello")}\n\n`,
        `data: ${JSON.stringify(", world")}\n\n`,
        `data: [DONE]\n\n`,
      ]),
    )

    const updates: string[] = []
    const result = await streamKoreaChat("hi", [], "day-3", (c) => updates.push(c))

    expect(result.content).toBe("Hello, world")
    expect(result.error).toBeUndefined()
    expect(updates).toEqual(["Hello", "Hello, world"])
  })

  it("tolerates an event whose terminating newline arrives in a later chunk", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        `data: ${JSON.stringify("Split")}`, // no trailing newline yet
        `\n\ndata: [DONE]\n\n`,
      ]),
    )
    const result = await streamKoreaChat("hi", [], undefined, () => {})
    expect(result.content).toBe("Split")
  })

  it("surfaces an in-stream {error} object", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        `data: ${JSON.stringify({ error: "boom" })}\n\n`,
        `data: [DONE]\n\n`,
      ]),
    )
    const result = await streamKoreaChat("hi", [], undefined, () => {})
    expect(result.error).toBe("boom")
  })

  it("throws the server's friendly message on a non-OK JSON response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "GEMINI_API_KEY is not set on the server." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    )
    await expect(streamKoreaChat("hi", [], undefined, () => {})).rejects.toThrow(
      "GEMINI_API_KEY is not set on the server.",
    )
  })

  it("forwards prompt, history and slug in the request body", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(sseResponse([`data: [DONE]\n\n`]))
    await streamKoreaChat(
      "lunch?",
      [{ role: "user", content: "dinner?" }],
      "day-9",
      () => {},
    )
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({
      prompt: "lunch?",
      messages: [{ role: "user", content: "dinner?" }],
      slug: "day-9",
    })
  })
})

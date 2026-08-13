import { describe, it, expect, vi, afterEach } from "vitest"
import { streamTripChat } from "../tripChatApi"

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

const getToken = async () => "test-token"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("streamTripChat", () => {
  it("accumulates JSON-encoded deltas and resolves on [DONE]", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        `data: ${JSON.stringify("Hello")}\n\n`,
        `data: ${JSON.stringify(", world")}\n\n`,
        `data: [DONE]\n\n`,
      ]),
    )

    const updates: string[] = []
    const result = await streamTripChat("tokyo", "hi", [], "day-3", getToken, (c) => updates.push(c))

    expect(result.content).toBe("Hello, world")
    expect(result.error).toBeUndefined()
    expect(updates).toEqual(["Hello", "Hello, world"])
  })

  it("forwards prompt, history and dayId in the request body", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(sseResponse([`data: [DONE]\n\n`]))
    await streamTripChat(
      "tokyo",
      "lunch?",
      [{ role: "user", content: "dinner?" }],
      "day-9",
      getToken,
      () => {},
    )
    expect(spy.mock.calls[0]![0]).toBe("/api/trips/tokyo/chat")
    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({
      prompt: "lunch?",
      messages: [{ role: "user", content: "dinner?" }],
      dayId: "day-9",
    })
  })

  it("omits dayId when the client has no focused day", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(sseResponse([`data: [DONE]\n\n`]))
    await streamTripChat("tokyo", "hi", [], undefined, getToken, () => {})
    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ prompt: "hi", messages: [] })
    expect("dayId" in body).toBe(false)
  })

  it("maps a trip-not-found 404 to a clear error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "trip not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    )
    await expect(streamTripChat("missing", "hi", [], undefined, getToken, () => {})).rejects.toThrow(
      "This trip could not be found.",
    )
  })

  it("maps a missing-route 404 to a server-not-ready error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Not Found", { status: 404 }))
    await expect(streamTripChat("tokyo", "hi", [], undefined, getToken, () => {})).rejects.toThrow(
      "Concierge is not available on this server yet.",
    )
  })

  it("throws the server's friendly message on a non-OK JSON response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "GEMINI_API_KEY is not set on the server." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    )
    await expect(streamTripChat("tokyo", "hi", [], undefined, getToken, () => {})).rejects.toThrow(
      "GEMINI_API_KEY is not set on the server.",
    )
  })
})

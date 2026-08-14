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

  it("falls back to Korea chat when trip chat is not mounted", async () => {
    const spy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
      .mockResolvedValueOnce(
        sseResponse([`data: ${JSON.stringify("Hello")}\n\n`, `data: [DONE]\n\n`]),
      )
    const koreaTrip = {
      id: "korea-2026",
      ownerId: "u1",
      name: "Korea 2026",
      destinations: ["Seoul"],
      startDate: "2026-05-26",
      endDate: "2026-06-06",
      timezone: "Asia/Seoul",
      status: "active" as const,
      tags: [],
      collaborators: [],
      days: [{ id: "day-1", date: "2026-05-26", items: [] }],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    }
    const updates: string[] = []
    const result = await streamTripChat(
      "korea-2026",
      "lunch?",
      [],
      "day-1",
      getToken,
      (c) => updates.push(c),
      undefined,
      koreaTrip,
    )
    expect(spy.mock.calls[1]![0]).toBe("/api/korea/chat")
    const body = JSON.parse((spy.mock.calls[1]![1] as RequestInit).body as string)
    expect(body.prompt).toBe("lunch?")
    expect(body.slug).toBe("day-1")
    expect(result.content).toBe("Hello")
    expect(updates).toEqual(["Hello"])
  })

  it("falls back to Korea chat for korea-2026 even without a trip document", async () => {
    const spy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
      .mockResolvedValueOnce(sseResponse([`data: ${JSON.stringify("ok")}\n\n`, `data: [DONE]\n\n`]))
    const result = await streamTripChat("korea-2026", "lunch?", [], "day-1", getToken, () => {})
    expect(spy.mock.calls[1]![0]).toBe("/api/korea/chat")
    const body = JSON.parse((spy.mock.calls[1]![1] as RequestInit).body as string)
    expect(body.prompt).toBe("lunch?")
    expect(body.slug).toBe("day-1")
    expect(result.content).toBe("ok")
  })

  it("wraps a non-Korea trip into the Korea chat prompt on fallback", async () => {
    const spy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "not found" }), { status: 404 }))
      .mockResolvedValueOnce(sseResponse([`data: [DONE]\n\n`]))
    const tokyo = {
      id: "tokyo",
      ownerId: "u1",
      name: "Tokyo Long Weekend",
      destinations: ["Tokyo"],
      startDate: "2026-07-10",
      endDate: "2026-07-12",
      timezone: "Asia/Tokyo",
      status: "active" as const,
      tags: [],
      collaborators: [],
      days: [{ id: "day-1", date: "2026-07-10", title: "Arrival", items: [] }],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    }
    await streamTripChat("tokyo", "ramen?", [], "day-1", getToken, () => {}, undefined, tokyo)
    const body = JSON.parse((spy.mock.calls[1]![1] as RequestInit).body as string)
    expect(spy.mock.calls[1]![0]).toBe("/api/korea/chat")
    expect(body.prompt).toContain("Tokyo Long Weekend")
    expect(body.prompt).toContain("Question: ramen?")
    expect(body.slug).toBeUndefined()
  })

  it("maps a gateway timeout to a retryable concierge error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Bad Gateway", { status: 502 }))
    await expect(streamTripChat("tokyo", "hi", [], undefined, getToken, () => {})).rejects.toThrow(
      /did not respond in time/i,
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

  it("asks the traveler to sign in again on 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    )
    await expect(streamTripChat("tokyo", "hi", [], undefined, getToken, () => {})).rejects.toThrow(
      /sign in again/i,
    )
  })

  it("maps a dropped fetch to a retryable connection error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network error"))
    await expect(streamTripChat("tokyo", "hi", [], undefined, getToken, () => {})).rejects.toThrow(
      /lost its connection/i,
    )
  })

  it("maps Firefox's NetworkError fetch failure the same way", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("NetworkError when attempting to fetch resource."),
    )
    await expect(streamTripChat("tokyo", "hi", [], undefined, getToken, () => {})).rejects.toThrow(
      /lost its connection/i,
    )
  })
})

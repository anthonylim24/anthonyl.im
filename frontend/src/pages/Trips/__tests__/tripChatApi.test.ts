import { describe, it, expect, vi, afterEach } from "vitest"
import { streamTripChat as stream, type TripChatMessage } from "../tripChatApi"
import type { Trip } from "../types"

/** Positional shorthand for the request most of these tests make. */
function streamTripChat(
  tripId: string,
  prompt: string,
  messages: TripChatMessage[],
  dayId: string | undefined,
  token: () => Promise<string | null>,
  onText: (content: string) => void,
  signal?: AbortSignal,
  trip?: Trip,
) {
  return stream({ tripId, prompt, messages, dayId, signal, trip }, token, { onText })
}

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

  it("collects places and sources and hides the add-places trailer", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        `data: ${JSON.stringify("Try Ichiran.\n:::add-places\n")}\n\n`,
        `data: ${JSON.stringify({ places: [{ name: "Ichiran", address: "Shibuya" }] })}\n\n`,
        `data: ${JSON.stringify({ sources: [{ kind: "maps", title: "Ichiran", uri: "https://maps.google.com/?cid=1" }] })}\n\n`,
        `data: ${JSON.stringify({ moves: [{ type: "remove", name: "Ichiran" }] })}\n\n`,
        `data: [DONE]\n\n`,
      ]),
    )
    const updates: string[] = []
    const result = await streamTripChat("tokyo", "ramen?", [], undefined, getToken, (c) => updates.push(c))
    expect(result.content).toBe("Try Ichiran.")
    expect(result.places).toEqual([{ name: "Ichiran", address: "Shibuya" }])
    expect(result.moves).toEqual([{ type: "remove", name: "Ichiran" }])
    expect(result.sources?.[0]?.kind).toBe("maps")
    expect(updates[updates.length - 1]).toBe("Try Ichiran.")
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

  it("strips add-places trailers on the Korea chat fallback", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
      .mockResolvedValueOnce(
        sseResponse([
          `data: ${JSON.stringify("Try Ichiran.\n:::add-places\n")}\n\n`,
          `data: [DONE]\n\n`,
        ]),
      )
    const updates: string[] = []
    const result = await streamTripChat("korea-2026", "ramen?", [], "day-1", getToken, (c) => updates.push(c))
    expect(result.content).toBe("Try Ichiran.")
    expect(updates[updates.length - 1]).toBe("Try Ichiran.")
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

  it("keeps partial text and flags a stream that ends without [DONE]", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([`data: ${JSON.stringify("Hello, wo")}\n\n`]),
    )
    const updates: string[] = []
    const result = await streamTripChat("tokyo", "hi", [], undefined, getToken, (c) => updates.push(c))
    expect(result.content).toBe("Hello, wo")
    expect(result.error).toMatch(/lost its connection/i)
    expect(updates).toEqual(["Hello, wo"])
  })

  it("maps Firefox's NetworkError fetch failure the same way", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("NetworkError when attempting to fetch resource."),
    )
    await expect(streamTripChat("tokyo", "hi", [], undefined, getToken, () => {})).rejects.toThrow(
      /lost its connection/i,
    )
  })

  it("relays live status, the model, a proposal and follow-ups as they arrive", async () => {
    const proposal = {
      id: "prop-1",
      summary: "Move dinner to 20:00",
      changes: [
        { id: "c1", op: "set_time", dayId: "day-1", itemId: "dinner", title: "Dinner", from: "20:30", time: "20:00" },
        { id: "c2", op: "teleport" },
      ],
    }
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        `data: ${JSON.stringify({ meta: { model: "gemini-4-hydrogen", tools: ["search", "places"] } })}\n\n`,
        `data: ${JSON.stringify({ status: { kind: "places", label: "Checking Google Maps", detail: "coffee near MAAT" } })}\n\n`,
        `data: ${JSON.stringify("Apply moves dinner.")}\n\n`,
        `data: ${JSON.stringify({ proposal })}\n\n`,
        `data: ${JSON.stringify({ status: { kind: "done" } })}\n\n`,
        `data: ${JSON.stringify({ followups: ["How do we get there?", "", 7] })}\n\n`,
        `data: [DONE]\n\n`,
      ]),
    )
    const seen: string[] = []
    const result = await stream({ tripId: "tokyo", prompt: "move dinner to 8", messages: [] }, getToken, {
      onText: () => seen.push("text"),
      onStatus: (status) => seen.push(`status:${status.kind}:${status.detail ?? ""}`),
      onMeta: (meta) => seen.push(`meta:${meta.model}`),
      onProposal: (p) => seen.push(`proposal:${p.changes.length}`),
      onFollowups: (f) => seen.push(`followups:${f.length}`),
    })
    expect(seen).toEqual([
      "meta:gemini-4-hydrogen",
      "status:places:coffee near MAAT",
      "text",
      "proposal:1",
      "status:done:",
      "followups:1",
    ])
    expect(result.meta?.model).toBe("gemini-4-hydrogen")
    // The malformed change is dropped; the valid one survives.
    expect(result.proposal?.changes).toEqual([proposal.changes[0]])
    expect(result.followups).toEqual(["How do we get there?"])
  })

  it("sends a shared position and the cards of earlier replies", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(sseResponse([`data: [DONE]\n\n`]))
    const messages: TripChatMessage[] = [
      { role: "user", content: "wine bars?" },
      {
        role: "assistant",
        content: "Bloco.",
        places: [{ ref: "ChIJbloco", name: "Bloco", dayId: "day-3", time: "21:00" }],
        proposal: { summary: "Add Bloco", state: "applied" },
      },
    ]
    await stream({ tripId: "tokyo", prompt: "near me?", messages, location: { lat: 38.7, lng: -9.1 } }, getToken, {
      onText: () => {},
    })
    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)
    expect(body.location).toEqual({ lat: 38.7, lng: -9.1 })
    expect(body.messages).toEqual(messages)
  })

  it("explains a rate limit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 429 }))
    await expect(streamTripChat("tokyo", "hi", [], undefined, getToken, () => {})).rejects.toThrow(/busy/i)
  })
})

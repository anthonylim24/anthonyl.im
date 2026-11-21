import { afterEach, describe, expect, it, vi } from "vitest"
import { createInvite, duplicateTrip, joinTrip, leaveTrip, revokeInvite } from "../tripsApi"
import type { Trip } from "../types"

const getToken = async () => "test-token"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

function call(spy: { mock: { calls: unknown[][] } }, index: number) {
  const [url, init] = spy.mock.calls[index] as [string, RequestInit]
  const headers = new Headers(init.headers)
  return {
    url: String(url),
    method: init.method ?? "GET",
    auth: headers.get("Authorization"),
    contentType: headers.get("Content-Type"),
    body: typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined,
  }
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "lisbon",
    ownerId: "u1",
    name: "Lisbon Long Weekend",
    destinations: ["Lisbon"],
    startDate: "2026-07-10",
    endDate: "2026-07-11",
    timezone: "Europe/Lisbon",
    status: "active",
    tags: ["food"],
    collaborators: [],
    days: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("invite links", () => {
  it("createInvite posts the role and returns the invite", async () => {
    const invite = { token: "tok-1", role: "editor" as const, createdAt: "2026-06-01T00:00:00Z" }
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ invite }))

    await expect(createInvite(getToken, "trip 1", "editor")).resolves.toEqual(invite)
    expect(call(spy, 0)).toEqual({
      url: "/api/trips/trip%201/invites",
      method: "POST",
      auth: "Bearer test-token",
      contentType: "application/json",
      body: { role: "editor" },
    })
  })

  it("revokeInvite deletes the encoded token", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ ok: true }))

    await expect(revokeInvite(getToken, "lisbon", "tok/1")).resolves.toEqual({ ok: true })
    const sent = call(spy, 0)
    expect(sent.url).toBe("/api/trips/lisbon/invites/tok%2F1")
    expect(sent.method).toBe("DELETE")
    expect(sent.auth).toBe("Bearer test-token")
    expect(sent.body).toBeUndefined()
  })

  it("joinTrip posts the display name when there is one", async () => {
    const result = { trip: { id: "lisbon", slug: "lisbon-2026", name: "Lisbon" }, access: "view" as const }
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(result))

    await expect(joinTrip(getToken, "tok-1", "Mina")).resolves.toEqual(result)
    expect(call(spy, 0)).toMatchObject({ url: "/api/trips/join/tok-1", method: "POST", body: { name: "Mina" } })

    await joinTrip(getToken, "tok-1")
    expect(call(spy, 1).body).toEqual({})
  })

  it("joinTrip surfaces the server's error for a dead link", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: "invite_not_found" }, 404))
    await expect(joinTrip(getToken, "gone")).rejects.toThrow(/invite_not_found/)
  })

  it("leaveTrip posts to the leave endpoint", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ ok: true }))

    await expect(leaveTrip(getToken, "lisbon")).resolves.toEqual({ ok: true })
    const sent = call(spy, 0)
    expect(sent.url).toBe("/api/trips/lisbon/leave")
    expect(sent.method).toBe("POST")
    expect(sent.auth).toBe("Bearer test-token")
  })

  it("sends no Authorization header without a token", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ ok: true }))
    await leaveTrip(async () => null, "lisbon")
    expect(call(spy, 0).auth).toBeNull()
  })
})

describe("duplicateTrip", () => {
  const source = makeTrip({
    description: "Pastries and trams",
    center: { lat: 38.72, lng: -9.14 },
    appearance: { accent: "sky", headline: "Hills and tiles" },
    collaborators: [{ userId: "u2", role: "editor" }],
    days: [
      {
        id: "src-day-a",
        date: "2026-07-10",
        title: "Alfama",
        city: "Lisbon",
        items: [
          { id: "it-old-1", kind: "place", title: "Castle", status: "none", createdBy: "user", location: { name: "Castle", lat: 38.71, lng: -9.13, source: "user" } },
          { id: "it-old-2", kind: "note", title: "Bring cash", status: "none", createdBy: "ai" },
        ],
      },
      { id: "src-day-b", date: "2026-07-11", title: "Belém", items: [{ id: "it-old-3", kind: "place", title: "Tower", status: "booked", createdBy: "user" }] },
    ],
  })

  it("creates a copy, then PATCHes the days across with fresh item ids", async () => {
    const created = makeTrip({
      id: "new-trip",
      name: "Lisbon Long Weekend (copy)",
      status: "draft",
      days: [
        { id: "day-1", date: "2026-07-10", items: [] },
        { id: "day-2", date: "2026-07-11", items: [] },
      ],
    })
    const saved = makeTrip({ id: "new-trip", name: "Lisbon Long Weekend (copy)" })
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ trip: created }))
      .mockResolvedValueOnce(json({ trip: saved }))

    await expect(duplicateTrip(getToken, source)).resolves.toEqual(saved)
    expect(spy).toHaveBeenCalledTimes(2)

    const post = call(spy, 0)
    expect(post.url).toBe("/api/trips")
    expect(post.method).toBe("POST")
    expect(post.body).toEqual({
      name: "Lisbon Long Weekend (copy)",
      destinations: ["Lisbon"],
      startDate: "2026-07-10",
      endDate: "2026-07-11",
      timezone: "Europe/Lisbon",
      tags: ["food"],
      description: "Pastries and trams",
      center: { lat: 38.72, lng: -9.14 },
    })

    const patch = call(spy, 1)
    expect(patch.url).toBe("/api/trips/new-trip")
    expect(patch.method).toBe("PATCH")
    expect(patch.body!.appearance).toEqual({ accent: "sky", headline: "Hills and tiles" })
    // The people on the original are not carried into the copy.
    expect(patch.body).not.toHaveProperty("collaborators")

    const days = patch.body!.days as Trip["days"]
    expect(days.map((d) => [d.id, d.date, d.title])).toEqual([
      ["day-1", "2026-07-10", "Alfama"],
      ["day-2", "2026-07-11", "Belém"],
    ])
    expect(days[0]!.city).toBe("Lisbon")
    expect(days.flatMap((d) => d.items.map((i) => i.title))).toEqual(["Castle", "Bring cash", "Tower"])
    expect(days[0]!.items[0]!.location).toEqual({ name: "Castle", lat: 38.71, lng: -9.13, source: "user" })
    // A booking made for the original isn't made for the copy.
    expect(days[1]!.items[0]!.status).toBe("none")

    const ids = days.flatMap((d) => d.items.map((i) => i.id))
    expect(new Set(ids).size).toBe(3)
    for (const id of ids) {
      expect(id).toMatch(/^it-[0-9a-f]{8}$/)
      expect(["it-old-1", "it-old-2", "it-old-3"]).not.toContain(id)
    }
    // The source trip is left untouched.
    expect(source.days[0]!.items[0]!.id).toBe("it-old-1")
  })

  it("keeps a created day as-is when the source has no day on that date", async () => {
    const created = makeTrip({
      id: "new-trip",
      days: [
        { id: "day-1", date: "2026-07-10", items: [] },
        { id: "day-2", date: "2026-07-12", items: [] },
      ],
    })
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ trip: created }))
      .mockResolvedValueOnce(json({ trip: created }))

    await duplicateTrip(getToken, source)
    const days = call(spy, 1).body!.days as Trip["days"]
    expect(days[0]!.title).toBe("Alfama")
    expect(days[1]).toEqual({ id: "day-2", date: "2026-07-12", items: [] })
  })

  it("caps the copied name at 160 characters", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ trip: makeTrip({ id: "new-trip" }) }))
      .mockResolvedValueOnce(json({ trip: makeTrip({ id: "new-trip" }) }))

    await duplicateTrip(getToken, makeTrip({ name: "x".repeat(158) }))
    const name = call(spy, 0).body!.name as string
    expect(name).toHaveLength(160)
    expect(name.startsWith("x".repeat(158))).toBe(true)
  })

  it("does not PATCH when the create fails", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ message: "nope" }, 500))
    await expect(duplicateTrip(getToken, source)).rejects.toThrow(/nope/)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("leaves the journey behind: statuses, bookings made, journals, highlights and ticks", async () => {
    const lived = makeTrip({
      checklist: [{ id: "c1", text: "Passport", done: true, group: "documents", createdAt: "2026-01-01T00:00:00Z" }],
      ideas: [{ id: "idea-1", kind: "place", title: "LX Factory", status: "completed", highlight: true, createdBy: "user" }],
      days: [
        {
          id: "src-day-a",
          date: "2026-07-10",
          journal: "Best pastéis of the trip.",
          items: [
            {
              id: "it-flight",
              kind: "reservation",
              title: "Flight to Lisbon",
              status: "booked",
              highlight: true,
              createdBy: "user",
              reservation: { type: "flight", status: "confirmed", confirmation: "ABC123", seat: "14A", number: "TP 202", from: "JFK", to: "LIS" },
            },
            { id: "it-done", kind: "place", title: "Castle", status: "completed", createdBy: "user" },
            { id: "it-skip", kind: "place", title: "Museum", status: "skipped", createdBy: "user" },
            { id: "it-maybe", kind: "place", title: "Fado bar", status: "optional", createdBy: "user" },
          ],
        },
      ],
    })
    const created = makeTrip({ id: "new-trip", days: [{ id: "day-1", date: "2026-07-10", items: [] }] })
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ trip: created }))
      .mockResolvedValueOnce(json({ trip: created }))

    await duplicateTrip(getToken, lived)
    const body = call(spy, 1).body!
    const [day] = body.days as Trip["days"]
    expect(day!.journal).toBeUndefined()
    expect(day!.items.map((i) => i.status)).toEqual(["none", "none", "none", "optional"])
    expect(day!.items.some((i) => i.highlight)).toBe(false)
    expect(day!.items[0]!.reservation).toEqual({ type: "flight", status: "pending", number: "TP 202", from: "JFK", to: "LIS" })
    expect((body.checklist as { done: boolean }[])[0]!.done).toBe(false)
    expect(body.ideas).toEqual([{ id: expect.stringMatching(/^it-/), kind: "place", title: "LX Factory", status: "none", createdBy: "user" }])
  })

  it("removes the empty copy when the plan can't be copied across", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ trip: makeTrip({ id: "new-trip" }) }))
      .mockResolvedValueOnce(json({ message: "Server error" }, 500))
      .mockResolvedValueOnce(json({ ok: true }))

    await expect(duplicateTrip(getToken, source)).rejects.toThrow("Server error")
    expect(spy).toHaveBeenCalledTimes(3)
    expect(call(spy, 2)).toMatchObject({ url: "/api/trips/new-trip", method: "DELETE" })
  })

  it("says so when the empty copy couldn't be removed either", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ trip: makeTrip({ id: "new-trip" }) }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))

    await expect(duplicateTrip(getToken, source)).rejects.toThrow(
      "Couldn’t copy the plan, and an empty “Lisbon Long Weekend (copy)” is left in your trips to delete. (Failed to fetch)",
    )
  })
})

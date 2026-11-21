import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { Hono } from "hono"
import { rateLimitStore } from "../middleware/rateLimit"
import { createBookingParser, type BookingParser } from "../trips/bookingParse"
import { MemoryTripStore } from "../trips/store"
import { createTripsRouter, type TripsRouterDeps } from "./trips"

// POST /api/trips/:id/bookings/parse, through the real trips router with a
// memory store and a fake model.

const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" }
const VIEWER = { Authorization: "Bearer viewer", "Content-Type": "application/json" }
const STRANGER = { Authorization: "Bearer stranger", "Content-Type": "application/json" }

const stay = { type: "hotel", title: "Halekulani", date: "2026-12-20", time: "15:00", endDate: "2026-12-24", endTime: "11:00" }

function makeApp(overrides: Partial<TripsRouterDeps> = {}) {
  const deps: TripsRouterDeps = {
    store: new MemoryTripStore(),
    verifyAuth: async (header) => ({ "Bearer owner": "user-1", "Bearer viewer": "user-2", "Bearer stranger": "user-3" })[header ?? ""] ?? null,
    llm: null,
    fetchWeather: async () => [],
    parseBookings: createBookingParser({ gemini: async () => JSON.stringify({ bookings: [stay] }) }),
    ...overrides,
  }
  const app = new Hono()
  app.route("/api/trips", createTripsRouter(deps))
  return app
}

async function makeTrip(app: Hono): Promise<string> {
  const res = await app.request("/api/trips", {
    method: "POST",
    headers: OWNER,
    body: JSON.stringify({ name: "Hawaii", destinations: ["Honolulu"], startDate: "2026-12-20", endDate: "2026-12-27", timezone: "Pacific/Honolulu" }),
  })
  expect(res.status).toBe(201)
  return ((await res.json()) as { trip: { id: string } }).trip.id
}

async function shareAsViewer(app: Hono, tripId: string) {
  const invite = await app.request(`/api/trips/${tripId}/invites`, { method: "POST", headers: OWNER, body: JSON.stringify({ role: "viewer" }) })
  const { invite: made } = (await invite.json()) as { invite: { token: string } }
  const joined = await app.request(`/api/trips/join/${made.token}`, { method: "POST", headers: VIEWER, body: "{}" })
  expect(joined.status).toBe(200)
}

const parse = (app: Hono, tripId: string, text: unknown, headers: Record<string, string> = OWNER) =>
  app.request(`/api/trips/${tripId}/bookings/parse`, { method: "POST", headers, body: JSON.stringify({ text }) })

let warn: ReturnType<typeof spyOn>
let error: ReturnType<typeof spyOn>
beforeEach(() => {
  // The paste limit is per user and process-wide; every test starts with a clean count.
  rateLimitStore.clear()
  warn = spyOn(console, "warn").mockImplementation(() => {})
  error = spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  warn.mockRestore()
  error.mockRestore()
})

describe("POST /api/trips/:id/bookings/parse", () => {
  test("answers the bookings found, as items to review", async () => {
    const app = makeApp()
    const id = await makeTrip(app)
    const res = await parse(app, id, "Your stay at Halekulani, Dec 20–24")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { bookings: Array<{ date: string; item: Record<string, unknown> }> }
    expect(body.bookings).toHaveLength(1)
    expect(body.bookings[0]!.date).toBe("2026-12-20")
    expect(body.bookings[0]!.item).toMatchObject({ kind: "reservation", title: "Halekulani", reservation: { type: "hotel", endDate: "2026-12-24" } })
    expect(body.bookings[0]!.item.id).toBeUndefined()
  })

  test("adds nothing to the trip", async () => {
    const app = makeApp()
    const id = await makeTrip(app)
    await parse(app, id, "Your stay at Halekulani")
    const trip = (await (await app.request(`/api/trips/${id}`, { headers: OWNER })).json()) as { trip: { days: Array<{ items: unknown[] }> } }
    expect(trip.trip.days.every((day) => day.items.length === 0)).toBe(true)
  })

  test("needs a signed-in editor", async () => {
    const app = makeApp()
    const id = await makeTrip(app)
    expect((await parse(app, id, "x", { "Content-Type": "application/json" })).status).toBe(401)
    expect((await parse(app, id, "x", STRANGER)).status).toBe(404)
    await shareAsViewer(app, id)
    expect((await parse(app, id, "x", VIEWER)).status).toBe(403)
  })

  test("caps the paste at 20,000 characters and refuses an empty one", async () => {
    let called = 0
    const app = makeApp({
      parseBookings: async () => {
        called += 1
        return []
      },
    })
    const id = await makeTrip(app)
    const tooLong = await parse(app, id, "a".repeat(20_001))
    expect(tooLong.status).toBe(413)
    expect(((await tooLong.json()) as { message: string }).message).toContain("20,000")
    const huge = await app.request(`/api/trips/${id}/bookings/parse`, { method: "POST", headers: OWNER, body: JSON.stringify({ text: "\u0001".repeat(50_000) }) })
    expect(huge.status).toBe(413)
    expect((await parse(app, id, "   ")).status).toBe(400)
    expect((await parse(app, id, 42)).status).toBe(400)
    expect((await parse(app, id, "a".repeat(20_000))).status).toBe(200)
    expect(called).toBe(1)
  })

  test("drops what the model got wrong and keeps the rest", async () => {
    const app = makeApp({
      parseBookings: createBookingParser({
        gemini: async () => JSON.stringify({ bookings: [{ type: "flight", title: "Flight", date: "next Tuesday" }, { nonsense: true }, stay] }),
      }),
    })
    const id = await makeTrip(app)
    const body = (await (await parse(app, id, "two bookings")).json()) as { bookings: Array<{ item: { title: string } }> }
    expect(body.bookings.map((b) => b.item.title)).toEqual(["Halekulani"])
  })

  test("says plainly when the server has no model key", async () => {
    const app = makeApp({ parseBookings: null })
    const id = await makeTrip(app)
    const res = await parse(app, id, "Your stay at Halekulani")
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe("ai_not_configured")
    expect(body.message).toContain("by hand")
  })

  test("answers 502 when no model could read it, without logging the paste", async () => {
    const secret = "PNR ZZ9PLZ Jane Doe"
    const failing: BookingParser = createBookingParser({
      gemini: async () => `I can't. ${secret}`,
      groq: async () => {
        throw new Error(`groq echoed ${secret}`)
      },
    })!
    const app = makeApp({ parseBookings: failing })
    const id = await makeTrip(app)
    const res = await parse(app, id, secret)
    expect(res.status).toBe(502)
    expect(((await res.json()) as { message: string }).message).toContain("Try again")
    const logged = [...warn.mock.calls, ...error.mock.calls].flat().map(String).join("\n")
    expect(logged).not.toContain("ZZ9PLZ")
  })

  test("has its own, stricter rate limit per user", async () => {
    const app = makeApp()
    const id = await makeTrip(app)
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) statuses.push((await parse(app, id, `paste ${i}`)).status)
    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true)
    expect(statuses[10]).toBe(429)
    // Only pasting is held back, and only for this traveller.
    expect((await app.request(`/api/trips/${id}`, { headers: OWNER })).status).toBe(200)
    await shareAsViewer(app, id)
    expect((await parse(app, id, "x", VIEWER)).status).toBe(403)
  })
})

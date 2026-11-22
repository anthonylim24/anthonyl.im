import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { Hono } from "hono"
import { rateLimitStore } from "../middleware/rateLimit"
import { MemoryTripStore } from "../trips/store"
import { createDaySuggester, type DayModel, type DaySuggester } from "../trips/suggestDays"
import { createTripsRouter, type TripsRouterDeps } from "./trips"

// POST /api/trips/:id/ideas/suggest-days, through the real trips router with
// a memory store and a fake model.

const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" }
const VIEWER = { Authorization: "Bearer viewer", "Content-Type": "application/json" }
const STRANGER = { Authorization: "Bearer stranger", "Content-Type": "application/json" }

const NOW = () => new Date("2026-11-21T12:00:00Z")
const idea = { title: "Ikseon-dong hanok alleys", theme: "neighborhood", location: { name: "Ikseon-dong", lat: 37.5743, lng: 126.9897 } }

function makeApp(overrides: Partial<TripsRouterDeps> = {}, model: DayModel | null = null) {
  const deps: TripsRouterDeps = {
    store: new MemoryTripStore(),
    verifyAuth: async (header) => ({ "Bearer owner": "user-1", "Bearer viewer": "user-2", "Bearer stranger": "user-3" })[header ?? ""] ?? null,
    llm: null,
    fetchWeather: async () => [],
    suggestDays: createDaySuggester({ model, now: NOW, timeoutMs: 50 }),
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
    body: JSON.stringify({ name: "Seoul", destinations: ["Seoul"], startDate: "2026-12-01", endDate: "2026-12-03", timezone: "Asia/Seoul" }),
  })
  expect(res.status).toBe(201)
  const { trip } = (await res.json()) as { trip: { id: string; days: Array<{ id: string }> } }
  // Day 2 gets a stop near the idea.
  const days = trip.days.map((day, i) =>
    i === 1
      ? { ...day, items: [{ id: "gj", kind: "place", title: "Gwangjang Market", status: "none", createdBy: "user", location: { name: "Gwangjang Market", lat: 37.5701, lng: 126.9996, source: "user" } }] }
      : day,
  )
  const patched = await app.request(`/api/trips/${trip.id}`, { method: "PATCH", headers: OWNER, body: JSON.stringify({ days }) })
  expect(patched.status).toBe(200)
  return trip.id
}

async function shareAsViewer(app: Hono, tripId: string) {
  const invite = await app.request(`/api/trips/${tripId}/invites`, { method: "POST", headers: OWNER, body: JSON.stringify({ role: "viewer" }) })
  const { invite: made } = (await invite.json()) as { invite: { token: string } }
  const joined = await app.request(`/api/trips/join/${made.token}`, { method: "POST", headers: VIEWER, body: "{}" })
  expect(joined.status).toBe(200)
}

const suggest = (app: Hono, tripId: string, body: unknown, headers: Record<string, string> = OWNER) =>
  app.request(`/api/trips/${tripId}/ideas/suggest-days`, { method: "POST", headers, body: JSON.stringify(body) })

let warn: ReturnType<typeof spyOn>
let error: ReturnType<typeof spyOn>
beforeEach(() => {
  rateLimitStore.clear()
  warn = spyOn(console, "warn").mockImplementation(() => {})
  error = spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  warn.mockRestore()
  error.mockRestore()
})

describe("POST /api/trips/:id/ideas/suggest-days", () => {
  test("answers the nearby ranking without a model", async () => {
    const app = makeApp()
    const id = await makeTrip(app)
    const res = await suggest(app, id, { idea })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { picks: Array<{ dayId: string; reason: string; nearestKm?: number }>; source: string }
    expect(body.source).toBe("nearby")
    expect(body.picks[0]).toMatchObject({ dayId: "day-2", reason: expect.stringContaining("from Gwangjang Market") })
    expect(body.picks[0]!.nearestKm).toBeLessThan(1.2)
    expect(body.picks.length).toBeLessThanOrEqual(3)
  })

  test("answers the model's picks, tagged ai, as the trip's own day ids", async () => {
    let keys: string[] = []
    const app = makeApp({}, async (prompt) => {
      keys = prompt.dayIds
      return JSON.stringify({ picks: [{ dayId: "d3", reason: "A free day for the alleys" }] })
    })
    const id = await makeTrip(app)
    const body = (await (await suggest(app, id, { idea })).json()) as { picks: Array<{ dayId: string; reason: string }>; source: string }
    expect(keys).toEqual(["d1", "d2", "d3"])
    expect(body).toEqual({ source: "ai", picks: [{ dayId: "day-3", reason: "A free day for the alleys" }] })
  })

  test("sends the model none of the booking codes or contact details in the idea's notes", async () => {
    let user = ""
    const app = makeApp({}, async (prompt) => {
      user = prompt.user
      return JSON.stringify({ picks: [] })
    })
    const id = await makeTrip(app)
    await suggest(app, id, { idea: { ...idea, notes: "Confirmation K9X2Q7, host jin@example.com, +82 10 9876 5432" } })
    expect(user).toContain("Ikseon-dong")
    for (const secret of ["K9X2Q7", "jin@example.com", "9876 5432"]) expect(user).not.toContain(secret)
  })

  test("still answers when the model fails, and logs none of the idea", async () => {
    const app = makeApp({}, async () => {
      throw new Error("boom")
    })
    const id = await makeTrip(app)
    const res = await suggest(app, id, { idea: { ...idea, notes: "PRIVATE-NOTE" } })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { source: string }).source).toBe("nearby")
    const logged = [...warn.mock.calls, ...error.mock.calls].flat().map(String).join("\n")
    expect(logged).not.toContain("PRIVATE-NOTE")
    expect(logged).not.toContain("Ikseon")
  })

  test("needs a signed-in editor", async () => {
    const app = makeApp()
    const id = await makeTrip(app)
    expect((await suggest(app, id, { idea }, { "Content-Type": "application/json" })).status).toBe(401)
    expect((await suggest(app, id, { idea }, STRANGER)).status).toBe(404)
    expect((await suggest(app, "no-such-trip", { idea })).status).toBe(404)
    await shareAsViewer(app, id)
    expect((await suggest(app, id, { idea }, VIEWER)).status).toBe(403)
  })

  test("validates the idea and caps its size", async () => {
    let called = 0
    const counting: DaySuggester = async () => {
      called += 1
      return { picks: [], source: "nearby" }
    }
    const app = makeApp({ suggestDays: counting })
    const id = await makeTrip(app)
    expect((await suggest(app, id, {})).status).toBe(400)
    expect((await suggest(app, id, { idea: { title: 42 } })).status).toBe(400)
    expect((await suggest(app, id, { idea: { title: "x", theme: "spaceflight" } })).status).toBe(400)
    expect((await suggest(app, id, { idea: { title: "x", location: { name: "x", lat: 120, lng: 0 } } })).status).toBe(400)
    expect((await suggest(app, id, { idea: { title: "x".repeat(301) } })).status).toBe(400)
    expect((await suggest(app, id, { idea: { title: "x", notes: "y".repeat(40_000) } })).status).toBe(413)
    expect(called).toBe(0)
    expect((await suggest(app, id, { idea: { title: "Just a name" } })).status).toBe(200)
    expect(called).toBe(1)
  })

  test("has its own rate limit per user: 30 in 10 minutes", async () => {
    const app = makeApp()
    const id = await makeTrip(app)
    const statuses: number[] = []
    for (let i = 0; i < 31; i++) statuses.push((await suggest(app, id, { idea })).status)
    expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true)
    expect(statuses[30]).toBe(429)
    // Only suggestions are held back.
    expect((await app.request(`/api/trips/${id}`, { headers: OWNER })).status).toBe(200)
  })
})

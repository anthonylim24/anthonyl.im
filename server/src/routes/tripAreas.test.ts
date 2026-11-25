import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { Hono } from "hono"
import { rateLimitStore } from "../middleware/rateLimit"
import { areaId, createNeighborhoods, type AreaModel, type NeighborhoodService } from "../trips/neighborhoods"
import { MemoryTripStore } from "../trips/store"
import { createTripsRouter, type TripsRouterDeps } from "./trips"

// GET /api/trips/:id/neighborhoods and …/:areaId/outline, through the real
// trips router with a memory store and a fake model.

const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" }
const VIEWER = { Authorization: "Bearer viewer", "Content-Type": "application/json" }
const STRANGER = { Authorization: "Bearer stranger", "Content-Type": "application/json" }

const GROUPED = JSON.stringify({ areas: [{ name: "Jongno", localName: "종로", city: "Seoul", summary: "Palaces and markets.", stops: ["s1", "s2"] }] })

function makeApp(neighborhoods: NeighborhoodService | null) {
  const deps: TripsRouterDeps = {
    store: new MemoryTripStore(),
    verifyAuth: async (header) => ({ "Bearer owner": "user-1", "Bearer viewer": "user-2", "Bearer stranger": "user-3" })[header ?? ""] ?? null,
    llm: null,
    fetchWeather: async () => [],
    neighborhoods,
  }
  const app = new Hono()
  app.route("/api/trips", createTripsRouter(deps))
  return app
}

async function makeTrip(app: Hono): Promise<string> {
  const res = await app.request("/api/trips", {
    method: "POST",
    headers: OWNER,
    body: JSON.stringify({ name: "Seoul", destinations: ["Seoul"], startDate: "2026-12-01", endDate: "2026-12-02", timezone: "Asia/Seoul" }),
  })
  const { trip } = (await res.json()) as { trip: { id: string; days: Array<{ id: string; date: string }> } }
  const stop = (id: string, name: string, lat: number, lng: number) => ({ id, kind: "place", title: name, status: "none", createdBy: "user", location: { name, lat, lng, source: "user" } })
  const days = trip.days.map((day, i) => ({ ...day, items: i === 0 ? [stop("gb", "Gyeongbokgung", 37.5796, 126.977), stop("gj", "Gwangjang Market", 37.5701, 126.9996)] : [] }))
  expect((await app.request(`/api/trips/${trip.id}`, { method: "PATCH", headers: OWNER, body: JSON.stringify({ days }) })).status).toBe(200)
  return trip.id
}

async function shareAsViewer(app: Hono, tripId: string) {
  const invite = await app.request(`/api/trips/${tripId}/invites`, { method: "POST", headers: OWNER, body: JSON.stringify({ role: "viewer" }) })
  const { invite: made } = (await invite.json()) as { invite: { token: string } }
  expect((await app.request(`/api/trips/join/${made.token}`, { method: "POST", headers: VIEWER, body: "{}" })).status).toBe(200)
}

const list = (app: Hono, id: string, headers: Record<string, string> = OWNER) => app.request(`/api/trips/${id}/neighborhoods`, { headers })
const outline = (app: Hono, id: string, area: string, headers: Record<string, string> = OWNER) =>
  app.request(`/api/trips/${id}/neighborhoods/${area}/outline`, { headers })

let warn: ReturnType<typeof spyOn>
beforeEach(() => {
  rateLimitStore.clear()
  warn = spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => warn.mockRestore())

describe("GET /api/trips/:id/neighborhoods", () => {
  test("answers the areas, with the trip's own stop ids, to anyone who can see the trip", async () => {
    const model: AreaModel = async () => GROUPED
    const app = makeApp(createNeighborhoods({ models: [model] }))
    const id = await makeTrip(app)
    await shareAsViewer(app, id)
    const res = await list(app, id, VIEWER)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      areas: [{ id: areaId("Jongno", "Seoul"), name: "Jongno", localName: "종로", city: "Seoul", summary: "Palaces and markets.", stopIds: ["gb", "gj"], photos: [] }],
    })
  })

  test("needs a signed-in user who can see the trip", async () => {
    const app = makeApp(createNeighborhoods({ models: [async () => GROUPED] }))
    const id = await makeTrip(app)
    expect((await list(app, id, { "Content-Type": "application/json" })).status).toBe(401)
    expect((await list(app, id, STRANGER)).status).toBe(404)
    expect((await list(app, "no-such-trip")).status).toBe(404)
  })

  test("answers 202 while the model is still grouping, then the areas", async () => {
    let release: (raw: string) => void = () => {}
    const slow: AreaModel = () => new Promise((resolve) => (release = resolve))
    const service = createNeighborhoods({ models: [slow] })
    const app = new Hono()
    app.route(
      "/api/trips",
      createTripsRouter({
        store: new MemoryTripStore(),
        verifyAuth: async (header) => (header === "Bearer owner" ? "user-1" : null),
        llm: null,
        neighborhoods: service,
        areasWaitMs: 5,
      }),
    )
    const id = await makeTrip(app)
    const waiting = await list(app, id)
    expect(waiting.status).toBe(202)
    expect(await waiting.json()).toEqual({ status: "grouping" })
    release(GROUPED)
    await Bun.sleep(1)
    const ready = await list(app, id)
    expect(ready.status).toBe(200)
    expect(((await ready.json()) as { areas: unknown[] }).areas).toHaveLength(1)
  })

  test("says calmly that grouping failed, with none of the model's words, and 503 without a model", async () => {
    const app = makeApp(createNeighborhoods({ models: [async () => "Error: SECRET quota dump"] }))
    const id = await makeTrip(app)
    const res = await list(app, id)
    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: string; message: string }
    expect(body).toEqual({ error: "neighborhoods_failed", message: "Couldn’t group your stops into neighborhoods just now." })
    const off = makeApp(null)
    const offId = await makeTrip(off)
    expect((await list(off, offId)).status).toBe(503)
  })
})

describe("GET /api/trips/:id/neighborhoods/:areaId/outline", () => {
  test("answers the outline of a grouped area, null for one it does not know, and 400 for a malformed id", async () => {
    const shape = { type: "Polygon" as const, coordinates: [[[126.97, 37.56], [127.01, 37.56], [127.01, 37.59], [126.97, 37.56]]] }
    const app = makeApp(createNeighborhoods({ models: [async () => GROUPED], outlines: async () => shape }))
    const id = await makeTrip(app)
    expect(await (await outline(app, id, areaId("Jongno", "Seoul"))).json()).toEqual({ outline: null })
    await list(app, id)
    expect(await (await outline(app, id, areaId("Jongno", "Seoul"))).json()).toEqual({ outline: shape })
    expect(await (await outline(app, id, "a-0000000000")).json()).toEqual({ outline: null })
    expect((await outline(app, id, "../etc")).status).toBe(404)
    expect((await outline(app, id, "not-an-area")).status).toBe(400)
    expect((await outline(app, id, areaId("Jongno", "Seoul"), STRANGER)).status).toBe(404)
  })

  test("answers 503 when the outline could not be looked up, so the client keeps its approximate shape", async () => {
    const app = makeApp(
      createNeighborhoods({
        models: [async () => GROUPED],
        outlines: async () => {
          throw new Error("nominatim 429")
        },
      }),
    )
    const id = await makeTrip(app)
    await list(app, id)
    const res = await outline(app, id, areaId("Jongno", "Seoul"))
    expect(res.status).toBe(503)
    expect(((await res.json()) as { error: string }).error).toBe("outline_unavailable")
  })
})

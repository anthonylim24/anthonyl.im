import { beforeEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { MemoryTripStore } from "../trips/store"
import { KOREA_TRIP_ID } from "../trips/koreaTrip"
import { createTripsRouter, type TripsRouterDeps } from "./trips"

const AUTH = { Authorization: "Bearer test-token", "Content-Type": "application/json" }

function makeApp(overrides: Partial<TripsRouterDeps> = {}) {
  const store = new MemoryTripStore()
  const deps: TripsRouterDeps = {
    store,
    verifyAuth: async (header) => {
      if (header === "Bearer test-token") return "user-1"
      if (header === "Bearer other-token") return "user-2"
      return null
    },
    llm: null,
    fetchWeather: async () => [],
    ...overrides,
  }
  const app = new Hono()
  app.route("/api/trips", createTripsRouter(deps))
  return { app, store }
}

const newTripBody = JSON.stringify({
  name: "Tokyo Long Weekend",
  destinations: ["Tokyo"],
  startDate: "2026-07-10",
  endDate: "2026-07-12",
  timezone: "Asia/Tokyo",
})

async function createTrip(app: Hono, headers: Record<string, string> = AUTH) {
  const res = await app.request("/api/trips", { method: "POST", headers, body: newTripBody })
  expect(res.status).toBe(201)
  const { trip } = (await res.json()) as { trip: { id: string; days: unknown[] } }
  return trip
}

describe("trips auth", () => {
  test("rejects unauthenticated requests", async () => {
    const { app } = makeApp()
    const res = await app.request("/api/trips")
    expect(res.status).toBe(401)
  })
})

describe("trips CRUD", () => {
  let app: Hono
  beforeEach(() => {
    app = makeApp().app
  })

  test("creates a blank trip with one empty day per date", async () => {
    const trip = await createTrip(app)
    expect(trip.days.length).toBe(3)
  })

  test("rejects invalid payloads", async () => {
    const res = await app.request("/api/trips", { method: "POST", headers: AUTH, body: JSON.stringify({ name: "x" }) })
    expect(res.status).toBe(400)
  })

  test("lists own trips plus the seeded Korea trip", async () => {
    await createTrip(app)
    const res = await app.request("/api/trips", { headers: AUTH })
    expect(res.status).toBe(200)
    const { trips } = (await res.json()) as { trips: Array<{ id: string; access: string }> }
    expect(trips.length).toBe(2)
    const korea = trips.find((t) => t.id === KOREA_TRIP_ID)
    expect(korea).toBeDefined()
    expect(korea!.access).toBe("edit") // sharedWithAllUsers legacy behavior
  })

  test("updates metadata and days", async () => {
    const trip = await createTrip(app)
    const res = await app.request(`/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: AUTH,
      body: JSON.stringify({
        name: "Tokyo + Kyoto",
        status: "active",
        days: [
          {
            id: "day-1",
            date: "2026-07-10",
            items: [
              {
                id: "it-1",
                kind: "place",
                title: "Senso-ji",
                status: "none",
                createdBy: "user",
                location: { name: "Senso-ji", lat: 35.7148, lng: 139.7967, source: "user" },
              },
            ],
          },
        ],
      }),
    })
    expect(res.status).toBe(200)
    const { trip: updated } = (await res.json()) as { trip: { name: string; status: string; days: Array<{ items: unknown[] }> } }
    expect(updated.name).toBe("Tokyo + Kyoto")
    expect(updated.status).toBe("active")
    expect(updated.days.length).toBe(1)
    expect(updated.days[0]!.items.length).toBe(1)
  })

  test("other users cannot see, edit, or delete a private trip", async () => {
    const trip = await createTrip(app)
    const other = { Authorization: "Bearer other-token", "Content-Type": "application/json" }
    expect((await app.request(`/api/trips/${trip.id}`, { headers: other })).status).toBe(403)
    expect(
      (await app.request(`/api/trips/${trip.id}`, { method: "PATCH", headers: other, body: JSON.stringify({ name: "hijack" }) }))
        .status,
    ).toBe(403)
    expect((await app.request(`/api/trips/${trip.id}`, { method: "DELETE", headers: other })).status).toBe(403)
  })

  test("viewer collaborators can view but not edit", async () => {
    const trip = await createTrip(app)
    await app.request(`/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: AUTH,
      body: JSON.stringify({ collaborators: [{ userId: "user-2", role: "viewer" }] }),
    })
    const other = { Authorization: "Bearer other-token", "Content-Type": "application/json" }
    expect((await app.request(`/api/trips/${trip.id}`, { headers: other })).status).toBe(200)
    expect(
      (await app.request(`/api/trips/${trip.id}`, { method: "PATCH", headers: other, body: JSON.stringify({ name: "nope" }) }))
        .status,
    ).toBe(403)
  })

  test("editor collaborators can edit but not change collaborators or delete", async () => {
    const trip = await createTrip(app)
    await app.request(`/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: AUTH,
      body: JSON.stringify({ collaborators: [{ userId: "user-2", role: "editor" }] }),
    })
    const other = { Authorization: "Bearer other-token", "Content-Type": "application/json" }
    expect(
      (await app.request(`/api/trips/${trip.id}`, { method: "PATCH", headers: other, body: JSON.stringify({ name: "Shared" }) }))
        .status,
    ).toBe(200)
    expect(
      (
        await app.request(`/api/trips/${trip.id}`, {
          method: "PATCH",
          headers: other,
          body: JSON.stringify({ collaborators: [] }),
        })
      ).status,
    ).toBe(403)
    expect((await app.request(`/api/trips/${trip.id}`, { method: "DELETE", headers: other })).status).toBe(403)
  })

  test("owner can delete", async () => {
    const trip = await createTrip(app)
    expect((await app.request(`/api/trips/${trip.id}`, { method: "DELETE", headers: AUTH })).status).toBe(200)
    expect((await app.request(`/api/trips/${trip.id}`, { headers: AUTH })).status).toBe(404)
  })
})

describe("korea seed trip", () => {
  test("is fetchable and editable by any authenticated user, but not deletable", async () => {
    const { app } = makeApp()
    const res = await app.request(`/api/trips/${KOREA_TRIP_ID}`, { headers: AUTH })
    expect(res.status).toBe(200)
    const { trip } = (await res.json()) as { trip: { days: Array<{ id: string; items: unknown[] }> } }
    expect(trip.days.length).toBe(12)
    expect(trip.days[0]!.items.length).toBeGreaterThan(0)
    expect((await app.request(`/api/trips/${KOREA_TRIP_ID}`, { method: "DELETE", headers: AUTH })).status).toBe(403)
  })

  test("serves Map Mode places for a Korea day in the PlacesResponse shape", async () => {
    const { app } = makeApp()
    const res = await app.request(`/api/trips/${KOREA_TRIP_ID}/days/day-4/places?lat=37.55&lng=127.04`, { headers: AUTH })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      meta: { slug: string; city: string; center?: { lat: number } }
      places: Array<{ id: string; lat: number; lng: number; icon: string; color: string; priority: string; distanceLabel?: string }>
      igSaves: unknown[]
      neighborhoods: unknown[]
    }
    expect(body.meta.slug).toBe("day-4")
    expect(body.places.length).toBeGreaterThan(0)
    for (const p of body.places) {
      expect(typeof p.lat).toBe("number")
      expect(typeof p.lng).toBe("number")
      expect(p.icon).toBeTruthy()
      expect(p.color).toMatch(/^#/)
      expect(["scheduled", "core", "supplemental"]).toContain(p.priority)
      expect(p.distanceLabel).toBeTruthy()
    }
  })
})

describe("AI generation endpoint", () => {
  const llmOk = async () =>
    JSON.stringify({
      summary: "Plan ready.",
      days: [
        {
          title: "Day in Asakusa",
          items: [
            { kind: "place", title: "Senso-ji", location: { name: "Senso-ji", address: "Asakusa", lat: 35.7, lng: 139.8, category: "shrine" } },
          ],
        },
      ],
    })

  test("returns 503 when no LLM is configured", async () => {
    const { app } = makeApp({ llm: null })
    const trip = await createTrip(app)
    const res = await app.request(`/api/trips/${trip.id}/generate`, { method: "POST", headers: AUTH, body: "{}" })
    expect(res.status).toBe(503)
  })

  test("generates a structured itinerary into the trip", async () => {
    const { app } = makeApp({ llm: llmOk })
    const trip = await createTrip(app)
    const res = await app.request(`/api/trips/${trip.id}/generate`, { method: "POST", headers: AUTH, body: "{}" })
    expect(res.status).toBe(200)
    const { trip: updated, summary } = (await res.json()) as {
      trip: { days: Array<{ items: Array<{ createdBy: string; location?: { source: string } }> }> }
      summary: string
    }
    expect(summary).toBe("Plan ready.")
    expect(updated.days.length).toBe(3)
    expect(updated.days[0]!.items[0]!.createdBy).toBe("ai")
    expect(updated.days[0]!.items[0]!.location!.source).toBe("ai")
  })

  test("refuses to overwrite a non-empty itinerary without replaceExisting", async () => {
    const { app } = makeApp({ llm: llmOk })
    const trip = await createTrip(app)
    await app.request(`/api/trips/${trip.id}/generate`, { method: "POST", headers: AUTH, body: "{}" })
    const res = await app.request(`/api/trips/${trip.id}/generate`, { method: "POST", headers: AUTH, body: "{}" })
    expect(res.status).toBe(409)
    const res2 = await app.request(`/api/trips/${trip.id}/generate`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ replaceExisting: true }),
    })
    expect(res2.status).toBe(200)
  })

  test("maps model failure to 502", async () => {
    const { app } = makeApp({ llm: async () => "garbage" })
    const trip = await createTrip(app)
    const res = await app.request(`/api/trips/${trip.id}/generate`, { method: "POST", headers: AUTH, body: "{}" })
    expect(res.status).toBe(502)
  })
})

describe("enhancement endpoints", () => {
  const llmSuggest = async () =>
    JSON.stringify({
      summary: "One tweak.",
      suggestions: [
        {
          kind: "add",
          dayId: "day-1",
          title: "Add lunch",
          detail: "No meals on day 1",
          confidence: "medium",
          proposedItem: { kind: "place", title: "Ichiran", location: { name: "Ichiran", address: "Shibuya", lat: 35.66, lng: 139.7, category: "restaurant" } },
        },
      ],
    })

  test("creates a run, lists it, and applies accepted suggestions", async () => {
    const { app } = makeApp({ llm: llmSuggest })
    const trip = await createTrip(app)

    const enhanceRes = await app.request(`/api/trips/${trip.id}/enhance`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ scope: "trip" }),
    })
    expect(enhanceRes.status).toBe(200)
    const { run } = (await enhanceRes.json()) as { run: { id: string; suggestions: Array<{ id: string }> } }
    expect(run.suggestions.length).toBe(1)

    const listRes = await app.request(`/api/trips/${trip.id}/enhancements`, { headers: AUTH })
    const { runs } = (await listRes.json()) as { runs: Array<{ id: string }> }
    expect(runs.map((r) => r.id)).toContain(run.id)

    const applyRes = await app.request(`/api/trips/${trip.id}/enhancements/${run.id}/apply`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ suggestionIds: [run.suggestions[0]!.id] }),
    })
    expect(applyRes.status).toBe(200)
    const { trip: updated, applied } = (await applyRes.json()) as {
      trip: { days: Array<{ items: Array<{ title: string }> }> }
      applied: string[]
    }
    expect(applied.length).toBe(1)
    expect(updated.days[0]!.items.map((i) => i.title)).toContain("Ichiran")
  })

  test("requires dayId for day scope", async () => {
    const { app } = makeApp({ llm: llmSuggest })
    const trip = await createTrip(app)
    const res = await app.request(`/api/trips/${trip.id}/enhance`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ scope: "day" }),
    })
    expect(res.status).toBe(400)
  })
})

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { MemoryTripStore } from "../trips/store"
import { KOREA_TRIP_ID } from "../trips/koreaTrip"
import { createTripsRouter, type TripsRouterDeps } from "./trips"

const AUTH = { Authorization: "Bearer test-token", "Content-Type": "application/json" }

function makeApp(overrides: Partial<TripsRouterDeps> = {}) {
  const store = overrides.store ?? new MemoryTripStore()
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

async function startEnhance(app: Hono, tripId: string, body: unknown = { scope: "trip" }) {
  const res = await app.request(`/api/trips/${tripId}/enhance`, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify(body),
  })
  expect(res.status).toBe(202)
  const started = (await res.json()) as { run: { id: string; status: string } }
  expect(started.run.status).toBe("running")
  return started.run
}

async function waitForEnhance(app: Hono, tripId: string, runId: string) {
  for (let i = 0; i < 50; i++) {
    await Bun.sleep(5)
    const res = await app.request(`/api/trips/${tripId}/enhancements/${runId}`, { headers: AUTH })
    if (res.status !== 200) continue
    const body = (await res.json()) as {
      run: {
        id: string
        status: string
        outcome?: string
        outcomeReason?: string
        appliedSuggestionIds: string[]
        suggestions: Array<{ id: string; kind: string }>
        error?: string
      }
      trip: { days: Array<{ items: Array<{ id: string; title: string; time?: string }> }> }
      applied: string[]
      error?: string
      message?: string
    }
    if (body.run.status !== "running") return body
  }
  throw new Error("enhancement did not finish")
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

  test("a slow draft keeps the connection alive and still delivers the trip", async () => {
    const slow = async () => {
      await new Promise((r) => setTimeout(r, 60))
      return llmOk()
    }
    const { app } = makeApp({ llm: slow, generateGraceMs: 5 })
    const trip = await createTrip(app)
    const res = await app.request(`/api/trips/${trip.id}/generate`, { method: "POST", headers: AUTH, body: "{}" })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text.startsWith(" ")).toBe(true)
    const body = JSON.parse(text) as { trip: { days: unknown[] }; summary: string }
    expect(body.summary).toBe("Plan ready.")
    expect(body.trip.days.length).toBe(3)
  })

  test("a slow draft that fails reports the error in the body", async () => {
    const slow = async () => {
      await new Promise((r) => setTimeout(r, 40))
      return "garbage"
    }
    const { app } = makeApp({ llm: slow, generateGraceMs: 5 })
    const trip = await createTrip(app)
    const res = await app.request(`/api/trips/${trip.id}/generate`, { method: "POST", headers: AUTH, body: "{}" })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { error: string }).error).toBe("generation_failed")
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

  test("creates a run, auto-applies add suggestions, and lists the run", async () => {
    const { app } = makeApp({ llm: llmSuggest })
    const trip = await createTrip(app)

    const started = await startEnhance(app, trip.id)
    const { run, trip: enhanced, applied } = await waitForEnhance(app, trip.id, started.id)
    expect(run.suggestions.length).toBe(1)
    expect(applied).toEqual([run.suggestions[0]!.id])
    expect(run.appliedSuggestionIds).toEqual(applied)
    expect(run.outcome).toBe("added_places")
    expect(run.outcomeReason).toBeTruthy()
    expect(enhanced.days[0]!.items.map((i) => i.title)).toContain("Ichiran")

    const listRes = await app.request(`/api/trips/${trip.id}/enhancements`, { headers: AUTH })
    const { runs } = (await listRes.json()) as { runs: Array<{ id: string }> }
    expect(runs.map((r) => r.id)).toContain(run.id)

    const applyRes = await app.request(`/api/trips/${trip.id}/enhancements/${run.id}/apply`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ suggestionIds: [run.suggestions[0]!.id] }),
    })
    expect(applyRes.status).toBe(200)
    const { applied: reapplied, skipped } = (await applyRes.json()) as { applied: string[]; skipped: string[] }
    expect(reapplied).toEqual([])
    expect(skipped).toEqual([run.suggestions[0]!.id])
  })

  test("leaves edit suggestions reviewable and surfaces a no-add reason", async () => {
    const { app } = makeApp({
      llm: async () =>
        JSON.stringify({
          summary: "One timing tweak; meals are covered.",
          outcome: "no_adds_needed",
          outcomeReason: "Day 1 already has a full cluster of stops; adding more would overpack the morning.",
          suggestions: [
            {
              kind: "edit",
              dayId: "day-1",
              itemId: "it-a",
              title: "Start earlier",
              detail: "Beat crowds.",
              confidence: "high",
              proposedChanges: { time: "08:00" },
            },
          ],
        }),
    })
    const trip = await createTrip(app)
    await app.request(`/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: AUTH,
      body: JSON.stringify({
        days: [
          {
            id: "day-1",
            date: trip.days[0]!.date,
            items: [
              {
                id: "it-a",
                kind: "place",
                title: "Osaka Castle",
                status: "none",
                createdBy: "user",
                location: { name: "Osaka Castle", lat: 34.69, lng: 135.53, source: "user" },
              },
            ],
          },
        ],
      }),
    })
    const started = await startEnhance(app, trip.id)
    const { run, applied, trip: enhanced } = await waitForEnhance(app, trip.id, started.id)
    expect(applied).toEqual([])
    expect(run.suggestions.map((s) => s.kind)).toEqual(["edit"])
    expect(enhanced.days[0]!.items.find((i) => i.id === "it-a")!.time).toBeUndefined()
    expect(run.outcome).toBe("no_adds_needed")
    expect(run.outcomeReason).toMatch(/overpack|meals|cluster/i)
  })

  test("returns a parseable error body when the model fails", async () => {
    const { app } = makeApp({ llm: async () => "not json at all" })
    const trip = await createTrip(app)
    const started = await startEnhance(app, trip.id)
    const body = await waitForEnhance(app, trip.id, started.id)
    expect(body.error).toBe("enhancement_failed")
    expect(body.message).toBeTruthy()
    expect(body.run.status).toBe("error")
    expect(body.run.outcomeReason).toMatch(/failed before/i)
  })

  test("remeshes a concurrent PATCH instead of overwriting it", async () => {
    const store = new MemoryTripStore()
    const origGet = store.get.bind(store)
    const origUpdate = store.update.bind(store)
    let sneakOnNextGet = false
    let sneaked = false
    store.get = async (id) => {
      const trip = await origGet(id)
      if (sneakOnNextGet && !sneaked && trip) {
        sneaked = true
        await origUpdate({
          ...trip,
          name: "Sneak edit",
          updatedAt: "2099-01-01T00:00:00.000Z",
        })
        return trip
      }
      return trip
    }

    let release!: () => void
    const hold = new Promise<void>((resolve) => {
      release = resolve
    })
    const { app } = makeApp({
      store,
      llm: async () => {
        await hold
        return JSON.stringify({
          summary: "One tweak.",
          suggestions: [
            {
              kind: "add",
              dayId: "day-1",
              title: "Add lunch",
              detail: "No meals on day 1",
              confidence: "medium",
              proposedItem: {
                kind: "place",
                title: "Ichiran",
                location: { name: "Ichiran", address: "Shibuya", lat: 35.66, lng: 139.7, category: "restaurant" },
              },
            },
          ],
        })
      },
    })
    const trip = await createTrip(app)
    const started = await startEnhance(app, trip.id)
    sneakOnNextGet = true
    release()
    const { trip: enhanced } = await waitForEnhance(app, trip.id, started.id)
    expect(enhanced.name).toBe("Sneak edit")
    expect(enhanced.days[0]!.items.map((i) => i.title)).toContain("Ichiran")
  })

  test("does not recreate a trip deleted while enhance is running", async () => {
    let release!: () => void
    const hold = new Promise<void>((resolve) => {
      release = resolve
    })
    const { app, store } = makeApp({
      llm: async () => {
        await hold
        return JSON.stringify({
          summary: "One tweak.",
          suggestions: [
            {
              kind: "add",
              dayId: "day-1",
              title: "Add lunch",
              detail: "No meals on day 1",
              confidence: "medium",
              proposedItem: {
                kind: "place",
                title: "Ichiran",
                location: { name: "Ichiran", lat: 35.66, lng: 139.7, category: "restaurant" },
              },
            },
          ],
        })
      },
    })
    const trip = await createTrip(app)
    const started = await startEnhance(app, trip.id)
    await store.delete(trip.id)
    release()
    for (let i = 0; i < 50; i++) {
      await Bun.sleep(5)
      const run = await store.getRun(trip.id, started.id)
      if (run && run.status !== "running") {
        expect(run.status).toBe("error")
        expect(run.outcomeReason).toMatch(/failed before/i)
        expect(await store.get(trip.id)).toBeNull()
        return
      }
    }
    throw new Error("enhancement did not finish")
  })

  test("returns the trip that matches a just-finished run", async () => {
    const { app, store } = makeApp({ llm: llmSuggest })
    const trip = await createTrip(app)
    const started = await startEnhance(app, trip.id)
    await waitForEnhance(app, trip.id, started.id)

    const fresh = await store.get(trip.id)
    expect(fresh).toBeTruthy()
    const origGet = store.get.bind(store)
    let reads = 0
    store.get = async (id) => {
      reads += 1
      if (reads === 1) {
        return { ...fresh!, name: "Stale snapshot", updatedAt: "2000-01-01T00:00:00.000Z" }
      }
      return origGet(id)
    }

    const res = await app.request(`/api/trips/${trip.id}/enhancements/${started.id}`, { headers: AUTH })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { trip: { name: string }; run: { status: string } }
    expect(body.run.status).toBe("complete")
    expect(body.trip.name).toBe(fresh!.name)
    expect(body.trip.name).not.toBe("Stale snapshot")
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

describe("live-document saves (empty drafts)", () => {
  test("accepts a just-added item with empty title and empty place name", async () => {
    const { app } = makeApp()
    const trip = await createTrip(app)
    const res = await app.request(`/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: AUTH,
      body: JSON.stringify({
        days: [
          {
            id: "day-1",
            date: "2026-07-10",
            items: [
              { id: "it-new", kind: "place", title: "", status: "none", createdBy: "user", location: { name: "", source: "user" } },
              { id: "it-note", kind: "note", title: "", status: "none", createdBy: "user" },
            ],
            callouts: [{ icon: "⚠️", tone: "warn", body: "" }],
          },
        ],
      }),
    })
    expect(res.status).toBe(200)
  })
})

describe("permalinks", () => {
  test("creates an intelligent slug from name + year and resolves by it", async () => {
    const { app } = makeApp()
    const res = await app.request("/api/trips", { method: "POST", headers: AUTH, body: newTripBody })
    const { trip } = (await res.json()) as { trip: { id: string; slug: string } }
    expect(trip.slug).toBe("tokyo-long-weekend-2026")
    const bySlug = await app.request(`/api/trips/tokyo-long-weekend-2026`, { headers: AUTH })
    expect(bySlug.status).toBe(200)
    expect(((await bySlug.json()) as { trip: { id: string } }).trip.id).toBe(trip.id)
  })

  test("auto-dedupes default slugs", async () => {
    const { app } = makeApp()
    const t1 = await createTrip(app)
    const r2 = await app.request("/api/trips", { method: "POST", headers: AUTH, body: newTripBody })
    const { trip: t2 } = (await r2.json()) as { trip: { slug: string } }
    expect((t1 as { slug?: string }).slug).toBe("tokyo-long-weekend-2026")
    expect(t2.slug).toBe("tokyo-long-weekend-2026-2")
  })

  test("custom slug can be set; duplicates are rejected with 409", async () => {
    const { app } = makeApp()
    const t1 = await createTrip(app)
    const r2 = await app.request("/api/trips", { method: "POST", headers: AUTH, body: newTripBody })
    const { trip: t2 } = (await r2.json()) as { trip: { id: string } }

    const ok = await app.request(`/api/trips/${t2.id}`, {
      method: "PATCH",
      headers: AUTH,
      body: JSON.stringify({ slug: "honeymoon" }),
    })
    expect(ok.status).toBe(200)

    const clash = await app.request(`/api/trips/${t1.id}`, {
      method: "PATCH",
      headers: AUTH,
      body: JSON.stringify({ slug: "honeymoon" }),
    })
    expect(clash.status).toBe(409)

    const invalid = await app.request(`/api/trips/${t1.id}`, {
      method: "PATCH",
      headers: AUTH,
      body: JSON.stringify({ slug: "Bad Slug!" }),
    })
    expect(invalid.status).toBe(400)
  })
})

describe("enhance with custom prompt", () => {
  test("forwards the traveler's focus into the model context", async () => {
    let seenUser = ""
    const { app } = makeApp({
      llm: async ({ user }: { user: string }) => {
        seenUser = user
        return JSON.stringify({ summary: "ok", suggestions: [] })
      },
    })
    const trip = await createTrip(app)
    const started = await startEnhance(app, trip.id, { scope: "trip", prompt: "find more vegetarian dinners" })
    await waitForEnhance(app, trip.id, started.id)
    expect(seenUser).toContain("find more vegetarian dinners")
  })
})

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

describe("concierge chat", () => {
  const realFetch = globalThis.fetch
  const realKey = process.env.GEMINI_API_KEY

  afterEach(() => {
    globalThis.fetch = realFetch
    if (realKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = realKey
  })

  test("rejects unauthenticated chat", async () => {
    const { app } = makeApp()
    const trip = await createTrip(app)
    const res = await app.request(`/api/trips/${trip.id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    })
    expect(res.status).toBe(401)
  })

  test("404 when the focused day is missing", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    const { app } = makeApp()
    const trip = await createTrip(app)
    const res = await app.request(`/api/trips/${trip.id}/chat`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ prompt: "hi", dayId: "not-a-day" }),
    })
    expect(res.status).toBe(404)
  })

  test("503 when GEMINI_API_KEY is not configured", async () => {
    delete process.env.GEMINI_API_KEY
    const { app } = makeApp()
    const trip = await createTrip(app)
    const res = await app.request(`/api/trips/${trip.id}/chat`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ prompt: "hi" }),
    })
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("gemini_not_configured")
  })

  test("relays Gemini SSE and includes the trip in the system prompt", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    let capturedBody: {
      systemInstruction?: { parts: Array<{ text: string }> }
      generationConfig?: { thinkingConfig?: { thinkingLevel?: string } }
      tools?: Array<Record<string, unknown>>
      toolConfig?: unknown
    } | null = null
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (!String(url).includes(":streamGenerateContent")) return new Response("{}", { status: 500 })
      capturedBody = JSON.parse(String(init?.body)) as typeof capturedBody
      return geminiSseResponse(["Hello", " there"])
    }) as unknown as typeof fetch

    const { app } = makeApp()
    const trip = await createTrip(app)
    const dayId = (trip.days[0] as { id: string }).id
    const res = await app.request(`/api/trips/${trip.id}/chat`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ prompt: "What's the plan?", dayId }),
    })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain(`data: ${JSON.stringify("Hello")}`)
    expect(text).toContain(`data: ${JSON.stringify(" there")}`)
    expect(text).toContain("data: [DONE]")
    const sys = capturedBody?.systemInstruction?.parts[0]?.text ?? ""
    expect(sys).toContain("Tokyo Long Weekend")
    expect(sys).toContain("FOCUSED DAY")
    expect(sys).toContain("propose_changes")
    expect(capturedBody?.generationConfig?.thinkingConfig).toEqual({ thinkingLevel: "low" })
    // Built-in Search plus our own functions, which Hydrogen only accepts
    // with server-side tool invocations switched on.
    expect(capturedBody?.tools?.[0]).toEqual({ googleSearch: {} })
    const declared = (capturedBody?.tools?.[1] as { functionDeclarations: Array<{ name: string }> }).functionDeclarations
    expect(declared.map((d) => d.name)).toContain("propose_changes")
    expect(capturedBody?.toolConfig).toEqual({ includeServerSideToolInvocations: true })
  })

  test("reports the model that answered in a meta event", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    globalThis.fetch = (async (url: string) => {
      if (!String(url).includes(":streamGenerateContent")) return new Response("{}", { status: 500 })
      return geminiRawSse([{ modelVersion: "gemini-4-hydrogen", candidates: [{ content: { parts: [{ text: "Hi." }] } }] }])
    }) as unknown as typeof fetch

    const { app } = makeApp()
    const trip = await createTrip(app)
    const res = await app.request(`/api/trips/${trip.id}/chat`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ prompt: "hello" }),
    })
    const text = await res.text()
    expect(text).toContain('"meta":{"model":"gemini-4-hydrogen"')
    expect(text.indexOf('"meta"')).toBeLessThan(text.indexOf('"Hi."'))
  })

  test("steps down to functions only when the model rejects Search with functions", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    const toolSets: unknown[] = []
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (!String(url).includes(":streamGenerateContent")) return new Response("{}", { status: 500 })
      const body = JSON.parse(String(init?.body)) as { tools?: unknown[] }
      toolSets.push(body.tools?.length ?? 0)
      if (body.tools?.length === 2) return new Response('{"error":{"message":"cannot be combined"}}', { status: 400 })
      return geminiSseResponse(["Fine."])
    }) as unknown as typeof fetch

    const { app } = makeApp()
    const trip = await createTrip(app)
    const res = await app.request(`/api/trips/${trip.id}/chat`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ prompt: "hello" }),
    })
    expect(await res.text()).toContain(`data: ${JSON.stringify("Fine.")}`)
    expect(toolSets).toEqual([2, 1])
  })

  test("runs propose_changes, validates it against the trip and emits a proposal", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    const { app } = makeApp()
    const trip = await createTrip(app)
    const dayId = (trip.days[0] as { id: string }).id
    await app.request(`/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: AUTH,
      body: JSON.stringify({
        days: [
          { ...trip.days[0], items: [{ id: "dinner", kind: "place", title: "Sushi Dai", time: "20:30", status: "none", createdBy: "user" }] },
          ...trip.days.slice(1),
        ],
      }),
    })

    const requests: Array<{ contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> }> = []
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (!String(url).includes(":streamGenerateContent")) return new Response("{}", { status: 500 })
      requests.push(JSON.parse(String(init?.body)))
      if (requests.length === 1) {
        return geminiRawSse([
          {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      thoughtSignature: "sig-1",
                      functionCall: {
                        id: "call-1",
                        name: "propose_changes",
                        args: {
                          summary: "Move dinner to 20:00",
                          changes: [
                            { op: "set_time", itemId: "dinner", time: "20:00" },
                            { op: "remove", itemId: "ghost" },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ])
      }
      return geminiSseResponse(["Apply moves **Sushi Dai** to 20:00."])
    }) as unknown as typeof fetch

    const res = await app.request(`/api/trips/${trip.id}/chat`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ prompt: "Move dinner to 8", dayId }),
    })
    const text = await res.text()
    const proposalLine = text.split("\n").find((line) => line.startsWith('data: {"proposal"')) ?? ""
    const { proposal } = JSON.parse(proposalLine.slice(5)) as {
      proposal: { summary: string; changes: Array<Record<string, unknown>> }
    }
    expect(proposal.summary).toBe("Move dinner to 20:00")
    expect(proposal.changes).toEqual([
      { id: "c1", op: "set_time", dayId, itemId: "dinner", title: "Sushi Dai", from: "20:30", time: "20:00" },
    ])
    expect(text).toContain("Apply moves **Sushi Dai** to 20:00.")
    expect(text.indexOf('data: {"proposal"')).toBeLessThan(text.indexOf("[DONE]"))

    // The second request replays the model's parts untouched (signature
    // included) and answers the call, with the bad change explained.
    const second = requests[1]!.contents
    expect(second[second.length - 2]!.parts[0]!.thoughtSignature).toBe("sig-1")
    const reply = second[second.length - 1]!.parts[0]!.functionResponse as {
      id: string
      response: { shown: number; rejected: string[] }
    }
    expect(reply.id).toBe("call-1")
    expect(reply.response.shown).toBe(1)
    expect(reply.response.rejected[0]).toContain("no stop with that itemId")
  })

  test("passes earlier cards back so follow-ups can point at them", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    let contents: Array<{ role: string; parts: Array<{ text?: string }> }> = []
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (!String(url).includes(":streamGenerateContent")) return new Response("{}", { status: 500 })
      contents = (JSON.parse(String(init?.body)) as { contents: typeof contents }).contents
      return geminiSseResponse(["Ok."])
    }) as unknown as typeof fetch

    const { app } = makeApp()
    const trip = await createTrip(app)
    await app.request(`/api/trips/${trip.id}/chat`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        prompt: "The second one. Add it to Saturday.",
        messages: [
          { role: "user", content: "Wine bars?" },
          {
            role: "assistant",
            content: "**Bloco** or **Black Sheep**.",
            places: [
              { ref: "ChIJbloco000", name: "Bloco" },
              { ref: "ChIJsheep000", name: "Black Sheep", address: "Praça das Flores 62" },
            ],
          },
        ],
      }),
    })
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user"])
    expect(contents[1]!.parts[0]!.text).toContain("2. Black Sheep (ref ChIJsheep000), Praça das Flores 62")
    expect(contents[2]!.parts[0]!.text).toBe("The second one. Add it to Saturday.")
  })

  test("emits web sources from grounding metadata", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    globalThis.fetch = (async (url: string) => {
      if (!String(url).includes(":streamGenerateContent")) return new Response("{}", { status: 500 })
      return geminiRawSse([
        {
          candidates: [
            {
              content: { parts: [{ text: "Senso-ji is open daily." }] },
              groundingMetadata: {
                groundingChunks: [{ web: { title: "senso-ji.jp", uri: "https://www.senso-ji.jp/about/" } }],
              },
            },
          ],
        },
      ])
    }) as unknown as typeof fetch

    const { app } = makeApp()
    const trip = await createTrip(app)
    const res = await app.request(`/api/trips/${trip.id}/chat`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ prompt: "temple?" }),
    })
    const text = await res.text()
    expect(text).toContain("Senso-ji")
    expect(text).toContain('"sources"')
    expect(text).toContain("senso-ji.jp")
  })

  test("says so when the model cannot be reached", async () => {
    process.env.GEMINI_API_KEY = "test-key"
    globalThis.fetch = (async () => new Response("nope", { status: 429 })) as unknown as typeof fetch
    const { app } = makeApp()
    const trip = await createTrip(app)
    const res = await app.request(`/api/trips/${trip.id}/chat`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ prompt: "hello" }),
    })
    const text = await res.text()
    expect(text).toContain('"error":"The concierge is unavailable right now. Please try again."')
    expect(text).toContain("data: [DONE]")
  })
})

describe("places catalog", () => {
  test("rejects unauthenticated catalog reads", async () => {
    const { app } = makeApp()
    const res = await app.request("/api/trips/places-catalog")
    expect(res.status).toBe(401)
  })

  test("is not captured as a trip id", async () => {
    const { app } = makeApp()
    const res = await app.request("/api/trips/places-catalog", { headers: AUTH })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { total: number; groups: unknown[] }
    expect(body.total).toBe(0)
    expect(body.groups).toEqual([])
  })

  test("returns Instagram-sourced places grouped by trip, city, and neighborhood", async () => {
    const { app } = makeApp()
    const trip = await createTrip(app)
    const patch = await app.request(`/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: AUTH,
      body: JSON.stringify({
        days: [
          {
            id: "day-1",
            date: "2026-07-10",
            city: "Tokyo",
            neighborhoods: ["Asakusa"],
            items: [
              {
                id: "it-ig",
                kind: "place",
                title: "Senso-ji",
                status: "none",
                createdBy: "user",
                links: ["https://www.instagram.com/reel/ABC/"],
                location: { name: "Senso-ji", source: "user", category: "landmark" },
              },
              {
                id: "it-maps",
                kind: "place",
                title: "User cafe",
                status: "none",
                createdBy: "user",
                links: ["https://maps.google.com/?q=cafe"],
                location: { name: "User cafe", source: "user" },
              },
            ],
          },
        ],
      }),
    })
    expect(patch.status).toBe(200)

    const res = await app.request("/api/trips/places-catalog?limit=20", { headers: AUTH })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      total: number
      groups: Array<{
        tripName: string
        cities: Array<{ city: string; neighborhoods: Array<{ neighborhood: string; places: Array<{ name: string }> }> }>
      }>
    }
    expect(body.total).toBe(1)
    expect(body.groups[0]!.tripName).toBe("Tokyo Long Weekend")
    expect(body.groups[0]!.cities[0]!.city).toBe("Tokyo")
    expect(body.groups[0]!.cities[0]!.neighborhoods[0]!.neighborhood).toBe("Asakusa")
    expect(body.groups[0]!.cities[0]!.neighborhoods[0]!.places[0]!.name).toBe("Senso-ji")
  })
})

const OTHER = { Authorization: "Bearer other-token", "Content-Type": "application/json" }

function placeItem(id: string, lat: number, lng: number) {
  return {
    id,
    kind: "place",
    title: id,
    status: "none",
    createdBy: "user",
    location: { name: id, lat, lng, source: "user" },
  }
}

type SummaryRow = {
  id: string
  center?: { lat: number; lng: number }
  points: Array<[number, number]>
  placeCount: number
}

async function summaryOf(app: Hono, tripId: string, headers: Record<string, string> = AUTH) {
  const res = await app.request("/api/trips", { headers })
  const { trips } = (await res.json()) as { trips: SummaryRow[] }
  return trips.find((t) => t.id === tripId)
}

describe("trip summary geography", () => {
  test("an empty trip has no center, no points and a zero place count", async () => {
    const { app } = makeApp()
    const trip = await createTrip(app)
    const summary = (await summaryOf(app, trip.id))!
    expect(summary.center).toBeUndefined()
    expect(summary.points).toEqual([])
    expect(summary.placeCount).toBe(0)
  })

  test("derives center, [lng, lat] points and placeCount from located items", async () => {
    const { app } = makeApp()
    const trip = await createTrip(app)
    const patch = await app.request(`/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: AUTH,
      body: JSON.stringify({
        days: [
          {
            id: "day-1",
            date: "2026-07-10",
            items: [
              placeItem("a", 35.123456, 139.654321),
              { id: "note", kind: "note", title: "No place", status: "none", createdBy: "user" },
              { id: "nameonly", kind: "place", title: "x", status: "none", createdBy: "user", location: { name: "x", source: "user" } },
            ],
          },
          { id: "day-2", date: "2026-07-11", items: [placeItem("b", 36, 140)] },
        ],
      }),
    })
    expect(patch.status).toBe(200)
    const summary = (await summaryOf(app, trip.id))!
    expect(summary.placeCount).toBe(2)
    expect(summary.points).toEqual([
      [139.6543, 35.1235],
      [140, 36],
    ])
    expect(summary.center!.lat).toBeCloseTo((35.123456 + 36) / 2, 6)
    expect(summary.center!.lng).toBeCloseTo((139.654321 + 140) / 2, 6)
  })

  test("an explicit center wins and points are down-sampled to 48", async () => {
    const { app } = makeApp()
    const trip = await createTrip(app)
    const items = Array.from({ length: 100 }, (_, i) => placeItem(`p${i}`, 10 + i * 0.01, 20 + i * 0.01))
    const patch = await app.request(`/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: AUTH,
      body: JSON.stringify({ center: { lat: 1.5, lng: 2.5 }, days: [{ id: "day-1", date: "2026-07-10", items }] }),
    })
    expect(patch.status).toBe(200)
    const summary = (await summaryOf(app, trip.id))!
    expect(summary.center).toEqual({ lat: 1.5, lng: 2.5 })
    expect(summary.placeCount).toBe(100)
    expect(summary.points.length).toBe(48)
    expect(summary.points[0]).toEqual([20, 10])
    expect(summary.points[47]).toEqual([20.99, 10.99])
  })

  test("create accepts a center and rejects an out-of-range one", async () => {
    const { app } = makeApp()
    const base = JSON.parse(newTripBody) as Record<string, unknown>
    const ok = await app.request("/api/trips", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ ...base, center: { lat: 35.68, lng: 139.76 } }),
    })
    expect(ok.status).toBe(201)
    const { trip } = (await ok.json()) as { trip: { center?: { lat: number; lng: number } } }
    expect(trip.center).toEqual({ lat: 35.68, lng: 139.76 })
    const bad = await app.request("/api/trips", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ ...base, center: { lat: 135, lng: 139.76 } }),
    })
    expect(bad.status).toBe(400)
  })
})

describe("invites and joining", () => {
  type Invite = { token: string; role: "viewer" | "editor"; createdAt: string }

  async function createInvite(app: Hono, tripId: string, role: "viewer" | "editor", headers = AUTH) {
    return app.request(`/api/trips/${tripId}/invites`, { method: "POST", headers, body: JSON.stringify({ role }) })
  }
  async function inviteFor(app: Hono, tripId: string, role: "viewer" | "editor") {
    const res = await createInvite(app, tripId, role)
    expect(res.status).toBe(200)
    return ((await res.json()) as { invite: Invite }).invite
  }
  async function join(app: Hono, token: string, body?: unknown, headers = OTHER) {
    return app.request(`/api/trips/join/${token}`, {
      method: "POST",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }

  test("owner creates an invite, and the same role reuses it", async () => {
    const { app } = makeApp()
    const trip = await createTrip(app)
    const first = await inviteFor(app, trip.id, "viewer")
    expect(first.role).toBe("viewer")
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{24,}$/)
    expect(Number.isNaN(Date.parse(first.createdAt))).toBe(false)
    const again = await inviteFor(app, trip.id, "viewer")
    expect(again.token).toBe(first.token)
    const editor = await inviteFor(app, trip.id, "editor")
    expect(editor.token).not.toBe(first.token)
  })

  test("invite creation validates the role", async () => {
    const { app } = makeApp()
    const trip = await createTrip(app)
    const res = await app.request(`/api/trips/${trip.id}/invites`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ role: "owner" }),
    })
    expect(res.status).toBe(400)
  })

  test("only the owner can create or delete invites", async () => {
    const { app } = makeApp()
    const trip = await createTrip(app)
    const invite = await inviteFor(app, trip.id, "editor")
    // Stranger
    expect((await createInvite(app, trip.id, "viewer", OTHER)).status).toBe(403)
    // Editor collaborator
    expect((await join(app, invite.token)).status).toBe(200)
    expect((await createInvite(app, trip.id, "viewer", OTHER)).status).toBe(403)
    expect(
      (await app.request(`/api/trips/${trip.id}/invites/${invite.token}`, { method: "DELETE", headers: OTHER })).status,
    ).toBe(403)
  })

  test("deleting an invite revokes the link", async () => {
    const { app, store } = makeApp()
    const trip = await createTrip(app)
    const invite = await inviteFor(app, trip.id, "viewer")
    const del = await app.request(`/api/trips/${trip.id}/invites/${invite.token}`, { method: "DELETE", headers: AUTH })
    expect(del.status).toBe(200)
    expect(await del.json()).toEqual({ ok: true })
    expect((await store.get(trip.id))!.invites).toEqual([])
    expect((await join(app, invite.token)).status).toBe(404)
  })

  test("joining adds a collaborator with the invite role and trimmed name", async () => {
    const { app, store } = makeApp()
    const trip = await createTrip(app)
    const invite = await inviteFor(app, trip.id, "viewer")
    const res = await join(app, invite.token, { name: "  Sam  " })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { trip: { id: string; slug: string; name: string }; access: string }
    expect(body.access).toBe("view")
    expect(body.trip).toEqual({ id: trip.id, slug: "tokyo-long-weekend-2026", name: "Tokyo Long Weekend" })
    expect((await store.get(trip.id))!.collaborators).toEqual([{ userId: "user-2", role: "viewer", name: "Sam" }])
    expect((await app.request(`/api/trips/${trip.id}`, { headers: OTHER })).status).toBe(200)
  })

  test("joining works without a body", async () => {
    const { app, store } = makeApp()
    const trip = await createTrip(app)
    const invite = await inviteFor(app, trip.id, "editor")
    const res = await join(app, invite.token)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { access: string }).access).toBe("edit")
    expect((await store.get(trip.id))!.collaborators).toEqual([{ userId: "user-2", role: "editor" }])
  })

  test("an editor invite upgrades a viewer; a viewer invite never downgrades", async () => {
    const { app, store } = makeApp()
    const trip = await createTrip(app)
    const viewer = await inviteFor(app, trip.id, "viewer")
    const editor = await inviteFor(app, trip.id, "editor")
    await join(app, viewer.token, { name: "Sam" })

    const up = await join(app, editor.token)
    expect(((await up.json()) as { access: string }).access).toBe("edit")
    expect((await store.get(trip.id))!.collaborators).toEqual([{ userId: "user-2", role: "editor", name: "Sam" }])

    const down = await join(app, viewer.token, { name: "Samantha" })
    expect(((await down.json()) as { access: string }).access).toBe("edit")
    expect((await store.get(trip.id))!.collaborators).toEqual([{ userId: "user-2", role: "editor", name: "Samantha" }])
  })

  test("the owner joining their own link changes nothing", async () => {
    const { app, store } = makeApp()
    const trip = await createTrip(app)
    const invite = await inviteFor(app, trip.id, "editor")
    const before = (await store.get(trip.id))!.updatedAt
    const res = await join(app, invite.token, { name: "Me" }, AUTH)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { access: string }).access).toBe("owner")
    const after = (await store.get(trip.id))!
    expect(after.collaborators).toEqual([])
    expect(after.updatedAt).toBe(before)
  })

  test("an unknown token is a 404 and joining requires auth", async () => {
    const { app } = makeApp()
    await createTrip(app)
    const res = await join(app, "nope-nope-nope-nope-nope-nope")
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "invite_not_found" })
    expect((await app.request("/api/trips/join/whatever", { method: "POST" })).status).toBe(401)
  })

  test("a collaborator can leave; the owner cannot", async () => {
    const { app, store } = makeApp()
    const trip = await createTrip(app)
    const invite = await inviteFor(app, trip.id, "editor")
    await join(app, invite.token)

    const ownerLeave = await app.request(`/api/trips/${trip.id}/leave`, { method: "POST", headers: AUTH })
    expect(ownerLeave.status).toBe(400)
    expect(await ownerLeave.json()).toEqual({ error: "owner_cannot_leave" })

    const leave = await app.request(`/api/trips/${trip.id}/leave`, { method: "POST", headers: OTHER })
    expect(leave.status).toBe(200)
    expect(await leave.json()).toEqual({ ok: true })
    expect((await store.get(trip.id))!.collaborators).toEqual([])
    expect((await app.request(`/api/trips/${trip.id}`, { headers: OTHER })).status).toBe(403)
  })

  test("invites are only returned to the owner and survive collaborator edits", async () => {
    const { app, store } = makeApp()
    const trip = await createTrip(app)
    const invite = await inviteFor(app, trip.id, "editor")
    await join(app, invite.token)

    const asOwner = (await (await app.request(`/api/trips/${trip.id}`, { headers: AUTH })).json()) as {
      trip: { invites?: Invite[] }
    }
    expect(asOwner.trip.invites).toEqual([invite])

    const asEditor = (await (await app.request(`/api/trips/${trip.id}`, { headers: OTHER })).json()) as {
      trip: Record<string, unknown>
    }
    expect("invites" in asEditor.trip).toBe(false)

    // An editor's save neither leaks nor drops the stored invites, and
    // cannot inject its own.
    const patch = await app.request(`/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: OTHER,
      body: JSON.stringify({ name: "Renamed", invites: [{ token: "evil", role: "editor", createdAt: "x" }] }),
    })
    expect(patch.status).toBe(200)
    const patched = (await patch.json()) as { trip: Record<string, unknown> }
    expect(patched.trip.name).toBe("Renamed")
    expect("invites" in patched.trip).toBe(false)
    expect((await store.get(trip.id))!.invites).toEqual([invite])

    const ownerPatch = await app.request(`/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: AUTH,
      body: JSON.stringify({ invites: [] }),
    })
    expect(((await ownerPatch.json()) as { trip: { invites?: Invite[] } }).trip.invites).toEqual([invite])

    // Summaries never carry invites.
    const summary = (await summaryOf(app, trip.id, AUTH)) as unknown as Record<string, unknown>
    expect("invites" in summary).toBe(false)
  })
})

import { describe, expect, test } from "bun:test"
import {
  applySuggestions,
  autoApplyAddSuggestions,
  computeTravelLegs,
  createGeminiLlm,
  createTripsLlm,
  enhanceTrip,
  extractModelJson,
  generateItinerary,
  normalizeAiItem,
  normalizeTime,
  resolveEnhancementOutcome,
  salvageItinerary,
  salvageSuggestions,
  withLlmFallback,
} from "./ai"
import type { EnhancementRun, Trip } from "./types"

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-1",
    ownerId: "user-1",
    name: "Tokyo Long Weekend",
    destinations: ["Tokyo"],
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    timezone: "Asia/Tokyo",
    status: "draft",
    tags: [],
    collaborators: [],
    days: [
      {
        id: "day-1",
        date: "2026-07-10",
        items: [
          {
            id: "it-a",
            kind: "place",
            title: "Senso-ji",
            status: "none",
            location: { name: "Senso-ji", lat: 35.7148, lng: 139.7967, source: "user" },
            createdBy: "user",
          },
          {
            id: "it-b",
            kind: "place",
            title: "Shibuya Crossing",
            status: "none",
            location: { name: "Shibuya Crossing", lat: 35.6595, lng: 139.7005, source: "user" },
            createdBy: "user",
          },
        ],
      },
      { id: "day-2", date: "2026-07-11", items: [] },
      { id: "day-3", date: "2026-07-12", items: [] },
    ],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("generateItinerary", () => {
  test("maps structured model output into trip days with AI provenance", async () => {
    const llm = async () =>
      JSON.stringify({
        summary: "A relaxed three-day Tokyo plan.",
        days: [
          {
            title: "Asakusa & Ueno",
            city: "Tokyo",
            items: [
              {
                kind: "place",
                title: "Senso-ji Temple",
                time: "09:30",
                location: { name: "Senso-ji", address: "2 Chome-3-1 Asakusa", lat: 35.7148, lng: 139.7967, category: "shrine" },
              },
              { kind: "note", title: "Buy a Suica card at the airport" },
            ],
          },
          {
            title: "Shibuya",
            items: [
              {
                kind: "place",
                title: "Lunch at Uobei",
                time: "12:00",
                location: { name: "Uobei Shibuya", address: "Dogenzaka 2-29-11", category: "restaurant" },
              },
            ],
          },
        ],
      })

    const geocoded: string[] = []
    const result = await generateItinerary({
      trip: makeTrip(),
      llm,
      geocode: async (q) => {
        geocoded.push(q)
        return { lat: 35.66, lng: 139.7, address: "geocoded address", placeId: "gp-1" }
      },
    })

    expect(result.summary).toContain("Tokyo")
    expect(result.days.length).toBe(3) // one per trip date, even when model returns fewer
    expect(result.days[0]!.date).toBe("2026-07-10")
    expect(result.days[0]!.items[0]!.createdBy).toBe("ai")
    expect(result.days[0]!.items[0]!.location!.source).toBe("ai")
    // Place missing lat/lng was geocoded
    const lunch = result.days[1]!.items[0]!
    expect(lunch.location!.lat).toBe(35.66)
    expect(lunch.location!.placeId).toBe("gp-1")
    expect(geocoded.length).toBe(1)
  })

  test("throws a validation error on garbage output", async () => {
    const llm = async () => JSON.stringify({ days: "nope" })
    await expect(generateItinerary({ trip: makeTrip(), llm })).rejects.toThrow(/validation/)
  })

  test("recovers JSON wrapped in a code fence", async () => {
    const llm = async () => '```json\n{"summary":"ok","days":[]}\n```'
    const result = await generateItinerary({ trip: makeTrip(), llm })
    expect(result.summary).toBe("ok")
    expect(result.days.length).toBe(3)
  })
})

describe("computeTravelLegs", () => {
  test("computes distances between consecutive located items", () => {
    const legs = computeTravelLegs(makeTrip().days)
    expect(legs.length).toBe(1)
    expect(legs[0]!.dayId).toBe("day-1")
    // Senso-ji → Shibuya is roughly 10 km
    expect(legs[0]!.distanceKm).toBeGreaterThan(7)
    expect(legs[0]!.distanceKm).toBeLessThan(13)
  })
})

describe("enhanceTrip", () => {
  test("returns validated suggestions and filters bogus item references", async () => {
    const llm = async ({ user }: { user: string }) => {
      expect(user).toContain("Senso-ji")
      expect(user).toContain("km") // travel legs included
      expect(user).toContain("rain chance") // weather included
      return JSON.stringify({
        summary: "Solid plan with one ordering issue.",
        suggestions: [
          {
            kind: "edit",
            dayId: "day-1",
            itemId: "it-a",
            title: "Start earlier",
            detail: "Beat the crowds.",
            confidence: "high",
            proposedChanges: { time: "08:00" },
          },
          {
            kind: "edit",
            dayId: "day-1",
            itemId: "does-not-exist",
            title: "Bogus",
            detail: "Should be filtered",
            confidence: "low",
          },
          {
            kind: "add",
            dayId: "day-2",
            title: "Add lunch",
            detail: "Day 2 has no meals.",
            confidence: "medium",
            proposedItem: {
              kind: "place",
              title: "Ramen at Ichiran",
              location: { name: "Ichiran Shibuya", address: "Jinnan 1-22-7" },
            },
          },
        ],
      })
    }

    const run = await enhanceTrip({
      trip: makeTrip(),
      scope: "trip",
      llm,
      fetchWeather: async () => [{ date: "2026-07-10", highC: 30, lowC: 24, precipitationChance: 40 }],
    })

    expect(run.status).toBe("complete")
    expect(run.suggestions.length).toBe(2)
    expect(run.suggestions[0]!.proposedChanges).toEqual({ time: "08:00" })
    expect(run.suggestions[1]!.proposedItem!.createdBy).toBe("ai")
    expect(run.suggestions[1]!.proposedItem!.location!.source).toBe("ai")
    expect(run.outcome).toBe("added_places")
    expect(run.outcomeReason).toBeTruthy()
  })

  test("drops add suggestions that lack a proposedItem or valid dayId", async () => {
    const run = await enhanceTrip({
      trip: makeTrip(),
      scope: "trip",
      llm: async () =>
        JSON.stringify({
          summary: "Tried to add.",
          outcome: "added_places",
          outcomeReason: "Day 2 needs lunch.",
          suggestions: [
            { kind: "add", dayId: "day-2", title: "Add lunch", detail: "No meals.", confidence: "high" },
            {
              kind: "add",
              dayId: "day-99",
              title: "Wrong day",
              detail: "Bogus day",
              confidence: "high",
              proposedItem: { kind: "place", title: "Ghost", location: { name: "Ghost" } },
            },
          ],
        }),
    })
    expect(run.status).toBe("complete")
    expect(run.suggestions.filter((s) => s.kind === "add")).toEqual([])
    expect(run.outcome).toBe("no_adds_possible")
    expect(run.outcomeReason).toMatch(/dropped|missing place/i)
  })

  test("always stamps an outcomeReason when the model returns none", async () => {
    const run = await enhanceTrip({
      trip: makeTrip(),
      scope: "trip",
      llm: async () => JSON.stringify({ summary: "Solid plan.", suggestions: [] }),
    })
    expect(run.status).toBe("complete")
    expect(run.outcome).toBe("no_adds_needed")
    expect(run.outcomeReason).toMatch(/Solid plan|already covers/i)
  })

  test("geocodes proposed add items that are missing coordinates", async () => {
    const run = await enhanceTrip({
      trip: makeTrip(),
      scope: "trip",
      geocode: async () => ({ lat: 35.66, lng: 139.7, address: "Shibuya", placeId: "pid" }),
      llm: async () =>
        JSON.stringify({
          summary: "Add lunch.",
          outcome: "added_places",
          outcomeReason: "Day 2 has no meals.",
          suggestions: [
            {
              kind: "add",
              dayId: "day-2",
              title: "Add lunch",
              detail: "No meals.",
              confidence: "high",
              proposedItem: { kind: "place", title: "Ichiran", location: { name: "Ichiran", address: "Shibuya" } },
            },
          ],
        }),
    })
    expect(run.suggestions[0]!.proposedItem!.location!.lat).toBe(35.66)
    expect(run.suggestions[0]!.proposedItem!.location!.placeId).toBe("pid")
  })

  test("errors cleanly for an unknown day scope", async () => {
    const run = await enhanceTrip({ trip: makeTrip(), scope: "day", dayId: "day-99", llm: async () => "{}" })
    expect(run.status).toBe("error")
    expect(run.outcome).toBe("no_adds_possible")
    expect(run.outcomeReason).toMatch(/not on this trip/i)
  })

  test("captures llm failure as an error run", async () => {
    const run = await enhanceTrip({
      trip: makeTrip(),
      scope: "trip",
      llm: async () => "not json at all",
    })
    expect(run.status).toBe("error")
    expect(run.error).toBeTruthy()
    expect(run.outcomeReason).toMatch(/failed before/i)
  })
})

describe("applySuggestions", () => {
  function makeRun(trip: Trip): EnhancementRun {
    return {
      id: "run-1",
      tripId: trip.id,
      scope: "trip",
      status: "complete",
      appliedSuggestionIds: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      suggestions: [
        {
          id: "sug-add",
          kind: "add",
          dayId: "day-2",
          title: "Add lunch",
          detail: "",
          confidence: "medium",
          proposedItem: {
            id: "it-new",
            kind: "place",
            title: "Ichiran",
            status: "needs_review",
            location: { name: "Ichiran", lat: 35.66, lng: 139.7, source: "ai" },
            createdBy: "ai",
          },
        },
        {
          id: "sug-edit",
          kind: "edit",
          itemId: "it-a",
          dayId: "day-1",
          title: "Start earlier",
          detail: "",
          confidence: "high",
          proposedChanges: { time: "08:00" },
        },
        {
          id: "sug-remove",
          kind: "remove",
          itemId: "it-b",
          dayId: "day-1",
          title: "Drop Shibuya",
          detail: "",
          confidence: "low",
        },
        {
          id: "sug-reorder",
          kind: "reorder",
          dayId: "day-1",
          title: "Flip order",
          detail: "",
          confidence: "medium",
          proposedOrder: ["it-b", "it-a"],
        },
      ],
    }
  }

  test("applies add, edit, and remove suggestions", () => {
    const trip = makeTrip()
    const run = makeRun(trip)
    const { trip: next, applied, skipped } = applySuggestions(trip, run, ["sug-add", "sug-edit", "sug-remove"])
    expect(applied).toEqual(["sug-add", "sug-edit", "sug-remove"])
    expect(skipped).toEqual([])
    expect(next.days[1]!.items.map((i) => i.title)).toContain("Ichiran")
    expect(next.days[0]!.items.find((i) => i.id === "it-a")!.time).toBe("08:00")
    expect(next.days[0]!.items.find((i) => i.id === "it-b")).toBeUndefined()
    // original untouched
    expect(trip.days[1]!.items.length).toBe(0)
  })

  test("applies reorder when the proposed order covers all items", () => {
    const trip = makeTrip()
    const run = makeRun(trip)
    const { trip: next, applied } = applySuggestions(trip, run, ["sug-reorder"])
    expect(applied).toEqual(["sug-reorder"])
    expect(next.days[0]!.items.map((i) => i.id)).toEqual(["it-b", "it-a"])
  })

  test("skips unknown and already-applied suggestions", () => {
    const trip = makeTrip()
    const run = makeRun(trip)
    run.appliedSuggestionIds = ["sug-edit"]
    const { applied, skipped } = applySuggestions(trip, run, ["sug-edit", "nope"])
    expect(applied).toEqual([])
    expect(skipped).toEqual(["sug-edit", "nope"])
  })

  test("skips add suggestions that lack a dayId instead of dumping onto day 1", () => {
    const trip = makeTrip()
    const run = makeRun(trip)
    run.suggestions[0]!.dayId = undefined
    const { trip: next, applied, skipped } = applySuggestions(trip, run, ["sug-add"])
    expect(applied).toEqual([])
    expect(skipped).toEqual(["sug-add"])
    expect(next.days[0]!.items.map((i) => i.title)).not.toContain("Ichiran")
    expect(next.days[1]!.items.map((i) => i.title)).not.toContain("Ichiran")
  })
})

describe("autoApplyAddSuggestions", () => {
  test("applies valid adds and stamps added_places", () => {
    const trip = makeTrip()
    const run: EnhancementRun = {
      id: "run-1",
      tripId: trip.id,
      scope: "trip",
      status: "complete",
      appliedSuggestionIds: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      suggestions: [
        {
          id: "sug-add",
          kind: "add",
          dayId: "day-2",
          title: "Add lunch",
          detail: "Day 2 has no meals.",
          confidence: "high",
          proposedItem: {
            id: "it-new",
            kind: "place",
            title: "Ichiran",
            status: "needs_review",
            location: { name: "Ichiran", lat: 35.66, lng: 139.7, source: "ai" },
            createdBy: "ai",
          },
        },
        {
          id: "sug-edit",
          kind: "edit",
          itemId: "it-a",
          dayId: "day-1",
          title: "Start earlier",
          detail: "Beat crowds.",
          confidence: "high",
          proposedChanges: { time: "08:00" },
        },
      ],
    }
    const result = autoApplyAddSuggestions(trip, run)
    expect(result.applied).toEqual(["sug-add"])
    expect(result.trip.days[1]!.items.map((i) => i.title)).toContain("Ichiran")
    expect(result.trip.days[0]!.items.find((i) => i.id === "it-a")!.time).toBeUndefined()
    expect(result.run.outcome).toBe("added_places")
    expect(result.run.outcomeReason).toMatch(/meals|Ichiran|stop/i)
    expect(result.run.appliedSuggestionIds).toEqual(["sug-add"])
  })

  test("explains a no-add run", () => {
    const trip = makeTrip()
    const run: EnhancementRun = {
      id: "run-1",
      tripId: trip.id,
      scope: "trip",
      status: "complete",
      summary: "Already well paced.",
      appliedSuggestionIds: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      suggestions: [],
    }
    const result = autoApplyAddSuggestions(trip, run)
    expect(result.applied).toEqual([])
    expect(result.run.outcome).toBe("no_adds_needed")
    expect(result.run.outcomeReason).toMatch(/Already well paced|already covers/)
  })

  test("does not auto-apply a place add that lacks a location name", () => {
    const trip = makeTrip()
    const run: EnhancementRun = {
      id: "run-1",
      tripId: trip.id,
      scope: "trip",
      status: "complete",
      appliedSuggestionIds: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      suggestions: [
        {
          id: "sug-add",
          kind: "add",
          dayId: "day-2",
          title: "Add something",
          detail: "Vague.",
          confidence: "low",
          proposedItem: {
            id: "it-new",
            kind: "place",
            title: "Mystery spot",
            status: "needs_review",
            createdBy: "ai",
          },
        },
      ],
    }
    const result = autoApplyAddSuggestions(trip, run)
    expect(result.applied).toEqual([])
    expect(result.trip.days[1]!.items).toEqual([])
    expect(result.run.outcome).toBe("no_adds_possible")
  })
})

describe("resolveEnhancementOutcome", () => {
  test("does not keep added_places when every add was filtered out", () => {
    const resolved = resolveEnhancementOutcome({
      suggestions: [],
      modelOutcome: "added_places",
      modelReason: "Added lunch on day 2.",
      appliedAddCount: 0,
    })
    expect(resolved.outcome).toBe("no_adds_possible")
    expect(resolved.outcomeReason).toMatch(/dropped/i)
  })

  test("prefers applied count over a stale model outcome", () => {
    const resolved = resolveEnhancementOutcome({
      suggestions: [],
      modelOutcome: "no_adds_needed",
      modelReason: "Added a late lunch near the museum.",
      appliedAddCount: 1,
    })
    expect(resolved.outcome).toBe("added_places")
    expect(resolved.outcomeReason).toBe("Added a late lunch near the museum.")
  })
})

describe("createGeminiLlm", () => {
  test("sends Maps-grounded request and joins non-thought text parts", async () => {
    let captured: { url: string; body: Record<string, unknown> } | null = null
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> }
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { thought: true, text: "planning {not json}" },
                  { text: '{"summary":' },
                  { text: '"ok","days":[]}' },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      )
    }) as typeof fetch

    const llm = createGeminiLlm("test-key", fetchImpl)
    const out = await llm({ system: "SYS", user: "USER" })
    expect(out).toBe('{"summary":"ok","days":[]}')
    expect(captured!.url).toContain("gemini-3.7-flash:generateContent")
    expect(captured!.body.tools).toEqual([{ googleSearch: {} }, { googleMaps: {} }])
    const gen = captured!.body.generationConfig as { thinkingConfig: { thinkingLevel: string } }
    expect(gen.thinkingConfig).toEqual({ thinkingLevel: "low" })
    const contents = captured!.body.contents as Array<{ parts: Array<{ text: string }> }>
    expect(contents[0]!.parts[0]!.text).toContain("SYS")
    expect(contents[0]!.parts[0]!.text).toContain("USER")
  })

  test("retries a transient 5xx on the same Maps-grounded request", async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      if (calls === 1) return new Response("Internal error encountered", { status: 502 })
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }),
        { status: 200 },
      )
    }) as typeof fetch

    const llm = createGeminiLlm("test-key", fetchImpl)
    await expect(llm({ system: "s", user: "u" })).resolves.toBe('{"ok":true}')
    expect(calls).toBe(2)
  })

  test("retries Maps then JSON when Search+Maps fails", async () => {
    const calls: Array<Record<string, unknown>> = []
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      calls.push(body)
      if (calls.length < 3) return new Response("grounding unavailable", { status: 400 })
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }),
        { status: 200 },
      )
    }) as typeof fetch

    const llm = createGeminiLlm("test-key", fetchImpl)
    const out = await llm({ system: "s", user: "u" })
    expect(out).toBe('{"ok":true}')
    expect(calls).toHaveLength(3)
    expect(calls[0]!.tools).toEqual([{ googleSearch: {} }, { googleMaps: {} }])
    expect(calls[1]!.tools).toEqual([{ googleMaps: {} }])
    expect(calls[2]!.tools).toBeUndefined()
    const gen = calls[2]!.generationConfig as { responseMimeType?: string }
    expect(gen.responseMimeType).toBe("application/json")
  })

  test("throws with status + body on API errors after JSON retry also fails", async () => {
    const fetchImpl = (async () => new Response("quota exceeded", { status: 429 })) as typeof fetch
    const llm = createGeminiLlm("test-key", fetchImpl)
    await expect(llm({ system: "s", user: "u" })).rejects.toThrow(/429.*quota/)
  })

  test("throws on an empty candidate response", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })) as typeof fetch
    const llm = createGeminiLlm("test-key", fetchImpl)
    // First Maps attempt fails empty → JSON retry also empty → throws
    await expect(llm({ system: "s", user: "u" })).rejects.toThrow(/empty/)
  })
})

describe("withLlmFallback", () => {
  test("returns primary output when it succeeds", async () => {
    const llm = withLlmFallback(
      async () => "primary",
      async () => "fallback",
    )
    expect(await llm({ system: "s", user: "u" })).toBe("primary")
  })

  test("falls through to secondary when primary throws", async () => {
    const llm = withLlmFallback(
      async () => {
        throw new Error("boom")
      },
      async () => "fallback",
    )
    expect(await llm({ system: "s", user: "u" })).toBe("fallback")
  })

  test("createTripsLlm returns null when neither key is set", () => {
    expect(createTripsLlm({})).toBeNull()
  })
})

describe("normalizeTime / normalizeAiItem", () => {
  test("pads and converts common time variants", () => {
    expect(normalizeTime("9:00")).toBe("09:00")
    expect(normalizeTime("09:30")).toBe("09:30")
    expect(normalizeTime("9:00 pm")).toBe("21:00")
    expect(normalizeTime("12:15 am")).toBe("00:15")
  })

  test("coerces string coordinates and pads times before schema", () => {
    const out = normalizeAiItem({
      kind: "place",
      title: "Cafe",
      time: "9:30",
      location: { name: "Cafe", lat: "35.6", lng: "139.7" },
    }) as { time: string; location: { lat: number; lng: number } }
    expect(out.time).toBe("09:30")
    expect(out.location.lat).toBe(35.6)
    expect(out.location.lng).toBe(139.7)
  })
})

describe("extractModelJson", () => {
  test("parses double-encoded JSON (grounded Gemini failure mode)", () => {
    const inner = JSON.stringify({ summary: "ok", suggestions: [] })
    expect(extractModelJson(JSON.stringify(inner))).toEqual({ summary: "ok", suggestions: [] })
  })

  test("strips trailing prose after JSON starting at position 0", () => {
    expect(extractModelJson('{"a":1}\n\nSources: Google Maps')).toEqual({ a: 1 })
  })

  test("strips leading prose and code fences", () => {
    expect(extractModelJson('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
})

describe("salvage parsing", () => {
  test("keeps valid suggestions and drops malformed ones instead of failing", () => {
    const raw = JSON.stringify({
      summary: "Mixed bag.",
      suggestions: [
        { kind: "warning", dayId: "day-1", title: "Check hours", detail: "Verify.", confidence: "low" },
        "not an object",
        { kind: "edit", itemId: "it-a", title: "Shift", detail: "", confidence: "high", proposedChanges: "move to 08:00" },
        { title: "missing kind" },
      ],
    })
    const out = salvageSuggestions(raw)
    expect(out.suggestions.length).toBe(2)
    expect(out.suggestions[0]!.kind).toBe("warning")
    // string proposedChanges folded into detail rather than dropped
    expect(out.suggestions[1]!.kind).toBe("edit")
    expect(out.suggestions[1]!.proposedChanges).toBeUndefined()
    expect(out.suggestions[1]!.detail).toContain("move to 08:00")
  })

  test("enhanceTrip survives double-encoded grounded output end-to-end", async () => {
    const payload = JSON.stringify({
      summary: "Looks good.",
      suggestions: [{ kind: "info", dayId: "day-1", title: "Nice pacing", detail: "", confidence: "high" }],
    })
    const run = await enhanceTrip({
      trip: makeTrip(),
      scope: "day",
      dayId: "day-1",
      llm: async () => JSON.stringify(payload), // double-encoded
    })
    expect(run.status).toBe("complete")
    expect(run.suggestions.length).toBe(1)
  })

  test("salvageItinerary drops malformed items but keeps the rest of the day", () => {
    const raw = JSON.stringify({
      summary: "ok",
      days: [
        {
          title: "Day in town",
          items: [
            { kind: "place", title: "Museum", location: { name: "Museum", address: "1 Main St" } },
            { kind: "place" }, // missing title → dropped
            42,
          ],
        },
        "garbage day",
      ],
    })
    const out = salvageItinerary(raw)
    expect(out.days.length).toBe(2)
    expect(out.days[0]!.items.length).toBe(1)
    expect(out.days[1]!.items.length).toBe(0)
  })

  test("salvageItinerary accepts unpadded times and string lat/lng", () => {
    const raw = JSON.stringify({
      days: [
        {
          title: "Morning",
          emoji: "👨‍👩‍👧‍👦",
          items: [
            {
              kind: "place",
              title: "Cafe",
              time: "9:00",
              location: { name: "Cafe", lat: "35.66", lng: "139.70", category: "cafe" },
            },
          ],
        },
      ],
    })
    const out = salvageItinerary(raw)
    expect(out.days[0]!.emoji).toBe("👨‍👩‍👧‍👦")
    expect(out.days[0]!.items).toHaveLength(1)
    expect(out.days[0]!.items[0]!.time).toBe("09:00")
    expect(out.days[0]!.items[0]!.location!.lat).toBe(35.66)
  })
})

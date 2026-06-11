import { describe, expect, test } from "bun:test"
import { applySuggestions, computeTravelLegs, enhanceTrip, generateItinerary } from "./ai"
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
  })

  test("errors cleanly for an unknown day scope", async () => {
    const run = await enhanceTrip({ trip: makeTrip(), scope: "day", dayId: "day-99", llm: async () => "{}" })
    expect(run.status).toBe("error")
  })

  test("captures llm failure as an error run", async () => {
    const run = await enhanceTrip({
      trip: makeTrip(),
      scope: "trip",
      llm: async () => "not json at all",
    })
    expect(run.status).toBe("error")
    expect(run.error).toBeTruthy()
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
})

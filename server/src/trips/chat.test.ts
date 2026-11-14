import { describe, expect, it } from "bun:test"
import {
  buildChatHistory,
  buildTripChatContext,
  buildTripChatSystemInstruction,
  cleanFollowups,
  placesMentioned,
  planPosition,
  resetForecastCache,
  tripForecast,
  tripLatLngHint,
  tripPhase,
} from "./chat"
import type { Trip } from "./types"

function makeTrip(): Trip {
  return {
    id: "tokyo-weekend",
    ownerId: "u1",
    name: "Tokyo Long Weekend",
    destinations: ["Tokyo"],
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    timezone: "Asia/Tokyo",
    status: "active",
    tags: [],
    collaborators: [],
    description: "Three days of eating and wandering.",
    days: [
      {
        id: "day-1",
        date: "2026-07-10",
        title: "Arrival",
        city: "Tokyo",
        items: [
          {
            id: "a",
            kind: "place",
            title: "Senso-ji",
            status: "none",
            createdBy: "user",
            notes: "CONFIDENTIAL_DAY1_NOTE",
            location: { name: "Senso-ji", source: "user", lat: 35.7148, lng: 139.7967 },
          },
        ],
      },
      {
        id: "day-2",
        date: "2026-07-11",
        title: "Tsukiji",
        city: "Tokyo",
        neighborhoods: ["Tsukiji"],
        items: [
          {
            id: "b",
            kind: "reservation",
            title: "Sushi Saito",
            time: "12:00",
            status: "booked",
            createdBy: "user",
            reservation: { type: "meal", status: "confirmed", confirmation: "SAITO-9" },
          },
        ],
      },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  }
}

describe("buildTripChatContext", () => {
  it("includes trip metadata and a one-line overview of every day", () => {
    const ctx = buildTripChatContext(makeTrip())
    expect(ctx).toContain("TRIP: Tokyo Long Weekend")
    expect(ctx).toContain("Tokyo")
    expect(ctx).toContain("ALL DAYS (overview)")
    expect(ctx).toContain("Senso-ji")
    expect(ctx).toContain("Sushi Saito")
    expect(ctx).not.toContain("FOCUSED DAY")
  })

  it("expands the focused day first and gives the other days in full", () => {
    const ctx = buildTripChatContext(makeTrip(), "day-2")
    expect(ctx).toContain("FOCUSED DAY")
    expect(ctx).toContain("Sushi Saito")
    expect(ctx).toContain("SAITO-9")
    expect(ctx).toContain("Tsukiji")
    expect(ctx).toContain("dayId=day-2")
    expect(ctx).toContain("NO DINNER")
    // Cross-day questions are answered from data, so other days keep detail.
    expect(ctx.indexOf("FOCUSED DAY")).toBeLessThan(ctx.indexOf("OTHER DAYS"))
    expect(ctx).toContain("CONFIDENTIAL_DAY1_NOTE")
  })

  it("collapses far-off days to a line once the trip outgrows the budget", () => {
    const trip = makeTrip()
    const big = trip.days[0]!
    trip.days = Array.from({ length: 40 }, (_, i) => ({
      ...big,
      id: `day-${i + 1}`,
      date: `2026-07-${String((i % 28) + 1).padStart(2, "0")}`,
      items: Array.from({ length: 12 }, (_, n) => ({
        ...big.items[0]!,
        id: `it-${i}-${n}`,
        title: `Stop ${i}-${n}`,
        notes: `NOTE_${i}_${n} ${"x".repeat(300)}`,
      })),
    }))
    const ctx = buildTripChatContext(trip, "day-1")
    expect(ctx).toContain("NOTE_0_0")
    expect(ctx).not.toContain("NOTE_39_0")
    expect(ctx).toContain("dayId=day-40")
    expect(ctx.length).toBeLessThan(60_000)
  })
})

describe("buildTripChatSystemInstruction", () => {
  it("names the trip and embeds the itinerary digest", () => {
    const sys = buildTripChatSystemInstruction(makeTrip(), "day-2")
    expect(sys).toContain("concierge for one private trip")
    expect(sys).toContain("Tokyo Long Weekend")
    expect(sys).toContain("FOCUSED DAY")
    expect(sys).toContain("find_places")
    expect(sys).toContain("propose_changes")
    // The fenced-JSON trailers are gone: changes are real function calls.
    expect(sys).not.toContain(":::")
    // Stops carry their ids so a change can name its target exactly.
    expect(sys).toContain("Sushi Saito itemId=b")
    expect(sys).not.toContain("needs_review)")
  })

  it("drops the tools the server cannot run and explains a shared position", () => {
    const sys = buildTripChatSystemInstruction(makeTrip(), undefined, new Date("2026-07-10T03:00:00Z"), {
      tools: { places: false, directions: false, search: true },
      location: { lat: 35.7149, lng: 139.7968 },
    })
    expect(sys).not.toContain("- find_places:")
    expect(sys).not.toContain("- get_directions:")
    expect(sys).toContain("Place lookup is not available")
    expect(sys).toContain("shared their position with this message")
    expect(sys).toContain("Senso-ji (Day 1, itemId=a)")
  })

  it("gives live forecast lines and the walk between consecutive stops", () => {
    const trip = makeTrip()
    trip.days[0]!.items.push({
      id: "c",
      kind: "place",
      title: "Kappabashi",
      status: "needs_review",
      createdBy: "user",
      location: { name: "Kappabashi", source: "user", lat: 35.7143, lng: 139.7889 },
    })
    const ctx = buildTripChatContext(trip, undefined, new Date("2026-07-09T03:00:00Z"), [
      { date: "2026-07-10", highC: 31.4, lowC: 24.2, precipitationChance: 70 },
    ])
    expect(ctx).toContain("Forecast (Open-Meteo, fetched now): 24–31°C, 70% chance of rain")
    expect(ctx).toMatch(/↳ to Kappabashi: \d+ m, about \d+ min walk/)
    expect(ctx).toContain("not confirmed yet")
    expect(ctx).toContain("· tomorrow ·")
  })
})

describe("planPosition", () => {
  const day = {
    id: "d",
    date: "2026-07-10",
    items: [
      { id: "a", kind: "place" as const, title: "Museum", time: "10:00", endTime: "12:00", status: "none" as const, createdBy: "user" as const },
      { id: "b", kind: "place" as const, title: "Lunch", time: "13:00", status: "none" as const, createdBy: "user" as const },
    ],
  }

  it("says where the plan puts the traveller at a given minute", () => {
    expect(planPosition(day, "09:00").line).toContain("first up is Museum at 10:00")
    expect(planPosition(day, "11:00")).toMatchObject({ current: { id: "a" }, next: { id: "b" } })
    expect(planPosition(day, "12:30").line).toContain("done with Museum (ended 12:00); next is Lunch at 13:00")
    expect(planPosition(day, "15:00").line).toContain("at Lunch (from 13:00), the last timed stop")
    expect(planPosition({ ...day, items: [] }, "15:00").current).toBeNull()
  })
})

describe("buildChatHistory", () => {
  it("appends the cards and change cards the traveller saw to the model turn", () => {
    const history = buildChatHistory([
      { role: "assistant", content: "orphan greeting" },
      { role: "user", content: "wine bars?" },
      {
        role: "assistant",
        content: "Bloco.",
        places: [{ ref: "p1", name: "Bloco", address: "R. Nova da Trindade 11" }],
        proposal: { summary: "Add Bloco to Saturday", state: "applied" },
      },
      { role: "assistant", content: "" },
      { role: "user", content: "and after?" },
    ])
    expect(history.map((h) => h.role)).toEqual(["user", "model", "user"])
    expect(history[1]!.parts[0]!.text).toContain("1. Bloco (ref p1), R. Nova da Trindade 11")
    expect(history[1]!.parts[0]!.text).toContain('"Add Bloco to Saturday": the traveller applied it')
  })
})

describe("placesMentioned", () => {
  const places = [
    { ref: "a", name: "Maré de Alfama (Seafood & Portuguese cuisine)" },
    { ref: "b", name: "Bloco" },
    { ref: "c", name: "Never Named" },
  ]

  it("keeps only the places the reply names, in the order it names them", () => {
    const hit = placesMentioned("Start at **Bloco**, then lunch at Mare de Alfama.", places)
    expect(hit.map((p) => p.ref)).toEqual(["b", "a"])
    expect(placesMentioned("Blocos are everywhere.", places)).toEqual([])
  })
})

describe("cleanFollowups", () => {
  it("drops repeats, long lines and things the concierge cannot do", () => {
    expect(
      cleanFollowups(
        ["How do we get to Bloco?", "Can you book a table at Bloco?", "wine bars?", "How do we get to Bloco?", 3, "x ".repeat(40)],
        "Wine bars?",
      ),
    ).toEqual(["How do we get to Bloco?"])
    expect(cleanFollowups("nope", "q")).toEqual([])
  })
})

describe("tripForecast", () => {
  it("never holds the reply up, and serves the result once it has landed", async () => {
    resetForecastCache()
    const trip = makeTrip()
    let calls = 0
    const slow = async () => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 60))
      return [{ date: "2026-07-10", highC: 30, lowC: 22, precipitationChance: 10 }]
    }
    expect(await tripForecast(trip, "2026-07-09", slow, 5)).toEqual([])
    await new Promise((resolve) => setTimeout(resolve, 90))
    expect(await tripForecast(trip, "2026-07-09", slow, 5)).toHaveLength(1)
    expect(calls).toBe(1)
    // Outside the forecast window there is nothing to ask for.
    expect(await tripForecast(trip, "2026-01-01", slow, 5)).toEqual([])
    expect(calls).toBe(1)
  })
})

describe("tripPhase", () => {
  it("places now against the trip in the trip's own time zone", () => {
    const trip = makeTrip()
    // 2026-07-10 20:30 UTC is already 05:30 on the 11th in Tokyo.
    const during = tripPhase(trip, new Date("2026-07-10T20:30:00Z"))
    expect(during).toMatchObject({ phase: "during", today: "2026-07-11", clock: "05:30", todayId: "day-2" })
    expect(tripPhase(trip, new Date("2026-07-01T00:00:00Z")).line).toContain("begins in 9 days")
    expect(tripPhase(trip, new Date("2026-08-01T00:00:00Z")).phase).toBe("after")
  })

  it("tells the concierge the local clock and which day is today", () => {
    const sys = buildTripChatSystemInstruction(makeTrip(), undefined, new Date("2026-07-10T20:30:00Z"))
    expect(sys).toContain("Saturday 2026-07-11, 05:30")
    expect(sys).toContain("today is Day 2 of")
  })
})

describe("tripLatLngHint", () => {
  it("averages coords on the focused day", () => {
    const hint = tripLatLngHint(makeTrip(), "day-1")
    expect(hint).toEqual({ latitude: 35.7148, longitude: 139.7967 })
  })

  it("falls back to any located item when the focused day has none", () => {
    const hint = tripLatLngHint(makeTrip(), "day-2")
    expect(hint).toEqual({ latitude: 35.7148, longitude: 139.7967 })
  })
})

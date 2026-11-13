import { describe, expect, it } from "bun:test"
import { buildTripChatContext, buildTripChatSystemInstruction, tripLatLngHint, tripPhase } from "./chat"
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
    expect(sys).toContain("Google Search and Google Maps")
    expect(sys).toContain(":::add-places")
    expect(sys).toContain(":::trip-moves")
    expect(sys).not.toContain("Answer ONLY from the itinerary data")
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

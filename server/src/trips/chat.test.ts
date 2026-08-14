import { describe, expect, it } from "bun:test"
import { buildTripChatContext, buildTripChatSystemInstruction, tripLatLngHint } from "./chat"
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

  it("expands the focused day and keeps other days' notes out of the detail block", () => {
    const ctx = buildTripChatContext(makeTrip(), "day-2")
    expect(ctx).toContain("FOCUSED DAY")
    expect(ctx).toContain("Sushi Saito")
    expect(ctx).toContain("SAITO-9")
    expect(ctx).toContain("Tsukiji")
    expect(ctx).not.toContain("CONFIDENTIAL_DAY1_NOTE")
  })
})

describe("buildTripChatSystemInstruction", () => {
  it("names the trip and embeds the itinerary digest", () => {
    const sys = buildTripChatSystemInstruction(makeTrip(), "day-2")
    expect(sys).toContain("trip concierge")
    expect(sys).toContain("Tokyo Long Weekend")
    expect(sys).toContain("FOCUSED DAY")
    expect(sys).toContain("Google Search and Google Maps")
    expect(sys).toContain(":::add-places")
    expect(sys).not.toContain("Answer ONLY from the itinerary data")
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

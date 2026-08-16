import { describe, expect, it } from "vitest"
import { buildTripInsights } from "../beautiful/tripInsights"
import type { Trip } from "../types"

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-1",
    ownerId: "u1",
    name: "Tokyo Long Weekend",
    destinations: ["Tokyo"],
    startDate: "2026-09-10",
    endDate: "2026-09-12",
    timezone: "UTC",
    status: "draft",
    tags: [],
    collaborators: [],
    days: [
      {
        id: "day-1",
        date: "2026-09-10",
        title: "Arrival",
        weather: { highC: 28, lowC: 22, condition: "Clear" },
        items: [
          {
            id: "it-r",
            kind: "reservation",
            title: "Sukiyabashi Jiro",
            time: "19:00",
            status: "booked",
            createdBy: "user",
          },
        ],
      },
      { id: "day-2", date: "2026-09-11", title: "Empty", items: [] },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("buildTripInsights", () => {
  it("uses weather, empty days, and the next reservation from the document", () => {
    const cards = buildTripInsights(makeTrip())
    expect(cards.map((c) => c.id)).toEqual(["weather", "pacing", "next-reservation"])
    expect(cards[0]?.body).toMatch(/Clear/)
    expect(cards[1]?.body).toMatch(/1 day still empty/)
    expect(cards[2]?.body).toBe("Sukiyabashi Jiro")
  })

  it("scopes pacing to a day when asked", () => {
    const cards = buildTripInsights(makeTrip(), "day-2")
    expect(cards.find((c) => c.id === "pacing")?.body).toMatch(/no places or reservations/)
  })
})

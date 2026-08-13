import { describe, expect, it } from "vitest"
import { conciergeSuggestions } from "../conciergeSuggestions"
import type { Trip, TripDay } from "../types"

function day(partial: Partial<TripDay> & Pick<TripDay, "id" | "date">): TripDay {
  return { items: [], ...partial }
}

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "t1",
    ownerId: "u1",
    name: "Tokyo Long Weekend",
    destinations: ["Tokyo"],
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    timezone: "Asia/Tokyo",
    status: "active",
    tags: [],
    collaborators: [],
    days: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("conciergeSuggestions", () => {
  it("asks about the focused day's plan and nearby food", () => {
    const t = trip({
      days: [
        day({
          id: "d1",
          date: "2026-07-10",
          title: "Asakusa",
          city: "Tokyo",
          neighborhoods: ["Asakusa"],
          items: [
            {
              id: "r1",
              kind: "reservation",
              title: "Sushi Saito",
              status: "booked",
              createdBy: "user",
            },
          ],
        }),
      ],
    })
    expect(conciergeSuggestions(t, "d1")).toEqual([
      "What's the plan for Asakusa?",
      "When is Sushi Saito?",
      "Where should we eat near Asakusa?",
    ])
  })

  it("surfaces pending reservations and shopping on the trip overview", () => {
    const t = trip({
      destinations: ["Tokyo", "Kyoto"],
      days: [
        day({
          id: "d1",
          date: "2026-07-10",
          city: "Tokyo",
          items: [
            {
              id: "r1",
              kind: "reservation",
              title: "Kikunoi",
              status: "needs_review",
              createdBy: "user",
              reservation: { type: "meal", status: "pending" },
            },
          ],
        }),
        day({
          id: "d2",
          date: "2026-07-11",
          city: "Kyoto",
          items: [
            {
              id: "p1",
              kind: "place",
              title: "Nishiki Market",
              status: "none",
              createdBy: "user",
              location: { name: "Nishiki Market", source: "user", category: "shopping" },
            },
          ],
        }),
      ],
    })
    expect(conciergeSuggestions(t)).toEqual([
      "Which reservations still need confirming?",
      "What's the best day for Kyoto?",
      "What's the best day for shopping?",
    ])
  })

  it("uses destinations when days are still empty", () => {
    expect(conciergeSuggestions(trip())).toEqual([
      "Where should we eat in Tokyo?",
      "What's a realistic pace for this itinerary?",
      "What should I add to this itinerary first?",
    ])
  })
})

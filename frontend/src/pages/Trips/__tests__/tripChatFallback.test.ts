import { describe, expect, it } from "vitest"
import { isKoreaSeedTrip, KOREA_CHAT_PROMPT_MAX, wrapTripChatPrompt } from "../tripChatFallback"
import type { Trip, TripDay } from "../types"

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
    days: [{ id: "day-1", date: "2026-07-10", title: "Arrival", city: "Tokyo", items: [] }],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("tripChatFallback", () => {
  it("recognizes the seeded Korea trip", () => {
    expect(isKoreaSeedTrip(trip({ id: "korea-2026" }))).toBe(true)
    expect(isKoreaSeedTrip(trip({ id: "t1", slug: "korea-2026" }))).toBe(true)
    expect(isKoreaSeedTrip(trip())).toBe(false)
  })

  it("wraps a non-Korea prompt with itinerary and the user question", () => {
    const wrapped = wrapTripChatPrompt(trip(), "Where should we eat?", "day-1")
    expect(wrapped).toContain("Ignore the Korea itinerary")
    expect(wrapped).toContain("Tokyo Long Weekend")
    expect(wrapped).toContain("FOCUSED DAY")
    expect(wrapped).toContain("Question: Where should we eat?")
  })

  it("keeps a long itinerary under the Korea chat prompt cap", () => {
    const days: TripDay[] = Array.from({ length: 12 }, (_, i) => ({
      id: `day-${i + 1}`,
      date: `2026-07-${String(10 + i).padStart(2, "0")}`,
      title: `Neighborhood walk ${i + 1}`,
      city: "Tokyo",
      items: Array.from({ length: 10 }, (_, j) => ({
        id: `i-${i}-${j}`,
        kind: "place" as const,
        title: `Place ${i + 1}-${j + 1} with a fairly long restaurant name`,
        status: "none" as const,
        createdBy: "user" as const,
        notes: "A long note that would otherwise blow the prompt budget if copied in full.",
      })),
    }))
    const wrapped = wrapTripChatPrompt(trip({ days }), "Where should we eat tonight?", "day-3")
    expect(wrapped.length).toBeLessThanOrEqual(KOREA_CHAT_PROMPT_MAX)
    expect(wrapped).toContain("Question: Where should we eat tonight?")
  })
})

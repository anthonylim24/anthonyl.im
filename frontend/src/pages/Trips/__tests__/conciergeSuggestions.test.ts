import { describe, expect, it } from "vitest"
import { conciergeSuggestions, readDay } from "../conciergeSuggestions"
import type { ItineraryItem, Trip } from "../types"

const stop = (title: string, time?: string, extra: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id: title,
  kind: "place",
  title,
  status: "none",
  createdBy: "user",
  ...(time ? { time } : {}),
  ...extra,
})

function makeTrip(): Trip {
  return {
    id: "lisbon",
    ownerId: "u1",
    name: "Lisbon",
    destinations: ["Lisbon"],
    startDate: "2026-11-13",
    endDate: "2026-11-15",
    timezone: "Europe/Lisbon",
    status: "active",
    tags: [],
    collaborators: [],
    days: [
      {
        id: "fri",
        date: "2026-11-13",
        items: [
          stop("Mosteiro dos Jerónimos", "10:30", { endTime: "12:15" }),
          stop("MAAT", "15:00"),
          stop("Cervejaria Ramiro", "20:30", { status: "needs_review", location: { name: "Cervejaria Ramiro", source: "user", category: "restaurant" } }),
        ],
      },
      { id: "sat", date: "2026-11-14", items: [] },
      {
        id: "sun",
        date: "2026-11-15",
        items: [{ ...stop("TP 1352 to London", "18:10"), kind: "reservation", reservation: { type: "flight", status: "confirmed" } }],
      },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  }
}

describe("readDay", () => {
  it("finds the missing lunch, the gap and the midday stop", () => {
    const read = readDay(makeTrip().days[0]!)
    expect(read.hasLunch).toBe(false)
    expect(read.hasDinner).toBe(true)
    expect(read.gap?.after.title).toBe("Mosteiro dos Jerónimos")
    expect(read.middayStop?.title).toBe("Mosteiro dos Jerónimos")
  })
})

describe("conciergeSuggestions", () => {
  it("during the trip, starts from today and offers near-me with location", () => {
    const starters = conciergeSuggestions(makeTrip(), undefined, "2026-11-13")
    expect(starters.map((s) => s.label)).toEqual([
      "What's next today?",
      "Find lunch near Mosteiro dos Jerónimos",
      "Fill the gap after Mosteiro dos Jerónimos",
      "What's good near me right now?",
    ])
    expect(starters[3]).toMatchObject({ kind: "near", location: true })
    expect(starters[1]!.prompt).toBe("Where should we eat lunch near Mosteiro dos Jerónimos today?")
  })

  it("offers to plan an empty day in view", () => {
    const starters = conciergeSuggestions(makeTrip(), "sat", "2026-11-10")
    expect(starters[0]).toMatchObject({ kind: "plan", prompt: "Saturday is empty. Plan it for us." })
    expect(starters.map((s) => s.label)).toContain("Which bookings still need sorting?")
    expect(starters.some((s) => s.kind === "near")).toBe(false)
    expect(starters).toHaveLength(4)
  })

  it("before the trip, looks at bookings, empty days and the way home", () => {
    const labels = conciergeSuggestions(makeTrip(), undefined, "2026-10-01").map((s) => s.label)
    expect(labels).toEqual([
      "Which bookings still need sorting?",
      "Saturday is empty. Plan it",
      "When should we leave for the airport?",
      "What should we book ahead?",
    ])
  })

  it("falls back to the destination for a bare trip, never to filler", () => {
    const trip = { ...makeTrip(), days: [] }
    const starters = conciergeSuggestions(trip, undefined, "2027-01-01")
    expect(starters.map((s) => s.label)).toEqual(["Where should we eat in Lisbon?", "What should we not miss in Lisbon?"])
  })
})

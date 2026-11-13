import { describe, expect, it } from "vitest"
import { resizeDays } from "../workspace/DetailsDialog"
import type { ItineraryItem, TripDay } from "../types"

const stop = (id: string): ItineraryItem => ({ id, kind: "place", title: id, status: "none", createdBy: "user" })

const days: TripDay[] = [
  { id: "day-1", date: "2026-07-10", title: "Arrival", items: [stop("a")] },
  { id: "day-2", date: "2026-07-11", items: [stop("b"), stop("c")] },
  { id: "day-3", date: "2026-07-12", city: "Porto", items: [] },
]

describe("resizeDays", () => {
  it("returns the same day objects when the range is unchanged", () => {
    const out = resizeDays(days, "2026-07-10", "2026-07-12")
    expect(out).toHaveLength(3)
    out.forEach((day, i) => expect(day).toBe(days[i]))
  })

  it("re-dates existing days in order when the start moves", () => {
    const out = resizeDays(days, "2026-08-01", "2026-08-03")
    expect(out.map((d) => [d.id, d.date])).toEqual([
      ["day-1", "2026-08-01"],
      ["day-2", "2026-08-02"],
      ["day-3", "2026-08-03"],
    ])
    expect(out[0]!.title).toBe("Arrival")
    expect(out[0]!.items).toBe(days[0]!.items)
    expect(out[2]!.city).toBe("Porto")
    // The input is not mutated.
    expect(days[0]!.date).toBe("2026-07-10")
  })

  it("appends empty days for a longer range", () => {
    const out = resizeDays(days, "2026-07-10", "2026-07-14")
    expect(out.map((d) => [d.id, d.date, d.items.length])).toEqual([
      ["day-1", "2026-07-10", 1],
      ["day-2", "2026-07-11", 2],
      ["day-3", "2026-07-12", 0],
      ["day-4", "2026-07-13", 0],
      ["day-5", "2026-07-14", 0],
    ])
  })

  it("skips day-N ids that are already taken", () => {
    const odd: TripDay[] = [
      { id: "day-2", date: "2026-07-10", items: [] },
      { id: "day-3", date: "2026-07-11", items: [] },
    ]
    const out = resizeDays(odd, "2026-07-10", "2026-07-13")
    expect(out.map((d) => d.id)).toEqual(["day-2", "day-3", "day-4", "day-5"])
    expect(new Set(out.map((d) => d.id)).size).toBe(4)
  })

  it("truncates days beyond the new end", () => {
    const out = resizeDays(days, "2026-07-10", "2026-07-10")
    expect(out).toEqual([days[0]])
  })

  it("builds a fresh list from nothing", () => {
    expect(resizeDays([], "2026-12-31", "2027-01-01")).toEqual([
      { id: "day-1", date: "2026-12-31", items: [] },
      { id: "day-2", date: "2027-01-01", items: [] },
    ])
  })
})

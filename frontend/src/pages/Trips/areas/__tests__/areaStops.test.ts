import { describe, expect, it } from "vitest"
import { areaDays, areaFingerprint, areaMeta, dayRuns } from "../areaStops"
import type { ItineraryItem, TripDay } from "../../types"

const stop = (id: string, lat?: number, overrides: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id,
  kind: "place",
  title: id,
  status: "none",
  createdBy: "user",
  location: lat === undefined ? undefined : { name: id, lat, lng: -9.13, source: "user" },
  ...overrides,
})
const day = (id: string, items: ItineraryItem[]): TripDay => ({ id, date: "2026-07-10", items })

describe("dayRuns", () => {
  it("names one day, lists a few, and reads three in a row as a range", () => {
    expect(dayRuns([2])).toBe("Day 2")
    expect(dayRuns([9, 2])).toBe("Days 2, 9")
    expect(dayRuns([1, 2])).toBe("Days 1, 2")
    expect(dayRuns([5, 1, 2, 3, 3])).toBe("Days 1–3, 5")
  })
})

describe("areaDays", () => {
  it("reads the area's stops off the trip as it is now, by day in plan order", () => {
    const trip = {
      days: [
        day("d1", [stop("b", 38.71), stop("a", 38.72), stop("gone-skipped", 38.7, { status: "skipped" })]),
        day("d2", [stop("x", 38.7)]),
        day("d3", [stop("c", 38.71), stop("no-point")]),
      ],
    }
    const days = areaDays(trip, ["a", "b", "c", "deleted", "gone-skipped", "no-point"])
    expect(days.map((d) => [d.dayNumber, d.stops.map((s) => s.id)])).toEqual([
      [1, ["b", "a"]],
      [3, ["c"]],
    ])
    expect(areaMeta(days)).toBe("Days 1, 3 · 3 stops")
  })
})

describe("areaFingerprint", () => {
  it("changes when a stop moves or goes, not when stops are reordered", () => {
    const one = { days: [day("d1", [stop("a", 38.71), stop("b", 38.72)])] }
    const swapped = { days: [day("d1", [stop("b", 38.72)]), day("d2", [stop("a", 38.71)])] }
    const moved = { days: [day("d1", [stop("a", 38.75), stop("b", 38.72)])] }
    expect(areaFingerprint(swapped)).toBe(areaFingerprint(one))
    expect(areaFingerprint(moved)).not.toBe(areaFingerprint(one))
  })
})

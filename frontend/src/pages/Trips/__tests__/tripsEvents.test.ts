import { describe, expect, it } from "vitest"
import { mergeFetchedTrip, preferFresherTrip } from "../tripsEvents"
import type { ItineraryItem, Trip } from "../types"

const ICHIRAN: ItineraryItem = {
  id: "p1",
  kind: "place",
  title: "Ichiran",
  status: "none",
  createdBy: "ai",
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "tokyo",
    ownerId: "u1",
    name: "Tokyo",
    destinations: ["Tokyo"],
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    timezone: "Asia/Tokyo",
    status: "draft",
    tags: [],
    collaborators: [],
    days: [{ id: "day-1", date: "2026-07-10", items: [] }],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("preferFresherTrip", () => {
  it("takes incoming when there is no current trip", () => {
    const incoming = makeTrip()
    expect(preferFresherTrip(undefined, incoming)).toBe(incoming)
  })

  it("does not compare updatedAt across different trip ids", () => {
    const current = makeTrip()
    const other = makeTrip({ id: "osaka", updatedAt: "2026-02-01T00:00:00Z" })
    expect(preferFresherTrip(current, other)).toBe(other)
  })

  it("keeps the later updatedAt", () => {
    const stale = makeTrip({ updatedAt: "2026-01-01T00:00:00Z" })
    const live = makeTrip({
      updatedAt: "2026-01-01T00:00:01Z",
      days: [{ id: "day-1", date: "2026-07-10", items: [ICHIRAN] }],
    })
    expect(preferFresherTrip(stale, live)).toBe(live)
    expect(preferFresherTrip(live, stale)).toBe(live)
  })
})

describe("mergeFetchedTrip", () => {
  it("keeps a concierge write that beat an in-flight getTrip", () => {
    const fetched = makeTrip({ updatedAt: "2026-01-01T00:00:00Z" })
    const live = makeTrip({
      updatedAt: "2026-01-01T00:00:01Z",
      days: [{ id: "day-1", date: "2026-07-10", items: [ICHIRAN] }],
    })
    expect(mergeFetchedTrip(fetched, live).days[0]!.items).toEqual([ICHIRAN])
    expect(mergeFetchedTrip(fetched, null)).toBe(fetched)
  })
})

import { describe, expect, it } from "vitest"
import { todayDay } from "../today"
import { makeTrip } from "./tripFixtures"

// Seoul (UTC+9) for two days, then a day lived in Los Angeles (UTC-7 in summer).
const trip = makeTrip({
  timezone: "Asia/Seoul",
  startDate: "2026-07-10",
  endDate: "2026-07-12",
  days: [
    { id: "seoul-1", date: "2026-07-10", items: [] },
    { id: "seoul-2", date: "2026-07-11", items: [] },
    { id: "la", date: "2026-07-12", timezone: "America/Los_Angeles", items: [] },
  ],
})

describe("todayDay", () => {
  it("reads today in the trip's zone, not the device's", () => {
    // 16:00 UTC on 9 July is 01:00 on 10 July in Seoul.
    expect(todayDay(trip, Date.parse("2026-07-09T16:00:00Z"))?.id).toBe("seoul-1")
    expect(todayDay(trip, Date.parse("2026-07-09T14:00:00Z"))).toBeNull()
  })

  it("reads a day with its own zone in that zone", () => {
    // 20:00 UTC on 12 July: 13:00 on the 12th in Los Angeles, already the 13th in Seoul.
    expect(todayDay(trip, Date.parse("2026-07-12T20:00:00Z"))?.id).toBe("la")
  })

  it("is null after the trip", () => {
    expect(todayDay(trip, Date.parse("2026-07-14T12:00:00Z"))).toBeNull()
  })
})

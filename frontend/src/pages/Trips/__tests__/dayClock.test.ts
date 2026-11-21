import { describe, expect, it } from "vitest"
import { clockMinutes, dayEnd, dayStarts, dayZone, validZone, wallClock, zonedEpoch } from "../dayClock"

describe("clockMinutes", () => {
  it("reads HH:mm and refuses anything else", () => {
    expect(clockMinutes("00:00")).toBe(0)
    expect(clockMinutes("23:59")).toBe(1439)
    expect(clockMinutes("24:00")).toBeNull()
    expect(clockMinutes("9:30")).toBeNull()
    expect(clockMinutes(undefined)).toBeNull()
  })
})

describe("dayStarts", () => {
  it("puts a small-hours stop after a late one past midnight", () => {
    expect(dayStarts([{ time: "19:00" }, { time: "23:00" }, { time: "01:00" }])).toEqual([1140, 1380, 1500])
  })

  it("keeps an early stop at the start of the day as morning", () => {
    expect(dayStarts([{ time: "05:30" }, { time: "09:00" }])).toEqual([330, 540])
  })

  it("keeps small hours after a morning-only list as morning", () => {
    expect(dayStarts([{ time: "08:00" }, { time: "10:00" }, { time: "05:00" }])).toEqual([480, 600, 300])
  })

  it("leaves untimed items null without breaking the run", () => {
    expect(dayStarts([{ time: "21:00" }, {}, { time: "02:00" }])).toEqual([1260, null, 1560])
  })
})

describe("dayEnd", () => {
  it("wraps an end before the start past midnight", () => {
    expect(dayEnd(1380, "01:30")).toBe(1530)
    expect(dayEnd(600, "11:00")).toBe(660)
  })

  it("keeps an after-midnight start's end on the same night", () => {
    expect(dayEnd(1500, "02:30")).toBe(1590)
  })
})

describe("zones", () => {
  it("prefers the day's zone and falls back to the trip's, then UTC", () => {
    expect(dayZone({ timezone: "Asia/Tokyo" }, { timezone: "Pacific/Honolulu" })).toBe("Pacific/Honolulu")
    expect(dayZone({ timezone: "Asia/Tokyo" }, {})).toBe("Asia/Tokyo")
    expect(dayZone({ timezone: "Not/AZone" }, { timezone: "" })).toBe("UTC")
    expect(validZone("Europe/Lisbon")).toBe("Europe/Lisbon")
    expect(validZone("Mars/Base")).toBeUndefined()
  })

  it("turns a wall time into the right instant, across daylight saving", () => {
    // Lisbon: WET (UTC+0) in winter, WEST (UTC+1) in summer; clocks went back on 2026-10-25.
    expect(new Date(zonedEpoch("2026-10-24", 600, "Europe/Lisbon")).toISOString()).toBe("2026-10-24T09:00:00.000Z")
    expect(new Date(zonedEpoch("2026-10-25", 600, "Europe/Lisbon")).toISOString()).toBe("2026-10-25T10:00:00.000Z")
    // Auckland is UTC+13 in November.
    expect(new Date(zonedEpoch("2026-11-21", 9 * 60, "Pacific/Auckland")).toISOString()).toBe("2026-11-20T20:00:00.000Z")
  })

  it("takes minutes past 1440 into the next morning", () => {
    expect(new Date(zonedEpoch("2026-06-01", 1500, "UTC")).toISOString()).toBe("2026-06-02T01:00:00.000Z")
  })

  it("measures an evening across the spring-forward night as real time", () => {
    // New York sprang forward at 02:00 on 2026-03-08: 22:00 to 08:00 is nine hours, not ten.
    const from = zonedEpoch("2026-03-07", 22 * 60, "America/New_York")
    const to = zonedEpoch("2026-03-08", 8 * 60, "America/New_York")
    expect((to - from) / 3_600_000).toBe(9)
  })

  it("reads an instant back as the zone's date and clock", () => {
    expect(wallClock(Date.UTC(2026, 10, 20, 20, 0), "Pacific/Auckland")).toEqual({ date: "2026-11-21", minutes: 540 })
  })
})

import { describe, expect, it } from "vitest"
import { clockHour, dayOfYear, declinationDeg, hourIn, sunAt } from "../sun"

const DEG = Math.PI / 180

describe("clock helpers", () => {
  it("reads the hour in the trip's own time zone", () => {
    const instant = new Date("2026-06-14T12:00:00Z")
    expect(hourIn("Europe/Lisbon", instant)).toBeCloseTo(13)
    expect(hourIn("Asia/Tokyo", instant)).toBeCloseTo(21)
    expect(hourIn("America/Los_Angeles", instant)).toBeCloseTo(5)
    expect(hourIn("Asia/Kolkata", instant)).toBeCloseTo(17.5)
  })

  it("falls back to noon for a time zone it doesn't know", () => {
    expect(hourIn("Not/AZone")).toBe(12)
  })

  it("parses stop times", () => {
    expect(clockHour("14:30")).toBe(14.5)
    expect(clockHour("9:05")).toBeCloseTo(9.0833, 3)
    expect(clockHour("noon")).toBeNull()
    expect(clockHour(undefined)).toBeNull()
  })

  it("knows the solstices", () => {
    expect(dayOfYear("2026-01-01")).toBe(1)
    expect(dayOfYear("2026-12-31")).toBe(365)
    expect(declinationDeg(dayOfYear("2026-06-21"))).toBeGreaterThan(23)
    expect(declinationDeg(dayOfYear("2026-12-21"))).toBeLessThan(-23)
  })
})

describe("sunAt", () => {
  it("puts the midday sun to the south in Lisbon (+Z is north)", () => {
    const sun = sunAt({ hour: 12, latDeg: 38.72, date: "2026-06-14" })
    expect(sun.belowHorizon).toBe(false)
    expect(sun.elevation).toBeGreaterThan(70 * DEG)
    expect(sun.dir.z).toBeLessThan(0)
    expect(Math.hypot(sun.dir.x, sun.dir.y, sun.dir.z)).toBeCloseTo(1)
  })

  it("puts the midday sun to the north in Sydney", () => {
    const sun = sunAt({ hour: 12, latDeg: -33.87, date: "2026-06-14" })
    expect(sun.belowHorizon).toBe(false)
    expect(sun.dir.z).toBeGreaterThan(0)
    expect(sun.elevation).toBeLessThan(40 * DEG)
  })

  it("rises in the east and sets in the west (+X is west)", () => {
    const morning = sunAt({ hour: 8, latDeg: 38.72, date: "2026-06-14" })
    const evening = sunAt({ hour: 18, latDeg: 38.72, date: "2026-06-14" })
    expect(morning.dir.x).toBeLessThan(0)
    expect(evening.dir.x).toBeGreaterThan(0)
    expect(morning.height).toBeLessThan(sunAt({ hour: 12, latDeg: 38.72, date: "2026-06-14" }).height)
  })

  it("is lower in winter", () => {
    const summer = sunAt({ hour: 12, latDeg: 38.72, date: "2026-06-21" })
    const winter = sunAt({ hour: 12, latDeg: 38.72, date: "2026-12-21" })
    expect(winter.elevation).toBeLessThan(summer.elevation - 40 * DEG)
  })

  it("lights from a moon above the horizon at night", () => {
    const sun = sunAt({ hour: 1, latDeg: 38.72, date: "2026-12-05" })
    expect(sun.belowHorizon).toBe(true)
    expect(sun.elevation).toBeLessThan(0)
    expect(sun.dir.y).toBeGreaterThan(0.3)
  })

  it("keeps the midnight sun up in an Arctic summer", () => {
    expect(sunAt({ hour: 0, latDeg: 69.65, date: "2026-06-21" }).belowHorizon).toBe(false)
  })
})

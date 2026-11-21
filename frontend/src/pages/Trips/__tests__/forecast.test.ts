import { describe, expect, it } from "vitest"
import { forecastLine, forecastRequests, prefersFahrenheit, readDaily, weatherKind } from "../forecast"
import { makeItem, makeTrip } from "./tripFixtures"

const at = (lat: number, lng: number) => ({ name: "x", source: "user" as const, lat, lng })

describe("forecastRequests", () => {
  it("reads each day at its first pin and groups days in the same place", () => {
    const trip = makeTrip({
      center: { lat: 38.72, lng: -9.14 },
      days: [
        { id: "d1", date: "2026-07-10", items: [makeItem({ id: "a", location: at(38.71, -9.13) })] },
        { id: "d2", date: "2026-07-11", items: [] },
        { id: "d3", date: "2026-07-12", items: [makeItem({ id: "b", location: at(41.15, -8.61) })] },
      ],
    })
    const reqs = forecastRequests(trip, "2026-07-09")
    expect(reqs).toHaveLength(2)
    expect(reqs[0]).toMatchObject({ lat: 38.7, lng: -9.1, start: "2026-07-10", end: "2026-07-11" })
    expect([...reqs[0]!.days.keys()]).toEqual(["d1", "d2"])
    expect(reqs[1]).toMatchObject({ lat: 41.2, lng: -8.6, start: "2026-07-12", end: "2026-07-12" })
  })

  it("falls back to the trip centre and skips days outside the 16-day window", () => {
    const trip = makeTrip({ center: { lat: 38.72, lng: -9.14 } })
    expect(forecastRequests(trip, "2026-06-01")).toEqual([])
    expect(forecastRequests(trip, "2026-07-12")).toEqual([])
    const reqs = forecastRequests(trip, "2026-06-25")
    expect(reqs).toHaveLength(1)
    expect([...reqs[0]!.days.values()]).toEqual(["2026-07-10"])
  })

  it("asks nothing when no place is known", () => {
    expect(forecastRequests(makeTrip(), "2026-07-09")).toEqual([])
  })
})

describe("readDaily", () => {
  it("drops days with a missing temperature instead of showing 0°", () => {
    const rows = readDaily({
      time: ["2026-07-10", "2026-07-11"],
      weather_code: [61, 0],
      temperature_2m_max: [24.4, null],
      temperature_2m_min: [17.1, 15],
      precipitation_probability_max: [70, 5],
    })
    expect(rows).toEqual([{ date: "2026-07-10", highC: 24.4, lowC: 17.1, rainChance: 70, code: 61 }])
    expect(readDaily(undefined)).toEqual([])
  })
})

describe("weather words", () => {
  it("names the sky from the WMO code", () => {
    expect(weatherKind(0).word).toBe("Clear")
    expect(weatherKind(2).word).toBe("Partly cloudy")
    expect(weatherKind(45).word).toBe("Fog")
    expect(weatherKind(63).word).toBe("Rain")
    expect(weatherKind(81).word).toBe("Showers")
    expect(weatherKind(73).word).toBe("Snow")
    expect(weatherKind(95).word).toBe("Thunderstorms")
  })

  it("mentions rain only when it is likely, in the reader's scale", () => {
    const f = { date: "2026-07-10", highC: 24.4, lowC: 17.1, rainChance: 70, code: 61 }
    expect(forecastLine(f, false)).toBe("24° / 17° · Rain 70%")
    expect(forecastLine({ ...f, rainChance: 10, code: 0 }, true)).toBe("76° / 63° · Clear")
    expect(forecastLine({ ...f, rainChance: 40, code: 3 }, false)).toBe("24° / 17° · Overcast · 40% rain")
  })

  it("uses Fahrenheit for US locales only", () => {
    expect(prefersFahrenheit("en-US")).toBe(true)
    expect(prefersFahrenheit("en-GB")).toBe(false)
    expect(prefersFahrenheit("ko")).toBe(false)
    expect(prefersFahrenheit(undefined)).toBe(false)
  })
})

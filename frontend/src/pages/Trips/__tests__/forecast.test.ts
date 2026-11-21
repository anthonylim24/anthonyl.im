import { describe, expect, it } from "vitest"
import { SKIES, daySky, forecastLine, forecastRequests, prefersFahrenheit, readDaily, skyFromText, weatherKind, wetDuring, wetSpells, wetWord, type SkyId } from "../forecast"
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

  it("reads the light and the hours from Open-Meteo's own stamps", () => {
    const [day] = readDaily(
      {
        time: ["2026-11-21"],
        weather_code: [1],
        temperature_2m_max: [10.4],
        temperature_2m_min: [3.3],
        precipitation_probability_max: [0],
        sunrise: ["2026-11-21T06:36"],
        sunset: ["2026-11-21T16:48"],
      },
      {
        time: ["2026-11-21T00:00", "2026-11-21T01:00", "2026-11-22T00:00"],
        temperature_2m: [5, null, 4.4],
        precipitation_probability: [0, 0, 10],
        weather_code: [1, 1, 3],
      },
    )
    expect(day).toMatchObject({ sunrise: "06:36", sunset: "16:48", hours: [{ time: "00:00", tempC: 5, rainChance: 0, code: 1 }] })
  })
})

describe("wetSpells", () => {
  it("joins wet hours into spells with their highest chance", () => {
    const hour = (time: string, rainChance: number, code = 61) => ({ time, tempC: 10, rainChance, code })
    const hours = [hour("12:00", 20), hour("13:00", 55, 3), hour("14:00", 80, 73), hour("15:00", 30), hour("18:00", 60, 81)]
    expect(wetSpells(hours)).toEqual([
      { from: 13 * 60, to: 15 * 60, chance: 80, code: 73 },
      { from: 18 * 60, to: 19 * 60, chance: 60, code: 81 },
    ])
  })

  it("names what falls from the wettest hour", () => {
    expect(wetWord(73)).toBe("Snow")
    expect(wetWord(81)).toBe("Showers")
    expect(wetWord(63)).toBe("Rain")
    expect(wetWord(3)).toBe("Rain")
  })

  it("finds the wettest spell a stop meets", () => {
    const spells = [
      { from: 13 * 60, to: 15 * 60, chance: 80, code: 61 },
      { from: 18 * 60, to: 19 * 60, chance: 60, code: 61 },
    ]
    expect(wetDuring(spells, 14 * 60 + 30, 19 * 60)?.chance).toBe(80)
    expect(wetDuring(spells, 15 * 60, 18 * 60)).toBeNull()
  })
})

describe("daySky", () => {
  const forecast = { date: "2026-07-10", highC: 24, lowC: 17, rainChance: 70, code: 61 }
  const none = { byDay: new Map(), pending: new Set<string>(), missing: new Set<string>() }

  it("prefers the live forecast, then holds the place while one loads", () => {
    const day = { id: "d1", weather: { highC: 30, lowC: 20, condition: "Sunny" } }
    expect(daySky(day, { ...none, byDay: new Map([["d1", forecast]]) })).toEqual({ status: "forecast", forecast })
    expect(daySky(day, { ...none, pending: new Set(["d1"]) })).toEqual({ status: "loading" })
  })

  it("falls back to the plan's weather, then to nothing", () => {
    expect(daySky({ id: "d1", weather: { highC: 30, lowC: 20, condition: "Light rain, humid" } }, none)).toEqual({
      status: "expected",
      highC: 30,
      lowC: 20,
      word: "Light rain, humid",
      sky: "rain",
    })
    expect(daySky({ id: "d1" }, none)).toEqual({ status: "none" })
  })

  it("says so when a day in the forecast's reach got no forecast", () => {
    expect(daySky({ id: "d1" }, { ...none, missing: new Set(["d1"]) })).toEqual({ status: "unavailable" })
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

  it("gives every sky the forecast can name an engraving and a glyph", () => {
    const codes = [0, 1, 2, 3, 45, 48, 51, 55, 57, 61, 65, 67, 71, 75, 77, 80, 82, 85, 86, 95, 96, 99, 4]
    for (const code of codes) {
      const kind = weatherKind(code)
      expect(kind.art, `code ${code}`).toMatch(/sky-[a-z-]+\.webp/)
      expect(kind.icon).toBeTruthy()
    }
    expect(weatherKind(4)).toMatchObject({ word: "Cloudy", sky: "cloudy" })
    expect(Object.keys(SKIES)).toHaveLength(9)
  })

  it("reads a written forecast as the nearest sky", () => {
    const cases: Array<[string, SkyId]> = [
      ["Sunny and warm", "clear"],
      ["Partly cloudy", "partly-cloudy"],
      ["Overcast", "cloudy"],
      ["Morning mist", "fog"],
      ["Light drizzle", "drizzle"],
      ["Scattered showers", "showers"],
      ["Heavy rain", "rain"],
      ["Snow flurries", "snow"],
      ["Thunderstorms", "thunder"],
      ["Humid", "cloudy"],
    ]
    for (const [text, sky] of cases) expect(skyFromText(text), text).toBe(sky)
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

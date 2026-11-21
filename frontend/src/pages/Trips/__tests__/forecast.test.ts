import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import {
  SKIES,
  daySky,
  forecastLine,
  forecastRequests,
  prefersFahrenheit,
  readDaily,
  skyFromText,
  useForecast,
  weatherKind,
  wetDuring,
  wetSpells,
  wetWord,
  type SkyId,
} from "../forecast"
import { forgetClimate } from "../climate"
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

  describe("past the forecast's reach", () => {
    const typical = { date: "2026-12-24", highC: 7, lowC: 0, rainChance: 40, code: 3, years: 3 }
    const planned = { id: "d1", weather: { highC: 30, lowC: 20, condition: "Sunny" } }

    it("never passes history off as a forecast: a live forecast wins", () => {
      const both = { ...none, byDay: new Map([["d1", forecast]]), typical: new Map([["d1", typical]]) }
      expect(daySky(planned, both)).toEqual({ status: "forecast", forecast })
    })

    it("prefers the measured history of the date to the plan's guess", () => {
      expect(daySky(planned, { ...none, typical: new Map([["d1", typical]]) })).toEqual({ status: "typical", typical })
    })

    it("holds the place while the history is on its way, then falls back to the plan's guess", () => {
      expect(daySky(planned, { ...none, typical: new Map(), pending: new Set(["d1"]) })).toEqual({ status: "loading" })
      // The archive answered with nothing for this day (or failed): the plan's weather, as before.
      expect(daySky(planned, { ...none, typical: new Map() })).toMatchObject({ status: "expected", highC: 30 })
      expect(daySky({ id: "d1" }, { ...none, typical: new Map() })).toEqual({ status: "none" })
    })
  })
})

describe("useForecast", () => {
  const TODAY = new Date("2026-11-21T12:00:00Z")
  const realFetch = globalThis.fetch

  /** A daily answer for one place: the given dates, all at `high`. */
  const placeAnswer = (dates: string[], high: number) => ({
    daily: {
      time: dates,
      weather_code: dates.map(() => 3),
      temperature_2m_max: dates.map(() => high),
      temperature_2m_min: dates.map(() => high - 8),
      precipitation_probability_max: dates.map(() => 10),
    },
  })

  /** Seven archive days around `centre`, all at `high`, wet on `wetDays` of them. */
  const archiveAnswer = (centre: string, high: number, wetDays: number) => {
    const dates = [-3, -2, -1, 0, 1, 2, 3].map((o) => {
      const d = new Date(`${centre}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() + o)
      return d.toISOString().slice(0, 10)
    })
    return {
      daily: {
        time: dates,
        weather_code: dates.map(() => 3),
        temperature_2m_max: dates.map(() => high),
        temperature_2m_min: dates.map(() => high - 6),
        precipitation_sum: dates.map((_, i) => (i < wetDays ? 3 : 0)),
      },
    }
  }

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(TODAY)
    localStorage.clear()
    forgetClimate()
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.fetch = realFetch
  })

  it("asks for every place in one request, however many there are", async () => {
    // Eight cities on eight days, all inside the forecast's reach: once capped at six requests.
    const cities = Array.from({ length: 8 }, (_, i) => ({ lat: 30 + i, lng: 100 + i }))
    const days = cities.map((c, i) => ({ id: `d${i}`, date: `2026-11-${22 + i}`, items: [makeItem({ id: `s${i}`, location: at(c.lat, c.lng) })] }))
    const trip = makeTrip({ timezone: "UTC", startDate: "2026-11-22", endDate: "2026-11-29", days })
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("api.open-meteo.com/v1/forecast?")
      return json(days.map((d, i) => placeAnswer([d.date], 10 + i)))
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const { result } = renderHook(() => useForecast(trip))
    await waitFor(() => expect(result.current.byDay.size).toBe(8))
    expect(fetchMock).toHaveBeenCalledOnce()
    const url = new URL(fetchMock.mock.calls[0]![0])
    expect(url.searchParams.get("latitude")).toBe(cities.map((c) => c.lat).join(","))
    expect(url.searchParams.get("longitude")).toBe(cities.map((c) => c.lng).join(","))
    expect(url.searchParams.get("start_date")).toBe(days.map((d) => d.date).join(","))
    expect(url.searchParams.get("end_date")).toBe(days.map((d) => d.date).join(","))
    // The answers come back in the order asked, one per place.
    expect(result.current.byDay.get("d0")?.highC).toBe(10)
    expect(result.current.byDay.get("d7")?.highC).toBe(17)
    expect(result.current.missing.size).toBe(0)
  })

  it("reads a lone place's answer, which comes as an object rather than an array", async () => {
    const trip = makeTrip({
      timezone: "UTC",
      center: { lat: 51.5, lng: -0.1 },
      days: [{ id: "d1", date: "2026-11-23", items: [] }],
    })
    globalThis.fetch = vi.fn(async () => json(placeAnswer(["2026-11-23"], 9))) as unknown as typeof fetch
    const { result } = renderHook(() => useForecast(trip))
    await waitFor(() => expect(result.current.byDay.get("d1")?.highC).toBe(9))
  })

  it("gives the days past the forecast's reach their typical weather, from one archive request, kept for next time", async () => {
    const trip = makeTrip({
      timezone: "Asia/Seoul",
      center: { lat: 37.57, lng: 126.98 },
      days: [
        { id: "near", date: "2026-11-25", items: [] },
        { id: "far", date: "2026-12-24", items: [] },
        { id: "busan", date: "2026-12-26", items: [makeItem({ id: "b", location: at(35.18, 129.08) })] },
      ],
    })
    const urls: string[] = []
    globalThis.fetch = vi.fn(async (url: string) => {
      urls.push(url)
      if (url.includes("archive-api")) {
        return json([
          // Seoul, its three years in turn, then Busan's.
          archiveAnswer("2025-12-24", 4, 2),
          archiveAnswer("2024-12-24", 2, 0),
          archiveAnswer("2023-12-24", 3, 1),
          archiveAnswer("2025-12-26", 9, 0),
          archiveAnswer("2024-12-26", 9, 0),
          archiveAnswer("2023-12-26", 9, 0),
        ])
      }
      return json(placeAnswer(["2026-11-25"], 12))
    }) as unknown as typeof fetch

    const { result, unmount } = renderHook(() => useForecast(trip))
    // The far days hold their place while the history comes.
    expect(daySky({ id: "far" }, result.current)).toEqual({ status: "loading" })
    await waitFor(() => expect(result.current.typical?.size).toBe(2))
    expect(result.current.byDay.has("far")).toBe(false)
    expect(daySky({ id: "near" }, result.current).status).toBe("forecast")
    expect(daySky({ id: "far" }, result.current)).toMatchObject({ status: "typical", typical: { highC: 3, rainChance: 14, years: 3 } })
    expect(result.current.typical?.get("busan")).toMatchObject({ highC: 9, rainChance: 0 })

    const archive = urls.filter((url) => url.includes("archive-api"))
    expect(archive).toHaveLength(1)
    const query = new URL(archive[0]!).searchParams
    expect(query.get("latitude")).toBe("37.6,37.6,37.6,35.2,35.2,35.2")
    expect(query.get("start_date")).toBe("2025-12-21,2024-12-21,2023-12-21,2025-12-23,2024-12-23,2023-12-23")
    expect(query.get("end_date")).toBe("2025-12-27,2024-12-27,2023-12-27,2025-12-29,2024-12-29,2023-12-29")
    unmount()

    // Next visit (a reload): straight from storage, no request, no held place.
    forgetClimate()
    urls.length = 0
    const again = renderHook(() => useForecast(trip))
    expect(daySky({ id: "far" }, again.result.current)).toMatchObject({ status: "typical" })
    await waitFor(() => expect(again.result.current.byDay.size).toBe(1))
    expect(urls.some((url) => url.includes("archive-api"))).toBe(false)
  })

  it("keeps the plan's own weather when the history does not come, and never calls it a missing forecast", async () => {
    const trip = makeTrip({
      timezone: "UTC",
      center: { lat: 48.86, lng: 2.35 },
      days: [{ id: "far", date: "2027-01-10", weather: { highC: 6, lowC: 1, condition: "Grey" }, items: [] }],
    })
    globalThis.fetch = vi.fn(async () => json({ error: true, reason: "down" }, 500)) as unknown as typeof fetch
    const { result } = renderHook(() => useForecast(trip))
    await waitFor(() => expect(result.current.pending.size).toBe(0))
    expect(result.current.missing.size).toBe(0)
    expect(daySky(trip.days[0]!, result.current)).toMatchObject({ status: "expected", highC: 6 })
    expect(localStorage.length).toBe(0)
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

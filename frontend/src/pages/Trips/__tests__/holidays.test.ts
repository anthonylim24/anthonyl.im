import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { forgetHolidays, holidayDays, holidayLine, holidaysByDay, readHolidays, useHolidays, type Holiday } from "../holidays"
import { dayCountries } from "../prep/essentials"
import { makeTrip } from "./tripFixtures"

const row = (over: Record<string, unknown>) => ({
  date: "2026-12-25",
  localName: "Christmas Day",
  name: "Christmas Day",
  countryCode: "US",
  fixed: false,
  global: true,
  counties: null,
  launchYear: null,
  types: ["Public", "Bank"],
  ...over,
})

describe("readHolidays", () => {
  it("keeps nationwide public holidays and nothing else", () => {
    const rows = [
      row({}),
      row({ date: "2026-02-12", name: "Lincoln's Birthday", global: false, counties: ["US-CA"], types: ["Observance"] }),
      row({ date: "2026-04-03", name: "Good Friday", global: false, counties: ["US-TX"], types: ["Optional"] }),
      row({ date: "2026-05-08", name: "Truman Day", global: true, types: ["School"] }),
      // An older answer with a single `type`.
      { date: "2026-01-01", localName: "새해", name: "New Year's Day", global: true, type: "Public" },
      row({ date: "not a date" }),
      row({ name: "   " }),
      "junk",
    ]
    expect(readHolidays(rows, "US")).toEqual([
      { date: "2026-12-25", name: "Christmas Day", localName: "Christmas Day", country: "US" },
      { date: "2026-01-01", name: "New Year's Day", localName: "새해", country: "US" },
    ])
    expect(readHolidays({ status: 404 }, "XX")).toEqual([])
  })
})

describe("which country each day is in", () => {
  it("follows a day's own zone, then its city, then the day before", () => {
    const trip = makeTrip({
      destinations: ["Seoul", "Tokyo"],
      timezone: "Asia/Seoul",
      days: [
        { id: "d1", date: "2026-12-24", items: [] },
        { id: "d2", date: "2026-12-25", city: "Busan", items: [] },
        { id: "d3", date: "2026-12-26", timezone: "Asia/Tokyo", items: [] },
        { id: "d4", date: "2026-12-27", items: [] },
        { id: "d5", date: "2026-12-28", city: "Gyeongju", items: [] },
      ],
    })
    const countries = dayCountries(trip)
    expect([...countries].map(([id, c]) => [id, c.code])).toEqual([
      ["d1", "KR"],
      ["d2", "KR"],
      ["d3", "JP"],
      ["d4", "JP"],
      ["d5", "KR"],
    ])
  })

  it("asks for a list per country and year, from today on", () => {
    const trip = makeTrip({
      destinations: ["Japan"],
      timezone: "Asia/Tokyo",
      days: [
        { id: "past", date: "2026-11-20", items: [] },
        { id: "eve", date: "2026-12-31", items: [] },
        { id: "new", date: "2027-01-01", items: [] },
      ],
    })
    expect(holidayDays(trip, "2026-11-21")).toEqual([
      { dayId: "eve", date: "2026-12-31", country: "JP", list: "JP:2026" },
      { dayId: "new", date: "2027-01-01", country: "JP", list: "JP:2027" },
    ])
    expect(holidayDays(makeTrip({ destinations: ["Somewhere new"], timezone: "UTC" }), "2026-01-01")).toEqual([])
  })
})

describe("holidaysByDay", () => {
  it("maps each day to its holidays, once per name", () => {
    const days = [
      { dayId: "d1", date: "2026-12-25", country: "DE", list: "DE:2026" },
      { dayId: "d2", date: "2026-12-27", country: "DE", list: "DE:2026" },
      { dayId: "d3", date: "2027-01-01", country: "DE", list: "DE:2027" },
    ]
    const christmas: Holiday = { date: "2026-12-25", name: "Christmas Day", localName: "Weihnachtstag", country: "DE" }
    const lists = new Map([["DE:2026", [christmas, { ...christmas }, { ...christmas, date: "2026-12-26", name: "St. Stephen's Day" }]]])
    expect(holidaysByDay(days, lists)).toEqual(new Map([["d1", [christmas]]]))
  })

  it("puts one or several names in a quiet line", () => {
    const h = (name: string): Holiday => ({ date: "2026-12-25", name, localName: name, country: "X" })
    expect(holidayLine([h("Christmas Day")])).toEqual({ names: "Christmas Day", note: "public holiday: shops and museums may close or keep short hours" })
    expect(holidayLine([h("A"), h("B"), h("C")]).names).toBe("A, B and C")
    expect(holidayLine([h("A"), h("B")]).note).toMatch(/^public holidays:/)
  })
})

describe("useHolidays", () => {
  const realFetch = globalThis.fetch
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

  beforeEach(() => {
    localStorage.clear()
    forgetHolidays()
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  const trip = makeTrip({
    destinations: ["South Korea"],
    timezone: "Asia/Seoul",
    days: [
      { id: "d1", date: "2026-12-24", items: [] },
      { id: "d2", date: "2026-12-25", items: [] },
      { id: "d3", date: "2027-01-01", items: [] },
    ],
  })

  it("fetches each country-year once and maps the holidays to the days, kept for next time", async () => {
    const urls: string[] = []
    globalThis.fetch = vi.fn(async (url: string) => {
      urls.push(url)
      return url.endsWith("/2026/KR")
        ? json([row({ countryCode: "KR", localName: "기독탄신일" })])
        : json([row({ date: "2027-01-01", name: "New Year's Day", localName: "새해", countryCode: "KR" })])
    }) as unknown as typeof fetch
    const { result, unmount } = renderHook(() => useHolidays(trip, "2026-11-21"))
    await waitFor(() => expect(result.current.size).toBe(2))
    expect(result.current.get("d2")).toEqual([{ date: "2026-12-25", name: "Christmas Day", localName: "기독탄신일", country: "KR" }])
    expect(result.current.get("d3")?.[0]?.name).toBe("New Year's Day")
    expect(result.current.has("d1")).toBe(false)
    expect(urls.sort()).toEqual(["https://date.nager.at/api/v3/PublicHolidays/2026/KR", "https://date.nager.at/api/v3/PublicHolidays/2027/KR"])
    unmount()

    forgetHolidays()
    urls.length = 0
    const again = renderHook(() => useHolidays(trip, "2026-11-21"))
    expect(again.result.current.get("d2")?.[0]?.name).toBe("Christmas Day")
    expect(urls).toEqual([])
  })

  it("shows nothing, and keeps nothing, when the service fails; a country it does not cover is an empty answer", async () => {
    globalThis.fetch = vi.fn(async (url: string) => (url.endsWith("/2026/KR") ? json({}, 503) : new Response(null, { status: 404 }))) as unknown as typeof fetch
    const { result } = renderHook(() => useHolidays(trip, "2026-11-21"))
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current.size).toBe(0)
    // The 404 is remembered as "no holidays"; the failure is not.
    expect(localStorage.getItem("trips-holidays-v1:KR:2027")).not.toBeNull()
    expect(localStorage.getItem("trips-holidays-v1:KR:2026")).toBeNull()
  })
})

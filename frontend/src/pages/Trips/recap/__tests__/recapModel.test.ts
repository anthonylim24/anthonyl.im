import { describe, expect, it } from "vitest"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import type { ItineraryItem, TripExpense } from "../../types"
import { excerpt, formatTravelled, recapLine, tripRecap } from "../recapModel"

const at = (lat: number, lng: number, extra: Partial<ItineraryItem> = {}): ItineraryItem =>
  makeItem({ location: { name: extra.title ?? "Place", source: "user", lat, lng }, ...extra })

const spend = (id: string, amount: number, category: TripExpense["category"], currency = "KRW"): TripExpense => ({
  id,
  title: id,
  amount,
  currency,
  category,
  createdAt: "2026-12-23T12:00:00Z",
})

// Seoul is UTC+9: 03:00Z is noon there.
const NOON = (date: string) => Date.parse(`${date}T03:00:00Z`)

function seoulTrip() {
  return makeTrip({
    name: "Winter in Korea",
    startDate: "2026-12-23",
    endDate: "2026-12-25",
    timezone: "Asia/Seoul",
    budget: { currency: "KRW" },
    days: [
      {
        id: "d1",
        date: "2026-12-23",
        city: "Seoul",
        journal: "Snow on the palace roofs. 눈이 왔다.",
        items: [
          at(37.5796, 126.977, { id: "palace", title: "Gyeongbokgung", highlight: true }),
          makeItem({ id: "note", kind: "note", title: "Bring gloves" }),
          at(37.5512, 126.9882, { id: "tower", title: "N Seoul Tower", status: "skipped", highlight: true }),
          at(37.5636, 126.9869, { id: "market", title: "Myeongdong" }),
        ],
      },
      {
        id: "d2",
        date: "2026-12-24",
        city: "seoul",
        items: [
          at(37.5665, 126.978, { id: "plaza", title: "City Hall" }),
          makeItem({ id: "heading", kind: "section", title: "To schedule" }),
          at(37.57, 126.99, { id: "parked", title: "Gwangjang Market" }),
          at(37.58, 126.98, { id: "parked-done", title: "Bukchon", status: "completed" }),
        ],
      },
      {
        id: "d3",
        date: "2026-12-25",
        city: "Busan",
        items: [
          at(35.1587, 129.1604, { id: "beach", title: "Haeundae", status: "completed", highlight: true }),
          at(35.0975, 129.0106, { id: "village", title: "Gamcheon" }),
        ],
      },
    ],
    expenses: [spend("hotel", 300_000, "lodging"), spend("ktx", 60_000, "transport"), spend("bibimbap", 40_000, "food"), spend("pho", 10, "food", "VND")],
  })
}

describe("tripRecap", () => {
  it("counts what was done once the trip is over", () => {
    const recap = tripRecap(seoulTrip(), {}, NOON("2026-12-28"))
    expect(recap).toMatchObject({ name: "Winter in Korea", dates: "Dec 23 – 25, 2026", days: 3, totalDays: 3, over: true })
    // Palace, market, City Hall, Bukchon (parked but done), Haeundae, Gamcheon; not the skipped tower,
    // the note, the heading or the parked place never marked done.
    expect(recap.places).toBe(6)
    expect(recap.cities).toEqual(["Seoul", "Busan"])
    expect(recap.loved.map((stop) => [stop.title, stop.dayNumber, stop.city])).toEqual([
      ["Gyeongbokgung", 1, "Seoul"],
      ["Haeundae", 3, "Busan"],
    ])
    expect(recap.journal).toEqual([{ dayId: "d1", dayNumber: 1, date: "2026-12-23", text: "Snow on the palace roofs. 눈이 왔다." }])
    // Palace → market → City Hall in Seoul, then the long way down to Busan.
    expect(recap.points).toHaveLength(5)
    expect(recap.distance).toBeGreaterThan(330_000)
    expect(recap.distance).toBeLessThan(360_000)
  })

  it("counts a place marked done on a day still to come, and nothing else of the future", () => {
    const recap = tripRecap(seoulTrip(), {}, NOON("2026-12-24"))
    expect(recap.over).toBe(false)
    expect(recap.days).toBe(2)
    // Day 1 is over (palace, market); day 2 is today (only Bukchon is marked done); day 3 has Haeundae done.
    expect(recap.places).toBe(4)
    expect(recap.cities).toEqual(["Seoul"])
    expect(recapLine(recap)).toBe("2 of 3 days · 4 places · 1 city · about 333 km")
  })

  it("adds up the spending by category, largest first, and names what it could not convert", () => {
    const recap = tripRecap(seoulTrip(), {}, NOON("2026-12-28"))
    expect(recap.spend).toEqual({
      currency: "KRW",
      total: 400_000,
      categories: [
        { category: "lodging", label: "Lodging", amount: 300_000, share: 0.75 },
        { category: "transport", label: "Transport", amount: 60_000, share: 0.15 },
        { category: "food", label: "Food & drink", amount: 40_000, share: 0.1 },
      ],
      unconverted: ["VND"],
    })
  })

  it("gives zeros, not NaN, for a trip with nothing done or spent", () => {
    const recap = tripRecap(makeTrip({ days: [] }), {}, NOON("2026-07-01"))
    expect(recap).toMatchObject({ days: 0, totalDays: 0, over: false, places: 0, distance: 0, cities: [], loved: [], journal: [], spend: null })
    const fresh = tripRecap(makeTrip(), {}, NOON("2026-07-01"))
    expect(fresh).toMatchObject({ days: 0, totalDays: 2, places: 0, distance: 0, spend: null })
    expect(recapLine(fresh)).toBe("0 of 2 days · 0 places")
  })

  it("names the trip's one destination when its days name no city", () => {
    const lisbon = tripRecap(makeTrip({ destinations: ["Lisbon"] }), {}, NOON("2026-07-20"))
    expect(lisbon.cities).toEqual(["Lisbon"])
    expect(tripRecap(makeTrip({ destinations: ["Lisbon", "Porto"] }), {}, NOON("2026-07-20")).cities).toEqual([])
  })
})

describe("excerpt", () => {
  it("keeps a short entry whole and folds its spacing", () => {
    expect(excerpt("  First day.\n\nRain all morning.  ")).toBe("First day. Rain all morning.")
  })

  it("cuts a long entry at a space near the end", () => {
    const text = `${"word ".repeat(60)}end`
    const cut = excerpt(text, 52)
    expect(cut.endsWith("word…")).toBe(true)
    expect(Array.from(cut).length).toBeLessThanOrEqual(53)
  })

  it("never splits a syllable or an emoji, with or without spaces", () => {
    const korean = "오늘은부산에서해운대를걸었다".repeat(10)
    const cut = excerpt(korean, 20)
    expect(cut).toBe(`${Array.from(korean).slice(0, 20).join("")}…`)
    const flags = "🇰🇷".repeat(30)
    expect(excerpt(flags, 5)).toBe(`${"🇰🇷".repeat(5)}…`)
  })
})

describe("formatTravelled", () => {
  it("says metres, then tenths of a kilometre, then whole kilometres", () => {
    expect(formatTravelled(640)).toBe("640 m")
    expect(formatTravelled(8_420)).toBe("8.4 km")
    expect(formatTravelled(1_240_400)).toBe("1,240 km")
  })
})

import { describe, expect, it } from "vitest"
import type { ItineraryItem, Trip } from "../../types"
import { tonightsStay } from "../tonight"

const hotel = (id: string, name: string, address?: string): ItineraryItem => ({
  id,
  kind: "place",
  title: name,
  status: "none",
  createdBy: "user",
  location: { name, source: "user", category: "hotel", lat: 37.56, lng: 126.98, ...(address ? { address } : {}) },
})
const museum: ItineraryItem = {
  id: "m1",
  kind: "place",
  title: "National Museum",
  status: "none",
  createdBy: "user",
  location: { name: "National Museum", source: "user", category: "museum" },
}

const trip = (...days: ItineraryItem[][]): Pick<Trip, "days" | "timezone"> => ({
  timezone: "Asia/Seoul",
  days: days.map((items, i) => ({ id: `day-${i + 1}`, date: `2026-12-2${i + 3}`, items })),
})

// Seoul is UTC+9: 03:00Z is noon there.
const at = (date: string, utc = "03:00") => new Date(`${date}T${utc}:00Z`)

describe("tonightsStay", () => {
  const seoul = trip([museum, hotel("h1", "Hotel Cappuccino", "155 Bongeunsa-ro, Gangnam-gu, Seoul")], [museum], [hotel("h2", "Paradise Hotel Busan")])

  it("is the first night's place before the trip", () => {
    expect(tonightsStay(seoul, at("2026-12-01"))).toEqual({
      dayId: "day-1",
      itemId: "h1",
      name: "Hotel Cappuccino",
      address: "155 Bongeunsa-ro, Gangnam-gu, Seoul",
      lat: 37.56,
      lng: 126.98,
      date: "2026-12-23",
      when: "first",
    })
  })

  it("keeps the last place checked into until the next one", () => {
    expect(tonightsStay(seoul, at("2026-12-23"))).toMatchObject({ itemId: "h1", when: "tonight" })
    expect(tonightsStay(seoul, at("2026-12-24"))).toMatchObject({ itemId: "h1", when: "tonight" })
    expect(tonightsStay(seoul, at("2026-12-25"))).toMatchObject({ itemId: "h2", name: "Paradise Hotel Busan", address: null, when: "tonight" })
  })

  it("reads the day where it is spent, not in UTC", () => {
    // 16:00Z on the 22nd is already 01:00 on the 23rd in Seoul.
    expect(tonightsStay(seoul, at("2026-12-22", "16:00"))).toMatchObject({ itemId: "h1", when: "tonight" })
    expect(tonightsStay(seoul, at("2026-12-22", "14:00"))).toMatchObject({ itemId: "h1", when: "first" })
  })

  it("covers every night a booked stay runs to, and none after its check-out", () => {
    const booked: ItineraryItem = {
      ...hotel("h4", "Lotte Hotel"),
      kind: "reservation",
      reservation: { type: "hotel", status: "confirmed", endDate: "2026-12-25" },
    }
    const long = trip([booked], [museum], [museum], [museum])
    expect(tonightsStay(long, at("2026-12-24"))).toMatchObject({ itemId: "h4", when: "tonight" })
    expect(tonightsStay(long, at("2026-12-25"))).toBeNull()
  })

  it("is nothing after the trip, or with no lodging by tonight", () => {
    expect(tonightsStay(seoul, at("2026-12-26"))).toBeNull()
    expect(tonightsStay(trip([museum], [museum]), at("2026-12-23"))).toBeNull()
    expect(tonightsStay(trip([museum], [hotel("h3", "Late Inn")]), at("2026-12-23"))).toBeNull()
  })
})

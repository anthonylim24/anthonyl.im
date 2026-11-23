import { describe, expect, it } from "vitest"
import { dayPins } from "../map/geo"
import { dayStays, framedStays, withStays } from "../map/stayPins"
import type { ItineraryItem, Trip } from "../types"

const place = (id: string, title: string, at: { lat: number; lng: number }, category?: string): ItineraryItem => ({
  id,
  kind: "place",
  title,
  status: "none",
  createdBy: "user",
  location: { name: title, source: "user", ...(category ? { category } : {}), ...at },
})

const trip = (...days: ItineraryItem[][]): Pick<Trip, "days"> => ({
  days: days.map((items, i) => ({ id: `day-${i + 1}`, date: `2027-02-${String(i + 6).padStart(2, "0")}`, items })),
})

const hotel = place("h1", "Halekulani", { lat: 21.2768, lng: -157.8318 }, "hotel")
const turtleBay = place("h2", "Turtle Bay Resort", { lat: 21.7056, lng: -157.9977 }, "hotel")
const beach = place("p1", "Kuhio Beach", { lat: 21.2743, lng: -157.8247 })
const diamondHead = place("p2", "Diamond Head", { lat: 21.2614, lng: -157.8056 })
const kauai = place("p3", "Waimea Canyon", { lat: 22.0717, lng: -159.6615 })

describe("dayStays", () => {
  // Day 1 check in at the Halekulani, days 2–3 there, day 4 move to Turtle Bay, day 5 leave.
  const stay = trip([beach, hotel], [diamondHead], [beach], [turtleBay], [beach])

  it("is where the traveller woke up and sleeps tonight, one stay when they are the same", () => {
    expect(dayStays(stay, 1)).toEqual([{ item: hotel, role: "both" }])
    expect(dayStays(stay, 2)).toEqual([{ item: hotel, role: "both" }])
  })

  it("is two stays on a day they move, and last night's on the day they leave", () => {
    expect(dayStays(stay, 3)).toEqual([
      { item: hotel, role: "last" },
      { item: turtleBay, role: "tonight" },
    ])
    expect(dayStays(stay, 4)).toEqual([{ item: turtleBay, role: "last" }])
  })

  it("is nothing before the first booking, and leaves out a stay with no point", () => {
    expect(dayStays(trip([beach], [hotel]), 0)).toEqual([])
    const nowhere: ItineraryItem = { ...hotel, location: { name: "Somewhere", source: "user", category: "hotel" } }
    expect(dayStays(trip([nowhere], [beach]), 1)).toEqual([])
  })

  it("counts two bookings of one hotel as one stay", () => {
    const again = { ...hotel, id: "h1-copy" }
    expect(dayStays(trip([hotel], [again], [beach]), 1)).toEqual([{ item: again, role: "both" }])
  })
})

describe("withStays", () => {
  const stay = trip([beach, hotel], [diamondHead, beach], [beach])

  it("adds a hotel pin under the stay's own id on the days after check-in, never numbered", () => {
    const day = stay.days[1]!
    const pins = withStays(day, dayStays(stay, 1), dayPins(day))
    expect(pins.map((pin) => [pin.id, pin.variant, pin.label])).toEqual([
      ["p2", "stop", "1"],
      ["p1", "stop", "2"],
      ["h1", "hotel", undefined],
    ])
    expect(pins[2]).toMatchObject({ lat: hotel.location!.lat, lng: hotel.location!.lng, title: "Halekulani, where you’re staying" })
  })

  it("marks the check-in stop instead of drawing the hotel twice, and keeps its number", () => {
    const day = stay.days[0]!
    const pins = withStays(day, dayStays(stay, 0), dayPins(day))
    expect(pins.map((pin) => [pin.id, pin.variant, pin.label, pin.lodging ?? false])).toEqual([
      ["p1", "stop", "1", false],
      ["h1", "stop", "2", true],
    ])
  })

  it("names last night's and tonight's stays apart on a moving day", () => {
    const moving = trip([hotel], [beach, turtleBay], [beach])
    const day = moving.days[1]!
    const pins = withStays(day, dayStays(moving, 1), dayPins(day))
    expect(pins.filter((pin) => pin.variant === "hotel").map((pin) => pin.title)).toEqual(["Halekulani, where you stayed last night"])
    expect(pins.find((pin) => pin.id === "h2")).toMatchObject({ variant: "stop", lodging: true })
  })

  it("draws one pin for a stay copied onto the day: the copy, marked", () => {
    const copied = trip([hotel], [beach, { ...hotel, id: "h1-copy" }], [beach])
    const day = copied.days[1]!
    const pins = withStays(day, dayStays(copied, 1), dayPins(day))
    expect(pins.map((pin) => [pin.id, pin.variant, pin.lodging ?? false])).toEqual([
      ["p1", "stop", false],
      ["h1-copy", "stop", true],
    ])
  })

  it("marks only the stay, not a booking that merely starts at a hotel", () => {
    const train: ItineraryItem = {
      ...place("ktx", "KTX to Busan", hotel.location as never, "hotel"),
      kind: "reservation",
      reservation: { type: "train", status: "confirmed" },
    }
    const moving = trip([hotel], [train, turtleBay], [beach])
    const day = moving.days[1]!
    const pins = withStays(day, dayStays(moving, 1), dayPins(day))
    expect(pins.map((pin) => [pin.id, pin.variant, pin.lodging ?? false])).toEqual([
      ["ktx", "stop", false],
      ["h2", "stop", true],
      ["h1", "hotel", false],
    ])
  })

  it("leaves the day's own pins as they were", () => {
    const day = stay.days[1]!
    const own = dayPins(day)
    const before = JSON.stringify(own)
    withStays(day, dayStays(stay, 1), own)
    expect(JSON.stringify(own)).toBe(before)
  })
})

describe("framedStays", () => {
  const pin = { id: "h1", lat: hotel.location!.lat!, lng: hotel.location!.lng!, title: "Halekulani", variant: "hotel" as const }

  it("frames a hotel near the day's stops, and on a day with no stops", () => {
    expect(framedStays([pin], [{ lat: 21.2614, lng: -157.8056 }])).toEqual([pin])
    expect(framedStays([pin], [])).toEqual([pin])
  })

  it("leaves a day trip's far-off base out of the frame", () => {
    expect(framedStays([pin], [{ lat: kauai.location!.lat!, lng: kauai.location!.lng! }])).toEqual([])
  })
})

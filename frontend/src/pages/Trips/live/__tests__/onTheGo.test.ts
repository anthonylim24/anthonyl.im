import { describe, expect, it } from "vitest"
import { makeItem } from "../../__tests__/tripFixtures"
import { planStarts } from "../../timeline/timeline"
import type { ItineraryItem, TripDay } from "../../types"
import { directionsTo, hotelTonight, legMode, routeToday, shiftRemaining, stopsAhead, withStatus } from "../onTheGo"
import { bukchon, ktx, market, palace, place, seoulTrip } from "./liveFixtures"

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36"
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"

const at = (hhmm: string, nextDay = false) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) + (nextDay ? 1440 : 0)
const day = (items: ItineraryItem[]): TripDay => ({ id: "d1", date: "2026-05-28", items })
const times = (d: TripDay | null) => d?.items.map((item) => [item.id, item.time ?? null, item.endTime ?? null])
const params = (href: string) => new URL(href).searchParams

/** Day 3 of the Seoul trip: breakfast 09:00, Bukchon 10:30–12:30, a note, the palace 14:00, the market 19:00, then a parked place. */
const seoulDay = () => seoulTrip().days[2]!

describe("shiftRemaining", () => {
  it("moves every stop still to come, and leaves what is over and what is parked", () => {
    const moved = shiftRemaining(seoulDay(), at("13:42"), 30)
    expect(times(moved)).toEqual([
      ["breakfast", "09:00", null],
      ["bukchon", "10:30", "12:30"],
      ["errand", null, null],
      ["palace", "14:30", null],
      ["market", "19:30", null],
      ["parked", null, null],
      ["ikseon", "20:00", null],
    ])
  })

  it("keeps the start of the stop under way and ends it later", () => {
    const moved = shiftRemaining(seoulDay(), at("11:00"), 15)
    expect(moved!.items.find((i) => i.id === "bukchon")).toMatchObject({ time: "10:30", endTime: "12:45" })
    expect(moved!.items.find((i) => i.id === "palace")).toMatchObject({ time: "14:15" })
  })

  it("carries a late night past midnight on the day's clock", () => {
    const night = day([
      makeItem({ id: "dinner", time: "19:00", endTime: "21:00" }),
      makeItem({ id: "bar", time: "23:00" }),
      makeItem({ id: "club", time: "01:00", endTime: "04:00" }),
    ])
    const moved = shiftRemaining(night, at("22:30"), 60)
    expect(times(moved)).toEqual([
      ["dinner", "19:00", "21:00"],
      ["bar", "00:00", null],
      ["club", "02:00", "05:00"],
    ])
    // Read back, the bar is midnight and the club 2 AM of the same night.
    expect(planStarts(moved!)).toEqual([at("19:00"), at("00:00", true), at("02:00", true)])

    // From the small hours (00:30 is 1470 on the day's clock), only the club moves.
    expect(times(shiftRemaining(night, at("00:30", true), 30))).toEqual([
      ["dinner", "19:00", "21:00"],
      ["bar", "23:00", null],
      ["club", "01:30", "04:30"],
    ])
  })

  it("refuses a shift the day's clock cannot hold", () => {
    // A lone 23:30 pushed to 00:30 would read as half past midnight that morning.
    expect(shiftRemaining(day([makeItem({ id: "late", time: "23:30" })]), at("22:00"), 60)).toBeNull()
    // A 05:30 after a late night pushed to 06:30 would read as that morning.
    const dawn = day([makeItem({ id: "bar", time: "22:00" }), makeItem({ id: "sunrise", time: "05:30" })])
    expect(shiftRemaining(dawn, at("23:00"), 60)).toBeNull()
  })

  it("leaves bookings, done and skipped stops where they are", () => {
    const d = day([
      makeItem({ id: "walk", time: "14:00" }),
      makeItem({ id: "table", kind: "reservation", time: "19:00", reservation: { type: "meal", status: "confirmed" } }),
      makeItem({ id: "show", time: "20:00", status: "booked" }),
      makeItem({ id: "early", time: "15:00", status: "completed" }),
      makeItem({ id: "gone", time: "16:00", status: "skipped" }),
    ])
    expect(times(shiftRemaining(d, at("13:00"), 15))).toEqual([
      ["walk", "14:15", null],
      ["table", "19:00", null],
      ["show", "20:00", null],
      ["early", "15:00", null],
      ["gone", "16:00", null],
    ])
  })

  it("is null when nothing would move", () => {
    expect(shiftRemaining(seoulDay(), at("21:00"), 30)).toBeNull()
    expect(shiftRemaining(seoulDay(), at("13:42"), 0)).toBeNull()
    const booked = day([makeItem({ id: "table", kind: "reservation", time: "19:00", reservation: { type: "meal", status: "confirmed" } })])
    expect(shiftRemaining(booked, at("13:00"), 15)).toBeNull()
  })
})

describe("withStatus", () => {
  it("sets one stop's status and nothing else", () => {
    const d = withStatus(seoulDay(), "palace", "skipped")
    expect(d.items.find((i) => i.id === "palace")!.status).toBe("skipped")
    expect(d.items.filter((i) => i.status === "skipped")).toHaveLength(1)
  })
})

describe("directions", () => {
  it("walks a short leg from the stop before, in the traveller's maps app", () => {
    // Bukchon to the palace is about 1.1 km.
    expect(legMode(bukchon, palace)).toBe("walk")
    const google = directionsTo(palace, bukchon, ANDROID)!
    expect(google.app).toBe("google")
    expect(params(google.href).get("travelmode")).toBe("walking")
    expect(params(google.href).get("origin")).toBe("37.58,126.98")
    expect(params(google.href).get("destination")).toBe("37.59,126.98")
    const apple = directionsTo(palace, bukchon, IPHONE)!
    expect(apple.app).toBe("apple")
    expect(params(apple.href).get("dirflg")).toBe("w")
  })

  it("takes transit for a longer leg, and starts from the phone with nothing before", () => {
    // The palace to the market is about 3.3 km.
    expect(legMode(palace, market)).toBe("transit")
    expect(params(directionsTo(market, palace, ANDROID)!.href).get("travelmode")).toBe("transit")
    const fromHere = directionsTo(market, null, ANDROID)!
    expect(params(fromHere.href).get("origin")).toBeNull()
    expect(params(fromHere.href).get("travelmode")).toBe("transit")
  })

  it("has nowhere to go for a stop with no place", () => {
    expect(directionsTo(makeItem({ id: "x" }), bukchon, ANDROID)).toBeUndefined()
  })
})

describe("stopsAhead and routeToday", () => {
  it("routes the pinned stops still ahead, in clock order, by car when a leg is too far to walk", () => {
    expect(stopsAhead(seoulDay(), at("08:00")).map((i) => i.id)).toEqual(["breakfast", "bukchon", "palace", "market"])
    expect(stopsAhead(seoulDay(), at("13:42")).map((i) => i.id)).toEqual(["palace", "market"])
    const route = routeToday(stopsAhead(seoulDay(), at("13:42")), ANDROID)!
    expect(route.app).toBe("google")
    expect(route.stops).toBe(2)
    expect(params(route.href).get("travelmode")).toBe("driving")
    expect(params(route.href).get("waypoints")).toBe("37.59,126.98")
    expect(params(route.href).get("destination")).toBe("37.62,126.98")
    // Google even on an iPhone: Apple Maps links take no stops on the way.
    expect(routeToday(stopsAhead(seoulDay(), at("08:00")), IPHONE)!.app).toBe("google")
  })

  it("walks the route when every leg is a walk", () => {
    const stroll = [place("a", "A", 37.57), place("b", "B", 37.575), place("c", "C", 37.58)]
    expect(params(routeToday(stroll, ANDROID)!.href).get("travelmode")).toBe("walking")
  })

  it("leaves out done and skipped stops, and is nothing with fewer than two", () => {
    const d = withStatus(withStatus(seoulDay(), "palace", "completed"), "breakfast", "skipped")
    expect(stopsAhead(d, at("08:00")).map((i) => i.id)).toEqual(["bukchon", "market"])
    expect(routeToday(stopsAhead(seoulDay(), at("15:00")), ANDROID)).toBeUndefined()
  })

  it("ends the route at a train: what follows it is somewhere else", () => {
    const d = day([ktx, place("haeundae", "Haeundae Beach", 35.16, { time: "13:00" })])
    expect(stopsAhead(d, at("07:00")).map((i) => i.id)).toEqual(["ktx"])
  })

  it("takes a day with no times in list order, stops not yet done", () => {
    const loose = day([place("a", "A", 37.57), place("b", "B", 37.575, { status: "completed" }), place("c", "C", 37.58)])
    expect(stopsAhead(loose, null).map((i) => i.id)).toEqual(["a", "c"])
  })
})

describe("hotelTonight", () => {
  it("is the latest pinned stay on or before the day", () => {
    const trip = seoulTrip()
    const stay = place("stay", "Hotel in Anguk", 37.575, { kind: "reservation", time: "15:00", reservation: { type: "hotel", status: "confirmed" } })
    trip.days[1]!.items = [stay]
    expect(hotelTonight(trip, trip.days[2]!)?.id).toBe("stay")
    expect(hotelTonight(trip, trip.days[1]!)?.id).toBe("stay")
    // Day 1's hotel has no pin; there is nothing to route back to.
    expect(hotelTonight(trip, trip.days[0]!)).toBeNull()
  })
})

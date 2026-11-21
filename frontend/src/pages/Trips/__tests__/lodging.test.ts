import { describe, expect, it } from "vitest"
import { changedLodging, checkOutOn, isLodging, lodgingBrief, lodgingEntries, lodgingForNight, nightsByDay } from "../lodging"
import type { ItineraryItem, Trip } from "../types"

const place = (id: string, title: string, category?: string, at?: { lat: number; lng: number }): ItineraryItem => ({
  id,
  kind: "place",
  title,
  status: "none",
  createdBy: "user",
  location: { name: title, source: "user", ...(category ? { category } : {}), ...(at ?? {}) },
})

const trip = (...days: ItineraryItem[][]): Pick<Trip, "days"> => ({
  days: days.map((items, i) => ({ id: `day-${i + 1}`, date: `2027-02-${String(i + 6).padStart(2, "0")}`, items })),
})

const aulani = place("h1", "Aulani", "hotel", { lat: 21.3393, lng: -158.1234 })
const beach = place("p1", "Kuhio Beach", "park", { lat: 21.2743, lng: -157.8247 })

describe("isLodging", () => {
  it("is a stop in the hotel category or a lodging booking", () => {
    expect(isLodging(aulani)).toBe(true)
    expect(isLodging(beach)).toBe(false)
    expect(isLodging({ ...beach, kind: "reservation", reservation: { type: "Hotel check-in", status: "confirmed" } })).toBe(true)
    expect(isLodging({ ...beach, kind: "reservation", reservation: { type: "meal", status: "confirmed" } })).toBe(false)
    expect(isLodging({ id: "n", kind: "note", title: "Hotel is nice", status: "none", createdBy: "user" })).toBe(false)
  })
})

describe("changedLodging", () => {
  it("finds a hotel that was added", () => {
    const before = lodgingEntries(trip([beach]))
    const after = lodgingEntries(trip([beach, aulani]))
    expect(before).toEqual([])
    expect(changedLodging(before, after)).toMatchObject({ dayId: "day-1", itemId: "h1", name: "Aulani" })
  })

  it("finds a hotel whose place changed, but not a rename of the stop title or a new time", () => {
    const before = lodgingEntries(trip([aulani]))
    const moved = { ...aulani, location: { ...aulani.location!, name: "Turtle Bay Resort", lat: 21.7056, lng: -157.9977 } }
    expect(changedLodging(before, lodgingEntries(trip([moved])))?.name).toBe("Turtle Bay Resort")
    expect(changedLodging(before, lodgingEntries(trip([{ ...aulani, time: "15:00", notes: "Late check-in" }])))).toBeNull()
  })

  it("treats a hotel moved to another day as a change, and a removal as none", () => {
    const before = lodgingEntries(trip([aulani], [beach]))
    expect(changedLodging(before, lodgingEntries(trip([], [beach, aulani])))?.dayId).toBe("day-2")
    expect(changedLodging(before, lodgingEntries(trip([], [beach])))).toBeNull()
  })
})

describe("lodgingBrief", () => {
  it("names the base and keeps bookings in place", () => {
    const brief = lodgingBrief("Aulani")
    expect(brief).toContain("staying at Aulani")
    expect(brief).toContain("Keep bookings")
  })
})

const stay = (id: string, title: string, endDate?: string, endTime?: string): ItineraryItem => ({
  id,
  kind: "reservation",
  title,
  status: "booked",
  createdBy: "user",
  ...(endTime ? { endTime } : {}),
  reservation: { type: "hotel", status: "confirmed", ...(endDate ? { endDate } : {}) },
})

describe("nightsByDay", () => {
  // Five days: Feb 6 to Feb 10.
  const week = (...days: ItineraryItem[][]) => trip(...days, ...Array.from({ length: 5 - days.length }, () => []))

  it("covers every night from check-in to the night before check-out", () => {
    const t = week([stay("h1", "Halekulani", "2027-02-10", "11:00")])
    expect(lodgingForNight(t, "day-2")).toMatchObject({ name: "Halekulani", night: 2, nights: 4 })
    expect(lodgingForNight(t, "day-4")).toMatchObject({ night: 4, nights: 4, checkOutTime: "11:00" })
    expect(lodgingForNight(t, "day-5")).toBeNull()
    expect(checkOutOn(nightsByDay(t), "2027-02-10")).toMatchObject({ itemId: "h1" })
  })

  it("lets a stay that starts later take the night from an earlier booking", () => {
    const t = week([stay("h1", "Halekulani", "2027-02-10")], [], [stay("h2", "Turtle Bay", "2027-02-09")])
    expect(lodgingForNight(t, "day-2")?.itemId).toBe("h1")
    expect(lodgingForNight(t, "day-3")).toMatchObject({ itemId: "h2", night: 1, nights: 1 })
    expect(lodgingForNight(t, "day-4")).toMatchObject({ itemId: "h1", night: 4 })
  })

  it("without a check-out, lasts until the next stay and stops short of the day they leave", () => {
    const t = week([aulani], [], [stay("h2", "Turtle Bay")])
    expect(lodgingForNight(t, "day-1")).toMatchObject({ itemId: "h1", night: 1, nights: 2 })
    expect(lodgingForNight(t, "day-2")).toMatchObject({ itemId: "h1", night: 2, nights: 2 })
    expect(lodgingForNight(t, "day-3")).toMatchObject({ itemId: "h2", night: 1, nights: 2 })
    expect(lodgingForNight(t, "day-4")?.itemId).toBe("h2")
    expect(lodgingForNight(t, "day-5")).toBeNull()
  })

  it("ignores a check-out that is not after check-in, and knows nothing before the first stay", () => {
    const t = week([], [stay("h1", "Aulani", "2027-02-07")])
    expect(lodgingForNight(t, "day-1")).toBeNull()
    expect(lodgingForNight(t, "day-2")).toMatchObject({ itemId: "h1", night: 1 })
  })

  it("leaves lodgingEntries alone: a new check-out date is not a new base", () => {
    const before = lodgingEntries(week([stay("h1", "Halekulani")]))
    const after = lodgingEntries(week([stay("h1", "Halekulani", "2027-02-10", "11:00")]))
    expect(after).toEqual(before)
    expect(changedLodging(before, after)).toBeNull()
  })
})

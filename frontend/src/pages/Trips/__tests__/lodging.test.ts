import { describe, expect, it } from "vitest"
import { changedLodging, isLodging, lodgingBrief, lodgingEntries } from "../lodging"
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
  days: days.map((items, i) => ({ id: `day-${i + 1}`, date: `2027-02-0${i + 6}`, items })),
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

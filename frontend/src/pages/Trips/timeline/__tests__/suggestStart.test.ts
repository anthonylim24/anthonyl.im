import { describe, expect, it } from "vitest"
import { TO_SCHEDULE } from "../../map/geo"
import type { ItineraryItem, TripDay } from "../../types"
import { makeItem } from "../../__tests__/tripFixtures"
import { startReason, suggestStart } from "../suggestStart"

/** About 1.1 km per 0.01° of latitude. */
const SEOUL = { lat: 37.57, lng: 126.98 }
const north = (km: number) => ({ lat: SEOUL.lat + km / 111.195, lng: SEOUL.lng })

function stop(id: string, time: string | undefined, overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  return makeItem({ id, title: id, time, ...overrides })
}

function pinned(id: string, time: string | undefined, point: { lat: number; lng: number }, overrides: Partial<ItineraryItem> = {}) {
  return stop(id, time, { location: { name: id, lat: point.lat, lng: point.lng, source: "user" }, ...overrides })
}

const day = (items: ItineraryItem[]): TripDay => ({ id: "d1", date: "2026-06-01", items })

describe("suggestStart", () => {
  it("starts a stop once the one before it ends and the walk between is done, on the next five minutes", () => {
    const plan = day([pinned("Galleria", "13:00", north(0), { endTime: "14:20" }), pinned("Cafe", undefined, north(1))])
    const suggestion = suggestStart(plan, "Cafe")
    expect(suggestion).toEqual({ time: "14:35", after: "Galleria", travel: { mode: "walk", minutes: 12, label: "12 min walk" } })
    expect(startReason(suggestion!)).toBe("after Galleria, 12 min walk")
  })

  it("says so when the stop before has no end and its length is a guess", () => {
    const plan = day([stop("Palace", "10:00", { location: { name: "Palace", category: "palace", source: "user" } }), stop("Lunch", undefined)])
    const suggestion = suggestStart(plan, "Lunch")
    expect(suggestion).toEqual({ time: "12:00", after: "Palace", guessedStay: 120 })
    expect(startReason(suggestion!)).toBe("after Palace (about 2 h there)")
  })

  it("looks past headings, notes and skipped stops to the stop before", () => {
    const plan = day([
      stop("Breakfast", "08:00", { endTime: "09:00" }),
      stop("Skipped", "09:00", { endTime: "11:00", status: "skipped" }),
      stop("Morning", undefined, { kind: "section" }),
      stop("Bring cash", undefined, { kind: "note" }),
      stop("Market", undefined),
    ])
    expect(suggestStart(plan, "Market")).toMatchObject({ time: "09:00", after: "Breakfast" })
  })

  it("offers nothing when the stop before has no time, or there is none", () => {
    expect(suggestStart(day([stop("A", undefined), stop("B", undefined)]), "B")).toBeNull()
    expect(suggestStart(day([stop("B", undefined), stop("C", "15:00")]), "B")).toBeNull()
  })

  it("offers nothing for a stop with a time, a booking, a note, or one parked under To schedule", () => {
    const first = stop("A", "09:00", { endTime: "10:00" })
    expect(suggestStart(day([first, stop("B", "11:00")]), "B")).toBeNull()
    expect(suggestStart(day([first, stop("B", undefined, { kind: "reservation", reservation: { type: "meal", status: "confirmed" } })]), "B")).toBeNull()
    expect(suggestStart(day([first, stop("B", undefined, { kind: "note" })]), "B")).toBeNull()
    expect(suggestStart(day([first, stop(TO_SCHEDULE, undefined, { kind: "section" }), stop("B", undefined)]), "B")).toBeNull()
  })

  it("offers nothing that would not fit before the next stop on the clock", () => {
    const plan = (next: string) =>
      day([pinned("Galleria", "13:00", north(0), { endTime: "14:20" }), pinned("Cafe", undefined, north(1)), pinned("Dinner", next, north(1))])
    expect(suggestStart(plan("14:45"), "Cafe")).toBeNull()
    expect(suggestStart(plan("14:50"), "Cafe")).toMatchObject({ time: "14:35" })
  })

  it("leaves room for the next stop on the clock, wherever it sits in the list", () => {
    const plan = (dinner: string) =>
      day([stop("Dinner", dinner), stop("Breakfast", "08:00"), pinned("Galleria", "13:00", north(0), { endTime: "14:20" }), pinned("Cafe", undefined, north(1))])
    expect(suggestStart(plan("14:45"), "Cafe")).toBeNull()
    expect(suggestStart(plan("14:50"), "Cafe")).toMatchObject({ time: "14:35", after: "Galleria" })
  })

  it("offers nothing past midnight", () => {
    const plan = day([pinned("Bar", "23:00", north(0), { endTime: "23:55" }), pinned("Club", undefined, north(1))])
    expect(suggestStart(plan, "Club")).toBeNull()
  })

  it("offers nothing after a flight with no landing time: how long it takes is unknown", () => {
    const flight = stop("KE123", "09:00", { kind: "reservation", reservation: { type: "flight", status: "confirmed" } })
    expect(suggestStart(day([flight, stop("Hotel", undefined)]), "Hotel")).toBeNull()
    expect(suggestStart(day([{ ...flight, endTime: "11:10" }, stop("Hotel", undefined)]), "Hotel")).toMatchObject({ time: "11:10", after: "KE123" })
  })
})

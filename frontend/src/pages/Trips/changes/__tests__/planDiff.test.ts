import { describe, expect, it } from "vitest"
import { countChanges, diffPlan, touchedStops } from "../planDiff"
import type { ItineraryItem, Trip, TripDay } from "../../types"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"

const stop = (id: string, more: Partial<ItineraryItem> = {}) => makeItem({ id, title: id, ...more })
const day = (id: string, items: ItineraryItem[]): TripDay => ({ id, date: "2026-07-10", items })
const trip = (days: TripDay[], more: Partial<Trip> = {}) => makeTrip({ days, ...more })

const palace = stop("Iolani Palace", { time: "09:00", endTime: "10:30" })
const museum = stop("HoMA", { time: "11:00" })
const lunch = stop("Lunch", { time: "12:30" })
const beach = stop("Beach")
const shave = stop("Shave ice")

describe("diffPlan", () => {
  it("has nothing to say about an unchanged plan, headings included", () => {
    const plan = trip([day("d1", [palace, museum]), day("d2", [beach])])
    expect(diffPlan(plan, structuredClone(plan)).days).toEqual([])

    const heading = makeItem({ id: "h", kind: "section", title: "To schedule" })
    expect(diffPlan(plan, trip([day("d1", [palace, museum, heading]), day("d2", [beach])])).days).toEqual([])
  })

  it("names added stops, and the ones that came off the wishlist", () => {
    const flagged = stop("Diamond Head", { time: "07:00", fromWishlist: true })
    const kept = stop("Leonard's", { time: "15:00" })
    const before = trip([day("d1", [palace])], { ideas: [kept] })
    const after = trip([day("d1", [flagged, palace, kept, lunch])], { ideas: [] })

    expect(diffPlan(before, after).days).toEqual([
      {
        dayId: "d1",
        changes: [
          { kind: "added", item: flagged, fromWishlist: true },
          { kind: "added", item: lunch, fromWishlist: false },
          { kind: "added", item: kept, fromWishlist: true },
        ],
        reordered: null,
        swappedWith: null,
      },
    ])
  })

  it("lists a removed stop where it stood on the clock", () => {
    const before = trip([day("d1", [palace, museum, lunch])])
    const after = trip([day("d1", [palace, lunch])])
    const [d1] = diffPlan(before, after).days
    expect(d1!.changes).toEqual([{ kind: "removed", item: museum }])
  })

  it("reads a stop on another day as one move: out of the old day, into the new, never also retimed", () => {
    const before = trip([day("d1", [palace, museum]), day("d2", [lunch])])
    const moved = { ...museum, time: "14:00" }
    const after = trip([day("d1", [palace]), day("d2", [lunch, moved])])
    const diff = diffPlan(before, after)

    expect(diff.days.map((d) => [d.dayId, d.changes])).toEqual([
      ["d1", [{ kind: "movedOut", item: museum, toDayId: "d2" }]],
      ["d2", [{ kind: "movedIn", item: moved, fromDayId: "d1" }]],
    ])
    expect(countChanges(diff).moved).toBe(1)
  })

  it("reads a new clock as retimed, with the old one and anything else that changed", () => {
    const before = trip([day("d1", [palace, museum, beach, lunch])])
    const after = trip([
      day("d1", [
        { ...palace, endTime: "11:00" },
        { ...museum, time: "10:20", notes: "Free on the first Sunday" },
        { ...beach, time: "16:00" },
        lunch,
      ]),
    ])
    const [d1] = diffPlan(before, after).days
    expect(d1!.changes).toEqual([
      { kind: "retimed", item: { ...palace, endTime: "11:00" }, before: { time: "09:00", endTime: "10:30" }, fields: [] },
      { kind: "retimed", item: { ...museum, time: "10:20", notes: "Free on the first Sunday" }, before: { time: "11:00", endTime: undefined }, fields: ["notes"] },
      { kind: "retimed", item: { ...beach, time: "16:00" }, before: { time: undefined, endTime: undefined }, fields: [] },
    ])
  })

  it("names each edited field, and reads a location by value, not key order", () => {
    const pinned = stop("Pier", { location: { name: "Pier 39", lat: 1, lng: 2, source: "user" } })
    const before = trip([day("d1", [pinned, beach])])
    const after = trip([
      day("d1", [
        { ...pinned, location: { source: "user", lng: 2, lat: 1, name: "Pier 39" } },
        { ...beach, title: "Waikiki Beach", status: "booked", location: { name: "Waikiki", source: "ai" } },
      ]),
    ])
    const [d1] = diffPlan(before, after).days
    expect(d1!.changes).toEqual([{ kind: "edited", item: after.days[0]!.items[1], fields: ["title", "location", "status"] }])
  })

  it("flags a day only when its untimed stops change order", () => {
    const before = trip([day("d1", [palace, beach, shave, museum])])
    const timedSwap = trip([day("d1", [{ ...museum, time: "08:00" }, palace, beach, shave])])
    expect(diffPlan(before, timedSwap).days[0]!.reordered).toBeNull()

    const untimedSwap = trip([day("d1", [palace, shave, beach, museum])])
    expect(diffPlan(before, untimedSwap).days).toEqual([{ dayId: "d1", changes: [], reordered: { kind: "untimed" }, swappedWith: null }])
  })

  it("names the first pair a day listed out of clock order and now reads in", () => {
    const before = trip([day("d1", [lunch, palace, museum])])
    const after = trip([day("d1", [palace, museum, lunch])])
    const diff = diffPlan(before, after)

    expect(diff.days).toEqual([{ dayId: "d1", changes: [], reordered: { kind: "clock", earlier: palace, later: lunch }, swappedWith: null }])
    expect(countChanges(diff)).toMatchObject({ inClockOrder: 1, reordered: 0 })
  })

  it("does not call a day back in time order when the stops it fixed are still out of it", () => {
    const before = trip([day("d1", [lunch, palace, museum])])
    const after = trip([day("d1", [lunch, museum, palace])])
    expect(diffPlan(before, after).days).toEqual([])
  })

  it("collapses two days that traded plans into one swap, but keeps a stop from a third day as its own move", () => {
    const before = trip([day("d1", [palace, museum]), day("d2", [lunch]), day("d3", [beach])])
    const after = trip([day("d1", [lunch, beach]), day("d2", [palace, museum]), day("d3", [])])
    const diff = diffPlan(before, after)

    expect(diff.days).toEqual([
      { dayId: "d1", changes: [{ kind: "movedIn", item: beach, fromDayId: "d3" }], reordered: null, swappedWith: "d2" },
      { dayId: "d2", changes: [], reordered: null, swappedWith: "d1" },
      { dayId: "d3", changes: [{ kind: "movedOut", item: beach, toDayId: "d1" }], reordered: null, swappedWith: null },
    ])
    expect(countChanges(diff)).toMatchObject({ swaps: 1, moved: 1 })
  })

  it("does not call moving every stop onto an empty day a swap", () => {
    const before = trip([day("d1", [palace]), day("d2", [])])
    const after = trip([day("d1", []), day("d2", [palace])])
    expect(diffPlan(before, after).days.map((d) => d.swappedWith)).toEqual([null, null])
  })

  it("keeps the trip's day order and counts what the summary says", () => {
    const before = trip([day("d1", [palace, museum]), day("d2", [lunch, beach])])
    const after = trip([day("d1", [{ ...palace, time: "08:30" }, shave]), day("d2", [lunch])])
    const diff = diffPlan(before, after)

    expect(diff.days.map((d) => d.dayId)).toEqual(["d1", "d2"])
    expect(countChanges(diff)).toEqual({ added: 1, retimed: 1, moved: 0, removed: 2, edited: 0, swaps: 0, inClockOrder: 0, reordered: 0 })
    expect([...touchedStops(diff)].sort()).toEqual(["Iolani Palace", "Shave ice"])
  })
})

import { describe, expect, test } from "bun:test"
import { applySuggestions, autoApplyAddSuggestions } from "./ai"
import type { EnhancementRun, EnhancementSuggestion, ItineraryItem, Trip } from "./types"

// Applying a review's suggestions as the traveller sees it: every touched day
// ends in clock order, a suggestion that could not land says why, and what is
// already done is not a failure.

const stop = (id: string, title: string, time?: string, extra: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id,
  kind: "place",
  title,
  ...(time ? { time } : {}),
  status: "none",
  location: { name: title, source: "user" },
  createdBy: "user",
  ...extra,
})

function oahu(days: ItineraryItem[][]): Trip {
  return {
    id: "trip-oahu",
    ownerId: "user-1",
    name: "O'ahu",
    destinations: ["Honolulu"],
    startDate: "2027-02-01",
    endDate: `2027-02-0${days.length}`,
    timezone: "Pacific/Honolulu",
    status: "draft",
    tags: [],
    collaborators: [],
    days: days.map((items, i) => ({ id: `day-${i + 1}`, date: `2027-02-0${i + 1}`, items })),
    createdAt: "2027-01-01T00:00:00.000Z",
    updatedAt: "2027-01-01T00:00:00.000Z",
  }
}

const runOf = (suggestions: EnhancementSuggestion[], appliedSuggestionIds: string[] = []): EnhancementRun => ({
  id: "run-1",
  tripId: "trip-oahu",
  scope: "trip",
  status: "complete",
  appliedSuggestionIds,
  createdAt: "2027-01-10T00:00:00.000Z",
  suggestions,
})

const suggestion = (fields: Partial<EnhancementSuggestion> & Pick<EnhancementSuggestion, "id" | "kind">): EnhancementSuggestion => ({
  title: "A change",
  detail: "",
  confidence: "high",
  ...fields,
})

const timeline = (trip: Trip, dayIndex: number) => trip.days[dayIndex]!.items.map((i) => (i.time ? `${i.title} ${i.time}` : i.title))

describe("applying keeps each touched day in clock order", () => {
  test("an edit that moves a stop's time moves the stop to that time's place", () => {
    const trip = oahu([[stop("poai", "Po'ai", "07:30", { endTime: "08:15" }), stop("leonards", "Leonard's", "08:30"), stop("diamond", "Diamond Head", "10:00")]])
    const run = runOf([suggestion({ id: "s-edit", kind: "edit", dayId: "day-1", itemId: "poai", proposedChanges: { time: "15:00" } })])
    const out = applySuggestions(trip, run, ["s-edit"])
    expect(out.applied).toEqual(["s-edit"])
    expect(timeline(out.trip, 0)).toEqual(["Leonard's 08:30", "Diamond Head 10:00", "Po'ai 15:00"])
    // Still a 45-minute stop, not one that runs from 3 PM to 8:15 the next morning.
    expect(out.trip.days[0]!.items[2]!.endTime).toBe("15:45")
  })

  test("a reorder stored without times is skipped with a reason, never leaving a later stop above an earlier one", () => {
    const trip = oahu([[stop("iolani", "Iolani Palace", "10:00"), stop("lunch", "Helena's", "12:30"), stop("bishop", "Bishop Museum", "14:00")]])
    const run = runOf([suggestion({ id: "s-order", kind: "reorder", dayId: "day-1", proposedOrder: ["iolani", "bishop", "lunch"] })])
    const out = applySuggestions(trip, run, ["s-order"])
    expect(timeline(out.trip, 0)).toEqual(["Iolani Palace 10:00", "Helena's 12:30", "Bishop Museum 14:00"])
    expect(out.applied).toEqual([])
    expect(out.skipReasons["s-order"]).toBe("Its order doesn't match the times of the stops on Day 1.")
  })

  test("a reorder with new times lands in its new order, at those times", () => {
    const trip = oahu([[stop("iolani", "Iolani Palace", "10:00"), stop("lunch", "Helena's", "12:30", { endTime: "13:30" }), stop("bishop", "Bishop Museum", "14:00")]])
    const run = runOf([
      suggestion({
        id: "s-order",
        kind: "reorder",
        dayId: "day-1",
        proposedOrder: ["iolani", "bishop", "lunch"],
        proposedTimes: { bishop: { time: "11:30", endTime: "13:00" }, lunch: { time: "13:15" } },
      }),
    ])
    const out = applySuggestions(trip, run, ["s-order"])
    expect(out.applied).toEqual(["s-order"])
    expect(timeline(out.trip, 0)).toEqual(["Iolani Palace 10:00", "Bishop Museum 11:30", "Helena's 13:15"])
    expect(out.trip.days[0]!.items[1]!.endTime).toBe("13:00")
    // Lunch was an hour; given only a new start, it still is.
    expect(out.trip.days[0]!.items[2]!.endTime).toBe("14:15")
  })

  test("a reorder still lands when a stop was added to its day since the review", () => {
    const eight = ["08:00", "09:00", "10:00", "11:00", "13:00", "15:00", "16:00", "17:00"].map((time, i) => stop(`s${i + 1}`, `Stop ${i + 1}`, time))
    const gohan = stop("gohan", "GOHAN", "12:00", { createdBy: "ai" })
    const trip = oahu([[], [...eight.slice(0, 4), gohan, ...eight.slice(4)]])
    const run = runOf([
      suggestion({
        id: "s-order",
        kind: "reorder",
        dayId: "day-2",
        proposedOrder: ["s2", "s1", "s3", "s4", "s5", "s6", "s7", "s8"],
        proposedTimes: { s2: { time: "08:00" }, s1: { time: "09:00" } },
      }),
    ])
    const out = applySuggestions(trip, run, ["s-order"])
    expect(out.applied).toEqual(["s-order"])
    expect(out.skipped).toEqual([])
    expect(timeline(out.trip, 1)).toEqual([
      "Stop 2 08:00",
      "Stop 1 09:00",
      "Stop 3 10:00",
      "Stop 4 11:00",
      "GOHAN 12:00",
      "Stop 5 13:00",
      "Stop 6 15:00",
      "Stop 7 16:00",
      "Stop 8 17:00",
    ])
  })
})

describe("what could not be applied says why; what is already done is not a failure", () => {
  const day1 = () => [stop("iolani", "Iolani Palace", "10:00"), stop("lunch", "Helena's", "12:30"), stop("bishop", "Bishop Museum", "14:00")]

  test("each skip carries one plain sentence", () => {
    const trip = oahu([day1(), [stop("beach", "Kailua Beach", "09:00")]])
    const ala = stop("ala-new", "Ala Moana Center", "16:00", { createdBy: "ai" })
    const withAla = oahu([day1(), [stop("beach", "Kailua Beach", "09:00")], [stop("ala-mine", "Ala Moana Center", "11:00")]])
    const run = runOf([
      suggestion({ id: "s-edit", kind: "edit", dayId: "day-1", itemId: "gone", proposedChanges: { time: "09:00" } }),
      suggestion({ id: "s-move", kind: "move", dayId: "day-1", itemId: "lunch", toDayId: "day-9" }),
      suggestion({ id: "s-order", kind: "reorder", dayId: "day-1", proposedOrder: ["bishop", "gone-1", "gone-2"] }),
      suggestion({ id: "s-day", kind: "reorder", dayId: "day-7", proposedOrder: ["iolani", "lunch"] }),
      suggestion({ id: "s-add", kind: "add", dayId: "day-2", proposedItem: ala }),
    ])
    const first = applySuggestions(trip, run, ["s-edit", "s-move", "s-order", "s-day"])
    expect(first.applied).toEqual([])
    expect(first.skipReasons).toEqual({
      "s-edit": "That stop is no longer on the trip.",
      "s-move": "The day it was moving to is no longer on the trip.",
      "s-order": "Fewer than two of its stops are still on Day 1.",
      "s-day": "Its day is no longer on the trip.",
    })
    expect(first.skipped).toEqual(["s-edit", "s-move", "s-order", "s-day"])
    const second = applySuggestions(withAla, run, ["s-add"])
    expect(second.skipReasons).toEqual({ "s-add": "Ala Moana Center is already on Day 3." })
    expect(second.trip.days[1]!.items.map((i) => i.title)).toEqual(["Kailua Beach"])
  })

  test("a remove of a stop already gone, and an add already on its day, count as applied", () => {
    const helenas = stop("lunch-ai", "Helena's", "12:30", { createdBy: "ai" })
    const trip = oahu([day1()])
    const run = runOf([
      suggestion({ id: "s-remove", kind: "remove", dayId: "day-1", itemId: "gone" }),
      suggestion({ id: "s-add", kind: "add", dayId: "day-1", proposedItem: helenas }),
    ])
    const out = applySuggestions(trip, run, ["s-remove", "s-add"])
    expect(out.applied).toEqual(["s-remove", "s-add"])
    expect(out.skipped).toEqual([])
    expect(timeline(out.trip, 0)).toEqual(["Iolani Palace 10:00", "Helena's 12:30", "Bishop Museum 14:00"])
  })

  test("a move to the day the stop is already on applies its new time, or holds as it is", () => {
    const trip = oahu([day1()])
    const run = runOf([
      suggestion({ id: "s-same", kind: "move", dayId: "day-1", itemId: "iolani", toDayId: "day-1" }),
      suggestion({ id: "s-later", kind: "move", dayId: "day-1", itemId: "iolani", toDayId: "day-1", proposedChanges: { time: "16:00" } }),
    ])
    const held = applySuggestions(trip, run, ["s-same"])
    expect(held.applied).toEqual(["s-same"])
    expect(timeline(held.trip, 0)).toEqual(timeline(trip, 0))
    const later = applySuggestions(trip, run, ["s-later"])
    expect(later.applied).toEqual(["s-later"])
    expect(timeline(later.trip, 0)).toEqual(["Helena's 12:30", "Bishop Museum 14:00", "Iolani Palace 16:00"])
  })

  test("an id sent twice lands once", () => {
    const trip = oahu([[], []])
    const run = runOf([suggestion({ id: "s-add", kind: "add", dayId: "day-2", proposedItem: stop("ala", "Ala Moana Center", "16:00", { createdBy: "ai" }) })])
    const out = applySuggestions(trip, run, ["s-add", "s-add"])
    expect(out.applied).toEqual(["s-add"])
    expect(out.trip.days[1]!.items).toHaveLength(1)
  })

  test("a day no suggestion changed keeps the order the traveller gave it", () => {
    const theirs = [stop("late", "Late show", "20:00"), stop("early", "Early swim", "07:00")]
    const trip = oahu([day1(), theirs])
    const run = runOf([suggestion({ id: "s-edit", kind: "edit", dayId: "day-1", itemId: "iolani", proposedChanges: { notes: "Book the audio tour." } })])
    const out = applySuggestions(trip, run, ["s-edit"])
    expect(timeline(out.trip, 1)).toEqual(["Late show 20:00", "Early swim 07:00"])
  })
})

test("a review whose only add was already on its day says it added nothing", () => {
  const mine = stop("ala-mine", "Ala Moana Center", "11:00", { location: { name: "Ala Moana Center", lat: 21.291, lng: -157.843, source: "user" } })
  const theirs = stop("ala-ai", "Ala Moana Center", "16:00", { createdBy: "ai", location: { name: "Ala Moana Center", lat: 21.291, lng: -157.843, source: "ai" } })
  const trip = oahu([[mine]])
  const run = { ...runOf([suggestion({ id: "s-add", kind: "add", dayId: "day-1", proposedItem: theirs })]), outcome: "added_places" as const }
  const out = autoApplyAddSuggestions(trip, run)
  expect(out.run.appliedSuggestionIds).toEqual(["s-add"])
  expect(out.run.outcome).not.toBe("added_places")
  expect(out.trip.days[0]!.items.map((i) => i.id)).toEqual(["ala-mine"])
})

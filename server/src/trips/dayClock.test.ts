import { describe, expect, test } from "bun:test"
import { dayStarts, firstOutOfOrder, insertByTime, outOfOrder, reorderDay, retimed, sortByTime } from "./dayClock"
import type { ItineraryItem } from "./types"

let seq = 0
const stop = (title: string, time?: string, extra: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id: `it-${++seq}`,
  kind: "place",
  title,
  ...(time ? { time } : {}),
  status: "none",
  createdBy: "user",
  ...extra,
})
const heading = (title: string, time?: string): ItineraryItem => stop(title, time, { kind: "section" })
const titles = (items: readonly ItineraryItem[]) => items.map((i) => i.title)

describe("dayStarts", () => {
  test("small hours after a stop at noon or later count from the next midnight", () => {
    expect(dayStarts([{ time: "19:00" }, { time: "23:00" }, { time: "01:00" }])).toEqual([1140, 1380, 1500])
    expect(dayStarts([{ time: "01:00" }, { time: "09:00" }])).toEqual([60, 540])
    expect(dayStarts([{}, { time: "nonsense" }, { time: "25:00" }])).toEqual([null, null, null])
  })
})

describe("sortByTime", () => {
  test("puts timed stops in clock order, each untimed item staying behind the stop it followed", () => {
    const items = [stop("Lead note"), stop("Lunch", "12:30"), stop("Order the poke"), stop("Breakfast", "08:00"), stop("Sunset", "18:00")]
    expect(titles(sortByTime(items))).toEqual(["Lead note", "Breakfast", "Lunch", "Order the poke", "Sunset"])
  })

  test("a 1 AM bar after dinner stays last", () => {
    expect(titles(sortByTime([stop("Dinner", "19:00"), stop("Club", "01:00"), stop("Bar", "23:00")]))).toEqual(["Dinner", "Bar", "Club"])
  })

  test("a heading's time is a label: it travels with the stop it followed", () => {
    const items = [stop("Hike", "14:00"), heading("Evening", "07:00"), stop("Breakfast", "08:00")]
    expect(titles(sortByTime(items))).toEqual(["Breakfast", "Hike", "Evening"])
  })

  test("everything from To schedule on stays put", () => {
    const items = [stop("Late", "18:00"), stop("Early", "09:00"), heading("To schedule"), stop("Parked late", "20:00"), stop("Parked early", "07:00")]
    expect(titles(sortByTime(items))).toEqual(["Early", "Late", "To schedule", "Parked late", "Parked early"])
  })

  test("sorting a sorted day returns the same items in the same order", () => {
    const items = [stop("A", "09:00"), stop("note"), stop("B", "09:00"), stop("C", "13:00")]
    const sorted = sortByTime(items)
    expect(sorted.every((item, i) => item === items[i])).toBe(true)
    expect(outOfOrder(items)).toBe(false)
  })
})

describe("firstOutOfOrder", () => {
  test("names the first stop listed above one that starts earlier", () => {
    const poai = stop("Po'ai", "15:00")
    const leonards = stop("Leonard's", "08:30")
    expect(firstOutOfOrder([poai, leonards, stop("Diamond Head", "10:00")])).toEqual({ listedFirst: poai, startsEarlier: leonards })
    expect(firstOutOfOrder([stop("A", "09:00"), stop("B", "10:00")])).toBeNull()
  })
})

describe("insertByTime", () => {
  test("puts a timed item where the clock says", () => {
    const items = [stop("A", "09:00"), stop("B", "13:00"), stop("C", "19:00")]
    expect(titles(insertByTime(items, stop("New", "15:30")))).toEqual(["A", "B", "New", "C"])
  })

  test("appends untimed items and items on untimed days", () => {
    expect(insertByTime([stop("A"), stop("B")], stop("New", "10:00")).at(-1)!.title).toBe("New")
    expect(insertByTime([stop("A", "09:00")], stop("New")).at(-1)!.title).toBe("New")
  })

  test("reads the day's clock: a late stop lands before a 01:00 one listed after dinner", () => {
    const items = [stop("Dinner", "19:00"), stop("Club", "01:00")]
    expect(titles(insertByTime(items, stop("Bar", "22:00")))).toEqual(["Dinner", "Bar", "Club"])
  })

  test("keeps new stops on the route, above the places parked under To schedule", () => {
    const items = [stop("A", "09:00"), stop("B", "13:00"), heading("To schedule"), stop("Parked")]
    expect(titles(insertByTime(items, stop("Late", "21:00")))).toEqual(["A", "B", "Late", "To schedule", "Parked"])
    expect(titles(insertByTime(items, stop("Loose")))).toEqual(["A", "B", "Loose", "To schedule", "Parked"])
  })
})

describe("reorderDay", () => {
  test("orders the stops it names, drops ids no longer on the day, and slots the rest by time", () => {
    const a = stop("A", "09:00")
    const b = stop("B", "10:00")
    const added = stop("Added since", "08:30")
    const out = reorderDay([a, added, b], [b.id, "it-gone", a.id], { [b.id]: { time: "08:00" } })!
    expect(out.map((i) => `${i.title} ${i.time}`)).toEqual(["B 08:00", "Added since 08:30", "A 09:00"])
  })

  test("never moves anything across the To schedule heading", () => {
    const a = stop("A")
    const b = stop("B")
    const park = heading("To schedule")
    const parked = stop("Parked")
    expect(titles(reorderDay([a, b, park, parked], [parked.id, b.id, a.id])!)).toEqual(["B", "A", "To schedule", "Parked"])
  })

  test("has nothing to do once fewer than two named stops are left", () => {
    const a = stop("A")
    expect(reorderDay([a, stop("B")], [a.id, "it-gone"])).toBeNull()
  })
})

describe("retimed", () => {
  test("a stop given only a new start keeps its length, across midnight too", () => {
    expect(retimed(stop("Lunch", "12:30", { endTime: "13:30" }), { time: "14:00" }).endTime).toBe("15:00")
    expect(retimed(stop("Show", "21:00", { endTime: "22:30" }), { time: "23:30" }).endTime).toBe("01:00")
    expect(retimed(stop("Lunch", "12:30", { endTime: "13:30" }), { time: "14:00", endTime: "14:45" }).endTime).toBe("14:45")
    expect("endTime" in retimed(stop("Untimed", undefined, { endTime: "13:30" }), { time: "14:00" })).toBe(false)
  })
})

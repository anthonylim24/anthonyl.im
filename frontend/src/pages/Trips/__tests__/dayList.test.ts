import { describe, expect, it } from "vitest"
import { dayPins, TO_SCHEDULE } from "../map/geo"
import type { ItineraryItem, TripDay } from "../types"
import { dayList } from "../workspace/dayList"
import { makeItem } from "./tripFixtures"

const KYOTO = { lat: 35.0, lng: 135.77 }

/** A stop `km` north of the centre, pinned unless `km` is null. */
function stop(id: string, time?: string, endTime?: string, km: number | null = 0, overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  const location = km === null ? undefined : { name: id, lat: KYOTO.lat + km / 111.195, lng: KYOTO.lng, source: "user" as const }
  return makeItem({ id, title: id, time, endTime, location, ...overrides })
}

const day = (items: ItineraryItem[]): TripDay => ({ id: "d1", date: "2026-11-21", items })
const heading = (title: string) => makeItem({ id: `h-${title}`, kind: "section", title })
const note = (id: string) => makeItem({ id, kind: "note", title: id })
const min = (clock: string) => {
  const [h, m] = clock.split(":").map(Number)
  return h! * 60 + m!
}

describe("dayList Anytime", () => {
  it("starts at the run of untimed stops after the last timed one", () => {
    const list = dayList(day([stop("A", "09:00", "10:00"), stop("B", "11:00", "12:00"), stop("C"), stop("D")]), null)
    expect(list.anytimeAt).toBe(2)
  })

  it("leaves an untimed stop between timed ones where it is", () => {
    expect(dayList(day([stop("A", "09:00", "10:00"), stop("X"), stop("B", "11:00", "12:00")]), null).anytimeAt).toBeNull()
  })

  it("is not drawn when nothing has a time", () => {
    expect(dayList(day([stop("X"), stop("Y")]), null).anytimeAt).toBeNull()
  })

  it("skips notes and headings to sit right above the first untimed stop", () => {
    const list = dayList(day([stop("A", "09:00", "10:00"), note("Bring cash"), heading("Evening"), stop("C")]), null)
    expect(list.anytimeAt).toBe(3)
  })

  it("never covers the places parked under To schedule", () => {
    const list = dayList(day([stop("A", "09:00", "10:00"), heading(TO_SCHEDULE), stop("Parked")]), null)
    expect(list.anytimeAt).toBeNull()
  })
})

describe("dayList legs", () => {
  it("draws no leg into or between Anytime stops", () => {
    const list = dayList(day([stop("A", "09:00", "10:00", 0), stop("B", "11:00", "12:00", 1), stop("C", undefined, undefined, 2), stop("D", undefined, undefined, 3)]), null)
    expect(list.legs.get("B")?.text).toMatch(/^1000 m · 12 min walk · 48 min free$/)
    expect(list.legs.has("C")).toBe(false)
    expect(list.legs.has("D")).toBe(false)
  })

  it("draws each leg above the stop it leads into", () => {
    const list = dayList(day([stop("A", "09:00", "10:00", 0), stop("X", undefined, undefined, 0.5), stop("B", "11:00", "12:00", 1)]), null)
    expect([...list.legs.keys()]).toEqual(["X", "B"])
  })

  it("says there is no time to travel into an overlapping stop", () => {
    const list = dayList(day([stop("A", "10:15", "11:30", 0), stop("B", "11:00", "12:00", 0.5)]), null)
    expect(list.legs.get("B")).toEqual({ text: "No time to travel", leave: null, mode: "overlap" })
  })

  it("adds the timeline's free time and when to leave, counted from now on today", () => {
    const plan = day([stop("Lunch", "12:30", "13:30", 0), stop("Gion", "15:30", "18:00", 0.94)])
    expect(dayList(plan, null).legs.get("Gion")).toEqual({ text: "940 m · 12 min walk · 1 h 48 free", leave: "Leave by 3:18 PM", mode: "walk" })
    expect(dayList(plan, min("14:10")).legs.get("Gion")).toEqual({ text: "940 m · 12 min walk · 1 h 08 free", leave: "Leave by 3:18 PM", mode: "walk" })
    // Past the time to leave there is nothing free to name.
    expect(dayList(plan, min("15:20")).legs.get("Gion")).toEqual({ text: "940 m · 12 min walk", leave: null, mode: "walk" })
  })

  it("finds the gap when the list runs against the clock", () => {
    const list = dayList(day([stop("Late", "15:30", "18:00", 0.94), stop("Early", "12:30", "13:30", 0)]), null)
    expect(list.legs.get("Early")?.text).toBe("940 m · 12 min walk · 1 h 48 free")
  })

  it("names no free time under a quarter of an hour", () => {
    const list = dayList(day([stop("A", "09:00", "10:00", 0), stop("B", "10:20", "11:00", 0.94)]), null)
    expect(list.legs.get("B")).toEqual({ text: "940 m · 12 min walk", leave: null, mode: "walk" })
  })
})

describe("dayList labels", () => {
  it("numbers the stops as the map does", () => {
    const d = day([stop("A", "09:00", "10:00"), stop("Unpinned", "10:30", "11:00", null), stop("B"), heading(TO_SCHEDULE), stop("Parked")])
    const pins = new Map(dayPins(d).filter((pin) => pin.variant === "stop").map((pin) => [pin.id, pin.label]))
    expect(Object.fromEntries(dayList(d, null).labels)).toEqual(Object.fromEntries(pins))
    expect(dayList(d, null).labels.has("Parked")).toBe(false)
  })
})

describe("dayList past and current", () => {
  const plan = day([stop("Temple", "09:00", "10:00"), stop("Lunch", "11:00", "12:00"), stop("Garden", "13:00", "14:00"), stop("Later")])

  it("marks what has ended and what is under way", () => {
    const list = dayList(plan, min("11:15"))
    expect([...list.past]).toEqual(["Temple"])
    expect(list.current).toBe("Lunch")
  })

  it("counts a stop as ended at its end time, and leaves untimed stops unmarked", () => {
    const list = dayList(plan, min("14:00"))
    expect([...list.past]).toEqual(["Temple", "Lunch", "Garden"])
    expect(list.current).toBeNull()
  })

  it("reads a stop with no end for as long as it usually takes", () => {
    // A museum runs about two hours.
    const museum = stop("Museum", "09:00", undefined, 0, { location: { name: "Museum", category: "museum", lat: KYOTO.lat, lng: KYOTO.lng, source: "user" } })
    expect(dayList(day([museum]), min("10:30")).current).toBe("Museum")
    expect(dayList(day([museum]), min("11:05")).past.has("Museum")).toBe(true)
  })

  it("marks nothing on any other day", () => {
    const list = dayList(plan, null)
    expect(list.past.size).toBe(0)
    expect(list.current).toBeNull()
  })
})

describe("dayList done", () => {
  const plan = day([stop("Temple", "09:00", "10:00"), stop("Lunch", "11:00", "12:00"), stop("Garden", "13:00", "14:00"), stop("Later")])

  it("folds the run of finished stops at the head of the list", () => {
    expect(dayList(plan, min("12:30")).done).toEqual({ length: 2, stops: ["Temple", "Lunch"], from: min("09:00"), to: min("12:00") })
  })

  it("is empty before the first stop ends, and on any other day", () => {
    expect(dayList(plan, min("09:30")).done).toBeNull()
    expect(dayList(plan, null).done).toBeNull()
  })

  it("stops at the first stop still ahead, even when a later one is over", () => {
    const outOfOrder = day([stop("Temple", "09:00", "10:00"), stop("Dinner", "19:00", "20:00"), stop("Lunch", "11:00", "12:00")])
    expect(dayList(outOfOrder, min("12:30")).done?.stops).toEqual(["Temple"])
  })

  it("takes the headings and notes among the finished stops with them", () => {
    const sections = day([heading("Morning"), stop("Temple", "09:00", "10:00"), note("Bring cash"), stop("Lunch", "11:00", "12:00"), heading("Afternoon"), stop("Garden", "13:00", "14:00")])
    expect(dayList(sections, min("12:30")).done).toMatchObject({ length: 4, stops: ["Temple", "Lunch"] })
  })
})

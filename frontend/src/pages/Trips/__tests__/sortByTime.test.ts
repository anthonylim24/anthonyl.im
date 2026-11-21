import { describe, expect, it } from "vitest"
import { outOfOrder, sortByTime } from "../workspace/dayOps"
import type { ItineraryItem } from "../types"

const stop = (id: string, time?: string, overrides: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id,
  kind: "place",
  title: id,
  status: "none",
  createdBy: "user",
  time,
  ...overrides,
})

const ids = (items: readonly ItineraryItem[]) => items.map((i) => i.id)

describe("sortByTime", () => {
  it("puts timed items in clock order", () => {
    expect(ids(sortByTime([stop("dinner", "20:00"), stop("lunch", "12:30"), stop("coffee", "09:00")]))).toEqual([
      "coffee",
      "lunch",
      "dinner",
    ])
  })

  it("keeps untimed items behind the timed item they followed", () => {
    const items = [stop("dinner", "20:00"), stop("nightcap"), stop("lunch", "12:30"), stop("stroll"), stop("gelato")]
    expect(ids(sortByTime(items))).toEqual(["lunch", "stroll", "gelato", "dinner", "nightcap"])
  })

  it("leaves untimed items that lead the day at the top", () => {
    const items = [stop("packing note"), stop("dinner", "20:00"), stop("lunch", "12:30")]
    expect(ids(sortByTime(items))).toEqual(["packing note", "lunch", "dinner"])
  })

  it("keeps the original order for equal times", () => {
    const items = [stop("b", "10:00"), stop("a", "10:00"), stop("c", "08:00")]
    expect(ids(sortByTime(items))).toEqual(["c", "b", "a"])
  })

  it("treats a heading as untimed, so it travels with the stop above it", () => {
    const items = [
      stop("dinner", "20:00"),
      stop("Evening", "06:00", { kind: "section" }),
      stop("bar"),
      stop("lunch", "12:30"),
    ]
    expect(ids(sortByTime(items))).toEqual(["lunch", "dinner", "Evening", "bar"])
  })

  it("returns a new array with the same item objects and does not mutate the input", () => {
    const items = [stop("late", "22:00"), stop("early", "07:00")]
    const snapshot = [...items]
    const out = sortByTime(items)
    expect(out).not.toBe(items)
    expect(items).toEqual(snapshot)
    expect(out[0]).toBe(items[1])
  })

  it("reads the day's clock: a 01:00 stop after a 23:00 one stays last", () => {
    const night = [stop("dinner", "19:00"), stop("bar", "23:00"), stop("club", "01:00")]
    expect(ids(sortByTime(night))).toEqual(["dinner", "bar", "club"])
    expect(outOfOrder(night)).toBe(false)
    const shuffled = [stop("bar", "23:00"), stop("lunch", "12:00"), stop("club", "01:00")]
    expect(ids(sortByTime(shuffled))).toEqual(["lunch", "bar", "club"])
    expect(outOfOrder(shuffled)).toBe(true)
  })

  it("sorts the route only: places parked under “To schedule” keep their place", () => {
    const items = [
      stop("dinner", "19:00"),
      stop("lunch", "12:00"),
      stop("park", undefined, { kind: "section", title: "To schedule" }),
      stop("ig-2", "08:00"),
      stop("ig-1"),
    ]
    expect(ids(sortByTime(items))).toEqual(["lunch", "dinner", "park", "ig-2", "ig-1"])
    expect(outOfOrder([items[1]!, items[0]!, ...items.slice(2)])).toBe(false)
  })

  it("sorting twice changes nothing", () => {
    const items = [stop("a", "13:00"), stop("b", "02:00"), stop("note"), stop("c", "11:00"), stop("d", "09:00")]
    const once = sortByTime(items)
    expect(sortByTime(once)).toEqual(once)
    expect(outOfOrder(once)).toBe(false)
  })

  it("is a no-op for already ordered, untimed or empty lists", () => {
    const ordered = [stop("a", "08:00"), stop("b"), stop("c", "09:00")]
    expect(sortByTime(ordered)).toEqual(ordered)
    const untimed = [stop("x"), stop("y")]
    expect(sortByTime(untimed)).toEqual(untimed)
    expect(sortByTime([])).toEqual([])
  })
})

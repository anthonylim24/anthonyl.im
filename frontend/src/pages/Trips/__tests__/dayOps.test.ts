import { describe, expect, it } from "vitest"
import { addDays } from "../meta"
import { LIMITS } from "../limits"
import { canAddDay, dayAfterDelete, deleteDay, duplicateDay, insertDayAfter, moveDay, type DayPlan } from "../workspace/dayOps"
import type { ItineraryItem, TripDay } from "../types"

const stop = (id: string, extra: Partial<ItineraryItem> = {}): ItineraryItem => ({ id, kind: "place", title: id, status: "none", createdBy: "user", ...extra })

/** Kyoto 10–12 July: three planned days, the AI's weather on each date. */
function plan(): DayPlan {
  return {
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    days: [
      { id: "day-1", date: "2026-07-10", title: "Temples", city: "Kyoto", timezone: "Asia/Tokyo", weather: { highC: 30, lowC: 22, condition: "Sunny" }, items: [stop("a")] },
      { id: "day-2", date: "2026-07-11", title: "Nara", weather: { highC: 25, lowC: 20, condition: "Rain" }, items: [stop("b"), stop("c")] },
      { id: "day-3", date: "2026-07-12", title: "Osaka", weather: { highC: 28, lowC: 21, condition: "Cloudy" }, items: [] },
    ],
  }
}

/** Day i falls on start + i, and the trip ends on the last day. */
function expectDated(p: DayPlan) {
  p.days.forEach((day, i) => expect(day.date).toBe(addDays(p.startDate, i)))
  expect(p.endDate).toBe(p.days[p.days.length - 1]!.date)
}
const titles = (p: DayPlan) => p.days.map((d) => d.title ?? "(blank)")
const weatherByDate = (p: DayPlan) => Object.fromEntries(p.days.map((d) => [d.date, d.weather?.condition ?? null]))

describe("insertDayAfter", () => {
  it("puts a blank day after this one; later days move a date on and the trip ends a day later", () => {
    const next = insertDayAfter(plan(), "day-1")!
    expect(titles(next)).toEqual(["Temples", "(blank)", "Nara", "Osaka"])
    expect(next.startDate).toBe("2026-07-10")
    expect(next.endDate).toBe("2026-07-13")
    expectDated(next)
    const added = next.days[1]!
    expect(added.items).toEqual([])
    expect(added.city).toBe("Kyoto")
    expect(added.timezone).toBe("Asia/Tokyo")
    expect(plan().days.map((d) => d.id)).not.toContain(added.id)
  })

  it("leaves the weather on its date, not on the plan that moved", () => {
    const next = insertDayAfter(plan(), "day-1")!
    expect(weatherByDate(next)).toEqual({ "2026-07-10": "Sunny", "2026-07-11": "Rain", "2026-07-12": "Cloudy", "2026-07-13": null })
  })

  it("adds after the last day", () => {
    const next = insertDayAfter(plan(), "day-3")!
    expect(titles(next)).toEqual(["Temples", "Nara", "Osaka", "(blank)"])
    expectDated(next)
  })

  it("stops at the 60-day cap", () => {
    const start = plan()
    const full: DayPlan = {
      startDate: start.startDate,
      endDate: addDays(start.startDate, LIMITS.days - 1),
      days: Array.from({ length: LIMITS.days }, (_, i) => ({ id: `d${i}`, date: addDays(start.startDate, i), items: [] })),
    }
    expect(canAddDay(full)).toBe(false)
    expect(insertDayAfter(full, "d3")).toBeNull()
    expect(duplicateDay(full, "d3")).toBeNull()
    expect(canAddDay(start)).toBe(true)
  })

  it("is null for a day that is not on the trip", () => {
    expect(insertDayAfter(plan(), "ghost")).toBeNull()
  })
})

describe("deleteDay", () => {
  it("removes the day and its plan; later days move a date earlier and the trip ends sooner", () => {
    const next = deleteDay(plan(), "day-2")!
    expect(titles(next)).toEqual(["Temples", "Osaka"])
    expect(next.startDate).toBe("2026-07-10")
    expect(next.endDate).toBe("2026-07-11")
    expectDated(next)
    expect(weatherByDate(next)).toEqual({ "2026-07-10": "Sunny", "2026-07-11": "Rain" })
  })

  it("deleting the first day keeps the start date", () => {
    const next = deleteDay(plan(), "day-1")!
    expect(titles(next)).toEqual(["Nara", "Osaka"])
    expectDated(next)
  })

  it("never leaves a trip with no days", () => {
    const one: DayPlan = { startDate: "2026-07-10", endDate: "2026-07-10", days: [plan().days[0]!] }
    expect(deleteDay(one, "day-1")).toBeNull()
  })

  it("says which day to show next: the one that took its place, else the one before", () => {
    const { days } = plan()
    expect(dayAfterDelete(days, "day-2")?.id).toBe("day-3")
    expect(dayAfterDelete(days, "day-3")?.id).toBe("day-2")
    expect(dayAfterDelete(days, "ghost")).toBeUndefined()
  })
})

describe("duplicateDay", () => {
  it("inserts a copy after the day with new ids for the day and every stop", () => {
    const start = plan()
    const next = duplicateDay(start, "day-2")!
    expect(titles(next)).toEqual(["Temples", "Nara", "Nara", "Osaka"])
    expectDated(next)
    const [original, copy] = [next.days[1]!, next.days[2]!]
    expect(original).toBe(start.days[1])
    expect(copy.id).not.toBe(original.id)
    expect(copy.items.map((i) => i.title)).toEqual(["b", "c"])
    for (const item of copy.items) expect(original.items.map((i) => i.id)).not.toContain(item.id)
  })

  it("copies the plan, not how the original went", () => {
    const start = plan()
    start.days[1] = {
      ...start.days[1]!,
      journal: "Deer everywhere",
      items: [stop("b", { status: "completed", highlight: true }), stop("c", { status: "skipped" }), stop("d", { kind: "reservation", status: "completed", reservation: { type: "train", status: "confirmed" } })],
    }
    const copy = duplicateDay(start, "day-2")!.days[2]!
    expect(copy.journal).toBeUndefined()
    expect(copy.items.map((i) => i.status)).toEqual(["none", "none", "booked"])
    expect(copy.items.some((i) => i.highlight)).toBe(false)
    // The original keeps everything.
    expect(start.days[1]!.journal).toBe("Deer everywhere")
  })
})

describe("moveDay", () => {
  it("trades places with the next day: the plans swap dates, the dates stay in order", () => {
    const next = moveDay(plan(), "day-1", 1)!
    expect(next.days.map((d) => d.id)).toEqual(["day-2", "day-1", "day-3"])
    expectDated(next)
    expect(next.days[0]!.title).toBe("Nara")
    expect(next.days[1]!.title).toBe("Temples")
    expect(next.startDate).toBe("2026-07-10")
    expect(next.endDate).toBe("2026-07-12")
    expect(weatherByDate(next)).toEqual(weatherByDate(plan()))
  })

  it("moves earlier, and does nothing at either edge", () => {
    expect(moveDay(plan(), "day-3", -1)!.days.map((d) => d.id)).toEqual(["day-1", "day-3", "day-2"])
    expect(moveDay(plan(), "day-1", -1)).toBeNull()
    expect(moveDay(plan(), "day-3", 1)).toBeNull()
  })

  it("never changes the input plan", () => {
    const start = plan()
    const snapshot = JSON.stringify(start)
    moveDay(start, "day-1", 1)
    insertDayAfter(start, "day-1")
    deleteDay(start, "day-2")
    duplicateDay(start, "day-2")
    expect(JSON.stringify(start)).toBe(snapshot)
  })
})

it("keeps every untouched day object as it was", () => {
  const start = plan()
  const next = insertDayAfter(start, "day-3")!
  expect(next.days.slice(0, 3)).toEqual(start.days)
  next.days.slice(0, 3).forEach((day: TripDay, i) => expect(day).toBe(start.days[i]))
})

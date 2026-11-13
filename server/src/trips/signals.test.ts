import { describe, expect, test } from "bun:test"
import { analyseDay, describeSignals, insertByTime, shorterRoute, weekday } from "./signals"
import type { ItineraryItem, TripDay } from "./types"

let seq = 0
function stop(title: string, extra: Partial<ItineraryItem> & { at?: [number, number]; category?: string } = {}): ItineraryItem {
  const { at, category, ...rest } = extra
  return {
    id: `it-${++seq}`,
    kind: "place",
    title,
    status: "none",
    location: { name: title, source: "user", ...(at ? { lat: at[0], lng: at[1] } : {}), ...(category ? { category } : {}) },
    ...rest,
  } as ItineraryItem
}
const day = (items: ItineraryItem[]): TripDay => ({ id: "day-1", date: "2026-07-11", items })

describe("analyseDay", () => {
  test("an empty day reads as EMPTY", () => {
    const signals = analyseDay(day([]))
    expect(signals.stops).toBe(0)
    expect(describeSignals(signals)).toContain("EMPTY")
  })

  test("finds meals, gaps and long hops", () => {
    const signals = analyseDay(
      day([
        stop("Museum", { time: "09:30", endTime: "11:00", at: [38.7, -9.14] }),
        stop("Lunch at Ramiro", { time: "12:30", at: [38.72, -9.135], category: "restaurant" }),
        stop("Belém Tower", { time: "16:30", at: [38.6916, -9.216] }),
      ]),
    )
    expect(signals.hasLunch).toBe(true)
    expect(signals.hasDinner).toBe(false)
    expect(signals.gaps).toHaveLength(1)
    expect(signals.gaps[0]).toMatchObject({ after: "Lunch at Ramiro", before: "Belém Tower", minutes: 240 })
    expect(signals.longLegs).toHaveLength(1)
    const text = describeSignals(signals)
    expect(text).toContain("NO DINNER")
    expect(text).toContain("GAP of 4 h")
    expect(text).toContain("LONG HOP")
    expect(text).not.toContain("NO LUNCH")
  })

  test("a gap is measured from the end time when there is one", () => {
    const signals = analyseDay(day([stop("A", { time: "09:00", endTime: "11:30" }), stop("B", { time: "13:00" })]))
    expect(signals.gaps).toHaveLength(0)
  })

  test("flags timed stops listed out of clock order", () => {
    const signals = analyseDay(day([stop("Late", { time: "18:00" }), stop("Early", { time: "09:00" })]))
    expect(signals.outOfOrder).toBe(true)
  })

  test("notes and headings are not stops", () => {
    const note = { ...stop("Bring cash"), kind: "note", location: undefined } as ItineraryItem
    expect(analyseDay(day([note])).stops).toBe(0)
  })
})

describe("shorterRoute", () => {
  const zigzag = () => [
    stop("A", { at: [38.7, -9.2] }),
    stop("B", { at: [38.7, -9.1] }),
    stop("C", { at: [38.7, -9.19] }),
    stop("D", { at: [38.7, -9.11] }),
  ]

  test("offers a nearest-first order that keeps the first stop", () => {
    const items = zigzag()
    const result = shorterRoute(day(items))!
    expect(result.order).toEqual([items[0]!.id, items[2]!.id, items[3]!.id, items[1]!.id])
    expect(result.afterKm).toBeLessThan(result.beforeKm * 0.75)
  })

  test("carries notes with the stop they follow", () => {
    const items = zigzag()
    const note = { ...stop("Order the clams"), kind: "note", location: undefined } as ItineraryItem
    items.splice(2, 0, note)
    const result = shorterRoute(day(items))!
    const at = result.order.indexOf(note.id)
    expect(result.order[at - 1]).toBe(items[1]!.id)
    expect(result.order).toHaveLength(5)
  })

  test("leaves timed days and already-short routes alone", () => {
    const timed = zigzag()
    timed[0]!.time = "09:00"
    expect(shorterRoute(day(timed))).toBeNull()
    const line = [0, 1, 2, 3].map((i) => stop(`S${i}`, { at: [38.7, -9.2 + i * 0.03] }))
    expect(shorterRoute(day(line))).toBeNull()
  })
})

describe("insertByTime", () => {
  test("puts a timed item where the clock says", () => {
    const items = [stop("A", { time: "09:00" }), stop("B", { time: "13:00" }), stop("C", { time: "19:00" })]
    const out = insertByTime(items, stop("New", { time: "15:30" }))
    expect(out.map((i) => i.title)).toEqual(["A", "B", "New", "C"])
  })

  test("appends untimed items and items on untimed days", () => {
    const untimedDay = [stop("A"), stop("B")]
    expect(insertByTime(untimedDay, stop("New", { time: "10:00" })).at(-1)!.title).toBe("New")
    const timedDay = [stop("A", { time: "09:00" })]
    expect(insertByTime(timedDay, stop("New")).at(-1)!.title).toBe("New")
  })
})

test("weekday reads the calendar date", () => {
  expect(weekday("2026-07-11")).toBe("Saturday")
})

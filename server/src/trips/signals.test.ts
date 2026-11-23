import { describe, expect, test } from "bun:test"
import { analyseDay, describeSignals, shorterRoute, weekday } from "./signals"
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

  test("a bar after midnight, listed after dinner, is in order", () => {
    const signals = analyseDay(day([stop("Dinner", { time: "19:00" }), stop("Bar", { time: "23:00" }), stop("Club", { time: "01:00" })]))
    expect(signals.outOfOrder).toBe(false)
    expect(describeSignals(signals)).not.toContain("OUT OF ORDER")
  })

  test("names both stops and their times when one starts before the last has ended", () => {
    const signals = analyseDay(
      day([stop("Bishop Museum", { time: "13:00", endTime: "15:30" }), stop("Shave ice", { time: "15:00" }), stop("Sunset sail", { time: "17:00" })]),
    )
    expect(describeSignals(signals)).toContain('OVERLAP: "Bishop Museum" (13:00–15:30) runs past the start of "Shave ice" (15:00).')
    expect(signals.overlaps).toHaveLength(1)
  })

  test("reads overlaps on the day clock, past midnight too", () => {
    const late = analyseDay(day([stop("Dinner", { time: "21:00", endTime: "23:30" }), stop("Bar", { time: "23:00", endTime: "02:00" }), stop("Club", { time: "01:00" })]))
    expect(late.overlaps.map((o) => `${o.first} > ${o.second}`)).toEqual(["Dinner > Bar", "Bar > Club"])
    const backToBack = analyseDay(day([stop("A", { time: "09:00", endTime: "10:00" }), stop("B", { time: "10:00" })]))
    expect(backToBack.overlaps).toEqual([])
  })

  test("a stay or a booking that ends on a later date overlaps nothing", () => {
    const hotel = stop("Moana Surfrider", { time: "15:00", endTime: "11:00", category: "hotel" })
    const flight = { ...stop("Flight home", { time: "16:00", endTime: "06:30" }), kind: "reservation", reservation: { type: "flight", status: "confirmed", endDate: "2026-07-12" } } as ItineraryItem
    const signals = analyseDay(day([hotel, flight, stop("Dinner", { time: "18:00" })]))
    expect(signals.overlaps).toEqual([])
    expect(describeSignals(signals)).not.toContain("OVERLAP")
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

test("weekday reads the calendar date", () => {
  expect(weekday("2026-07-11")).toBe("Saturday")
})

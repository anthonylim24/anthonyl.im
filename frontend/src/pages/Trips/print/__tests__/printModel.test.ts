import { describe, expect, it } from "vitest"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import { ACCENT_FILL } from "../../meta"
import { inkOn, planDay, PRINT_INK, PRINT_PAPER, printDocument, stopFacts, TRIP_STILL } from "../printModel"
import { printTrip } from "./printFixture"

const NOW = Date.UTC(2026, 10, 20, 12)

describe("planDay", () => {
  it("numbers pinned stops in route order, as the day map does; parked and unpinned stops get no number", () => {
    const plan = planDay(printTrip().days[0]!)
    const rows = plan.rows.map((row) => (row.k === "stop" ? [row.item.id, row.pin] : ["#", row.title]))
    expect(rows).toEqual([
      ["flight", 1],
      ["#", "Evening"],
      ["dinner", 2],
      ["view", 3],
      ["note", null],
      ["fado", null],
    ])
    expect(plan.parked.map((item) => item.id)).toEqual(["market", "tour"])
    expect(plan).toMatchObject({ stops: 4, toSchedule: 2, empty: false })
    expect(plan.route).toHaveLength(3)
  })

  it("puts each leg on the stop it leaves from: walk under 2 km, ride past it", () => {
    const rows = planDay(printTrip().days[0]!).rows.flatMap((row) => (row.k === "stop" ? [[row.item.id, row.leg]] : []))
    expect(rows).toEqual([
      ["flight", "6.0 km · ride"],
      ["dinner", "610 m · 8 min walk"],
      ["view", null],
      ["note", null],
      ["fado", null],
    ])
  })

  it("is empty with nothing but headings", () => {
    const plan = planDay({ id: "d", date: "2026-07-10", items: [makeItem({ kind: "section", title: "Morning" })] })
    expect(plan).toMatchObject({ empty: true, stops: 0, rows: [{ k: "section", title: "Morning" }] })
  })
})

describe("stopFacts", () => {
  it("names a booking by type and a place by category, and drops the location name when the title says it", () => {
    const [flight, , dinner] = printTrip().days[0]!.items
    expect(stopFacts(flight!)).toMatchObject({ place: "Lisbon Airport", category: "Flight", status: "Booked", confirmation: "ABC123" })
    expect(stopFacts(dinner!)).toMatchObject({ title: "Dinner at Ramiro", place: null, category: "Restaurant", status: null })
  })
})

describe("printDocument", () => {
  it("summarises the trip and dates the paper", () => {
    const doc = printDocument(printTrip(), NOW)
    expect(doc).toMatchObject({
      name: "Lisbon Long Weekend",
      accent: "sky",
      dates: "Jul 10 – 12, 2026 · 3 days",
      destinations: "Lisbon",
      summary: "7 stops · 2 bookings · 2 of 3 days planned",
    })
    expect(doc.printed).toMatch(/^Printed Nov 2[01], 2026$/)
  })

  it("heads each day as 'Day N · weekday, date · city', with the weather and the day's tally", () => {
    const [first, empty] = printDocument(printTrip(), NOW).days
    expect(first).toMatchObject({
      eyebrow: "Day 1 · Friday, July 10 · Lisbon",
      title: "Arrival",
      weather: "27° / 19° Sunny",
      summary: "4 stops · 6.6 km · 2 to schedule",
      stillKey: "day:day-1",
    })
    expect(empty).toMatchObject({ title: null, date: "Saturday, July 11", stillKey: null })
  })

  it("asks for the trip still first, then one per day with pins", () => {
    const doc = printDocument(printTrip(), NOW)
    expect(doc.stills.map((still) => [still.key, still.points.length])).toEqual([
      [TRIP_STILL, 4],
      ["day:day-1", 3],
      ["day:day-3", 1],
    ])
  })

  it("lists every booking, parked ones too, with its confirmation", () => {
    expect(printDocument(printTrip(), NOW).bookings).toEqual([
      expect.objectContaining({ id: "flight", dayNumber: 1, date: "Fri, Jul 10", time: "10:40", kind: "Flight · Confirmed", confirmation: "ABC123" }),
      expect.objectContaining({ id: "tour", dayNumber: 1, time: null, kind: "Tour or activity · Tentative", confirmation: "SNT-77" }),
    ])
  })

  it("still draws a trip with no pins yet when it knows where it is", () => {
    const centred = printDocument(makeTrip({ center: { lat: 38.72, lng: -9.14 } }), NOW)
    expect(centred.stills).toEqual([{ key: TRIP_STILL, points: [], center: { lat: 38.72, lng: -9.14 } }])
    expect(printDocument(makeTrip(), NOW).stills).toEqual([])
  })
})

describe("inkOn", () => {
  it("picks whichever of ink or paper reads better on the accent fill", () => {
    expect(inkOn(ACCENT_FILL.amber)).toBe(PRINT_INK)
    expect(inkOn(ACCENT_FILL.emerald)).toBe(PRINT_INK)
    expect(inkOn(ACCENT_FILL.violet)).toBe(PRINT_PAPER)
    expect(inkOn("#000000")).toBe(PRINT_PAPER)
  })
})

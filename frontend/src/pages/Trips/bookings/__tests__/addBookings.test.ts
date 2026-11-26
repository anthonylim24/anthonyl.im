import { describe, expect, it } from "vitest"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import { todayIsoIn } from "../../meta"
import type { ItineraryItem, TripDay } from "../../types"
import { addBookings, bookingsInOrder, defaultBookingDay, draftsFrom, newBooking, pickedEntries } from "../addBookings"
import { pasteErrorMessage } from "../bookingsApi"
import { endDateChoices, tripZones } from "../choices"

const booking = (id: string, time?: string): ItineraryItem =>
  makeItem({ id, kind: "reservation", title: id, status: "booked", time, reservation: { type: "flight", status: "confirmed" } })

describe("bookingsInOrder", () => {
  it("lists bookings by day, then by time, untimed last on their day", () => {
    const days: TripDay[] = [
      { id: "d2", date: "2026-07-11", items: [booking("dawn", "07:00")] },
      { id: "d1", date: "2026-07-10", items: [booking("evening", "18:00"), makeItem({ id: "cafe" }), booking("untimed"), booking("morning", "09:00")] },
    ]
    expect(bookingsInOrder(days).map(({ day, item }) => `${day.id}:${item.id}`)).toEqual(["d1:morning", "d1:evening", "d1:untimed", "d2:dawn"])
  })
})

describe("addBookings", () => {
  it("puts each booking on its day by time and leaves the other days as they were", () => {
    const days: TripDay[] = [
      { id: "d1", date: "2026-07-10", items: [booking("early", "08:00"), booking("late", "20:00")] },
      { id: "d2", date: "2026-07-11", items: [] },
    ]
    const next = addBookings(days, [{ dayId: "d1", item: booking("noon", "12:00") }])
    expect(next[0].items.map((item) => item.id)).toEqual(["early", "noon", "late"])
    expect(next[1]).toBe(days[1])
  })
})

describe("newBooking / defaultBookingDay", () => {
  it("starts an untitled booking of the chosen kind", () => {
    expect(newBooking("car")).toMatchObject({ kind: "reservation", title: "", status: "booked", reservation: { type: "car", status: "confirmed" } })
  })

  it("starts on today while the trip is on, else its first day", () => {
    const today = todayIsoIn("UTC")
    const on = makeTrip({ timezone: "UTC", days: [{ id: "a", date: "2000-01-01", items: [] }, { id: "b", date: today, items: [] }] })
    expect(defaultBookingDay(on)).toBe("b")
    expect(defaultBookingDay(makeTrip())).toBe("day-1")
    expect(defaultBookingDay(makeTrip({ days: [] }))).toBeNull()
  })
})

describe("draftsFrom", () => {
  it("ticks a booking on a trip day, not one outside the trip or one already there", () => {
    const trip = makeTrip({
      days: [
        { id: "day-1", date: "2026-07-10", items: [makeItem({ id: "x", kind: "reservation", title: "Dinner", time: "20:00", reservation: { type: "meal", status: "confirmed" } })] },
        { id: "day-2", date: "2026-07-11", items: [] },
      ],
    })
    const drafts = draftsFrom(
      [
        { date: "2026-07-11", item: { kind: "reservation", title: "Train", status: "booked", createdBy: "ai", reservation: { type: "train", status: "confirmed" } } },
        { date: "2026-09-01", item: { kind: "reservation", title: "Later", status: "booked", createdBy: "ai", reservation: { type: "hotel", status: "confirmed" } } },
        { date: "2026-07-10", item: { kind: "reservation", title: "dinner ", status: "booked", createdBy: "ai", time: "20:00", reservation: { type: "meal", status: "confirmed" } } },
      ],
      trip,
    )
    expect(drafts.map((d) => [d.dayId, d.picked, d.already?.id ?? null])).toEqual([
      ["day-2", true, null],
      [null, false, null],
      ["day-1", false, "day-1"],
    ])
    expect(new Set(drafts.map((d) => d.item.id)).size).toBe(3)
    expect(pickedEntries(drafts).map((entry) => entry.item.title)).toEqual(["Train"])
  })
})

describe("endDateChoices", () => {
  it("offers a flight the same day, the next two, and the day before", () => {
    expect(endDateChoices("flight", "2026-12-20", "2026-12-27").map((c) => c.value)).toEqual(["", "2026-12-21", "2026-12-22", "2026-12-19"])
    expect(endDateChoices("ride", "2026-12-20", "2026-12-27").map((c) => c.value)).toEqual(["", "2026-12-21", "2026-12-22"])
  })

  it("counts a stay's nights up to the morning after the trip, and keeps a date already set", () => {
    const stay = endDateChoices("stay", "2026-12-20", "2026-12-22")
    expect(stay.map((c) => c.label)).toEqual(["Not set", "Mon 21 Dec · 1 night", "Tue 22 Dec · 2 nights", "Wed 23 Dec · 3 nights"])
    const later = endDateChoices("stay", "2026-12-20", "2026-12-22", "2027-01-05")
    expect(later[later.length - 1]).toEqual({ value: "2027-01-05", label: "Tue 5 Jan" })
  })
})

describe("time zones", () => {
  it("lists the trip's zones once, its own first", () => {
    const trip = makeTrip({
      timezone: "America/Los_Angeles",
      days: [
        { id: "a", date: "2026-12-20", items: [] },
        { id: "b", date: "2026-12-21", items: [], timezone: "Pacific/Honolulu" },
        { id: "c", date: "2026-12-22", items: [], timezone: "Pacific/Honolulu" },
      ],
    })
    expect(tripZones(trip)).toEqual(["America/Los_Angeles", "Pacific/Honolulu"])
  })
})

describe("pasteErrorMessage", () => {
  it("speaks for each refusal, in the server's words where it wrote some", () => {
    expect(pasteErrorMessage(429, "HTTP 429")).toMatch(/Try again in a few minutes/)
    expect(pasteErrorMessage(403, "forbidden")).toMatch(/view this trip but not change it/)
    expect(pasteErrorMessage(413, "That’s more than 20,000 characters.")).toBe("That’s more than 20,000 characters.")
    expect(pasteErrorMessage(503, "HTTP 503")).toBe("Couldn’t read that confirmation. Try again in a moment.")
    expect(pasteErrorMessage(500, "boom")).toBe("Couldn’t read that confirmation. Try again in a moment.")
  })
})

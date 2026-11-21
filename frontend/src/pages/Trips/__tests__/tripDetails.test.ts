import { describe, expect, it } from "vitest"
import { applyDetailsPatch, detailsUndo, fitDays, ideasRoom, needsPlanChoice } from "../workspace/tripDetails"
import type { ItineraryItem, TripDay } from "../types"
import { makeTrip } from "./tripFixtures"

const stop = (id: string, extra: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id,
  kind: "place",
  title: id,
  status: "none",
  createdBy: "user",
  ...extra,
})

// Jun 10 – 12: a hotel and a flight on the first day, a section heading on the last.
const hotel = stop("hotel", { kind: "reservation", reservation: { type: "hotel", status: "confirmed", endDate: "2026-06-12" } })
const days: TripDay[] = [
  { id: "day-1", date: "2026-06-10", title: "Arrival", items: [hotel, stop("flight", { kind: "reservation" })] },
  { id: "day-2", date: "2026-06-11", items: [stop("b"), stop("c")] },
  { id: "day-3", date: "2026-06-12", city: "Porto", items: [stop("head", { kind: "section" }), stop("d")] },
]
const trip = makeTrip({ startDate: "2026-06-10", endDate: "2026-06-12", days })

const shape = (out: readonly TripDay[]) => out.map((day) => [day.id, day.date, day.items.map((i) => i.id).join(",")])

describe("fitDays · shift", () => {
  it("returns the same day objects when the range is unchanged", () => {
    const { days: out, dropped } = fitDays(days, "2026-06-10", "2026-06-12", "shift")
    out.forEach((day, i) => expect(day).toBe(days[i]))
    expect(dropped).toEqual([])
  })

  it("moves every day with the start, bookings' end dates included", () => {
    const { days: out, dropped } = fitDays(days, "2026-08-01", "2026-08-03", "shift")
    expect(shape(out)).toEqual([
      ["day-1", "2026-08-01", "hotel,flight"],
      ["day-2", "2026-08-02", "b,c"],
      ["day-3", "2026-08-03", "head,d"],
    ])
    expect(out[0]!.title).toBe("Arrival")
    expect(out[0]!.items[0]!.reservation?.endDate).toBe("2026-08-03")
    expect(out[2]!.city).toBe("Porto")
    expect(dropped).toEqual([])
    // The input is not mutated.
    expect(days[0]!.date).toBe("2026-06-10")
    expect(hotel.reservation?.endDate).toBe("2026-06-12")
  })

  it("drops the tail when the moved range is shorter", () => {
    const { days: out, dropped } = fitDays(days, "2026-06-11", "2026-06-12", "shift")
    expect(shape(out)).toEqual([
      ["day-1", "2026-06-11", "hotel,flight"],
      ["day-2", "2026-06-12", "b,c"],
    ])
    expect(dropped).toEqual([days[2]])
  })

  it("appends empty days with fresh ids for a longer range", () => {
    const { days: out } = fitDays(days, "2026-06-10", "2026-06-13", "shift")
    expect(shape(out)[3]).toEqual(["day-4", "2026-06-13", ""])
  })
})

describe("fitDays · keep", () => {
  it("keeps each day on its date: a later start drops the first day, not the last", () => {
    const { days: out, dropped } = fitDays(days, "2026-06-11", "2026-06-12", "keep")
    expect(shape(out)).toEqual([
      ["day-2", "2026-06-11", "b,c"],
      ["day-3", "2026-06-12", "head,d"],
    ])
    expect(out[0]).toBe(days[1])
    expect(dropped).toEqual([days[0]])
  })

  it("adds empty days before and after, never reusing an id (dropped ones included)", () => {
    const { days: out } = fitDays(days, "2026-06-09", "2026-06-13", "keep")
    expect(shape(out)).toEqual([
      ["day-4", "2026-06-09", ""],
      ["day-1", "2026-06-10", "hotel,flight"],
      ["day-2", "2026-06-11", "b,c"],
      ["day-3", "2026-06-12", "head,d"],
      ["day-5", "2026-06-13", ""],
    ])
    const odd: TripDay[] = [{ id: "day-1", date: "2026-06-10", items: [] }]
    const moved = fitDays([...odd, { id: "day-2", date: "2026-06-11", items: [] }], "2026-06-11", "2026-06-12", "keep")
    expect(moved.days.map((day) => day.id)).toEqual(["day-2", "day-3"])
  })

  it("builds a fresh list from nothing", () => {
    expect(fitDays([], "2026-12-31", "2027-01-01", "keep").days).toEqual([
      { id: "day-1", date: "2026-12-31", items: [] },
      { id: "day-2", date: "2027-01-01", items: [] },
    ])
  })
})

describe("needsPlanChoice", () => {
  it("asks when the start moves on a trip with plans", () => {
    expect(needsPlanChoice(days, "2026-06-11", "2026-06-13")).toBe(true)
    expect(needsPlanChoice(days, "2026-06-09", "2026-06-12")).toBe(true)
  })

  it("does not ask when only the end moves: both answers are the same", () => {
    expect(needsPlanChoice(days, "2026-06-10", "2026-06-14")).toBe(false)
    expect(needsPlanChoice(days, "2026-06-10", "2026-06-11")).toBe(false)
  })

  it("does not ask about a trip with nothing on it", () => {
    const empty: TripDay[] = days.map((day) => ({ id: day.id, date: day.date, items: [] }))
    expect(needsPlanChoice(empty, "2026-07-01", "2026-07-03")).toBe(false)
  })
})

describe("applyDetailsPatch", () => {
  it("changes only the fields in the patch, on the trip as it is now", () => {
    // A collaborator renamed the trip and added a stop after the dialog opened.
    const now = makeTrip({ ...trip, name: "Renamed by Sam", days: [days[0]!, { ...days[1]!, items: [...days[1]!.items, stop("sam")] }, days[2]!] })
    const next = applyDetailsPatch(now, { status: "completed", accent: "sky" })
    expect(next.name).toBe("Renamed by Sam")
    expect(next.days).toBe(now.days)
    expect(next.status).toBe("completed")
    expect(next.appearance?.accent).toBe("sky")
  })

  it("returns the trip itself for an empty patch, and clears a description with null", () => {
    expect(applyDetailsPatch(trip, {})).toBe(trip)
    expect(applyDetailsPatch(makeTrip({ description: "Old" }), { description: null }).description).toBeUndefined()
  })

  it("rebuilds the days from the current trip, not from the one the dialog opened on", () => {
    const now = makeTrip({ ...trip, days: [days[0]!, { ...days[1]!, items: [...days[1]!.items, stop("sam")] }, days[2]!] })
    const next = applyDetailsPatch(now, { dates: { startDate: "2026-06-11", endDate: "2026-06-13", plan: "shift", outside: "ideas" } })
    expect(shape(next.days)).toEqual([
      ["day-1", "2026-06-11", "hotel,flight"],
      ["day-2", "2026-06-12", "b,c,sam"],
      ["day-3", "2026-06-13", "head,d"],
    ])
    expect([next.startDate, next.endDate]).toEqual(["2026-06-11", "2026-06-13"])
  })

  it("sends stops on days that fall outside to the wishlist, without section headings", () => {
    const next = applyDetailsPatch(makeTrip({ ...trip, ideas: [stop("idea")] }), {
      dates: { startDate: "2026-06-10", endDate: "2026-06-11", plan: "keep", outside: "ideas" },
    })
    expect(shape(next.days)).toEqual([
      ["day-1", "2026-06-10", "hotel,flight"],
      ["day-2", "2026-06-11", "b,c"],
    ])
    expect(next.ideas?.map((idea) => idea.id)).toEqual(["idea", "d"])
  })

  it("removes them when asked to", () => {
    const next = applyDetailsPatch(trip, { dates: { startDate: "2026-06-11", endDate: "2026-06-12", plan: "keep", outside: "delete" } })
    expect(next.ideas).toBeUndefined()
    expect(next.days.flatMap((day) => day.items).map((item) => item.id)).toEqual(["b", "c", "head", "d"])
  })

  it("never puts more in Ideas than the server takes", () => {
    const full = makeTrip({ ...trip, ideas: Array.from({ length: 199 }, (_, i) => stop(`i${i}`)) })
    expect(ideasRoom(full)).toBe(1)
    const next = applyDetailsPatch(full, { dates: { startDate: "2026-06-12", endDate: "2026-06-12", plan: "keep", outside: "ideas" } })
    expect(next.ideas).toHaveLength(200)
  })

  it("sets the time zone and centre a new first destination brings", () => {
    const next = applyDetailsPatch(trip, { destinations: ["Tokyo", "Lisbon"], timezone: "Asia/Tokyo", center: { lat: 35.69, lng: 139.69 } })
    expect(next).toMatchObject({ destinations: ["Tokyo", "Lisbon"], timezone: "Asia/Tokyo", center: { lat: 35.69, lng: 139.69 } })
  })
})

describe("detailsUndo", () => {
  it("offers a toast only when days with plans go", () => {
    expect(detailsUndo(trip, { name: "x" })).toEqual({ label: "Updated the trip details" })
    expect(detailsUndo(trip, { dates: { startDate: "2026-06-10", endDate: "2026-06-14", plan: "keep", outside: "ideas" } })).toEqual({
      label: "Changed the trip dates",
    })
    expect(detailsUndo(trip, { dates: { startDate: "2026-06-11", endDate: "2026-06-12", plan: "keep", outside: "ideas" } })).toEqual({
      label: "Changed the trip dates",
      toast: true,
    })
  })
})

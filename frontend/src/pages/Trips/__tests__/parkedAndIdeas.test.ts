import { describe, expect, it } from "vitest"
import { applyProposal } from "../conciergeProposal"
import { LIMITS } from "../limits"
import { splitDay, TO_SCHEDULE } from "../map/geo"
import {
  addIdea,
  addItem,
  duplicateItem,
  ideaToDay,
  insertByTime,
  makeItem,
  moveItemToDay,
  removeIdea,
  restingStatus,
  saveForLater,
  setItemTime,
  toggledStatus,
  unparkDay,
} from "../tripEdits"
import type { ItineraryItem, Trip, TripDay } from "../types"

const stop = (id: string, time?: string, extra: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id,
  kind: "place",
  title: id,
  status: "none",
  createdBy: "user",
  ...(time ? { time } : {}),
  ...extra,
})
const heading = (): ItineraryItem => ({ ...stop("park"), kind: "section", title: TO_SCHEDULE })

/** Lunch and dinner on the route; two Instagram finds parked under "To schedule". */
const parkedDay = (): TripDay => ({
  id: "day-1",
  date: "2026-07-10",
  items: [stop("lunch", "12:00"), stop("dinner", "19:00"), heading(), stop("ig-1"), stop("ig-2")],
})
const ids = (items: readonly ItineraryItem[]) => items.map((i) => i.id)
const planned = (day: TripDay) => ids(splitDay(day).planned)
const parked = (day: TripDay) => ids(splitDay(day).parked)

describe("new stops land on the route, not under “To schedule”", () => {
  it("adds a stop above the heading and keeps the parked places parked", () => {
    const [day] = addItem([parkedDay()], "day-1", stop("new"))
    expect(planned(day!)).toEqual(["lunch", "dinner", "new"])
    expect(parked(day!)).toEqual(["ig-1", "ig-2"])
  })

  it("still appends on a day without the heading", () => {
    const [day] = addItem([{ id: "day-1", date: "2026-07-10", items: [stop("a")] }], "day-1", stop("b"))
    expect(ids(day!.items)).toEqual(["a", "b"])
  })

  it("moves a stop from another day onto the route, where its time falls", () => {
    const days: TripDay[] = [parkedDay(), { id: "day-2", date: "2026-07-11", items: [stop("museum", "10:00"), stop("walk")] }]
    const timed = moveItemToDay(days, "day-2", "museum", "day-1")
    expect(planned(timed[0]!)).toEqual(["museum", "lunch", "dinner"])
    expect(parked(timed[0]!)).toEqual(["ig-1", "ig-2"])
    expect(ids(timed[1]!.items)).toEqual(["walk"])

    const untimed = moveItemToDay(timed, "day-2", "walk", "day-1")
    expect(planned(untimed[0]!)).toEqual(["museum", "lunch", "dinner", "walk"])
    expect(parked(untimed[0]!)).toEqual(["ig-1", "ig-2"])
  })

  it("puts a timed add later than every stop at the end of the route, not under the heading", () => {
    expect(ids(insertByTime(parkedDay().items, stop("bar", "22:00")))).toEqual(["lunch", "dinner", "bar", "park", "ig-1", "ig-2"])
    expect(ids(insertByTime(parkedDay().items, stop("coffee", "09:00")))).toEqual(["coffee", "lunch", "dinner", "park", "ig-1", "ig-2"])
    expect(ids(insertByTime(parkedDay().items, stop("untimed")))).toEqual(["lunch", "dinner", "untimed", "park", "ig-1", "ig-2"])
  })

  it("ignores times on parked places when placing an add", () => {
    const items = [stop("lunch", "12:00"), heading(), stop("ig-1", "08:00")]
    expect(ids(insertByTime(items, stop("dinner", "19:00")))).toEqual(["lunch", "dinner", "park", "ig-1"])
  })

  it("reads the day's clock: a 22:00 add goes before a 01:00 stop listed after a late dinner", () => {
    const items = [stop("dinner", "19:00"), stop("club", "01:00")]
    expect(ids(insertByTime(items, stop("bar", "22:00")))).toEqual(["dinner", "bar", "club"])
  })

  it("the concierge's adds and moves land on the route too", () => {
    const days: TripDay[] = [parkedDay(), { id: "day-2", date: "2026-07-11", items: [stop("museum", "10:00")] }]
    const { days: next } = applyProposal(days, {
      id: "p",
      summary: "Evening",
      changes: [
        { id: "c1", op: "add", dayId: "day-1", time: "21:30", place: { name: "Night market", lat: 1, lng: 2, ref: "r1" } },
        { id: "c2", op: "move", itemId: "museum", title: "museum", fromDayId: "day-2", toDayId: "day-1", time: "23:00" },
      ],
    })
    expect(splitDay(next[0]!).planned.map((i) => i.title)).toEqual(["lunch", "dinner", "Night market", "museum"])
    expect(parked(next[0]!)).toEqual(["ig-1", "ig-2"])
  })

  it("a parked place given a time joins the route at that time", () => {
    const [day] = setItemTime([parkedDay()], "day-1", "ig-2", "15:00")
    expect(planned(day!)).toEqual(["lunch", "ig-2", "dinner"])
    expect(parked(day!)).toEqual(["ig-1"])
    expect(day!.items.find((i) => i.id === "ig-2")!.time).toBe("15:00")
  })

  it("a stop on the route keeps its place when its time changes or is cleared", () => {
    const [moved] = setItemTime([parkedDay()], "day-1", "lunch", "20:00")
    expect(ids(moved!.items)).toEqual(ids(parkedDay().items))
    const [cleared] = setItemTime([parkedDay()], "day-1", "ig-1", undefined)
    expect(parked(cleared!)).toEqual(["ig-1", "ig-2"])
  })

  it("removing the heading keeps its places, now on the route", () => {
    const [day] = unparkDay([parkedDay()], "day-1")
    expect(ids(day!.items)).toEqual(["lunch", "dinner", "ig-1", "ig-2"])
    const plain = [{ id: "day-1", date: "2026-07-10", items: [stop("a")] }]
    expect(unparkDay(plain, "day-1")[0]).toBe(plain[0])
  })
})

describe("Done and Skip toggles", () => {
  it("sets the status, and pressing it again puts the stop back at rest", () => {
    expect(toggledStatus(stop("a"), "completed")).toBe("completed")
    expect(toggledStatus(stop("a", undefined, { status: "completed" }), "completed")).toBe("none")
    expect(toggledStatus(stop("a", undefined, { status: "completed" }), "skipped")).toBe("skipped")
    expect(toggledStatus(stop("a", undefined, { status: "skipped" }), "skipped")).toBe("none")
  })

  it("a booking goes back to booked, not to no status", () => {
    const booking = stop("flight", "08:00", { kind: "reservation", status: "completed", reservation: { type: "flight", status: "confirmed" } })
    expect(restingStatus(booking)).toBe("booked")
    expect(toggledStatus(booking, "completed")).toBe("booked")
  })
})

const tripWith = (overrides: Partial<Trip> = {}): Pick<Trip, "days" | "ideas"> => ({
  days: [parkedDay(), { id: "day-2", date: "2026-07-11", items: [] }],
  ideas: [],
  ...overrides,
})

describe("the ideas list", () => {
  it("saves a stop for later: off its day, into ideas, without a time or how it went", () => {
    const trip = tripWith({
      days: [{ id: "day-1", date: "2026-07-10", items: [stop("museum", "10:00", { endTime: "12:00", status: "skipped", highlight: true, notes: "Free on Sundays" })] }],
    })
    const next = saveForLater(trip, "day-1", "museum")
    expect(next.days[0]!.items).toEqual([])
    expect(next.ideas).toEqual([{ id: "museum", kind: "place", title: "museum", status: "none", createdBy: "user", notes: "Free on Sundays" }])
  })

  it("does nothing for a stop that is gone, or when the list is full", () => {
    const trip = tripWith()
    expect(saveForLater(trip, "day-1", "ghost")).toBe(trip)
    const full = tripWith({ ideas: Array.from({ length: LIMITS.ideas }, (_, i) => stop(`idea-${i}`)) })
    expect(saveForLater(full, "day-1", "lunch")).toBe(full)
    expect(addIdea(full, stop("one-more"))).toBe(full)
  })

  it("adds an idea to a day: off the list, last on the route, above “To schedule”", () => {
    const trip = tripWith({ ideas: [stop("gallery")] })
    const next = ideaToDay(trip, "gallery", "day-1")
    expect(next.ideas).toEqual([])
    expect(planned(next.days[0]!)).toEqual(["lunch", "dinner", "gallery"])
    expect(parked(next.days[0]!)).toEqual(["ig-1", "ig-2"])
  })

  it("gives an idea a fresh id when a stop on the trip already has its id", () => {
    const trip = tripWith({ ideas: [stop("lunch", undefined, { title: "Lunch again" })] })
    const next = ideaToDay(trip, "lunch", "day-2")
    const added = next.days[1]!.items[0]!
    expect(added.title).toBe("Lunch again")
    expect(added.id).not.toBe("lunch")
  })

  it("adds and removes ideas", () => {
    const added = addIdea(tripWith(), { ...makeItem("place", "Tea house"), time: "15:00" })
    expect(added.ideas).toHaveLength(1)
    expect(added.ideas![0]!.time).toBeUndefined()
    expect(removeIdea(added, added.ideas![0]!.id).ideas).toEqual([])
    expect(removeIdea(added, "ghost")).toBe(added)
  })

  it("marks a place it puts on a day as from the wishlist, and drops the mark when it goes back or is copied", () => {
    const trip = tripWith({ ideas: [stop("gallery")] })
    const scheduled = ideaToDay(trip, "gallery", "day-1")
    expect(scheduled.days[0]!.items.find((i) => i.id === "gallery")?.fromWishlist).toBe(true)

    const copied = duplicateItem(scheduled.days, "day-1", "gallery")
    expect(copied[0]!.items.filter((i) => i.title === "gallery").map((i) => i.fromWishlist)).toEqual([true, undefined])

    const back = saveForLater(scheduled, "day-1", "gallery")
    expect(back.ideas).toEqual([stop("gallery")])
  })

  it("leaves a missing idea or day alone", () => {
    const trip = tripWith({ ideas: [stop("gallery")] })
    expect(ideaToDay(trip, "ghost", "day-1")).toBe(trip)
    expect(ideaToDay(trip, "gallery", "nowhere")).toBe(trip)
  })
})

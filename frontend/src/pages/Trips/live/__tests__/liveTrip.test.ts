import { describe, expect, it } from "vitest"
import { makeItem, makeSummary } from "../../__tests__/tripFixtures"
import type { TripDay } from "../../types"
import {
  clockIn,
  clockMinutes,
  clockText,
  countdownLabel,
  durationText,
  liveState,
  nowSlot,
  travelBetween,
  untilParts,
  zonedNow,
  type LiveAfter,
  type LiveBefore,
  type LiveDuring,
} from "../liveTrip"
import { parked, parkedHeading, place, seoulTrip } from "./liveFixtures"

// Every clock here is a UTC instant. The suite runs under any machine zone
// (CI checks Los Angeles and Seoul) and must give the same answers.

const at = (iso: string) => new Date(iso)

const duringAt = (iso: string, trip = seoulTrip()) => {
  const state = liveState(trip, at(iso))
  expect(state.phase).toBe("during")
  return state as LiveDuring
}

describe("clock in the trip's zone", () => {
  it("reads the wall clock of the trip, not the machine", () => {
    const instant = at("2026-05-27T15:05:00Z")
    expect(clockIn("Asia/Seoul", instant)).toBe("00:05")
    expect(clockIn("America/Los_Angeles", instant)).toBe("08:05")
    expect(clockIn("UTC", instant)).toBe("15:05")
    expect(clockIn("Asia/Kathmandu", instant)).toBe("20:50")
  })

  it("names the zone's own date across the date line", () => {
    // 16:30Z on the 27th is 01:30 on the 28th in Seoul and 09:30 on the 27th in Los Angeles.
    const instant = at("2026-05-27T16:30:00Z")
    expect(zonedNow("Asia/Seoul", instant)).toEqual({ date: "2026-05-28", minutes: 90 })
    expect(zonedNow("America/Los_Angeles", instant)).toEqual({ date: "2026-05-27", minutes: 570 })
  })

  it("falls back to UTC for a zone it does not know", () => {
    expect(clockIn("Mars/Olympus_Mons", at("2026-05-27T15:05:00Z"))).toBe("15:05")
  })

  it("parses and prints 24-hour times", () => {
    expect(clockMinutes("09:30")).toBe(570)
    expect(clockMinutes("9:30")).toBe(570)
    expect(clockMinutes("24:00")).toBeNull()
    expect(clockMinutes("9.30")).toBeNull()
    expect(clockMinutes(undefined)).toBeNull()
    expect(clockText(570)).toBe("09:30")
    expect(clockText(-8)).toBe("23:52")
    expect(clockText(1440 + 75)).toBe("01:15")
  })

  it("writes durations short", () => {
    expect(durationText(25)).toBe("25 min")
    expect(durationText(65)).toBe("1h 5m")
    expect(durationText(120)).toBe("2h")
    expect(durationText(0)).toBe("1 min")
  })
})

describe("countdownLabel", () => {
  const summary = makeSummary({ startDate: "2026-05-26", endDate: "2026-06-06", timezone: "Asia/Seoul" })

  it("counts down in days for the last month, then weeks and months", () => {
    expect(countdownLabel(summary, at("2026-05-03T03:00:00Z"))).toBe("In 23 days")
    expect(countdownLabel(summary, at("2026-04-26T03:00:00Z"))).toBe("In 30 days")
    expect(countdownLabel(summary, at("2026-04-11T03:00:00Z"))).toBe("In 6 weeks")
    expect(countdownLabel(summary, at("2026-01-26T03:00:00Z"))).toBe("In 4 months")
    expect(countdownLabel(summary, at("2024-05-26T03:00:00Z"))).toBe("In 2 years")
  })

  it("turns over at midnight in the trip's zone", () => {
    // 23:30 on the 25th in Seoul, then 00:30 on the 26th.
    expect(countdownLabel(summary, at("2026-05-25T14:30:00Z"))).toBe("Tomorrow")
    expect(countdownLabel(summary, at("2026-05-25T15:30:00Z"))).toBe("Day 1 of 12")
    // The same instant is still the day before for a trip that starts in Los Angeles.
    const la = makeSummary({ startDate: "2026-05-26", endDate: "2026-05-30", timezone: "America/Los_Angeles" })
    expect(countdownLabel(la, at("2026-05-25T15:30:00Z"))).toBe("Tomorrow")
  })

  it("says which day of the trip it is", () => {
    expect(countdownLabel(summary, at("2026-05-28T04:42:00Z"))).toBe("Day 3 of 12")
    expect(countdownLabel(summary, at("2026-06-06T14:59:00Z"))).toBe("Day 12 of 12")
  })

  it("says how long ago a recent trip ended, and nothing once it is long past", () => {
    expect(countdownLabel(summary, at("2026-06-06T15:00:00Z"))).toBe("Ended yesterday")
    expect(countdownLabel(summary, at("2026-06-09T03:00:00Z"))).toBe("Ended 3 days ago")
    expect(countdownLabel(summary, at("2026-06-14T03:00:00Z"))).toBe("Ended a week ago")
    expect(countdownLabel(summary, at("2026-06-20T03:00:00Z"))).toBe("Ended 2 weeks ago")
    expect(countdownLabel(summary, at("2026-07-31T03:00:00Z"))).toBe("Ended 8 weeks ago")
    expect(countdownLabel(summary, at("2026-08-01T03:00:00Z"))).toBeNull()
  })

  it("picks the unit a person would count in", () => {
    expect(untilParts(1)).toEqual({ value: 1, unit: "day" })
    expect(untilParts(23)).toEqual({ value: 23, unit: "days" })
    expect(untilParts(31)).toEqual({ value: 4, unit: "weeks" })
    expect(untilParts(63)).toEqual({ value: 2, unit: "months" })
    expect(untilParts(400)).toEqual({ value: 13, unit: "months" })
    expect(untilParts(800)).toEqual({ value: 2, unit: "years" })
  })
})

describe("liveState before the trip", () => {
  it("counts down and leads with the first booking", () => {
    const state = liveState(seoulTrip(), at("2026-05-03T03:00:00Z")) as LiveBefore
    expect(state).toMatchObject({ phase: "before", daysUntil: 23, label: "Starts in 23 days", count: { value: 23, unit: "days" } })
    // The timed flight comes before the untimed hotel listed above it.
    expect(state.first).toMatchObject({ kind: "booking", dayIndex: 0 })
    expect(state.first?.item.id).toBe("flight")
  })

  it("says tomorrow with no figure to set large", () => {
    const state = liveState(seoulTrip(), at("2026-05-25T03:00:00Z")) as LiveBefore
    expect(state).toMatchObject({ daysUntil: 1, label: "Starts tomorrow", count: null })
  })

  it("falls back to the first timed stop when nothing is booked", () => {
    const trip = seoulTrip()
    trip.days[0]!.items = []
    trip.days[3]!.items = []
    const state = liveState(trip, at("2026-04-01T03:00:00Z")) as LiveBefore
    expect(state.label).toBe("Starts in 8 weeks")
    expect(state.first).toMatchObject({ kind: "stop", dayIndex: 2 })
    expect(state.first?.item.id).toBe("breakfast")
  })

  it("has no first entry for an empty plan", () => {
    const trip = seoulTrip()
    for (const day of trip.days) day.items = []
    expect((liveState(trip, at("2026-05-03T03:00:00Z")) as LiveBefore).first).toBeNull()
  })
})

describe("liveState during the trip", () => {
  it("between stops: nothing on now, the next stop, and when to leave for it", () => {
    // 13:42 in Seoul on day 3.
    const state = duringAt("2026-05-28T04:42:00Z")
    expect(state).toMatchObject({ date: "2026-05-28", clock: "13:42", dayIndex: 2, dayCount: 12, current: null })
    expect(state.day?.id).toBe("d3")
    expect(state.next).toMatchObject({ start: "14:00", end: null, tomorrow: false, dayIndex: 2 })
    expect(state.next?.item.id).toBe("palace")
    expect(state.minutesToNext).toBe(18)
    // From Bukchon (the pinned stop before it; the note has no pin): 1.1 km on foot.
    expect(state.travel).toMatchObject({ mode: "walk", minutes: 14, label: "14 min walk" })
    expect(state.travel?.from.id).toBe("bukchon")
    expect(state.leaveBy).toBe("13:46")
    expect(state.leaveIn).toBe(4)
    expect(state).toMatchObject({ started: 2, total: 4, progress: 0.5 })
  })

  it("during a stop with an end time", () => {
    const state = duringAt("2026-05-28T02:00:00Z") // 11:00
    expect(state.current).toMatchObject({ start: "10:30", end: "12:30" })
    expect(state.current?.item.id).toBe("bukchon")
    expect(state.next?.item.id).toBe("palace")
    expect(state.leaveBy).toBe("13:46")
    expect(state.leaveIn).toBe(166)
  })

  it("an open-ended stop lasts until the next one, at most three hours", () => {
    expect(duringAt("2026-05-28T01:00:00Z").current?.item.id).toBe("breakfast") // 10:00
    expect(duringAt("2026-05-28T01:30:00Z").current?.item.id).toBe("bukchon") // 10:30
    expect(duringAt("2026-05-28T05:30:00Z").current?.item.id).toBe("palace") // 14:30
    expect(duringAt("2026-05-28T08:30:00Z").current).toBeNull() // 17:30, three hours on
  })

  it("estimates transit beyond walking distance and says to leave now once it is late", () => {
    const state = duringAt("2026-05-28T09:50:00Z") // 18:50
    expect(state.next?.item.id).toBe("market")
    // 3.3 km at 22 km/h, rounded up, plus 8 minutes.
    expect(state.travel).toMatchObject({ mode: "transit", minutes: 18, label: "18 min by transit" })
    expect(state.leaveBy).toBe("18:42")
    expect(state.leaveIn).toBe(-8)
  })

  it("after the last stop, next is tomorrow's first, with no countdown or leave time", () => {
    const state = duringAt("2026-05-28T12:00:00Z") // 21:00
    expect(state.current?.item.id).toBe("market")
    expect(state.next).toMatchObject({ tomorrow: true, start: "08:10", dayIndex: 3 })
    expect(state.next?.item.id).toBe("ktx")
    expect(state).toMatchObject({ minutesToNext: null, travel: null, leaveBy: null, leaveIn: null, progress: 1 })
  })

  it("ignores places parked under “To schedule”, even with a time", () => {
    const state = duringAt("2026-05-28T11:30:00Z") // 20:30
    expect(state.current?.item.id).toBe("market")
    expect(state.total).toBe(4)
  })

  it("reads today from the trip's zone when the machine's date differs", () => {
    // 01:30 on the 28th in Seoul; still the 27th in UTC and in Los Angeles.
    const state = duringAt("2026-05-27T16:30:00Z")
    expect(state).toMatchObject({ date: "2026-05-28", dayIndex: 2, clock: "01:30", current: null, minutesToNext: 450 })
    expect(state.next?.item.id).toBe("breakfast")
    // The first stop of the day has no pinned stop before it to travel from.
    expect(state).toMatchObject({ travel: null, leaveBy: null, progress: 0 })
  })

  it("runs an end time before the start over midnight", () => {
    const trip = seoulTrip()
    trip.days[2]!.items = [place("club", "Late set", 37.58, { time: "22:00", endTime: "01:00" })]
    expect(duringAt("2026-05-28T14:30:00Z", trip).current).toMatchObject({ start: "22:00", end: "01:00" }) // 23:30
  })

  it("puts a leave time before midnight on the evening before", () => {
    const trip = seoulTrip()
    trip.days[2]!.items = [
      place("bar", "Bar", 37.57, { time: "00:00", endTime: "00:05" }),
      place("noodles", "Late noodles", 37.6, { time: "00:10" }),
    ]
    const state = duringAt("2026-05-27T15:06:00Z", trip) // 00:06
    expect(state.travel?.minutes).toBe(18)
    expect(state.leaveBy).toBe("23:52")
    expect(state.leaveIn).toBe(-14)
  })

  it("has no travel when either end has no pin, or they are the same place", () => {
    const trip = seoulTrip()
    trip.days[2]!.items = [
      place("a", "Gallery", 37.58, { time: "10:00" }),
      makeItem({ id: "b", title: "Somewhere", time: "12:00" }),
      place("c", "Gallery café", 37.58, { time: "15:00" }),
    ]
    expect(duringAt("2026-05-28T02:00:00Z", trip)).toMatchObject({ travel: null, leaveBy: null }) // 11:00 → b
    // c's pinned stop before it is a, a few metres away.
    expect(duringAt("2026-05-28T04:00:00Z", trip)).toMatchObject({ travel: null, leaveBy: null, minutesToNext: 120 })
  })

  it("does not guess a leg between cities", () => {
    expect(travelBetween(place("s", "Seoul Station", 37.55), place("b", "Busan Station", 35.11))).toBeNull()
  })

  it("copes with a day with no times, and with no day for today's date", () => {
    const untimed = seoulTrip()
    untimed.days[2]!.items = [makeItem({ id: "x", title: "Wander" })]
    const quiet = duringAt("2026-05-28T04:42:00Z", untimed)
    expect(quiet).toMatchObject({ current: null, total: 0, started: 0, progress: 0, minutesToNext: null })
    expect(quiet.next?.item.id).toBe("ktx")

    const gap = seoulTrip()
    gap.days.splice(2, 1)
    const missing = duringAt("2026-05-28T04:42:00Z", gap)
    expect(missing).toMatchObject({ day: null, dayIndex: 2, current: null, progress: 0 })
    expect(missing.next?.item.id).toBe("ktx")

    expect(duringAt("2026-05-28T04:42:00Z", seoulTrip({ days: [] }))).toMatchObject({ day: null, next: null, current: null })
  })
})

describe("liveState after the trip", () => {
  it("recaps the trip", () => {
    const state = liveState(seoulTrip(), at("2026-06-20T03:00:00Z")) as LiveAfter
    // Places and bookings count; the note and the heading do not.
    expect(state).toEqual({ phase: "after", daysSince: 14, label: "Ended 2 weeks ago", days: 12, places: 8, cities: 2 })
  })

  it("falls back to the destinations when no day names a city", () => {
    const trip = seoulTrip()
    for (const day of trip.days) day.city = undefined
    const state = liveState(trip, at("2026-12-01T03:00:00Z")) as LiveAfter
    expect(state).toMatchObject({ label: null, cities: 2 })
  })
})

describe("nowSlot", () => {
  const day3 = () => seoulTrip().days[2]!
  const trip = { timezone: "Asia/Seoul" }

  it("sits before the next timed stop", () => {
    expect(nowSlot(day3(), trip, at("2026-05-28T04:42:00Z"))).toBe(3) // 13:42 → before the palace
    expect(nowSlot(day3(), trip, at("2026-05-28T02:00:00Z"))).toBe(3) // 11:00 → after the untimed note
    expect(nowSlot(day3(), trip, at("2026-05-27T23:00:00Z"))).toBe(0) // 08:00 → top
  })

  it("sits after the last timed stop, never among the places to schedule", () => {
    expect(nowSlot(day3(), trip, at("2026-05-28T12:00:00Z"))).toBe(5) // 21:00 → before “To schedule”
  })

  it("is null on any other day, judged in the trip's zone", () => {
    const seoul = seoulTrip()
    // 01:30 on the 28th in Seoul: day 3 is today, day 2 is not, whatever the machine says.
    expect(nowSlot(seoul.days[2]!, trip, at("2026-05-27T16:30:00Z"))).toBe(0)
    expect(nowSlot(seoul.days[1]!, trip, at("2026-05-27T16:30:00Z"))).toBeNull()
  })

  it("is null when nothing on the plan has a time", () => {
    const day: TripDay = { id: "d3", date: "2026-05-28", items: [makeItem({ id: "x" }), parkedHeading, parked] }
    expect(nowSlot(day, trip, at("2026-05-28T04:42:00Z"))).toBeNull()
  })

  it("follows list order when times are out of order", () => {
    const day: TripDay = {
      id: "d3",
      date: "2026-05-28",
      items: [makeItem({ id: "late", time: "14:00" }), makeItem({ id: "early", time: "10:00" })],
    }
    // At 12:00 the first card still to come is the first in the list.
    expect(nowSlot(day, trip, at("2026-05-28T03:00:00Z"))).toBe(0)
    expect(nowSlot(day, trip, at("2026-05-28T06:00:00Z"))).toBe(2)
  })
})

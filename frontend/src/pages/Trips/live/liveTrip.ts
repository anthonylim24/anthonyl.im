import { clockMinutes, dayEnd, dayZone, SMALL_HOURS_END, validZone, wallClock, zonedEpoch } from "../dayClock"
import { addDays, dayCount, daysBetween } from "../meta"
import { distanceMeters, isLocated, splitDay } from "../map/geo"
import { isJourney, outcomeOf, planStarts, type Outcome } from "../timeline/timeline"
import { formatMinutes } from "../timeline/travel"
import type { ItineraryItem, Trip, TripDay, TripSummary } from "../types"
import { stayFor } from "./stays"

// Where a trip stands at a given instant: counting down, under way (what is
// on now, what is next, when to leave), or done. Pure: every function takes
// `now`. Clock maths happens in the zone each day is lived in (`dayZone`),
// never the machine's, so a phone still set to home time reads Seoul
// correctly; countdowns are taken between real instants (`zonedEpoch`), so
// they hold across a daylight-saving night. A day's clock runs past
// midnight (`dayClock.ts`): the 1 AM bar after dinner is still that day's
// night, and the day stays under way until its night is over.

export { clockMinutes }

const MINUTE = 60_000
const DAY_MINUTES = 24 * 60

// ── Clock in a zone ──────────────────────────────────────────────────────

export interface ZonedNow {
  /** The calendar date in the zone, "YYYY-MM-DD". */
  date: string
  /** Minutes since local midnight, 0–1439. */
  minutes: number
}

/** The date and time in `zone`; an unknown zone reads as UTC rather than taking the page down. */
export function zonedNow(zone: string, now: Date): ZonedNow {
  return wallClock(now.getTime(), validZone(zone) ?? "UTC")
}

/** Wall-clock minutes as "HH:mm", wrapping past midnight in either direction. */
export function clockText(minutes: number): string {
  const wrapped = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`
}

/** The time in `zone` as "HH:mm". */
export function clockIn(zone: string, now: Date): string {
  return clockText(zonedNow(zone, now).minutes)
}

/** Live state moves on whole minutes, as the clock on the card does. */
const toMinute = (now: Date) => Math.floor(now.getTime() / MINUTE) * MINUTE

// ── Countdowns ───────────────────────────────────────────────────────────

export interface Until {
  value: number
  /** Already pluralised: "days", "week". */
  unit: string
}

/**
 * How far off a date is, in the unit a person would count in: days for the
 * last month (the countdown people actually watch), then weeks, months, years.
 */
export function untilParts(days: number): Until {
  const unit = (one: string, value: number) => ({ value, unit: value === 1 ? one : `${one}s` })
  if (days <= 30) return unit("day", days)
  if (days <= 62) return unit("week", Math.round(days / 7))
  if (days <= 547) return unit("month", Math.round(days / 30.44))
  return unit("year", Math.round(days / 365.25))
}

/** "tomorrow", "in 23 days", "in 5 weeks". */
function untilPhrase(days: number): string {
  if (days === 1) return "tomorrow"
  const { value, unit } = untilParts(days)
  return `in ${value} ${unit}`
}

/** Recent enough that "ago" means something; older trips show their month instead. */
const RECENT_DAYS = 56

function sincePhrase(days: number): string | null {
  if (days <= 1) return "Ended yesterday"
  if (days < 7) return `Ended ${days} days ago`
  if (days >= RECENT_DAYS) return null
  const weeks = Math.round(days / 7)
  return weeks === 1 ? "Ended a week ago" : `Ended ${weeks} weeks ago`
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Short chip text for an index card: "In 23 days", "Tomorrow", "Day 3 of 12",
 * "Ended 2 weeks ago". Null once a trip is long past. A summary carries no
 * days, so this reads the trip's own zone.
 */
export function countdownLabel(
  summary: Pick<TripSummary, "startDate" | "endDate" | "timezone">,
  now: Date,
): string | null {
  const today = zonedNow(summary.timezone, now).date
  if (today < summary.startDate) return capitalise(untilPhrase(daysBetween(today, summary.startDate)))
  if (today <= summary.endDate) {
    return `Day ${daysBetween(summary.startDate, today) + 1} of ${dayCount(summary.startDate, summary.endDate)}`
  }
  return sincePhrase(daysBetween(summary.endDate, today))
}

// ── Stops with a time ────────────────────────────────────────────────────

interface Timed {
  item: ItineraryItem
  /** Position in `day.items`. */
  index: number
  /** Minutes on the day's own clock: past 1440 after midnight. */
  start: number
  /** Explicit end on the day's clock, else null. */
  end: number | null
  /** Done or still planned; skipped stops are not on the clock at all. */
  outcome: Exclude<Outcome, "skipped">
}

/**
 * The day's planned entries that run to a clock, earliest first. Sections and
 * "To schedule" are not on it, and neither is a skipped stop: it is not
 * happening, so it is never under way, never next and never a place to set off from.
 */
function timedStops(day: TripDay): Timed[] {
  const starts = planStarts(day)
  const out: Timed[] = []
  // `planned` is a prefix of `day.items`, so its indices are the day's indices.
  splitDay(day).planned.forEach((item, index) => {
    const outcome = outcomeOf(item)
    const start = starts[index] ?? null
    if (item.kind === "section" || outcome === "skipped" || start === null) return
    const end = dayEnd(start, item.endTime)
    // An end equal to the start says nothing.
    out.push({ item, index, start, end: end === start ? null : end, outcome })
  })
  return out.sort((x, y) => x.start - y.start || x.index - y.index)
}

/** With no end time, a stop lasts until the next one starts, and at most this long. */
const OPEN_STOP_MINUTES = 180

function stopEnd(stops: readonly Timed[], at: number): number {
  const stop = stops[at]!
  if (stop.end !== null) return stop.end
  const following = stops[at + 1]
  return Math.min(following ? following.start : Infinity, stop.start + OPEN_STOP_MINUTES)
}

/** Still to happen or happening at `n`: planned, and not yet ended. */
const notOver = (stops: readonly Timed[], at: number, n: number) => stops[at]!.outcome === "planned" && stopEnd(stops, at) > n

// ── Which day is under way ───────────────────────────────────────────────

interface LiveDay {
  day: TripDay
  /** Position in `trip.days`. */
  index: number
  zone: string
  /** Now on the day's clock: past 1440 in its night. */
  minutes: number
  /** The small hours after the day's date, while a stop of its night is still on. */
  night: boolean
}

/** Minutes on `day`'s own clock at `epoch`, when the day is under way; else null. */
function clockOn(trip: Pick<Trip, "timezone">, day: TripDay, epoch: number): { minutes: number; night: boolean } | null {
  const wall = wallClock(epoch, dayZone(trip, day))
  if (wall.date === day.date) return { minutes: wall.minutes, night: false }
  if (wall.minutes >= SMALL_HOURS_END || wall.date !== addDays(day.date, 1)) return null
  const minutes = wall.minutes + DAY_MINUTES
  const stops = timedStops(day)
  return stops.some((_, at) => notOver(stops, at, minutes)) ? { minutes, night: true } : null
}

/**
 * Now on `day`'s clock, when the day is under way: minutes from its own
 * midnight in its own zone on its date, or past 1440 in the small hours after
 * it while a stop of its night is still on (00:30 after a 1 AM bar reads
 * 1470). Null on any other day. The list, the timeline and the now line all
 * read "today" through here.
 */
export function dayNow(trip: Pick<Trip, "timezone">, day: TripDay, now: Date): number | null {
  return clockOn(trip, day, toMinute(now))?.minutes ?? null
}

/**
 * The day under way at `epoch`. A day still in its night wins over the date
 * it has run into, so at 00:30 the card stays on the club, not on tomorrow's
 * breakfast. Across a change of zone two days can share an instant; the
 * earlier one in the trip is taken.
 */
function liveDay(trip: Trip, epoch: number): LiveDay | null {
  let today: LiveDay | null = null
  for (const [index, day] of trip.days.entries()) {
    const on = clockOn(trip, day, epoch)
    if (!on) continue
    const live = { day, index, zone: dayZone(trip, day), ...on }
    if (on.night) return live
    today ??= live
  }
  return today
}

/** The zone a date of the trip is lived in: its day's own, else the trip's. */
const zoneOfDate = (trip: Trip, date: string) => dayZone(trip, trip.days.find((day) => day.date === date))

// ── Getting there ────────────────────────────────────────────────────────

const WALK_MPS = 1.35
/** Beyond this, walking is not the plan; directions ask for transit instead. */
export const WALK_MAX_M = 1_500
/** Transit at a city pace, plus waiting and the walk to the platform. */
const TRANSIT_KMH = 22
const TRANSIT_OVERHEAD_MIN = 8
/** Past city scale the leg is a train or a flight, which has its own booking. */
const CITY_MAX_M = 60_000
/** Closer than this is the same place. */
const SAME_PLACE_M = 30

export interface LiveTravel {
  mode: "walk" | "transit"
  meters: number
  /** Rounded up: leaving a minute early beats arriving a minute late. */
  minutes: number
  /** "18 min walk", "35 min by transit". */
  label: string
  /** The stop the estimate starts from. */
  from: ItineraryItem
}

export function travelBetween(from: ItineraryItem, to: ItineraryItem): LiveTravel | null {
  if (!isLocated(from) || !isLocated(to)) return null
  const meters = distanceMeters(from.location, to.location)
  if (meters < SAME_PLACE_M || meters > CITY_MAX_M) return null
  if (meters <= WALK_MAX_M) {
    const minutes = Math.ceil(meters / WALK_MPS / 60)
    return { mode: "walk", meters, minutes, label: `${formatMinutes(minutes)} walk`, from }
  }
  const minutes = Math.ceil(meters / ((TRANSIT_KMH * 1000) / 60)) + TRANSIT_OVERHEAD_MIN
  return { mode: "transit", meters, minutes, label: `${formatMinutes(minutes)} by transit`, from }
}

/**
 * Where the traveller sets off from for `stops[at]`: the stop before it in
 * clock order (done ones count: you were there), when it has a pin. A flight
 * or train before it lands somewhere else, so it is no place to set off from.
 * The day's first timed stop sets off from last night's bed.
 */
function setOffFrom(trip: Trip, dayIndex: number, stops: readonly Timed[], at: number): ItineraryItem | null {
  if (at === 0) {
    const bed = stayFor(trip, dayIndex, "last")
    return bed && isLocated(bed) ? bed : null
  }
  for (let i = at - 1; i >= 0; i--) {
    const before = stops[i]!.item
    if (isJourney(before)) return null
    if (isLocated(before)) return before
  }
  return null
}

// ── Live state ───────────────────────────────────────────────────────────

export interface LiveStop {
  item: ItineraryItem
  day: TripDay
  /** Position of `day` in `trip.days`. */
  dayIndex: number
  /** "HH:mm"; null for a stop with no time (a loose day). */
  start: string | null
  /** The stop's own end time ("HH:mm"), when it has one. */
  end: string | null
}

export interface LiveNext extends LiveStop {
  /**
   * "today": the next timed stop. "anytime": a day with stops but no times,
   * so its first one not done yet. "tomorrow": nothing timed is left today.
   */
  when: "today" | "anytime" | "tomorrow"
}

export interface LiveFirst {
  kind: "booking" | "stop"
  item: ItineraryItem
  day: TripDay
  dayIndex: number
}

export interface LiveBefore {
  phase: "before"
  /** Whole days until the first day, 1 or more. */
  daysUntil: number
  /** "Starts tomorrow", "Starts in 23 days", "Starts in 5 weeks". */
  label: string
  /** The figure to set large ("23 days"); null when the label is "tomorrow". */
  count: Until | null
  /** The first booking, else the first timed stop. */
  first: LiveFirst | null
}

export interface LiveDuring {
  phase: "during"
  /** The date of the day under way, "YYYY-MM-DD" (in its night, still that day's date). */
  date: string
  /** The time in the day's zone, "HH:mm". */
  clock: string
  /** Now on the day's clock: minutes from its midnight, past 1440 in its night. */
  now: number
  /** The zone the day is lived in. */
  zone: string
  /** The small hours after the day's date, with a stop of its night still on. */
  night: boolean
  /** 0-based day number, counted from the start date. */
  dayIndex: number
  dayCount: number
  /** The itinerary day under way; null when the document has no day for today's date. */
  day: TripDay | null
  /** The timed stop under way now. */
  current: LiveStop | null
  next: LiveNext | null
  /** Minutes until `next` starts, between real instants; null unless `next` is timed today. */
  minutesToNext: number | null
  /** Where the traveller sets off for `next` today: the pinned stop before it in clock order, or last night's bed. */
  from: ItineraryItem | null
  /** Travel to `next` from `from`; null when either has no pin, they are one place, or `next` is not today. */
  travel: LiveTravel | null
  /** "HH:mm" to set off for `next`. */
  leaveBy: string | null
  /** Minutes until `leaveBy`; zero or less means leave now. */
  leaveIn: number | null
  /** Today's timed stops that have started or are done, of `total`. */
  started: number
  total: number
  /** started / total, 0 when nothing today has a time. */
  progress: number
}

export interface LiveAfter {
  phase: "after"
  /** Whole days since the last day, 1 or more. */
  daysSince: number
  /** "Ended 2 weeks ago"; null once that stops meaning much. */
  label: string | null
  days: number
  /** Every stop on the plan (places and bookings, not notes, headings or skipped stops). */
  places: number
  /** Distinct day cities, else the trip's destinations. */
  cities: number
}

export type LiveState = LiveBefore | LiveDuring | LiveAfter

const isStop = (item: ItineraryItem) => item.kind !== "section" && item.kind !== "note"

function liveStop(trip: Trip, day: TripDay, stop: Timed): LiveStop {
  return {
    item: stop.item,
    day,
    dayIndex: trip.days.indexOf(day),
    start: clockText(stop.start),
    end: stop.end === null ? null : clockText(stop.end),
  }
}

function firstOfTrip(trip: Trip): LiveFirst | null {
  for (const [dayIndex, day] of trip.days.entries()) {
    // Timed bookings by clock, then untimed ones in list order.
    const starts = planStarts(day)
    const booking = day.items
      .map((item, index) => ({ item, index, start: starts[index] ?? DAY_MINUTES * 2 }))
      .filter(({ item }) => item.kind === "reservation" && outcomeOf(item) !== "skipped")
      .sort((x, y) => x.start - y.start || x.index - y.index)[0]
    if (booking) return { kind: "booking", item: booking.item, day, dayIndex }
  }
  for (const [dayIndex, day] of trip.days.entries()) {
    const stop = timedStops(day)[0]
    if (stop) return { kind: "stop", item: stop.item, day, dayIndex }
  }
  return null
}

/** A day's first stop still to do, in list order: the plan of a day with no times. */
function firstOpen(day: TripDay): ItineraryItem | null {
  return splitDay(day).planned.find((item) => isStop(item) && outcomeOf(item) === "planned") ?? null
}

function during(trip: Trip, live: LiveDay | null, date: string, zone: string, epoch: number): LiveDuring {
  const day = live?.day ?? null
  const n = live?.minutes ?? wallClock(epoch, zone).minutes
  const stops = day ? timedStops(day) : []

  let current: LiveStop | null = null
  for (const [at, stop] of stops.entries()) {
    // Overlaps resolve to the stop that started last.
    if (day && stop.start <= n && notOver(stops, at, n)) current = liveStop(trip, day, stop)
  }

  const started = stops.filter((stop) => stop.outcome === "done" || stop.start <= n).length
  const ahead = stops.findIndex((stop) => stop.outcome === "planned" && stop.start > n)
  const upcoming = ahead >= 0 ? stops[ahead]! : null
  let next: LiveNext | null = null
  let minutesToNext: number | null = null
  let from: ItineraryItem | null = null
  let travel: LiveTravel | null = null
  let leaveBy: string | null = null
  let leaveIn: number | null = null
  const loose = day && stops.length === 0 ? firstOpen(day) : null
  if (day && live && upcoming) {
    next = { ...liveStop(trip, day, upcoming), when: "today" }
    // Real instants, so the hour a clock skips or repeats overnight is counted as it is lived.
    const startsAt = zonedEpoch(day.date, upcoming.start, live.zone)
    minutesToNext = Math.round((startsAt - epoch) / MINUTE)
    from = setOffFrom(trip, live.index, stops, ahead)
    travel = from ? travelBetween(from, upcoming.item) : null
    if (travel) {
      const setOff = startsAt - travel.minutes * MINUTE
      leaveBy = clockText(wallClock(setOff, live.zone).minutes)
      leaveIn = Math.round((setOff - epoch) / MINUTE)
    }
  } else if (day && loose) {
    next = { item: loose, day, dayIndex: trip.days.indexOf(day), start: null, end: null, when: "anytime" }
  } else {
    const tomorrow = trip.days.find((d) => d.date === addDays(date, 1))
    const first = tomorrow ? timedStops(tomorrow).find((stop) => stop.outcome === "planned") : undefined
    if (tomorrow && first) next = { ...liveStop(trip, tomorrow, first), when: "tomorrow" }
  }

  return {
    phase: "during",
    date,
    clock: clockText(n),
    now: n,
    zone,
    night: live?.night ?? false,
    dayIndex: daysBetween(trip.startDate, date),
    dayCount: dayCount(trip.startDate, trip.endDate),
    day,
    current,
    next,
    minutesToNext,
    from,
    travel,
    leaveBy,
    leaveIn,
    started,
    total: stops.length,
    progress: stops.length === 0 ? 0 : started / stops.length,
  }
}

function after(trip: Trip, today: string): LiveAfter {
  const daysSince = daysBetween(trip.endDate, today)
  const cities = new Set(trip.days.map((d) => d.city?.trim().toLowerCase()).filter(Boolean))
  const destinations = new Set(trip.destinations.map((d) => d.trim().toLowerCase()).filter(Boolean))
  return {
    phase: "after",
    daysSince,
    label: sincePhrase(daysSince),
    days: dayCount(trip.startDate, trip.endDate),
    places: trip.days.reduce((sum, day) => sum + day.items.filter((item) => isStop(item) && outcomeOf(item) !== "skipped").length, 0),
    cities: cities.size > 0 ? cities.size : destinations.size,
  }
}

export function liveState(trip: Trip, now: Date): LiveState {
  const epoch = toMinute(now)
  const live = liveDay(trip, epoch)
  if (live) return during(trip, live, live.day.date, live.zone, epoch)

  // The first day is counted down in its own zone, the last day ended in its own.
  const atStart = wallClock(epoch, zoneOfDate(trip, trip.startDate)).date
  if (atStart < trip.startDate) {
    const daysUntil = daysBetween(atStart, trip.startDate)
    return {
      phase: "before",
      daysUntil,
      label: `Starts ${untilPhrase(daysUntil)}`,
      count: daysUntil === 1 ? null : untilParts(daysUntil),
      first: firstOfTrip(trip),
    }
  }
  const atEnd = wallClock(epoch, zoneOfDate(trip, trip.endDate)).date
  if (atEnd > trip.endDate) return after(trip, atEnd)
  // Inside the dates with no day in the document for today.
  const zone = dayZone(trip)
  return during(trip, null, wallClock(epoch, zone).date, zone, epoch)
}

/**
 * Where a "now" marker belongs in a day's list: the index in `day.items` it
 * sits before. It goes ahead of the next stop still to come in clock order
 * (so a list written out of order still puts it before what happens next),
 * or just after the last timed stop once everything has started, and never
 * among the "To schedule" places. Null when the day is not under way
 * (`dayNow`) or nothing on its plan has a time.
 */
export function nowSlot(day: TripDay, trip: Pick<Trip, "timezone">, now: Date): number | null {
  const n = dayNow(trip, day, now)
  if (n === null) return null
  const stops = timedStops(day)
  if (stops.length === 0) return null
  const ahead = stops.find((stop) => stop.outcome === "planned" && stop.start > n)
  return ahead ? ahead.index : Math.max(...stops.map((stop) => stop.index)) + 1
}

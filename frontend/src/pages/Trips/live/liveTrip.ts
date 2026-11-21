import { addDays, dayCount, daysBetween } from "../meta"
import { distanceMeters, isLocated, splitDay } from "../map/geo"
import type { ItineraryItem, Trip, TripDay, TripSummary } from "../types"

// Where a trip stands at a given instant: counting down, under way (what is
// on now, what is next, when to leave), or done. Pure: every function takes
// `now`, and all clock maths happens in the trip's IANA zone, never the
// machine's, so a phone still set to home time reads Seoul correctly.

// ── Clock in the trip's zone ─────────────────────────────────────────────

const zoneFormats = new Map<string, Intl.DateTimeFormat>()

const ZONE_PARTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  // h23, not hour12: false, which some engines render as "24:05" after midnight.
  hourCycle: "h23",
}

function zoneFormat(zone: string): Intl.DateTimeFormat {
  const cached = zoneFormats.get(zone)
  if (cached) return cached
  let format: Intl.DateTimeFormat
  try {
    format = new Intl.DateTimeFormat("en-CA", { ...ZONE_PARTS, timeZone: zone })
  } catch {
    // An unknown zone reads as UTC rather than taking the page down.
    format = new Intl.DateTimeFormat("en-CA", { ...ZONE_PARTS, timeZone: "UTC" })
  }
  zoneFormats.set(zone, format)
  return format
}

export interface ZonedNow {
  /** The calendar date in the zone, "YYYY-MM-DD". */
  date: string
  /** Minutes since local midnight, 0–1439. */
  minutes: number
}

export function zonedNow(zone: string, now: Date): ZonedNow {
  const parts = zoneFormat(zone).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "00"
  const hour = Number(part("hour")) % 24
  return { date: `${part("year")}-${part("month")}-${part("day")}`, minutes: hour * 60 + Number(part("minute")) }
}

/** Wall-clock minutes as "HH:mm", wrapping past midnight in either direction. */
export function clockText(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`
}

/** The time in `zone` as "HH:mm". */
export function clockIn(zone: string, now: Date): string {
  return clockText(zonedNow(zone, now).minutes)
}

/** "09:30" → 570. Null for anything that is not a 24-hour clock time. */
export function clockMinutes(time: string | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time?.trim() ?? "")
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour > 23 || minute > 59 ? null : hour * 60 + minute
}

/** "25 min", "1h 5m", "2h". */
export function durationText(minutes: number): string {
  const total = Math.max(1, Math.round(minutes))
  if (total < 60) return `${total} min`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

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
 * "Ended 2 weeks ago". Null once a trip is long past.
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
  start: number
  /** Explicit end in minutes (past 1440 when it runs over midnight), else null. */
  end: number | null
}

/** The day's planned entries that run to a clock, earliest first. Sections and "To schedule" are not on it. */
function timedStops(day: TripDay): Timed[] {
  const out: Timed[] = []
  // `planned` is a prefix of `day.items`, so its indices are the day's indices.
  splitDay(day).planned.forEach((item, index) => {
    if (item.kind === "section") return
    const start = clockMinutes(item.time)
    if (start === null) return
    const endAt = clockMinutes(item.endTime)
    // An end before the start runs over midnight; an end equal to it says nothing.
    const end = endAt === null || endAt === start ? null : endAt < start ? endAt + 1440 : endAt
    out.push({ item, index, start, end })
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

// ── Getting there ────────────────────────────────────────────────────────

const WALK_MPS = 1.35
/** Beyond this, walking is not the plan. */
const WALK_MAX_M = 2_000
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
    return { mode: "walk", meters, minutes, label: `${durationText(minutes)} walk`, from }
  }
  const minutes = Math.ceil(meters / ((TRANSIT_KMH * 1000) / 60)) + TRANSIT_OVERHEAD_MIN
  return { mode: "transit", meters, minutes, label: `${durationText(minutes)} by transit`, from }
}

/** The pinned stop the traveller will be at just before `index`, on the same day's plan. */
function placeBefore(day: TripDay, index: number): ItineraryItem | null {
  const { planned } = splitDay(day)
  for (let i = Math.min(index, planned.length) - 1; i >= 0; i--) {
    const item = planned[i]!
    if (item.kind !== "section" && isLocated(item)) return item
  }
  return null
}

// ── Live state ───────────────────────────────────────────────────────────

export interface LiveStop {
  item: ItineraryItem
  day: TripDay
  /** Position of `day` in `trip.days`. */
  dayIndex: number
  /** "HH:mm". */
  start: string
  /** The stop's own end time ("HH:mm"), when it has one. */
  end: string | null
}

export interface LiveNext extends LiveStop {
  /** The first stop of tomorrow, because nothing timed is left today. */
  tomorrow: boolean
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
  /** Today in the trip's zone, "YYYY-MM-DD". */
  date: string
  /** The time in the trip's zone, "HH:mm". */
  clock: string
  /** 0-based day number, counted from the start date. */
  dayIndex: number
  dayCount: number
  /** Today's itinerary day; null when the document has no day for today's date. */
  day: TripDay | null
  /** The timed stop under way now. */
  current: LiveStop | null
  next: LiveNext | null
  /** Minutes until `next` starts; null when `next` is tomorrow or absent. */
  minutesToNext: number | null
  /** Travel to `next` from the pinned stop before it; null when either has no pin or `next` is tomorrow. */
  travel: LiveTravel | null
  /** "HH:mm" to set off for `next`. */
  leaveBy: string | null
  /** Minutes until `leaveBy`; zero or less means leave now. */
  leaveIn: number | null
  /** Today's timed stops that have started, of `total`. */
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
  /** Every stop on the plan (places and bookings, not notes or headings). */
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
    const booking = day.items
      .map((item, index) => ({ item, index, start: clockMinutes(item.time) ?? 1440 }))
      .filter(({ item }) => item.kind === "reservation")
      .sort((x, y) => x.start - y.start || x.index - y.index)[0]
    if (booking) return { kind: "booking", item: booking.item, day, dayIndex }
  }
  for (const [dayIndex, day] of trip.days.entries()) {
    const stop = timedStops(day)[0]
    if (stop) return { kind: "stop", item: stop.item, day, dayIndex }
  }
  return null
}

function during(trip: Trip, today: ZonedNow): LiveDuring {
  const n = today.minutes
  const day = trip.days.find((d) => d.date === today.date) ?? null
  const stops = day ? timedStops(day) : []

  let current: LiveStop | null = null
  for (const [at, stop] of stops.entries()) {
    // Overlaps resolve to the stop that started last.
    if (day && stop.start <= n && n < stopEnd(stops, at)) current = liveStop(trip, day, stop)
  }

  const started = stops.filter((stop) => stop.start <= n).length
  const upcoming = stops.find((stop) => stop.start > n)
  let next: LiveNext | null = null
  let minutesToNext: number | null = null
  let travel: LiveTravel | null = null
  if (upcoming && day) {
    next = { ...liveStop(trip, day, upcoming), tomorrow: false }
    minutesToNext = upcoming.start - n
    const from = placeBefore(day, upcoming.index)
    travel = from ? travelBetween(from, upcoming.item) : null
  } else {
    const tomorrow = trip.days.find((d) => d.date === addDays(today.date, 1))
    const first = tomorrow ? timedStops(tomorrow)[0] : undefined
    if (tomorrow && first) next = { ...liveStop(trip, tomorrow, first), tomorrow: true }
  }
  const setOff = upcoming && travel ? upcoming.start - travel.minutes : null

  return {
    phase: "during",
    date: today.date,
    clock: clockText(n),
    dayIndex: daysBetween(trip.startDate, today.date),
    dayCount: dayCount(trip.startDate, trip.endDate),
    day,
    current,
    next,
    minutesToNext,
    travel,
    leaveBy: setOff === null ? null : clockText(setOff),
    leaveIn: setOff === null ? null : setOff - n,
    started,
    total: stops.length,
    progress: stops.length === 0 ? 0 : started / stops.length,
  }
}

function after(trip: Trip, today: ZonedNow): LiveAfter {
  const daysSince = daysBetween(trip.endDate, today.date)
  const cities = new Set(trip.days.map((d) => d.city?.trim().toLowerCase()).filter(Boolean))
  const destinations = new Set(trip.destinations.map((d) => d.trim().toLowerCase()).filter(Boolean))
  return {
    phase: "after",
    daysSince,
    label: sincePhrase(daysSince),
    days: dayCount(trip.startDate, trip.endDate),
    places: trip.days.reduce((sum, day) => sum + day.items.filter(isStop).length, 0),
    cities: cities.size > 0 ? cities.size : destinations.size,
  }
}

export function liveState(trip: Trip, now: Date): LiveState {
  const today = zonedNow(trip.timezone, now)
  if (today.date < trip.startDate) {
    const daysUntil = daysBetween(today.date, trip.startDate)
    return {
      phase: "before",
      daysUntil,
      label: `Starts ${untilPhrase(daysUntil)}`,
      count: daysUntil === 1 ? null : untilParts(daysUntil),
      first: firstOfTrip(trip),
    }
  }
  if (today.date > trip.endDate) return after(trip, today)
  return during(trip, today)
}

/**
 * Where a "now" marker belongs in a day's list: the index in `day.items` it
 * sits before. It goes ahead of the first timed stop still to come, or just
 * after the last timed stop once everything has started, and never among
 * the "To schedule" places. Null when `day` is not today in the trip's zone
 * or nothing on its plan has a time.
 */
export function nowSlot(day: TripDay, trip: Pick<Trip, "timezone">, now: Date): number | null {
  const today = zonedNow(trip.timezone, now)
  if (day.date !== today.date) return null
  const stops = timedStops(day)
  if (stops.length === 0) return null
  // List order, not clock order: the marker sits between the cards as shown.
  const inOrder = [...stops].sort((x, y) => x.index - y.index)
  const ahead = inOrder.find((stop) => stop.start > today.minutes)
  return ahead ? ahead.index : inOrder[inOrder.length - 1]!.index + 1
}

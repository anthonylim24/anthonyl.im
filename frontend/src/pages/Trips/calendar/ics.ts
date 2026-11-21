import { clockMinutes, dayEnd, dayStarts, validZone, wallClock, zonedEpoch, zoneOffsetMs } from "../dayClock"
import type { ItineraryItem, Trip, TripDay } from "../types"
import { isCalendarItem } from "./calendarItems"

// A trip as an iCalendar file (RFC 5545), built in the browser. Pure: the
// caller passes `now`, so the same trip always gives the same file.
//
// - Timed stops are wall-clock times in the zone their day is lived in
//   (`DTSTART;TZID=…`), read on the day's own clock: a 1 AM bar after dinner
//   is on the next date. Each zone used gets a VTIMEZONE built from `Intl`
//   for the dates it covers. An unknown zone falls back to floating times.
// - A booking that lands elsewhere (a flight with `endTimezone` / `endDate`)
//   ends at its real arrival, written in the arrival zone.
// - Booked stops carry a reminder: three hours before a flight, an hour
//   before anything else. Ordinary stops have none.
// - Stops with no time are all-day events on their day; a skipped stop is
//   exported as cancelled, so a calendar that imported it before updates.
// - Each stop's UID is its item id, so importing the file again updates the
//   events instead of adding a second copy.

export { isCalendarItem }

const CRLF = "\r\n"
const MAX_OCTETS = 75
const MINUTES_PER_DAY = 24 * 60
/** A stop with a start and no end gets this long in the calendar. */
const DEFAULT_MINUTES = 60
/** An end earlier on the clock than the start is read as "after midnight" only up to this long. */
const MAX_OVERNIGHT_MINUTES = 12 * 60

const encoder = new TextEncoder()

/** TEXT value escaping (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
}

/**
 * Fold one content line to 75 octets (§3.1). Continuation lines start with
 * a space, which counts toward their 75. Never splits a UTF-8 sequence.
 */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= MAX_OCTETS) return line
  const out: string[] = []
  let current = ""
  let size = 0
  let limit = MAX_OCTETS
  for (const char of line) {
    const bytes = encoder.encode(char).length
    if (size + bytes > limit) {
      out.push(current)
      current = " "
      size = 1
      limit = MAX_OCTETS
    }
    current += char
    size += bytes
  }
  out.push(current)
  return out.join(CRLF)
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0")
}

/** "2026-07-10" → [2026, 7, 10], or null. */
function parseDate(date: string | undefined): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "")
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const check = new Date(Date.UTC(y, mo - 1, d))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null
  return [y, mo, d]
}

function addDays([y, m, d]: [number, number, number], days: number): [number, number, number] {
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return [next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()]
}

const isoOf = ([y, m, d]: [number, number, number]) => `${y}-${pad(m)}-${pad(d)}`

function dateValue([y, m, d]: [number, number, number]): string {
  return `${y}${pad(m)}${pad(d)}`
}

/** A wall time on the day's clock: minutes past 1440 land on the following dates. */
function dateTimeValue(date: [number, number, number], minutes: number): string {
  const days = Math.floor(minutes / MINUTES_PER_DAY)
  const rest = minutes - days * MINUTES_PER_DAY
  return `${dateValue(addDays(date, days))}T${pad(Math.floor(rest / 60))}${pad(rest % 60)}00`
}

function utcStamp(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

/** The zone's UTC offset at an instant, in minutes (east positive). */
export function zoneOffsetMinutes(zone: string, ms: number): number {
  return Math.round(zoneOffsetMs(ms, zone) / 60_000)
}

function offsetValue(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+"
  const abs = Math.abs(minutes)
  return `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`
}

interface Transition {
  /** The instant the new offset starts. */
  at: number
  from: number
  to: number
}

/** Offset changes between two instants, found to the second. */
export function zoneTransitions(zone: string, startMs: number, endMs: number): Transition[] {
  const STEP = 6 * 3600_000
  const out: Transition[] = []
  let prevAt = startMs
  let prev = zoneOffsetMinutes(zone, startMs)
  for (let t = startMs + STEP; t <= endMs + STEP; t += STEP) {
    const now = zoneOffsetMinutes(zone, t)
    if (now !== prev) {
      let lo = prevAt
      let hi = t
      while (hi - lo > 1000) {
        const mid = lo + Math.floor((hi - lo) / 2)
        if (zoneOffsetMinutes(zone, mid) === prev) lo = mid
        else hi = mid
      }
      out.push({ at: hi - (hi % 1000), from: prev, to: now })
      prev = now
    }
    prevAt = t
  }
  return out
}

/** A VTIMEZONE for `zone` covering the given dates. */
export function vtimezone(zone: string, first: [number, number, number], last: [number, number, number]): string[] {
  const startMs = Date.UTC(first[0], first[1] - 1, first[2]) - 2 * 86_400_000
  const endMs = Date.UTC(last[0], last[1] - 1, last[2]) + 3 * 86_400_000
  const initial = zoneOffsetMinutes(zone, startMs)
  const transitions = zoneTransitions(zone, startMs, endMs)
  // Over a year the larger offset is summer time; a short trip may see only one.
  const yearStart = Date.UTC(first[0], 0, 1)
  const yearly = [0, 3, 6, 9].map((month) => zoneOffsetMinutes(zone, yearStart + month * 30 * 86_400_000))
  const standard = Math.min(...yearly, initial)
  const kind = (offset: number) => (offset > standard ? "DAYLIGHT" : "STANDARD")

  const lines = ["BEGIN:VTIMEZONE", `TZID:${zone}`]
  const observance = (offset: number, from: number, localStart: string) => {
    lines.push(
      `BEGIN:${kind(offset)}`,
      `DTSTART:${localStart}`,
      `TZOFFSETFROM:${offsetValue(from)}`,
      `TZOFFSETTO:${offsetValue(offset)}`,
      `END:${kind(offset)}`,
    )
  }
  observance(initial, initial, "19700101T000000")
  for (const t of transitions) {
    // The onset is written in the local time that was in force before it.
    const local = new Date(t.at + t.from * 60_000)
    observance(
      t.to,
      t.from,
      `${local.getUTCFullYear()}${pad(local.getUTCMonth() + 1)}${pad(local.getUTCDate())}T${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}00`,
    )
  }
  lines.push("END:VTIMEZONE")
  return lines
}

/** "Name, Address" without repeating a name the address already starts with. */
function locationText(item: ItineraryItem): string | null {
  const loc = item.location
  if (!loc) return null
  const name = loc.name?.trim()
  const address = loc.address?.trim()
  if (name && address) return address.toLowerCase().startsWith(name.toLowerCase()) ? address : `${name}, ${address}`
  return name || address || null
}

function description(item: ItineraryItem): string | null {
  const parts: string[] = []
  if (item.notes?.trim()) parts.push(item.notes.trim())
  if (item.reservation?.confirmation) parts.push(`Confirmation: ${item.reservation.confirmation}`)
  if (item.reservation?.contact) parts.push(`Contact: ${item.reservation.contact}`)
  for (const link of item.links ?? []) parts.push(link)
  if (item.reservation?.url && !item.links?.includes(item.reservation.url)) parts.push(item.reservation.url)
  return parts.length > 0 ? parts.join("\n") : null
}

/** UIDs are global: item id plus trip id, reduced to safe characters. */
export function eventUid(trip: Pick<Trip, "id">, item: Pick<ItineraryItem, "id">): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "-")
  return `${clean(item.id)}.${clean(trip.id)}@trips.anthonyl.im`
}

/**
 * Where a timed stop ends on the day's clock (`dayEnd`): later the same day,
 * or after midnight. An end that wraps past midnight by more than 12 hours is
 * read as a slip (14:00 to 13:00), so null: the event gets the default length.
 */
export function endFor(start: number, endTime: string | undefined): number | null {
  const end = dayEnd(start, endTime)
  if (end === null || end === start) return null
  const wraps = end >= Math.floor(start / MINUTES_PER_DAY) * MINUTES_PER_DAY + MINUTES_PER_DAY
  return wraps && end - start > MAX_OVERNIGHT_MINUTES ? null : end
}

/** A local time in a zone (null: floating) on a date. */
interface Stamp {
  zone: string | null
  date: [number, number, number]
  minutes: number
}

/**
 * The arrival of a booking that ends somewhere else or on another day: its
 * `endTime` in `endTimezone` (else the day's zone), on `endDate` when given,
 * else the first such time after it leaves. Null when it has none, or it
 * would land before it leaves.
 */
function arrival(item: ItineraryItem, depart: Stamp & { zone: string }): Stamp | null {
  const booking = item.reservation
  if (!booking || (!booking.endTimezone && !booking.endDate)) return null
  const minutes = clockMinutes(item.endTime)
  if (minutes === null) return null
  const zone = validZone(booking.endTimezone) ?? depart.zone
  const leaves = zonedEpoch(isoOf(depart.date), depart.minutes, depart.zone)
  const given = parseDate(booking.endDate)
  let date = given ?? (parseDate(wallClock(leaves, zone).date) as [number, number, number])
  if (!given && zonedEpoch(isoOf(date), minutes, zone) <= leaves) date = addDays(date, 1)
  return zonedEpoch(isoOf(date), minutes, zone) > leaves ? { zone, date, minutes } : null
}

const isFlight = (item: ItineraryItem) => item.reservation?.type?.trim().toLowerCase() === "flight"
/** A booking the traveller must not miss: a reservation, or a stop marked booked. */
const isBooked = (item: ItineraryItem) => item.kind === "reservation" || item.status === "booked"

function alarmLines(item: ItineraryItem, summary: string): string[] {
  const hours = isFlight(item) ? 3 : 1
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(`${summary} · in ${hours === 1 ? "1 hour" : `${hours} hours`}`)}`,
    `TRIGGER:-PT${hours}H`,
    "END:VALARM",
  ]
}

const timeValue = (name: "DTSTART" | "DTEND", at: Stamp) =>
  `${name}${at.zone ? `;TZID=${at.zone}` : ""}:${dateTimeValue(at.date, at.minutes)}`

function eventLines(trip: Trip, day: TripDay, item: ItineraryItem, start: Stamp | null, end: Stamp | null, stamp: string, sequence: number): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${eventUid(trip, item)}`, `DTSTAMP:${stamp}`, `SEQUENCE:${sequence}`]
  const date = parseDate(day.date)!
  if (start === null) {
    lines.push(`DTSTART;VALUE=DATE:${dateValue(date)}`, `DTEND;VALUE=DATE:${dateValue(addDays(date, 1))}`, "TRANSP:TRANSPARENT")
  } else {
    lines.push(timeValue("DTSTART", start))
    if (end) lines.push(timeValue("DTEND", end))
    else lines.push(`DURATION:PT${DEFAULT_MINUTES / 60}H`)
  }
  const summary = item.title.trim() || "Stop"
  lines.push(`SUMMARY:${escapeText(summary)}`)
  const where = locationText(item)
  if (where) lines.push(`LOCATION:${escapeText(where)}`)
  const { lat, lng } = item.location ?? {}
  if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
    lines.push(`GEO:${lat.toFixed(6)};${lng.toFixed(6)}`)
  }
  const body = description(item)
  if (body) lines.push(`DESCRIPTION:${escapeText(body)}`)
  const skipped = item.status === "skipped"
  if (skipped) lines.push("STATUS:CANCELLED")
  else if (item.reservation) lines.push(`STATUS:${item.reservation.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}`)
  if (day.title?.trim()) lines.push(`CATEGORIES:${escapeText(day.title.trim())}`)
  // An all-day reminder would ring the evening before at an hour nobody chose.
  if (start !== null && !skipped && item.status !== "completed" && isBooked(item)) lines.push(...alarmLines(item, summary))
  lines.push("END:VEVENT")
  return lines
}

export interface CalendarExport {
  /** The `.ics` text, CRLF line endings, folded. */
  text: string
  /** How many events it holds. */
  events: number
}

/**
 * The trip, or one day of it (`dayId`), as an iCalendar file. `now` stamps
 * DTSTAMP; SEQUENCE follows the trip's `updatedAt`, so a later export of an
 * edited trip wins in calendars that honour it.
 */
export function tripToIcs(trip: Trip, { dayId, now }: { dayId?: string; now: number }): CalendarExport {
  const days = trip.days.filter((day) => (!dayId || day.id === dayId) && parseDate(day.date))
  const stamp = utcStamp(now)
  const updated = Date.parse(trip.updatedAt)
  // Minutes since 2020: an INTEGER (signed 32-bit) that only grows.
  const sequence = Number.isFinite(updated) ? Math.max(0, Math.floor((updated - Date.UTC(2020, 0, 1)) / 60_000)) : 0

  const events: string[] = []
  // Each zone a timed event is written in, with the first and last date it is used on.
  const zones = new Map<string, { first: [number, number, number]; last: [number, number, number] }>()
  const cover = (at: Stamp) => {
    if (!at.zone) return
    const date = addDays(at.date, Math.floor(at.minutes / MINUTES_PER_DAY))
    const seen = zones.get(at.zone)
    if (!seen) zones.set(at.zone, { first: date, last: date })
    else {
      if (isoOf(date) < isoOf(seen.first)) seen.first = date
      if (isoOf(date) > isoOf(seen.last)) seen.last = date
    }
  }
  let count = 0
  for (const day of days) {
    const date = parseDate(day.date)!
    // The day's zone, or floating times when neither the day's nor the trip's is one the runtime knows.
    const zone = validZone(day.timezone) ?? validZone(trip.timezone) ?? null
    // The day's own clock: a small-hours start after a late one is the next date. Headings never set it.
    const starts = dayStarts(day.items.map((item) => (item.kind === "section" ? {} : item)))
    for (const [index, item] of day.items.entries()) {
      if (!isCalendarItem(item)) continue
      const minutes = starts[index] ?? null
      const start: Stamp | null = minutes === null ? null : { zone, date, minutes }
      let end: Stamp | null = null
      if (start) {
        const landed = start.zone ? arrival(item, { ...start, zone: start.zone }) : null
        const until = landed ? null : endFor(start.minutes, item.endTime)
        end = landed ?? (until === null ? null : { zone, date, minutes: until })
        cover(start)
        if (end) cover(end)
      }
      events.push(...eventLines(trip, day, item, start, end, stamp, sequence))
      count += 1
    }
  }

  const tripZone = validZone(trip.timezone)
  const name = dayId && days[0] ? `${trip.name} · ${days[0].date}` : trip.name
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//anthonyl.im//Trips//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    ...(tripZone ? [`X-WR-TIMEZONE:${tripZone}`] : []),
    ...[...zones].flatMap(([zone, { first, last }]) => vtimezone(zone, first, last)),
    ...events,
    "END:VCALENDAR",
  ]
  return { text: lines.map(foldLine).join(CRLF) + CRLF, events: count }
}

/** "lisbon-2026.ics", from the slug, else the name, else the id. */
export function calendarFileName(trip: Pick<Trip, "id" | "slug" | "name">, day?: Pick<TripDay, "date">): string {
  const base =
    trip.slug?.trim() ||
    trip.name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) ||
    trip.id
  return `${base}${day ? `-${day.date}` : ""}.ics`
}

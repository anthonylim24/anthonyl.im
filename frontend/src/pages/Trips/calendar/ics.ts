import type { ItineraryItem, Trip, TripDay } from "../types"

// A trip as an iCalendar file (RFC 5545), built in the browser. Pure: the
// caller passes `now`, so the same trip always gives the same file.
//
// - Timed stops are wall-clock times in the trip's time zone
//   (`DTSTART;TZID=…`), with a VTIMEZONE built from `Intl` for the dates the
//   trip covers. An unknown zone falls back to floating times.
// - Stops with no time are all-day events on their day.
// - Each stop's UID is its item id, so importing the file again updates the
//   events instead of adding a second copy.

const CRLF = "\r\n"
const MAX_OCTETS = 75
/** A stop with a start and no end gets this long in the calendar. */
const DEFAULT_MINUTES = 60
/** An end earlier than the start is read as "after midnight" only up to this long. */
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
function parseDate(date: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const check = new Date(Date.UTC(y, mo - 1, d))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null
  return [y, mo, d]
}

/** "9:05" / "09:05" → minutes after midnight, or null. */
export function parseClock(time: string | undefined): number | null {
  if (!time) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(time.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

function addDays([y, m, d]: [number, number, number], days: number): [number, number, number] {
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return [next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()]
}

function dateValue([y, m, d]: [number, number, number]): string {
  return `${y}${pad(m)}${pad(d)}`
}

function dateTimeValue(date: [number, number, number], minutes: number): string {
  return `${dateValue(date)}T${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`
}

function utcStamp(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

/** True when `Intl` knows the zone. */
export function isKnownZone(zone: string | undefined): zone is string {
  if (!zone) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone })
    return true
  } catch {
    return false
  }
}

const offsetFormats = new Map<string, Intl.DateTimeFormat>()

/** The zone's UTC offset at an instant, in minutes (east positive). */
export function zoneOffsetMinutes(zone: string, ms: number): number {
  let format = offsetFormats.get(zone)
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    offsetFormats.set(zone, format)
  }
  const parts: Record<string, number> = {}
  for (const part of format.formatToParts(new Date(ms))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value)
  }
  const wall = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!)
  return Math.round((wall - Math.floor(ms / 1000) * 1000) / 60_000)
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

/** Stops that belong in a calendar: not headings, and notes only when timed. */
export function isCalendarItem(item: ItineraryItem): boolean {
  if (item.kind === "section") return false
  if (item.kind === "note") return parseClock(item.time) != null
  return true
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

/** End time for a timed stop: same day, after midnight, or none (default length). */
export function endFor(start: number, endTime: string | undefined): { minutes: number; nextDay: boolean } | null {
  const end = parseClock(endTime)
  if (end == null || end === start) return null
  if (end > start) return { minutes: end, nextDay: false }
  const overnight = 24 * 60 - start + end
  return overnight <= MAX_OVERNIGHT_MINUTES ? { minutes: end, nextDay: true } : null
}

function eventLines(trip: Trip, day: TripDay, date: [number, number, number], item: ItineraryItem, zone: string | null, stamp: string, sequence: number): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${eventUid(trip, item)}`, `DTSTAMP:${stamp}`, `SEQUENCE:${sequence}`]
  const start = parseClock(item.time)
  const tz = zone ? `;TZID=${zone}` : ""
  if (start == null) {
    lines.push(`DTSTART;VALUE=DATE:${dateValue(date)}`, `DTEND;VALUE=DATE:${dateValue(addDays(date, 1))}`, "TRANSP:TRANSPARENT")
  } else {
    lines.push(`DTSTART${tz}:${dateTimeValue(date, start)}`)
    const end = endFor(start, item.endTime)
    if (end) lines.push(`DTEND${tz}:${dateTimeValue(end.nextDay ? addDays(date, 1) : date, end.minutes)}`)
    else lines.push(`DURATION:PT${DEFAULT_MINUTES / 60}H`)
  }
  lines.push(`SUMMARY:${escapeText(item.title.trim() || "Stop")}`)
  const where = locationText(item)
  if (where) lines.push(`LOCATION:${escapeText(where)}`)
  const { lat, lng } = item.location ?? {}
  if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
    lines.push(`GEO:${lat.toFixed(6)};${lng.toFixed(6)}`)
  }
  const body = description(item)
  if (body) lines.push(`DESCRIPTION:${escapeText(body)}`)
  if (item.reservation) lines.push(`STATUS:${item.reservation.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}`)
  if (day.title?.trim()) lines.push(`CATEGORIES:${escapeText(day.title.trim())}`)
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
  const zone = isKnownZone(trip.timezone) ? trip.timezone : null
  const days = trip.days
    .filter((day) => !dayId || day.id === dayId)
    .flatMap((day) => {
      const date = parseDate(day.date)
      return date ? [{ day, date }] : []
    })
  const stamp = utcStamp(now)
  const updated = Date.parse(trip.updatedAt)
  // Minutes since 2020: an INTEGER (signed 32-bit) that only grows.
  const sequence = Number.isFinite(updated) ? Math.max(0, Math.floor((updated - Date.UTC(2020, 0, 1)) / 60_000)) : 0

  const events: string[] = []
  let count = 0
  let timed = false
  for (const { day, date } of days) {
    for (const item of day.items) {
      if (!isCalendarItem(item)) continue
      if (parseClock(item.time) != null) timed = true
      events.push(...eventLines(trip, day, date, item, zone, stamp, sequence))
      count += 1
    }
  }

  const name = dayId && days[0] ? `${trip.name} · ${days[0].day.date}` : trip.name
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//anthonyl.im//Trips//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    ...(zone ? [`X-WR-TIMEZONE:${zone}`] : []),
    ...(zone && timed && days.length > 0 ? vtimezone(zone, days[0]!.date, days[days.length - 1]!.date) : []),
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

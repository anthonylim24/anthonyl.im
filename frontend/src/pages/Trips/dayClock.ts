import type { Trip, TripDay } from "./types"

// One clock for a day of the trip. Live, the timeline, "sort by time" and the
// calendar export all read stop times through here, so a 1 AM bar after a
// late dinner is "after midnight" everywhere at once, and every countdown is
// taken between real instants in the zone the day is lived in.

const MINUTES_PER_DAY = 24 * 60

/** Small-hours starts (before 06:00) can belong to the night before. */
export const SMALL_HOURS_END = 6 * 60
/** ...when an earlier stop in the list starts at or after noon. */
const LATE_START = 12 * 60

/** "HH:mm" → minutes after midnight, or null when it isn't a clock time. */
export function clockMinutes(time: string | undefined | null): number | null {
  if (!time) return null
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/**
 * Each item's start on the day's own clock, in minutes from that day's
 * midnight (null when untimed). A start in the small hours listed after a
 * stop that starts at noon or later is the night's continuation, so it
 * counts from the next midnight (+1440): dinner 19:00, bar 23:00, club 01:00
 * reads 1140, 1380, 1500.
 */
export function dayStarts(items: readonly { time?: string }[]): (number | null)[] {
  let latest = -1
  return items.map((item) => {
    const start = clockMinutes(item.time)
    if (start === null) return null
    const onClock = start < SMALL_HOURS_END && latest >= LATE_START ? start + MINUTES_PER_DAY : start
    latest = Math.max(latest, onClock)
    return onClock
  })
}

/** Where an item ends on the day's clock, given where it starts: an end before the start runs past midnight. */
export function dayEnd(start: number, endTime: string | undefined | null): number | null {
  const end = clockMinutes(endTime)
  if (end === null) return null
  let at = end + Math.floor(start / MINUTES_PER_DAY) * MINUTES_PER_DAY
  if (at < start) at += MINUTES_PER_DAY
  return at
}

/** The IANA zone a day is lived in: its own when set (multi-country trips), else the trip's. */
export function dayZone(trip: Pick<Trip, "timezone">, day?: Pick<TripDay, "timezone"> | null): string {
  return validZone(day?.timezone) ?? validZone(trip.timezone) ?? "UTC"
}

/**
 * Zones already checked. Building a formatter to test one costs about a
 * millisecond on a phone, and `dayZone` runs for every day on every render of
 * the live card, the palette and the day view.
 */
const knownZones = new Map<string, boolean>()

/** The zone when the runtime knows it, else undefined. */
export function validZone(zone: string | undefined | null): string | undefined {
  if (!zone) return undefined
  let known = knownZones.get(zone)
  if (known === undefined) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone })
      known = true
    } catch {
      known = false
    }
    knownZones.set(zone, known)
  }
  return known ? zone : undefined
}

const offsetFormats = new Map<string, Intl.DateTimeFormat>()

function offsetFormat(zone: string): Intl.DateTimeFormat {
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
  return format
}

/** The zone's offset from UTC at an instant, in milliseconds. */
export function zoneOffsetMs(epoch: number, zone: string): number {
  const parts = Object.fromEntries(offsetFormat(zone).formatToParts(new Date(epoch)).map((p) => [p.type, p.value]))
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  )
  return wall - Math.floor(epoch / 1000) * 1000
}

/**
 * The instant (epoch ms) of a wall-clock time on an ISO date in a zone.
 * `minutes` may run past 1440 (the small hours after the date). Across a
 * daylight-saving change the offset in force at that wall time is used; a
 * wall time skipped by a spring-forward reads as the instant just after.
 */
export function zonedEpoch(date: string, minutes: number, zone: string): number {
  const [y, m, d] = date.split("-").map(Number)
  const wall = Date.UTC(y, m - 1, d, 0, minutes)
  let epoch = wall - zoneOffsetMs(wall, zone)
  const corrected = wall - zoneOffsetMs(epoch, zone)
  if (corrected !== epoch) epoch = corrected
  return epoch
}

/** The ISO date and minutes after midnight that an instant reads as in a zone. */
export function wallClock(epoch: number, zone: string): { date: string; minutes: number } {
  const parts = Object.fromEntries(offsetFormat(zone).formatToParts(new Date(epoch)).map((p) => [p.type, p.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
  }
}

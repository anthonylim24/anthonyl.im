import { daysBetween } from "./meta"
import type { ItineraryItem, Trip, TripDay } from "./types"

// Where the traveller sleeps. The server keeps the same rules
// (server/src/trips/lodging.ts): the planner and reviewer plan around it,
// and the workspace offers to rework the plan when it changes.

const LODGING_TYPE = /hotel|lodging|stay|hostel|resort|airbnb|rental|check[- ]?in/i

/** A booking type that means a place to sleep ("hotel", "Hotel check-in", "airbnb"). */
export function isLodgingType(type: string | undefined): boolean {
  return LODGING_TYPE.test(type ?? "")
}

/** A place to sleep: a stop in the hotel category, or a lodging booking. */
export function isLodging(item: ItineraryItem): boolean {
  if (item.kind !== "place" && item.kind !== "reservation") return false
  if (item.location?.category === "hotel") return true
  return item.kind === "reservation" && isLodgingType(item.reservation?.type)
}

export interface LodgingEntry {
  dayId: string
  itemId: string
  name: string
  key: string
}

/** Every lodging item on the trip, in day order, with a key that changes when its place does. */
export function lodgingEntries(trip: Pick<Trip, "days">): LodgingEntry[] {
  return trip.days.flatMap((day) =>
    day.items.filter(isLodging).map((item) => {
      const name = (item.location?.name || item.title).trim()
      return {
        dayId: day.id,
        itemId: item.id,
        name,
        key: `${day.id}:${name.toLowerCase()}@${item.location?.lat?.toFixed(3) ?? ""},${item.location?.lng?.toFixed(3) ?? ""}`,
      }
    }),
  )
}

/**
 * The lodging that is new or different since `before`, if any: what the
 * workspace names when it offers to rework the plan.
 */
export function changedLodging(before: readonly LodgingEntry[], after: readonly LodgingEntry[]): LodgingEntry | null {
  const known = new Set(before.map((entry) => entry.key))
  return after.find((entry) => !known.has(entry.key)) ?? null
}

/** What the reviewer is asked when the base changes. */
export function lodgingBrief(name: string): string {
  return (
    `The traveller is now staying at ${name}. Rework the plan around that base: ` +
    `days should start and end within an easy ride of it, far areas should be grouped into single days ` +
    `(swap days or move stops between days where that helps), breakfasts and last stops that are now across ` +
    `town should be replaced with nearby ones, and any long first or last leg needs a getting-there line. ` +
    `Keep bookings and the lodging itself where they are.`
  )
}

/** The stay a night belongs to: night 2 of 4 at Halekulani. */
export interface StayNight {
  /** The day the stay starts on (check-in). */
  dayId: string
  itemId: string
  name: string
  /** 1-based. */
  night: number
  nights: number
  /** Check-out date and time, when the booking says. */
  checkOutDate?: string
  checkOutTime?: string
}

interface Stay {
  index: number
  day: TripDay
  item: ItineraryItem
  /** Check-out, when it is after the check-in day. */
  until?: string
}

/**
 * Where the traveller sleeps on the night of each day. A stay with a
 * check-out date covers every night from its own day to the night before
 * check-out. One without covers its own night and each one after until the
 * next stay starts; the trip's last day is the day they leave, so the guess
 * stops short of it. A stay that starts on a day takes that night from one
 * booked earlier (the traveller moved), and the last stay listed on a day wins.
 */
export function nightsByDay(trip: Pick<Trip, "days">): Map<string, StayNight> {
  const stays: Stay[] = []
  trip.days.forEach((day, index) => {
    const item = [...day.items].reverse().find(isLodging)
    if (!item) return
    const end = item.reservation?.endDate
    stays.push({ index, day, item, until: end && end > day.date ? end : undefined })
  })
  const out = new Map<string, StayNight>()
  const lastIndex = trip.days.length - 1
  stays.forEach((stay, at) => {
    const next = stays[at + 1]?.index ?? trip.days.length
    const covered = trip.days.filter((day, index) => {
      if (index < stay.index) return false
      if (stay.until) return day.date < stay.until
      return index < next && (index === stay.index || index < lastIndex)
    })
    const nights = stay.until ? daysBetween(stay.day.date, stay.until) : covered.length
    covered.forEach((day, i) => {
      out.set(day.id, {
        dayId: stay.day.id,
        itemId: stay.item.id,
        name: (stay.item.location?.name || stay.item.title).trim(),
        night: stay.until ? daysBetween(stay.day.date, day.date) + 1 : i + 1,
        nights,
        checkOutDate: stay.until,
        checkOutTime: stay.until ? stay.item.endTime : undefined,
      })
    })
  })
  return out
}

/** Where the traveller sleeps on the night of this day, if the trip says. */
export function lodgingForNight(trip: Pick<Trip, "days">, dayId: string): StayNight | null {
  return nightsByDay(trip).get(dayId) ?? null
}

/** The stay that checks out on this date, out of `nightsByDay`'s answer. */
export function checkOutOn(nights: ReadonlyMap<string, StayNight>, date: string): StayNight | null {
  for (const night of nights.values()) {
    if (night.checkOutDate === date) return night
  }
  return null
}

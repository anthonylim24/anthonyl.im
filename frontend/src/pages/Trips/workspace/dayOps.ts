import { dayStarts } from "../dayClock"
import { addDays, daysBetween } from "../meta"
import { LIMITS } from "../limits"
import { isToSchedule } from "../map/geo"
import { makeItem, restingStatus } from "../tripEdits"
import type { ItineraryItem, Trip, TripDay } from "../types"

/**
 * The day's plan in clock order, read on the day's own clock (`dayStarts`): a
 * 01:00 stop after a 23:00 one stays last. Untimed items stay behind the timed
 * item they followed; headings travel the same way. Places parked under "To
 * schedule" keep their place under it. Sorting a sorted day changes nothing.
 */
export function sortByTime(items: readonly ItineraryItem[]): ItineraryItem[] {
  const parkedAt = items.findIndex(isToSchedule)
  const plan = parkedAt < 0 ? items : items.slice(0, parkedAt)
  const starts = dayStarts(plan.map((item) => (item.kind === "section" ? {} : item)))
  let carry = -1
  const keyed = plan.map((item, index) => {
    const start = starts[index] ?? null
    if (start !== null) carry = start
    return { item, index, key: start ?? carry }
  })
  keyed.sort((x, y) => x.key - y.key || x.index - y.index)
  return [...keyed.map((entry) => entry.item), ...items.slice(plan.length)]
}

/** "Sort stops by time" has something to do. */
export const outOfOrder = (items: readonly ItineraryItem[]) => sortByTime(items).some((item, i) => item !== items[i])

// Whole-day edits: insert, delete, duplicate and reorder days. Pure: each
// takes the trip's plan and returns the new one, or null when the edit isn't
// possible (the 60-day cap, the last day, an edge), so the caller can leave
// the document untouched.
//
// One rule holds after every edit: day i falls on startDate + i and endDate is
// the last day's date. The start never moves; the trip grows or shrinks at
// its end. A plan moves with its day (stops, title, city, notes, journal, its
// zone), and a booking that ends on a later date moves its end by as much, so
// a three-night stay stays three nights. The AI's weather stays with its date,
// as `swap_days` keeps it on the server: it was a forecast for that date, not
// for that plan.

export type DayPlan = Pick<Trip, "days" | "startDate" | "endDate">

export const canAddDay = (plan: Pick<DayPlan, "days">) => plan.days.length < LIMITS.days

/** A booking that ends on a later date (a check-out, an arrival) keeps its length when its day moves. */
function shiftEnds(items: ItineraryItem[], by: number): ItineraryItem[] {
  if (!items.some((item) => item.reservation?.endDate)) return items
  return items.map((item) =>
    item.reservation?.endDate ? { ...item, reservation: { ...item.reservation, endDate: addDays(item.reservation.endDate, by) } } : item,
  )
}

/** Dates from the start, in order; each day takes the weather already on its new date. */
function redate(plan: DayPlan, days: TripDay[]): DayPlan {
  const weatherOn = new Map(plan.days.map((day) => [day.date, day.weather]))
  const out = days.map((day, i) => {
    const date = addDays(plan.startDate, i)
    if (day.date === date) return day
    const next: TripDay = { ...day, date, items: shiftEnds(day.items, daysBetween(day.date, date)) }
    const weather = weatherOn.get(date)
    if (weather) next.weather = weather
    else delete next.weather
    return next
  })
  return { days: out, startDate: plan.startDate, endDate: addDays(plan.startDate, out.length - 1) }
}

/**
 * A day id no other day has. Random rather than the next `day-N`: two
 * people adding a day at once must not hand the merge two different days
 * under one id (it would keep one and drop the other without asking).
 */
function freshDayId(days: readonly TripDay[]): string {
  const taken = new Set(days.map((d) => d.id))
  let id: string
  do id = `day-${crypto.randomUUID().slice(0, 8)}`
  while (taken.has(id))
  return id
}

/** A blank day straight after this one, in the same city and zone; later days move a date on. */
export function insertDayAfter(plan: DayPlan, dayId: string): DayPlan | null {
  const at = plan.days.findIndex((d) => d.id === dayId)
  if (at < 0 || !canAddDay(plan)) return null
  const before = plan.days[at]!
  const day: TripDay = { id: freshDayId(plan.days), date: before.date, items: [] }
  if (before.city) day.city = before.city
  if (before.timezone) day.timezone = before.timezone
  return redate(plan, [...plan.days.slice(0, at + 1), day, ...plan.days.slice(at + 1)])
}

/** Remove a day and its plan; later days move a date earlier. A trip keeps at least one day. */
export function deleteDay(plan: DayPlan, dayId: string): DayPlan | null {
  const at = plan.days.findIndex((d) => d.id === dayId)
  if (at < 0 || plan.days.length <= 1) return null
  return redate(plan, plan.days.filter((_, i) => i !== at))
}

/**
 * A copy of the day's plan straight after it: new ids for the day and every
 * stop, and nothing about how the original went (Done, Skip, Loved it, the
 * journal), since the copy hasn't happened yet.
 */
export function duplicateDay(plan: DayPlan, dayId: string): DayPlan | null {
  const at = plan.days.findIndex((d) => d.id === dayId)
  if (at < 0 || !canAddDay(plan)) return null
  const source = structuredClone(plan.days[at]!)
  delete source.journal
  const copy: TripDay = {
    ...source,
    id: freshDayId(plan.days),
    items: source.items.map((item) => {
      const fresh = { ...item, id: makeItem(item.kind).id }
      delete fresh.highlight
      if (fresh.status === "completed" || fresh.status === "skipped") fresh.status = restingStatus(fresh)
      return fresh
    }),
  }
  return redate(plan, [...plan.days.slice(0, at + 1), copy, ...plan.days.slice(at + 1)])
}

/** Trade places with the day before (-1) or after (+1): the two plans swap dates. */
export function moveDay(plan: DayPlan, dayId: string, step: -1 | 1): DayPlan | null {
  const at = plan.days.findIndex((d) => d.id === dayId)
  const to = at + step
  if (at < 0 || to < 0 || to >= plan.days.length) return null
  const days = [...plan.days]
  ;[days[at], days[to]] = [days[to]!, days[at]!]
  return redate(plan, days)
}

/** The day to show once `dayId` is gone: the one that took its place, else the one before. */
export function dayAfterDelete(days: readonly TripDay[], dayId: string): TripDay | undefined {
  const at = days.findIndex((d) => d.id === dayId)
  return at < 0 ? undefined : (days[at + 1] ?? days[at - 1])
}

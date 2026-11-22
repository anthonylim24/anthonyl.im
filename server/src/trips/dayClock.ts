import type { ItineraryItem } from "./types"

// Where a day's stops sit in time, read the way the client reads them
// (frontend/src/pages/Trips/dayClock.ts, workspace/dayOps.ts `sortByTime`,
// tripEdits.ts `insertByTime`): a 1 AM bar after a late dinner is after
// midnight, not first thing. Every change the AI makes to a day goes
// through here, so a day the server saves reads in clock order.

const MINUTES_PER_DAY = 24 * 60
/** Small-hours starts (before 06:00) can belong to the night before... */
const SMALL_HOURS_END = 6 * 60
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
 * stop that starts at noon or later counts from the next midnight (+1440).
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

/** The heading the client parks unplaced stops under; everything after it is off the route. */
const TO_SCHEDULE = "To schedule"
export const isToSchedule = (item: ItineraryItem) => item.kind === "section" && (item.title ?? "").trim() === TO_SCHEDULE

/** The day's route, and what is parked from its "To schedule" heading on. */
export function splitPlan<T extends ItineraryItem>(items: readonly T[]): { plan: T[]; parked: T[] } {
  const at = items.findIndex(isToSchedule)
  return at < 0 ? { plan: [...items], parked: [] } : { plan: items.slice(0, at), parked: items.slice(at) }
}

/** Starts on the day's clock; a heading's time is a label, not a start. */
export const planStarts = (plan: readonly ItineraryItem[]) => dayStarts(plan.map((item) => (item.kind === "section" ? {} : item)))

/**
 * The day's plan in clock order. Untimed items and headings stay behind the
 * timed item they followed; everything from a "To schedule" heading on keeps
 * its place. Stable, so sorting a sorted day changes nothing.
 */
export function sortByTime(items: readonly ItineraryItem[]): ItineraryItem[] {
  const { plan, parked } = splitPlan(items)
  const starts = planStarts(plan)
  let carry = -1
  const keyed = plan.map((item, index) => {
    const start = starts[index] ?? null
    if (start !== null) carry = start
    return { item, index, key: start ?? carry }
  })
  keyed.sort((x, y) => x.key - y.key || x.index - y.index)
  return [...keyed.map((entry) => entry.item), ...parked]
}

/** Sorting by time would move something. */
export const outOfOrder = (items: readonly ItineraryItem[]) => sortByTime(items).some((item, i) => item !== items[i])

/** The first timed item listed above one that starts earlier, and that one. */
export function firstOutOfOrder(items: readonly ItineraryItem[]): { listedFirst: ItineraryItem; startsEarlier: ItineraryItem } | null {
  const { plan } = splitPlan(items)
  const starts = planStarts(plan)
  let previous = -1
  for (let i = 0; i < plan.length; i++) {
    const start = starts[i]
    if (start == null) continue
    if (previous >= 0 && start < starts[previous]!) return { listedFirst: plan[previous]!, startsEarlier: plan[i]! }
    previous = i
  }
  return null
}

/**
 * Insert an item where its time says it belongs on the route. Untimed items,
 * and items on a day with no times at all, go last on the route. Either way
 * they land above a "To schedule" heading, whose places stay parked.
 */
export function insertByTime(items: readonly ItineraryItem[], item: ItineraryItem): ItineraryItem[] {
  const { plan, parked } = splitPlan(items)
  const start = clockMinutes(item.time)
  const starts = dayStarts(plan)
  if (start === null || starts.every((s) => s === null)) return [...plan, item, ...parked]
  let at = plan.length
  for (let i = 0; i < plan.length; i++) {
    if (starts[i] !== null && starts[i]! > start) {
      at = i
      break
    }
  }
  // Don't strand the new item above a heading that introduces the next block.
  while (at > 0 && plan[at - 1]!.kind === "section" && (starts[at - 1] === null || starts[at - 1]! > start)) at -= 1
  return [...plan.slice(0, at), item, ...plan.slice(at), ...parked]
}

export type ProposedTimes = Record<string, { time: string; endTime?: string }>

/**
 * The item at a new start. Given no new end it keeps its length, so a
 * 45-minute stop moved to the afternoon still takes 45 minutes; an end it
 * cannot measure from the old start is dropped.
 */
export function retimed(item: ItineraryItem, at: { time: string; endTime?: string }): ItineraryItem {
  const { endTime: oldEnd, ...rest } = item
  const endTime = at.endTime ?? keptLength(item.time, oldEnd, at.time)
  return { ...rest, time: at.time, ...(endTime ? { endTime } : {}) }
}

function keptLength(oldStart: string | undefined, oldEnd: string | undefined, newStart: string): string | undefined {
  const from = clockMinutes(oldStart)
  const to = clockMinutes(newStart)
  if (from === null || to === null) return undefined
  const end = dayEnd(from, oldEnd)
  if (end === null) return undefined
  const at = (to + end - from) % MINUTES_PER_DAY
  return `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`
}

/**
 * A day in the order a reorder names, at any new times it gives. Ids no
 * longer on the day's route are passed over; items it does not name (a stop
 * added since the review) go where their time says. Nothing crosses the
 * "To schedule" heading. Null when fewer than two named items are left.
 */
export function reorderDay(items: readonly ItineraryItem[], order: readonly string[], times?: ProposedTimes): ItineraryItem[] | null {
  const { plan, parked } = splitPlan(items)
  const unnamed = new Map(plan.map((item) => [item.id, item]))
  const named: ItineraryItem[] = []
  for (const id of order) {
    const item = unnamed.get(id)
    if (!item) continue
    unnamed.delete(id)
    const at = times?.[id]
    named.push(at ? retimed(item, at) : item)
  }
  if (named.length < 2) return null
  const rest = plan.filter((item) => unnamed.has(item.id))
  return [...rest.reduce((list, item) => insertByTime(list, item), named), ...parked]
}

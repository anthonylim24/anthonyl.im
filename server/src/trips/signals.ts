import { haversineMeters } from "../data/koreaPlaces"
import type { ItineraryItem, TripDay } from "./types"

// Deterministic reading of a day, computed before any model is asked. The
// model gets these as facts ("no dinner", "3 h gap after the museum", "9 km
// hop") so its suggestions are about judgement, not arithmetic, and a few
// things (a shorter walking order) can be proposed without a model at all.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

/** Weekday name for a YYYY-MM-DD date (calendar date, no timezone drift). */
export function weekday(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return WEEKDAYS[day] ?? ""
}

export interface DayGap {
  afterItemId: string
  after: string
  before: string
  from: string
  to: string
  minutes: number
}

export interface LongLeg {
  from: string
  to: string
  km: number
}

export interface DaySignals {
  dayId: string
  /** Places + reservations (not notes or headings). */
  stops: number
  located: number
  timed: number
  hasLunch: boolean
  hasDinner: boolean
  firstTime?: string
  lastTime?: string
  gaps: DayGap[]
  longLegs: LongLeg[]
  /** Timed stops appear out of clock order in the list. */
  outOfOrder: boolean
  /** Straight-line length of the day's route through located stops, in km. */
  routeKm: number
}

const MEAL_CATEGORIES = new Set(["restaurant", "cafe", "market", "bar"])
const GAP_MINUTES = 150
const LONG_LEG_KM = 4

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
const isStop = (item: ItineraryItem) => item.kind === "place" || item.kind === "reservation"
const hasPoint = (item: ItineraryItem) => item.location?.lat != null && item.location?.lng != null
const point = (item: ItineraryItem) => ({ lat: item.location!.lat!, lng: item.location!.lng! })

function isMeal(item: ItineraryItem): boolean {
  if (!isStop(item)) return false
  if (MEAL_CATEGORIES.has(item.location?.category ?? "")) return true
  if (item.reservation?.type === "meal" || item.reservation?.type === "bar") return true
  return /\b(breakfast|brunch|lunch|dinner|supper|tapas|izakaya|bistro|restaurant|eat at)\b/i.test(item.title)
}

export function analyseDay(day: TripDay): DaySignals {
  const stops = day.items.filter(isStop)
  const timed = stops.filter((item) => item.time)
  const meals = stops.filter(isMeal)

  // A meal counts for the slot its time falls in; untimed meals fill lunch
  // first, then dinner, in list order.
  let hasLunch = false
  let hasDinner = false
  let untimedMeals = 0
  for (const meal of meals) {
    if (!meal.time) {
      untimedMeals += 1
      continue
    }
    const at = minutes(meal.time)
    if (at >= 11 * 60 && at < 15 * 60 + 30) hasLunch = true
    else if (at >= 17 * 60 + 30 && at <= 23 * 60) hasDinner = true
    else if (/\blunch\b/i.test(meal.title)) hasLunch = true
    else if (/\b(dinner|supper)\b/i.test(meal.title)) hasDinner = true
  }
  for (let i = 0; i < untimedMeals; i++) {
    if (!hasLunch) hasLunch = true
    else hasDinner = true
  }

  const gaps: DayGap[] = []
  const byClock = [...timed].sort((a, b) => a.time!.localeCompare(b.time!))
  for (let i = 1; i < byClock.length; i++) {
    const prev = byClock[i - 1]!
    const next = byClock[i]!
    const from = prev.endTime && prev.endTime > prev.time! ? prev.endTime : prev.time!
    const span = minutes(next.time!) - minutes(from)
    if (span >= GAP_MINUTES) {
      gaps.push({ afterItemId: prev.id, after: prev.title, before: next.title, from, to: next.time!, minutes: span })
    }
  }

  const located = stops.filter(hasPoint)
  const longLegs: LongLeg[] = []
  let routeMeters = 0
  for (let i = 1; i < located.length; i++) {
    const meters = haversineMeters(point(located[i - 1]!), point(located[i]!))
    routeMeters += meters
    if (meters >= LONG_LEG_KM * 1000) {
      longLegs.push({ from: located[i - 1]!.title, to: located[i]!.title, km: Math.round(meters / 100) / 10 })
    }
  }

  return {
    dayId: day.id,
    stops: stops.length,
    located: located.length,
    timed: timed.length,
    hasLunch,
    hasDinner,
    firstTime: byClock[0]?.time,
    lastTime: byClock[byClock.length - 1]?.time,
    gaps,
    longLegs,
    outOfOrder: timed.some((item, i) => i > 0 && item.time! < timed[i - 1]!.time!),
    routeKm: Math.round(routeMeters / 100) / 10,
  }
}

/** One line per fact, phrased for a model (and readable in logs). */
export function describeSignals(signals: DaySignals): string {
  const lines: string[] = []
  if (signals.stops === 0) {
    lines.push("EMPTY: no stops planned.")
    return lines.map((line) => `    ! ${line}`).join("\n")
  }
  lines.push(
    `${signals.stops} stops (${signals.timed} timed, ${signals.located} with coordinates)` +
      (signals.firstTime ? `, ${signals.firstTime}–${signals.lastTime}` : "") +
      (signals.routeKm > 0 ? `, ${signals.routeKm} km through the stops in listed order` : ""),
  )
  if (signals.stops < 4) lines.push("THIN: fewer than 4 stops.")
  if (signals.stops > 8) lines.push("PACKED: more than 8 stops.")
  if (!signals.hasLunch) lines.push("NO LUNCH on this day.")
  if (!signals.hasDinner) lines.push("NO DINNER on this day.")
  for (const gap of signals.gaps) {
    const hours = Math.round((gap.minutes / 60) * 10) / 10
    lines.push(`GAP of ${hours} h between ${JSON.stringify(gap.after)} (${gap.from}) and ${JSON.stringify(gap.before)} (${gap.to}).`)
  }
  for (const leg of signals.longLegs) {
    lines.push(`LONG HOP: ${leg.km} km from ${JSON.stringify(leg.from)} to ${JSON.stringify(leg.to)}.`)
  }
  if (signals.outOfOrder) lines.push("OUT OF ORDER: timed stops are not listed in clock order.")
  return lines.map((line, i) => `    ${i === 0 ? "·" : "!"} ${line}`).join("\n")
}

/**
 * A shorter walking order for a day whose stops carry no times (so order is
 * the traveller's only commitment). Keeps the first stop fixed, then always
 * walks to the nearest unvisited one. Returns null unless the saving is
 * worth a suggestion: at least 25% and 1 km shorter.
 *
 * Items without coordinates, notes and headings keep their place relative
 * to the located stop they followed.
 */
export function shorterRoute(day: TripDay): { order: string[]; beforeKm: number; afterKm: number } | null {
  if (day.items.some((item) => item.time || item.kind === "section")) return null
  const located = day.items.filter((item) => isStop(item) && hasPoint(item))
  if (located.length < 4) return null

  const length = (list: ItineraryItem[]) => {
    let total = 0
    for (let i = 1; i < list.length; i++) total += haversineMeters(point(list[i - 1]!), point(list[i]!))
    return total
  }

  const remaining = located.slice(1)
  const route = [located[0]!]
  while (remaining.length > 0) {
    const here = point(route[route.length - 1]!)
    let best = 0
    let bestMeters = Infinity
    remaining.forEach((candidate, i) => {
      const meters = haversineMeters(here, point(candidate))
      if (meters < bestMeters) {
        bestMeters = meters
        best = i
      }
    })
    route.push(remaining.splice(best, 1)[0]!)
  }

  const before = length(located)
  const after = length(route)
  if (before - after < 1000 || after > before * 0.75) return null

  // Carry each located stop's trailing unlocated items along with it.
  const followers = new Map<string, ItineraryItem[]>()
  const lead: ItineraryItem[] = []
  let anchor: string | null = null
  for (const item of day.items) {
    if (isStop(item) && hasPoint(item)) {
      anchor = item.id
      followers.set(anchor, [])
    } else if (anchor) followers.get(anchor)!.push(item)
    else lead.push(item)
  }
  const order = [...lead, ...route.flatMap((item) => [item, ...(followers.get(item.id) ?? [])])].map((item) => item.id)
  return { order, beforeKm: Math.round(before / 100) / 10, afterKm: Math.round(after / 100) / 10 }
}

/**
 * Insert a new item where its time says it belongs. Untimed items, and
 * items on a day with no times at all, go to the end.
 */
export function insertByTime(items: readonly ItineraryItem[], item: ItineraryItem): ItineraryItem[] {
  if (!item.time || !items.some((existing) => existing.time)) return [...items, item]
  let at = items.length
  for (let i = 0; i < items.length; i++) {
    const existing = items[i]!
    if (existing.time && existing.time > item.time) {
      at = i
      break
    }
  }
  // Don't strand the new item above a heading that introduces the next block.
  while (at > 0 && items[at - 1]!.kind === "section" && (!items[at - 1]!.time || items[at - 1]!.time! > item.time)) at -= 1
  return [...items.slice(0, at), item, ...items.slice(at)]
}

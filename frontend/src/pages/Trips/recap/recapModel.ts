import { budgetSummary, CATEGORY_LABEL, type Rates } from "../budget/budget"
import { dayZone, wallClock } from "../dayClock"
import { distanceMeters, isLocated, splitDay, type LngLat } from "../map/geo"
import { formatRange, resolveAccent } from "../meta"
import type { ExpenseCategory, ItineraryItem, Trip, TripAccent, TripDay } from "../types"

// The trip's recap, as figures: what was done, not what was planned. Pure.
//
// A place counts as visited when it was marked done, or when its day is over
// (in that day's own zone) and it was not skipped. Places parked under "To
// schedule" count only when marked done: they were ideas, not the plan. The
// distance is straight lines between the visited, pinned places in trip
// order, so it is an "about" figure.

export interface RecapStop {
  dayId: string
  itemId: string
  title: string
  /** 1-based. */
  dayNumber: number
  city: string | null
}

export interface RecapExcerpt {
  dayId: string
  dayNumber: number
  date: string
  text: string
}

export interface RecapCategory {
  category: ExpenseCategory
  label: string
  amount: number
  /** Of everything spent, 0–1. */
  share: number
}

export interface RecapSpend {
  currency: string
  total: number
  /** Largest first; only categories with money spent. */
  categories: RecapCategory[]
  /** Currencies with no rate: those amounts are left out. */
  unconverted: string[]
}

export interface Recap {
  name: string
  dates: string
  accent: TripAccent
  /** Days begun so far (every day once the trip is over). */
  days: number
  totalDays: number
  over: boolean
  places: number
  /** Distinct day cities among the days begun, in trip order. */
  cities: string[]
  /** Metres, straight line, between visited pinned places in order. */
  distance: number
  /** The visited pinned places, in order: the map. */
  points: LngLat[]
  loved: RecapStop[]
  journal: RecapExcerpt[]
  /** Null when nothing was spent. */
  spend: RecapSpend | null
}

/** A journal excerpt's length, in characters as people count them. */
export const EXCERPT_CHARS = 220

const isStop = (item: ItineraryItem) => item.kind !== "section" && item.kind !== "note"

// `Intl.Segmenter` (ES2022; the app's lib is ES2020): graphemes where the browser has it, code points otherwise.
type GraphemeSegmenter = { segment(text: string): Iterable<{ segment: string }> }
const Segmenter = (Intl as unknown as { Segmenter?: new (locale: undefined, options: { granularity: "grapheme" }) => GraphemeSegmenter }).Segmenter
const segmenter = Segmenter ? new Segmenter(undefined, { granularity: "grapheme" }) : null

function characters(text: string): string[] {
  return segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text)
}

/**
 * The start of a journal entry: at most `max` characters (graphemes, so
 * Korean syllables and emoji stay whole), cut at a space when one is near
 * the end, with an ellipsis when anything was left out.
 */
export function excerpt(text: string, max = EXCERPT_CHARS): string {
  const clean = text.replace(/\s+/g, " ").trim()
  const chars = characters(clean)
  if (chars.length <= max) return clean
  let cut = chars.slice(0, max)
  const space = cut.lastIndexOf(" ")
  if (space >= max * 0.6) cut = cut.slice(0, space)
  return `${cut.join("").replace(/[\s,;:.–—-]+$/u, "")}…`
}

function dayCity(day: TripDay): string | null {
  return day.city?.trim() || null
}

export function tripRecap(trip: Trip, rates: Rates, now: number): Recap {
  const today = (day: TripDay) => wallClock(now, dayZone(trip, day)).date
  const begun = trip.days.filter((day) => day.date <= today(day))
  const last = trip.days[trip.days.length - 1]
  const over = last !== undefined && last.date < today(last)

  let places = 0
  const points: LngLat[] = []
  const loved: RecapStop[] = []
  const journal: RecapExcerpt[] = []
  trip.days.forEach((day, index) => {
    const dayOver = day.date < today(day)
    const { planned, parked } = splitDay(day)
    const visited = (item: ItineraryItem) => isStop(item) && (item.status === "completed" || (dayOver && item.status !== "skipped"))
    for (const item of [...planned.filter(visited), ...parked.filter((item) => isStop(item) && item.status === "completed")]) {
      places += 1
      if (isLocated(item) && planned.includes(item)) points.push({ lat: item.location.lat, lng: item.location.lng })
    }
    for (const item of day.items) {
      if (!isStop(item) || !item.highlight || item.status === "skipped") continue
      const title = (item.title || item.location?.name || "").trim()
      if (title) loved.push({ dayId: day.id, itemId: item.id, title, dayNumber: index + 1, city: dayCity(day) })
    }
    const entry = day.journal?.trim()
    if (entry) journal.push({ dayId: day.id, dayNumber: index + 1, date: day.date, text: excerpt(entry) })
  })

  let distance = 0
  for (let i = 1; i < points.length; i++) distance += distanceMeters(points[i - 1]!, points[i]!)

  const seen = new Set<string>()
  const cities: string[] = []
  for (const day of begun) {
    const city = dayCity(day)
    if (city && !seen.has(city.toLowerCase())) {
      seen.add(city.toLowerCase())
      cities.push(city)
    }
  }

  const summary = budgetSummary(trip, rates)
  const spent = summary.byCategory.filter((row) => row.spent > 0).sort((x, y) => y.spent - x.spent)
  const spend: RecapSpend | null =
    summary.spent > 0
      ? {
          currency: summary.currency,
          total: summary.spent,
          categories: spent.map((row) => ({
            category: row.category,
            label: CATEGORY_LABEL[row.category],
            amount: row.spent,
            share: row.spent / summary.spent,
          })),
          unconverted: summary.unconverted,
        }
      : null

  return {
    name: trip.name.trim() || "Untitled trip",
    dates: formatRange(trip.startDate, trip.endDate),
    accent: resolveAccent(trip.appearance?.accent),
    days: begun.length,
    totalDays: trip.days.length,
    over,
    places,
    cities,
    distance,
    points,
    loved,
    journal,
    spend,
  }
}

/** "1,240 km", "8.4 km", "600 m": the distance as the recap says it. */
export function formatTravelled(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`
  const km = meters / 1000
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString("en-US")} km`
}

/** The figures in one line, for the share card's alt text and screen readers. */
export function recapLine(recap: Recap): string {
  const parts = [
    recap.over ? `${recap.days} ${recap.days === 1 ? "day" : "days"}` : `${recap.days} of ${recap.totalDays} days`,
    `${recap.places} ${recap.places === 1 ? "place" : "places"}`,
  ]
  if (recap.cities.length > 0) parts.push(`${recap.cities.length} ${recap.cities.length === 1 ? "city" : "cities"}`)
  if (recap.distance >= 1000) parts.push(`about ${formatTravelled(recap.distance)}`)
  return parts.join(" · ")
}

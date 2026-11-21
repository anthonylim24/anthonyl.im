import { dayRoute, distanceMeters, isLocated, routeMeters, splitDay, tripDots, type LngLat } from "../map/geo"
import { dayCount, formatRange, formatTripDate, plural, resolveAccent, STATUS_LABEL, titleCase } from "../meta"
import { formatDistance, formatWalkMinutes } from "../reservationView"
import type { ItineraryItem, Trip, TripAccent, TripDay } from "../types"

// What a printed or copied itinerary says, worked out once from the trip.
// Pure: the print document and the text export both read from here, so a
// stop is described the same way on paper and in a message.

// ── Stops ────────────────────────────────────────────────────────────────

/** One stop, as a reader needs it: what it is, its booking, where it is. */
export interface StopFacts {
  title: string
  /** The location's name, when it says more than the title. */
  place: string | null
  /** Booking type or place category: "Flight", "Restaurant". */
  category: string | null
  /** "Booked", "Optional"… Never "No status". */
  status: string | null
  confirmation: string | null
  address: string | null
  notes: string | null
}

const clean = (text: string | undefined | null): string | null => text?.trim() || null

export function stopFacts(item: ItineraryItem): StopFacts {
  const name = clean(item.location?.name)
  const title = clean(item.title) ?? name ?? (item.kind === "note" ? "Note" : "Untitled stop")
  const place = name && !title.toLowerCase().includes(name.toLowerCase()) ? name : null
  // Same reading as the stop card: a booking says its type, a place its category.
  const category =
    item.kind === "reservation"
      ? titleCase(item.reservation?.type ?? "Booking")
      : item.location?.category
        ? titleCase(item.location.category)
        : null
  return {
    title,
    place,
    category,
    status: item.status === "none" ? null : STATUS_LABEL[item.status],
    confirmation: clean(item.reservation?.confirmation),
    address: clean(item.location?.address),
    notes: clean(item.notes),
  }
}

/** A note with nothing written in it says nothing on paper either. */
const isBlankNote = (item: ItineraryItem) => item.kind === "note" && !clean(item.title) && !clean(item.notes)

/** Stops and bookings count; headings and notes do not (as on the day page). */
const isStop = (item: ItineraryItem) => item.kind !== "section" && item.kind !== "note"

/** "1.2 km · 15 min walk", or "14 km · ride" past a walk. Mirrors the day list. */
export function legLabel(meters: number): string {
  return meters < 2000 ? `${formatDistance(meters)} · ${formatWalkMinutes(meters)}` : `${formatDistance(meters)} · ride`
}

/** Legs shorter than this are the same place, not a walk. */
const MIN_LEG_M = 40

// ── Days ─────────────────────────────────────────────────────────────────

export type PlanRow =
  | { k: "section"; id: string; title: string; time: string | null }
  | {
      k: "stop"
      item: ItineraryItem
      /** Its number on the day's map; null when it has no pin. */
      pin: number | null
      /** Straight-line leg from this stop to the next numbered one. */
      leg: string | null
    }

export interface DayPlan {
  /** The day's plan proper, in order. */
  rows: PlanRow[]
  /** Places parked under "To schedule": unnumbered, off the route. */
  parked: ItineraryItem[]
  stops: number
  toSchedule: number
  /** Pinned stops on the route, in order (what the map draws). */
  route: LngLat[]
  meters: number
  empty: boolean
}

export function planDay(day: TripDay): DayPlan {
  const { planned, parked } = splitDay(day)
  const rows: PlanRow[] = []
  let pins = 0
  let last: { row: Extract<PlanRow, { k: "stop" }>; at: LngLat } | null = null
  for (const item of planned) {
    if (item.kind === "section") {
      const title = clean(item.title)
      if (title) rows.push({ k: "section", id: item.id, title, time: clean(item.time) })
      continue
    }
    if (isBlankNote(item)) continue
    const row: Extract<PlanRow, { k: "stop" }> = { k: "stop", item, pin: null, leg: null }
    if (isLocated(item)) {
      row.pin = ++pins
      const at = { lat: item.location.lat, lng: item.location.lng }
      if (last) {
        const meters = distanceMeters(last.at, at)
        if (meters >= MIN_LEG_M) last.row.leg = legLabel(meters)
      }
      last = { row, at }
    }
    rows.push(row)
  }
  const kept = parked.filter((item) => item.kind !== "section" && !isBlankNote(item))
  const route = dayRoute(day)
  return {
    rows,
    parked: kept,
    stops: planned.filter(isStop).length,
    toSchedule: kept.filter(isStop).length,
    route,
    meters: routeMeters(route),
    empty: rows.every((row) => row.k === "section") && kept.length === 0,
  }
}

/** The day's city, when the trip says which one. */
export function dayCity(trip: Pick<Trip, "destinations">, day: Pick<TripDay, "city">): string | null {
  return clean(day.city) ?? (trip.destinations.length === 1 ? clean(trip.destinations[0]) : null)
}

/** "18° / 9° Clear". */
export function weatherLabel(day: Pick<TripDay, "weather">): string | null {
  const w = day.weather
  if (!w) return null
  return `${Math.round(w.highC)}° / ${Math.round(w.lowC)}° ${w.condition}`.trim()
}

/** "5 stops · 4.2 km · 2 to schedule", as the day page says it. */
export function daySummary(plan: DayPlan): string {
  return (
    plural(plan.stops, "stop") +
    (plan.meters > 100 ? ` · ${formatDistance(plan.meters)}` : "") +
    (plan.toSchedule > 0 ? ` · ${plan.toSchedule} to schedule` : "")
  )
}

// ── Bookings ─────────────────────────────────────────────────────────────

export interface PrintBooking {
  id: string
  dayNumber: number
  /** "Tue, May 26". */
  date: string
  time: string | null
  title: string
  /** "Flight · Confirmed". */
  kind: string
  confirmation: string | null
  /** Phone, email or booking link. */
  contact: string | null
  address: string | null
}

/** Every booking on the trip, parked ones included, in day order. */
export function tripBookings(trip: Trip): PrintBooking[] {
  return trip.days.flatMap((day, index) =>
    day.items
      .filter((item) => item.kind === "reservation")
      .map((item): PrintBooking => {
        const facts = stopFacts(item)
        const state = item.reservation ? titleCase(item.reservation.status) : facts.status
        return {
          id: item.id,
          dayNumber: index + 1,
          date: formatTripDate(day.date, trip.timezone),
          time: clean(item.time),
          title: facts.place ? `${facts.title} · ${facts.place}` : facts.title,
          kind: [facts.category, state].filter(Boolean).join(" · "),
          confirmation: facts.confirmation,
          contact: clean(item.reservation?.contact) ?? clean(item.reservation?.url),
          address: facts.address,
        }
      }),
  )
}

// ── The printed document ─────────────────────────────────────────────────

/** A map still to draw: the whole trip, or one day's route. */
export interface PrintStill {
  key: string
  points: LngLat[]
  center?: LngLat
}

export const TRIP_STILL = "trip"
export const dayStillKey = (day: Pick<TripDay, "id">) => `day:${day.id}`

export interface PrintDay {
  id: string
  number: number
  /** "Day 3 · Thursday, May 28 · Seoul". */
  eyebrow: string
  /** The day's own title, if it has one. */
  title: string | null
  /** "Thursday, May 28". */
  date: string
  weather: string | null
  summary: string
  notes: string | null
  callouts: string[]
  plan: DayPlan
  /** Set when the day has pins to draw. */
  stillKey: string | null
}

export interface PrintDocument {
  name: string
  accent: TripAccent
  /** "May 26 – Jun 6, 2026 · 12 days". */
  dates: string
  destinations: string | null
  description: string | null
  /** "14 stops · 5 bookings · 10 of 12 days planned". */
  summary: string
  /** "Printed Nov 20, 2026": paper goes stale, so it says when. */
  printed: string
  /** Every pinned stop, for the cover chart when no still arrives. */
  points: LngLat[]
  /** Trip first, then each day in order. */
  stills: PrintStill[]
  days: PrintDay[]
  bookings: PrintBooking[]
}

function printedLabel(now: number): string {
  const date = new Date(now)
  return `Printed ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
}

export function printDocument(trip: Trip, now: number): PrintDocument {
  const days = trip.days.map((day, index): PrintDay => {
    const plan = planDay(day)
    const city = dayCity(trip, day)
    const date = formatTripDate(day.date, trip.timezone, { weekday: "long", month: "long" })
    return {
      id: day.id,
      number: index + 1,
      eyebrow: [`Day ${index + 1}`, date, city].filter(Boolean).join(" · "),
      title: clean(day.title),
      date,
      weather: weatherLabel(day),
      summary: daySummary(plan),
      notes: clean(day.notes),
      callouts: (day.callouts ?? []).map((callout) => callout.body.trim()).filter(Boolean),
      plan,
      stillKey: plan.route.length > 0 ? dayStillKey(day) : null,
    }
  })
  const points = tripDots(trip)
  const stills: PrintStill[] = []
  if (points.length > 0 || trip.center) stills.push({ key: TRIP_STILL, points, center: trip.center })
  for (const day of days) if (day.stillKey) stills.push({ key: day.stillKey, points: day.plan.route })

  const bookings = tripBookings(trip)
  const stops = days.reduce((sum, day) => sum + day.plan.stops + day.plan.toSchedule, 0)
  const planned = days.filter((day) => !day.plan.empty).length
  const daysLabel = planned === days.length ? `${plural(days.length, "day")} planned` : `${planned} of ${plural(days.length, "day")} planned`

  return {
    name: clean(trip.name) ?? "Untitled trip",
    accent: resolveAccent(trip.appearance?.accent),
    dates: `${formatRange(trip.startDate, trip.endDate)} · ${plural(dayCount(trip.startDate, trip.endDate), "day")}`,
    destinations: trip.destinations.map((d) => d.trim()).filter(Boolean).join(" · ") || null,
    description: clean(trip.description),
    summary: [plural(stops, "stop"), plural(bookings.length, "booking"), daysLabel].join(" · "),
    printed: printedLabel(now),
    points,
    stills,
    days,
    bookings,
  }
}

// ── Print colours ────────────────────────────────────────────────────────

function luminance(hex: string): number {
  const value = Number.parseInt(hex.replace("#", ""), 16)
  const channel = (shift: number) => {
    const c = ((value >> shift) & 0xff) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
}

export const PRINT_INK = "#14171a"
export const PRINT_PAPER = "#ffffff"

/**
 * The ink for a pin number on an accent fill: whichever of ink or paper
 * contrasts more (WCAG). Checked, not eyeballed, and it holds when a
 * black-and-white printer turns the fill grey.
 */
export function inkOn(fill: string): string {
  const l = luminance(fill)
  const onPaper = (luminance(PRINT_PAPER) + 0.05) / (l + 0.05)
  const onInk = (l + 0.05) / (luminance(PRINT_INK) + 0.05)
  return onInk >= onPaper ? PRINT_INK : PRINT_PAPER
}

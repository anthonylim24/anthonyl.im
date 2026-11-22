import {
  BedDouble,
  Building2,
  Bus,
  Car,
  CalendarClock,
  Camera,
  Church,
  Coffee,
  Landmark,
  MapPin,
  Martini,
  Mosque,
  PartyPopper,
  Plane,
  Ship,
  ShoppingBag,
  StickyNote,
  Store,
  Ticket,
  TrainFront,
  Trees,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react"
import type { ItemKind, ItemStatus, TripAccent, TripSummary } from "./types"

// Pure display helpers for trips: accents, dates, icons, labels.

export const DEFAULT_ACCENT: TripAccent = "amber"
export const TRIP_ACCENTS: readonly TripAccent[] = ["rose", "amber", "emerald", "sky", "violet"]
export const ACCENT_LABEL: Record<TripAccent, string> = {
  rose: "Poppy",
  amber: "Saffron",
  emerald: "Jade",
  sky: "Cobalt",
  violet: "Iris",
}

/** Accent fills as literals, for canvases that can't read CSS variables. Mirrors index.css. */
export const ACCENT_FILL: Record<TripAccent, string> = {
  rose: "#e5484d",
  amber: "#f2a71b",
  emerald: "#0f9b76",
  sky: "#2f7bf0",
  violet: "#7c5cff",
}

/** Safe accent lookup — never returns undefined for bad runtime data. */
export function resolveAccent(accent?: string | null): TripAccent {
  return TRIP_ACCENTS.includes(accent as TripAccent) ? (accent as TripAccent) : DEFAULT_ACCENT
}

/** Bookkeeping the migration left behind, not trip metadata a reader wants. */
const HIDDEN_TAGS = new Set(["migrated"])
export function visibleTags(tags: readonly string[]): string[] {
  return tags.filter((tag) => !HIDDEN_TAGS.has(tag))
}

// ── Dates ────────────────────────────────────────────────────────────────
// A trip's dates are calendar dates ("2026-07-10"), the same day in every
// zone, so they are formatted in UTC. Only "what is today" depends on a zone.

const noonUtc = (iso: string) => new Date(`${iso}T12:00:00Z`)

// Building an Intl.DateTimeFormat costs far more than using one, and a day
// rail formats three labels per day on every render. Each kind of format is
// kept under a key of the few things that vary in it (not a JSON of its
// options: these run hundreds of times a render).

/** The parts of a trip date a caller can change. */
export type TripDateParts = Pick<Intl.DateTimeFormatOptions, "weekday" | "month" | "day" | "year">

const TRIP_DATE: TripDateParts = { weekday: "short", month: "short", day: "numeric" }
const tripDateFormats = new Map<string, Intl.DateTimeFormat>()

function tripDateFormat(opts?: TripDateParts): Intl.DateTimeFormat {
  const parts = opts ? { ...TRIP_DATE, ...opts } : TRIP_DATE
  const key = `${parts.weekday}|${parts.month}|${parts.day}|${parts.year}`
  let format = tripDateFormats.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { ...parts, timeZone: "UTC" })
    tripDateFormats.set(key, format)
  }
  return format
}

/**
 * The page's first Intl date format costs some 30 ms on a slow phone, which
 * ever format it is: the runtime loading its locale data. The workspace calls
 * this while the trip is on its way, so that cost isn't paid between the trip
 * arriving and it being drawn.
 */
export function warmDateFormats(): void {
  tripDateFormat()
}

/**
 * "Fri, Jul 10" for a trip date; `opts` replaces any part (pass `undefined` to
 * drop one). `_timezone` is ignored: a trip date is a calendar date, and
 * formatting its noon in a zone 12 or more hours ahead of UTC named the next
 * day. Never throws: an unreadable date comes back as the raw string.
 */
export function formatTripDate(iso: string, _timezone?: string, opts?: TripDateParts): string {
  const date = noonUtc(iso)
  if (Number.isNaN(date.getTime())) return iso ?? ""
  try {
    return tripDateFormat(opts).format(date)
  } catch {
    return iso
  }
}

const todayFormats = new Map<string, Intl.DateTimeFormat>()

/** Today's date in `timezone`, "YYYY-MM-DD"; UTC's for a zone the runtime does not know. */
export function todayIsoIn(timezone: string): string {
  try {
    let format = todayFormats.get(timezone)
    if (!format) {
      format = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" })
      todayFormats.set(timezone, format)
    }
    return format.format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

let monthFormat: Intl.DateTimeFormat | null = null
let monthYearFormat: Intl.DateTimeFormat | null = null

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000)
}

export function dayCount(startIso: string, endIso: string): number {
  return Math.max(1, daysBetween(startIso, endIso) + 1)
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** "May 26 – Jun 6, 2026" / "May 26 – 30, 2026" / "May 26, 2026". */
export function formatRange(startIso: string, endIso: string): string {
  const start = noonUtc(startIso)
  const end = noonUtc(endIso)
  monthFormat ??= new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
  const month = (d: Date) => monthFormat!.format(d)
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear()
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth()
  const year = end.getUTCFullYear()
  if (startIso === endIso) return `${month(start)} ${start.getUTCDate()}, ${year}`
  if (sameMonth) return `${month(start)} ${start.getUTCDate()} – ${end.getUTCDate()}, ${year}`
  if (sameYear) return `${month(start)} ${start.getUTCDate()} – ${month(end)} ${end.getUTCDate()}, ${year}`
  return `${month(start)} ${start.getUTCDate()}, ${start.getUTCFullYear()} – ${month(end)} ${end.getUTCDate()}, ${year}`
}

export type TripPhase = "now" | "upcoming" | "past"

export interface TripTiming {
  phase: TripPhase
  /** Short status: "Day 3 of 12", "In 23 days", "Tomorrow", "May 2026". */
  label: string
  /** Days until departure (negative once it has started). */
  daysAway: number
}

export function tripTiming(trip: Pick<TripSummary, "startDate" | "endDate" | "timezone">): TripTiming {
  const today = todayIsoIn(trip.timezone)
  const daysAway = daysBetween(today, trip.startDate)
  if (today > trip.endDate) {
    monthYearFormat ??= new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
    return { phase: "past", daysAway, label: monthYearFormat.format(noonUtc(trip.startDate)) }
  }
  if (today >= trip.startDate) {
    return {
      phase: "now",
      daysAway,
      label: `Day ${daysBetween(trip.startDate, today) + 1} of ${dayCount(trip.startDate, trip.endDate)}`,
    }
  }
  const label =
    daysAway === 1
      ? "Tomorrow"
      : daysAway < 14
        ? `In ${daysAway} days`
        : daysAway < 60
          ? `In ${Math.round(daysAway / 7)} weeks`
          : `In ${Math.round(daysAway / 30)} months`
  return { phase: "upcoming", daysAway, label }
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** "09:30" → "9:30 AM". Leaves anything unexpected untouched. */
export function formatClock(time?: string): string {
  if (!time) return ""
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) return time
  const hour = Number(match[1])
  return `${hour % 12 === 0 ? 12 : hour % 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`
}

/**
 * Read a typed time: "8", "8a", "8:30", "830pm", "2 pm", "14:00", "noon".
 * Returns "HH:MM", or null when it isn't a time.
 */
export function parseClock(text: string): string | null {
  const raw = text.trim().toLowerCase().replace(/\./g, "")
  if (raw === "noon") return "12:00"
  if (raw === "midnight") return "00:00"
  const match = /^(\d{1,2})(?::?(\d{2}))?\s*(a|am|p|pm)?$/.exec(raw)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const half = match[3]?.[0]
  if (minute > 59) return null
  if (half) {
    if (hour < 1 || hour > 12) return null
    if (half === "p" && hour < 12) hour += 12
    if (half === "a" && hour === 12) hour = 0
  } else if (hour > 23) return null
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

// ── Icons + labels ───────────────────────────────────────────────────────

// Car rental is "car", never "…rental": lodging.ts reads /rental/ as a place to sleep.
export const RESERVATION_TYPES = [
  "flight",
  "hotel",
  "car",
  "train",
  "bus",
  "ferry",
  "transit",
  "meal",
  "bar",
  "experience",
  "event",
  "appointment",
] as const

const reservationTypeIcon: Record<string, LucideIcon> = {
  flight: Plane,
  hotel: BedDouble,
  meal: UtensilsCrossed,
  bar: Martini,
  experience: Ticket,
  transit: TrainFront,
  train: TrainFront,
  bus: Bus,
  ferry: Ship,
  car: Car,
  event: PartyPopper,
  appointment: CalendarClock,
  wedding: Church,
}

const placeCategoryIcon: Record<string, LucideIcon> = {
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  bar: Martini,
  market: Store,
  shopping: ShoppingBag,
  museum: Landmark,
  palace: Landmark,
  // Places of worship arrive under many names (the AI says "shrine"; seeds and imports say "temple").
  // Church's cross is kept for churches: a shrine or a temple takes the columned hall.
  shrine: Landmark,
  temple: Landmark,
  pagoda: Landmark,
  monastery: Landmark,
  synagogue: Landmark,
  place_of_worship: Landmark,
  church: Church,
  cathedral: Church,
  chapel: Church,
  basilica: Church,
  mosque: Mosque,
  park: Trees,
  viewpoint: Camera,
  experience: Ticket,
  landmark: Landmark,
  neighborhood: Building2,
  hotel: BedDouble,
  transit: TrainFront,
  venue: Ticket,
}

export function itemIcon(kind: ItemKind, category?: string, reservationType?: string): LucideIcon {
  if (kind === "reservation") return reservationTypeIcon[reservationType ?? ""] ?? Ticket
  if (kind === "note") return StickyNote
  return placeCategoryIcon[category?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? ""] ?? MapPin
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  none: "No status",
  optional: "Optional",
  booked: "Booked",
  completed: "Done",
  skipped: "Skipped",
  needs_review: "Needs review",
}

export function titleCase(text: string): string {
  return text.replace(/[_-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase())
}

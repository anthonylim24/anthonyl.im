import {
  BedDouble,
  Building2,
  CalendarClock,
  Camera,
  Church,
  Coffee,
  Landmark,
  MapPin,
  Martini,
  PartyPopper,
  Plane,
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

// ── Dates (all computed in the trip's timezone) ──────────────────────────

const noonUtc = (iso: string) => new Date(`${iso}T12:00:00Z`)

export function formatTripDate(iso: string, timezone: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
    ...opts,
  }).format(noonUtc(iso))
}

export function todayIsoIn(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

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
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
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
    return {
      phase: "past",
      daysAway,
      label: noonUtc(trip.startDate).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
    }
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

export const RESERVATION_TYPES = [
  "flight",
  "hotel",
  "meal",
  "bar",
  "experience",
  "transit",
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
  shrine: Church,
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
  return placeCategoryIcon[category ?? ""] ?? MapPin
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  none: "No status",
  optional: "Optional",
  booked: "Booked",
  completed: "Done",
  needs_review: "Needs review",
}

export function titleCase(text: string): string {
  return text.replace(/[_-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase())
}

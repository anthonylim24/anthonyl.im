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
import type { ItemStatus, SuggestionKind, TripAccent } from "./types"

// Generic dossier theme system — the Korea itinerary's visual language,
// parameterized by trip accent and timezone.
//
// The accent itself lives in CSS: `data-trip-accent="<accent>"` on a
// trip-scoped subtree (see the `.trips` block in index.css) sets `--ta`,
// `--ta-strong`, `--ta-soft`, `--ta-ring`, `--ta-bloom-a`, `--ta-bloom-b`
// plus the shared `--trips-accent` / `--trips-focus` chrome vars. Everything
// below is one set of class strings over those variables, so a page never
// branches on which accent a trip uses.

export interface AccentTheme {
  /** Hero radial bloom layers (accent top-right, warm echo bottom-left). */
  bloomA: string
  bloomB: string
  /** Accent text: countdowns, eyebrow numerals, status lines. */
  text: string
  /** Hover/pressed accent text. */
  textStrong: string
  /** Accent text that darkens with the enclosing `group`. */
  textHover: string
  /** Small dots, pips, filled timeline markers. */
  dot: string
  /** Tint background for "now" / "just changed" surfaces. */
  softBg: string
  /** Accent border for tinted panels and active states. */
  border: string
  /** Hairline rules next to eyebrows. */
  hairline: string
  /** Static accent ring (flash highlight, active rail segment). */
  ring: string
  /** Focus ring on trip-scoped surfaces. */
  focusRing: string
}

export const ACCENT: AccentTheme = {
  bloomA: "trip-bloom-a",
  bloomB: "trip-bloom-b",
  text: "text-[color:var(--ta)]",
  textStrong: "text-[color:var(--ta-strong)]",
  textHover: "group-hover:text-[color:var(--ta-strong)]",
  dot: "bg-[color:var(--ta)]",
  softBg: "bg-[color:var(--ta-soft)]",
  border: "border-[color:var(--ta-ring)]",
  hairline: "bg-[color:var(--ta-ring)]",
  ring: "ring-[color:var(--ta-ring)]",
  focusRing: "focus-visible:ring-[color:var(--ta-ring)]",
}

export const DEFAULT_ACCENT: TripAccent = "amber"

/** Picker order — also the set `resolveAccent` validates against. */
export const TRIP_ACCENTS: readonly TripAccent[] = ["rose", "amber", "emerald", "sky", "violet"]

/** Literal swatch colors — the one place per-accent hues are still named,
 *  because the appearance picker has to show all five at once. */
export const ACCENT_SWATCH: Record<TripAccent, string> = {
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
}

/** Safe accent lookup — never returns undefined for bad runtime data. */
export function resolveAccent(accent?: string | null): TripAccent {
  return TRIP_ACCENTS.includes(accent as TripAccent) ? (accent as TripAccent) : DEFAULT_ACCENT
}

// ── Item display metadata ────────────────────────────────────────────────

export const itemStatusMeta: Record<ItemStatus, { label: string; chip: string; dot: string } | null> = {
  none: null,
  booked: {
    label: "Booked",
    chip: "bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-900/60",
    dot: "bg-emerald-600 dark:bg-emerald-400",
  },
  optional: {
    label: "Optional",
    chip: "bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-900/60 dark:text-stone-300 dark:border-stone-700",
    dot: "bg-stone-400 dark:bg-stone-500",
  },
  needs_review: {
    label: "Needs review",
    chip: "bg-amber-50 text-amber-950 border-amber-300 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-900/60",
    dot: "bg-amber-600 dark:bg-amber-400",
  },
  completed: {
    label: "Done",
    chip: "bg-stone-100 text-stone-600 border-stone-300 dark:bg-stone-900/60 dark:text-stone-400 dark:border-stone-800",
    dot: "bg-stone-400 dark:bg-stone-600",
  },
}

/** Suggestion kinds collapse to three tints: added, removed, everything else. */
export function suggestionBadgeClass(kind: SuggestionKind): string {
  switch (kind) {
    case "add":
      return "bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-900/60"
    case "remove":
      return "bg-red-50 text-red-900 border-red-300 dark:bg-red-950/40 dark:text-red-100 dark:border-red-900/60"
    default:
      return "bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-900/70 dark:text-stone-300 dark:border-stone-700"
  }
}

// ── Icons — Lucide only; user-entered emoji (day.emoji, callout.icon) is
//    content and stays text. ────────────────────────────────────────────

export const reservationTypeIcon: Record<string, LucideIcon> = {
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

export const placeCategoryIcon: Record<string, LucideIcon> = {
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

export function itemIcon(kind: string, category?: string, reservationType?: string): LucideIcon {
  if (kind === "reservation" && reservationType) return reservationTypeIcon[reservationType] ?? Ticket
  if (category) return placeCategoryIcon[category] ?? MapPin
  return kind === "note" ? StickyNote : MapPin
}

export function calloutTone(tone: "info" | "warn" | "success" | "alert"): string {
  switch (tone) {
    case "info":
      return "border-stone-200 bg-stone-50/80 dark:bg-stone-900/40 dark:border-stone-800"
    case "warn":
      return "border-amber-200 bg-amber-50/80 dark:bg-amber-950/25 dark:border-amber-900/50"
    case "success":
      return "border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/25 dark:border-emerald-900/50"
    case "alert":
      return "border-rose-300 bg-rose-50/80 dark:bg-rose-950/40 dark:border-rose-900/60"
  }
}

// ── Timezone-aware date helpers (KST logic, parameterized) ───────────────

export function formatTripDate(iso: string, timezone: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
    ...opts,
  }).format(new Date(`${iso}T12:00:00Z`)) // noon UTC avoids date drift in any zone
}

/** Today's ISO date in the trip's timezone. */
export function todayIsoIn(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/** Whole days until the date, computed in the trip's timezone. */
export function daysUntilIn(iso: string, timezone: string): number {
  const today = todayIsoIn(timezone)
  const ms = new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()
  return Math.round(ms / 86_400_000)
}

/** Two-letter city tag — explicit config wins, else derived from the name. */
export function cityTag(city: string | undefined, tags?: Record<string, string>): string {
  if (!city) return "··"
  if (tags?.[city]) return tags[city]!
  const words = city.trim().split(/\s+/)
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : city.slice(0, 2)).toUpperCase()
}

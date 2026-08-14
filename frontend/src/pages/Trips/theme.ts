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
import type { DayWeather, ItemStatus, SuggestionKind, TripAccent, TripCollaborator } from "./types"

// Trip display metadata: the accent vocabulary, item iconography, and the
// timezone-aware date helpers every Trips surface shares.
//
// The accent itself lives in CSS: `data-trip-accent="<accent>"` on a
// trip-scoped subtree (see the `.trips` block in index.css) swaps `--ta`,
// `--ta-strong`, `--ta-soft`, `--ta-ring`, `--ta-ink`, and the two bloom
// stops. Everything below is one set of class strings over those variables,
// so a page never branches on which accent a trip uses.

export interface AccentTheme {
  /** Hero radial bloom layers (accent top-right, cool echo bottom-left). */
  bloomA: string
  bloomB: string
  /** Accent text: countdowns, status lines, active marks. */
  text: string
  /** Hover/pressed accent text. */
  textStrong: string
  /** Accent text that shifts with the enclosing `group`. */
  textHover: string
  /** Filled accent marks. Reserved for genuine live state, not decoration. */
  dot: string
  /** Tint background for "now" / "just changed" surfaces. */
  softBg: string
  /** Accent border for tinted panels and active states. */
  border: string
  /** Hairline rule next to an eyebrow. */
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

/** Picker order - also the set `resolveAccent` validates against. */
export const TRIP_ACCENTS: readonly TripAccent[] = ["rose", "amber", "emerald", "sky", "violet"]

/** Literal swatch colours for the appearance picker, which is the one place
 *  all five accents appear at once and therefore cannot read `--ta`. These
 *  mirror the light-theme values in the `.trips` block of index.css. */
export const ACCENT_SWATCH: Record<TripAccent, string> = {
  rose: "oklch(50% 0.17 18)",
  amber: "oklch(50% 0.14 55)",
  emerald: "oklch(47% 0.1 165)",
  sky: "oklch(48% 0.14 250)",
  violet: "oklch(48% 0.16 290)",
}

/** Human label for an accent, for the picker's accessible name. */
export const ACCENT_LABEL: Record<TripAccent, string> = {
  rose: "Rose",
  amber: "Ember",
  emerald: "Pine",
  sky: "Cobalt",
  violet: "Iris",
}

/** Safe accent lookup - never returns undefined for bad runtime data. */
export function resolveAccent(accent?: string | null): TripAccent {
  return TRIP_ACCENTS.includes(accent as TripAccent) ? (accent as TripAccent) : DEFAULT_ACCENT
}

// ── Trip metadata for display ────────────────────────────────────────────

/** Bookkeeping the migration left behind, not trip metadata a reader wants.
 *  Every surface that renders `trip.tags` filters through `visibleTags`. */
const HIDDEN_TAGS = new Set(["migrated"])

export function visibleTags(tags: readonly string[]): string[] {
  return tags.filter((tag) => !HIDDEN_TAGS.has(tag))
}

/** "1 editor, 2 viewers" - empty when nobody else is on the trip. */
export function collaboratorSummary(collaborators: readonly TripCollaborator[]): string {
  const editors = collaborators.filter((c) => c.role === "editor").length
  const viewers = collaborators.length - editors
  return [
    editors > 0 ? `${editors} editor${editors === 1 ? "" : "s"}` : "",
    viewers > 0 ? `${viewers} viewer${viewers === 1 ? "" : "s"}` : "",
  ]
    .filter((part) => part.length > 0)
    .join(", ")
}

// ── Item display metadata ────────────────────────────────────────────────

/** Status badges are square-cornered, tinted with the semantic tokens, and
 *  the only colour on a page besides the trip accent. `null` means the state
 *  is the default and earns no badge at all. */
export const itemStatusMeta: Record<ItemStatus, { label: string; chip: string; dot: string } | null> = {
  none: null,
  booked: {
    label: "Booked",
    chip: "border-[color:var(--tr-ok)] bg-[var(--tr-ok-soft)] text-[color:var(--tr-ok)]",
    dot: "bg-[color:var(--tr-ok)]",
  },
  optional: {
    label: "Optional",
    chip: "border-[color:var(--tr-line-strong)] bg-transparent text-[color:var(--tr-ink-muted)]",
    dot: "bg-[color:var(--tr-ink-faint)]",
  },
  needs_review: {
    label: "Needs review",
    chip: "border-[color:var(--tr-warn)] bg-[var(--tr-warn-soft)] text-[color:var(--tr-warn)]",
    dot: "bg-[color:var(--tr-warn)]",
  },
  completed: {
    label: "Done",
    chip: "border-[color:var(--tr-line)] bg-[var(--tr-overlay)] text-[color:var(--tr-ink-muted)]",
    dot: "bg-[color:var(--tr-ink-faint)]",
  },
}

/** Suggestion kinds collapse to three tints: added, removed, everything else. */
export function suggestionBadgeClass(kind: SuggestionKind): string {
  switch (kind) {
    case "add":
      return "border-[color:var(--tr-ok)] bg-[var(--tr-ok-soft)] text-[color:var(--tr-ok)]"
    case "remove":
      return "border-[color:var(--tr-danger-ring)] bg-[var(--tr-danger-soft)] text-[color:var(--tr-danger)]"
    default:
      return "border-[color:var(--tr-line-strong)] bg-[var(--tr-overlay)] text-[color:var(--tr-ink-muted)]"
  }
}

// ── Icons - Lucide only; user-entered emoji (day.emoji, callout.icon) is
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
      return "border-[color:var(--tr-line-strong)] bg-[var(--tr-overlay)]"
    case "warn":
      return "border-[color:var(--tr-warn)] bg-[var(--tr-warn-soft)]"
    case "success":
      return "border-[color:var(--tr-ok)] bg-[var(--tr-ok-soft)]"
    case "alert":
      return "border-[color:var(--tr-danger-ring)] bg-[var(--tr-danger-soft)]"
  }
}

/** Whether a day's forecast is worth printing.
 *
 *  Migrated days carry `{ highC: 0, lowC: 0 }` as a placeholder for "we never
 *  fetched this", and a Seoul day in May rendering `0 / 0` reads as a broken
 *  page rather than as missing data. A genuine freezing day has a high above
 *  its low, so the placeholder is the only pair this rejects. */
export function hasForecast(weather?: DayWeather | null): weather is DayWeather {
  if (!weather) return false
  return !(weather.highC === 0 && weather.lowC === 0)
}

// ── Timezone-aware date helpers ──────────────────────────────────────────

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

/** Two-letter city tag - explicit config wins, else derived from the name. */
export function cityTag(city: string | undefined, tags?: Record<string, string>): string {
  if (!city) return "--"
  if (tags?.[city]) return tags[city]!
  const words = city.trim().split(/\s+/)
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : city.slice(0, 2)).toUpperCase()
}

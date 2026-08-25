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
import { styles } from "./trips.stylex"
import type { sx } from "@/lib/utils"
import type { ItemStatus, SuggestionKind, TripAccent, TripCollaborator } from "./types"

// Trip accent tokens. Workspace chrome is green-gray print stock; a trip-scoped
// `data-trip-accent` subtree retints canvas + cover band (and `--ta` /
// `--trips-accent`) in index.css. Bloom layers stay no-ops so old class names
// remain safe.

export interface AccentTheme {
  /** No-op bloom class names — kept so old call sites stay safe. */
  bloomA: string
  bloomB: string
  text: typeof styles.accentText
  textStrong: typeof styles.accentTextStrong
  textHover: typeof styles.accentTextHover
  dot: typeof styles.accentDot
  softBg: typeof styles.accentSoftBg
  border: typeof styles.accentBorder
  hairline: typeof styles.accentHairline
  ring: typeof styles.accentRing
  focusRing: typeof styles.focusRing
}

export const ACCENT: AccentTheme = {
  bloomA: "trip-bloom-a",
  bloomB: "trip-bloom-b",
  text: styles.accentText,
  textStrong: styles.accentTextStrong,
  textHover: styles.accentTextHover,
  dot: styles.accentDot,
  softBg: styles.accentSoftBg,
  border: styles.accentBorder,
  hairline: styles.accentHairline,
  ring: styles.accentRing,
  focusRing: styles.focusRing,
}

export const DEFAULT_ACCENT: TripAccent = "amber"

/** Picker order — also the set `resolveAccent` validates against. */
export const TRIP_ACCENTS: readonly TripAccent[] = ["rose", "amber", "emerald", "sky", "violet"]

/** Literal swatch colors — the one place per-accent hues are still named,
 *  because the appearance picker has to show all five at once. */
export const ACCENT_SWATCH = {
  rose: styles.swatchRose,
  amber: styles.swatchAmber,
  emerald: styles.swatchEmerald,
  sky: styles.swatchSky,
  violet: styles.swatchViolet,
} satisfies Record<TripAccent, typeof styles.swatchRose | typeof styles.swatchAmber | typeof styles.swatchEmerald | typeof styles.swatchSky | typeof styles.swatchViolet>

/** Safe accent lookup — never returns undefined for bad runtime data. */
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

/** "1 editor · 2 viewers" — empty when nobody else is on the trip. */
export function collaboratorSummary(collaborators: readonly TripCollaborator[]): string {
  const editors = collaborators.filter((c) => c.role === "editor").length
  const viewers = collaborators.length - editors
  return [
    editors > 0 ? `${editors} editor${editors === 1 ? "" : "s"}` : "",
    viewers > 0 ? `${viewers} viewer${viewers === 1 ? "" : "s"}` : "",
  ]
    .filter((part) => part.length > 0)
    .join(" · ")
}

// ── Item display metadata ────────────────────────────────────────────────

export const itemStatusMeta: Record<
  ItemStatus,
  { label: string; chip: Parameters<typeof sx>[0]; dot: Parameters<typeof sx>[0] } | null
> = {
  none: null,
  booked: {
    label: "Booked",
    chip: styles.chipBooked,
    dot: styles.statusDotBooked,
  },
  optional: {
    label: "Optional",
    chip: styles.chipOptional,
    dot: styles.statusDotOptional,
  },
  needs_review: {
    label: "Needs review",
    chip: styles.chipNeedsReview,
    dot: styles.statusDotNeedsReview,
  },
  completed: {
    label: "Done",
    chip: styles.chipCompleted,
    dot: styles.statusDotCompleted,
  },
}

/** Suggestion kinds collapse to three tints: added, removed, everything else. */
export function suggestionBadgeStyle(kind: SuggestionKind): Parameters<typeof sx>[0] {
  switch (kind) {
    case "add":
      return styles.chipSuggestionAdd
    case "remove":
      return styles.chipSuggestionRemove
    default:
      return styles.chipSuggestionNeutral
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

export function calloutToneStyle(tone: "info" | "warn" | "success" | "alert"): Parameters<typeof sx>[0] {
  switch (tone) {
    case "info":
      return styles.calloutInfo
    case "warn":
      return styles.calloutWarn
    case "success":
      return styles.calloutSuccess
    case "alert":
      return styles.calloutAlert
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

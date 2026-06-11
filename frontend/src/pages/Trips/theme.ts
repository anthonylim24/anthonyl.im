import type { ItemStatus, TripAccent } from "./types"

// Generic dossier theme system — the Korea itinerary's visual language,
// parameterized by accent family and trip timezone. All class strings are
// literal (Tailwind can't see computed names).

export interface AccentTheme {
  /** Hero radial bloom layers (top-right primary, bottom-left amber echo). */
  bloomA: string
  bloomB: string
  /** Big countdown numeral + accent text. */
  countdown: string
  text: string
  textHover: string
  /** Small status dots / pips. */
  dot: string
  /** Eyebrow section number. */
  eyebrowNum: string
  /** Today-card border. */
  todayBorder: string
  focusRing: string
  hairline: string
}

export const ACCENTS: Record<TripAccent, AccentTheme> = {
  rose: {
    bloomA:
      "bg-[radial-gradient(ellipse_at_top_right,_rgba(244,63,94,0.10),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top_right,_rgba(251,113,133,0.16),_transparent_55%)]",
    bloomB:
      "bg-[radial-gradient(ellipse_at_bottom_left,_rgba(245,158,11,0.07),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_bottom_left,_rgba(251,191,36,0.10),_transparent_55%)]",
    countdown: "text-rose-600 dark:text-rose-400",
    text: "text-rose-700 dark:text-rose-300",
    textHover: "group-hover:text-rose-800 dark:group-hover:text-rose-200",
    dot: "bg-rose-500 dark:bg-rose-400",
    eyebrowNum: "text-rose-600 dark:text-rose-400",
    todayBorder: "border-rose-400/70 dark:border-rose-500/60",
    focusRing: "focus-visible:ring-rose-500/50",
    hairline: "bg-rose-400/60 dark:bg-rose-400/50",
  },
  amber: {
    bloomA:
      "bg-[radial-gradient(ellipse_at_top_right,_rgba(245,158,11,0.12),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top_right,_rgba(251,191,36,0.16),_transparent_55%)]",
    bloomB:
      "bg-[radial-gradient(ellipse_at_bottom_left,_rgba(120,113,108,0.08),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_bottom_left,_rgba(168,162,158,0.08),_transparent_55%)]",
    countdown: "text-amber-700 dark:text-amber-400",
    text: "text-amber-800 dark:text-amber-300",
    textHover: "group-hover:text-amber-900 dark:group-hover:text-amber-200",
    dot: "bg-amber-500 dark:bg-amber-400",
    eyebrowNum: "text-amber-700 dark:text-amber-400",
    todayBorder: "border-amber-400/70 dark:border-amber-500/60",
    focusRing: "focus-visible:ring-amber-500/50",
    hairline: "bg-amber-400/60 dark:bg-amber-400/50",
  },
  emerald: {
    bloomA:
      "bg-[radial-gradient(ellipse_at_top_right,_rgba(16,185,129,0.10),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top_right,_rgba(52,211,153,0.14),_transparent_55%)]",
    bloomB:
      "bg-[radial-gradient(ellipse_at_bottom_left,_rgba(245,158,11,0.06),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_bottom_left,_rgba(251,191,36,0.08),_transparent_55%)]",
    countdown: "text-emerald-700 dark:text-emerald-400",
    text: "text-emerald-800 dark:text-emerald-300",
    textHover: "group-hover:text-emerald-900 dark:group-hover:text-emerald-200",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    eyebrowNum: "text-emerald-700 dark:text-emerald-400",
    todayBorder: "border-emerald-400/70 dark:border-emerald-500/60",
    focusRing: "focus-visible:ring-emerald-500/50",
    hairline: "bg-emerald-400/60 dark:bg-emerald-400/50",
  },
  sky: {
    bloomA:
      "bg-[radial-gradient(ellipse_at_top_right,_rgba(14,165,233,0.10),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top_right,_rgba(56,189,248,0.14),_transparent_55%)]",
    bloomB:
      "bg-[radial-gradient(ellipse_at_bottom_left,_rgba(245,158,11,0.06),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_bottom_left,_rgba(251,191,36,0.08),_transparent_55%)]",
    countdown: "text-sky-700 dark:text-sky-400",
    text: "text-sky-800 dark:text-sky-300",
    textHover: "group-hover:text-sky-900 dark:group-hover:text-sky-200",
    dot: "bg-sky-500 dark:bg-sky-400",
    eyebrowNum: "text-sky-700 dark:text-sky-400",
    todayBorder: "border-sky-400/70 dark:border-sky-500/60",
    focusRing: "focus-visible:ring-sky-500/50",
    hairline: "bg-sky-400/60 dark:bg-sky-400/50",
  },
  violet: {
    bloomA:
      "bg-[radial-gradient(ellipse_at_top_right,_rgba(139,92,246,0.10),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top_right,_rgba(167,139,250,0.14),_transparent_55%)]",
    bloomB:
      "bg-[radial-gradient(ellipse_at_bottom_left,_rgba(244,63,94,0.06),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_bottom_left,_rgba(251,113,133,0.08),_transparent_55%)]",
    countdown: "text-violet-700 dark:text-violet-400",
    text: "text-violet-800 dark:text-violet-300",
    textHover: "group-hover:text-violet-900 dark:group-hover:text-violet-200",
    dot: "bg-violet-500 dark:bg-violet-400",
    eyebrowNum: "text-violet-700 dark:text-violet-400",
    todayBorder: "border-violet-400/70 dark:border-violet-500/60",
    focusRing: "focus-visible:ring-violet-500/50",
    hairline: "bg-violet-400/60 dark:bg-violet-400/50",
  },
}

export const DEFAULT_ACCENT: TripAccent = "amber"

export const accentTheme = (accent?: TripAccent): AccentTheme => ACCENTS[accent ?? DEFAULT_ACCENT]

// ── Item display metadata (mirrors koreaTheme's status/type systems) ─────

export const itemStatusMeta: Record<ItemStatus, { label: string; chip: string; dot: string } | null> = {
  none: null,
  booked: {
    label: "Booked",
    chip: "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-900/60",
    dot: "bg-emerald-600",
  },
  optional: {
    label: "Optional",
    chip: "bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-900/60 dark:text-stone-300 dark:border-stone-700",
    dot: "bg-stone-400 dark:bg-stone-500",
  },
  needs_review: {
    label: "Needs review",
    chip: "bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:text-rose-100 dark:border-rose-900/60",
    dot: "bg-rose-500",
  },
  completed: {
    label: "Done",
    chip: "bg-stone-100 text-stone-500 border-stone-200 dark:bg-stone-900/60 dark:text-stone-500 dark:border-stone-800",
    dot: "bg-stone-400 dark:bg-stone-600",
  },
}

export const reservationTypeIcon: Record<string, string> = {
  flight: "✈️",
  hotel: "🏨",
  meal: "🍴",
  bar: "🍸",
  experience: "🎟️",
  transit: "🚄",
  event: "🎆",
  appointment: "📅",
  wedding: "💒",
}

export const placeCategoryIcon: Record<string, string> = {
  restaurant: "🍴",
  cafe: "☕",
  bar: "🍸",
  market: "🧺",
  shopping: "🛍️",
  museum: "🖼️",
  palace: "🏯",
  shrine: "⛩️",
  park: "🌳",
  viewpoint: "🌆",
  experience: "🎟️",
  landmark: "📍",
  neighborhood: "🏘️",
  hotel: "🏨",
  transit: "🚄",
  venue: "🎪",
}

export function itemIcon(kind: string, category?: string, reservationType?: string): string {
  if (kind === "reservation" && reservationType) return reservationTypeIcon[reservationType] ?? "📌"
  if (category) return placeCategoryIcon[category] ?? "📍"
  return kind === "note" ? "📝" : "📍"
}

export function calloutTone(tone: "info" | "warn" | "success" | "alert"): string {
  switch (tone) {
    case "info":
      return "border-stone-200 bg-stone-50 dark:bg-stone-900/40 dark:border-stone-800"
    case "warn":
      return "border-rose-200 bg-rose-50/70 dark:bg-rose-950/25 dark:border-rose-900/50"
    case "success":
      return "border-emerald-200 bg-emerald-50/70 dark:bg-emerald-950/25 dark:border-emerald-900/50"
    case "alert":
      return "border-rose-300 bg-rose-100/70 dark:bg-rose-950/40 dark:border-rose-900/60"
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

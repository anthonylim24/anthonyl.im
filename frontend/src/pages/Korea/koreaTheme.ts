// Visual constants for the Korea section. Centralized so callout colors,
// status pills, and reservation type icons stay consistent across pages.

import type { ReservationStatus, ReservationType } from "./types"

// Ink + rose status system. The previous trio was a rose / amber / emerald
// color zoo that read as "AI-tagged severity." Emerald earns its place
// because "confirmed" is a real semantic moment in a travel dossier (the
// booking is locked in). Tentative and pending share rose/stone — pending
// is the loud one, tentative the muted one.
export const statusMeta: Record<ReservationStatus, { label: string; chip: string; dot: string }> = {
  confirmed: {
    label: "Confirmed",
    chip: "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-900/60",
    dot: "bg-emerald-600",
  },
  tentative: {
    label: "Tentative",
    chip: "bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-900/60 dark:text-stone-300 dark:border-stone-700",
    dot: "bg-stone-400 dark:bg-stone-500",
  },
  pending: {
    label: "Book now",
    chip: "bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:text-rose-100 dark:border-rose-900/60",
    dot: "bg-rose-500",
  },
}

export const typeMeta: Record<ReservationType, { icon: string; label: string }> = {
  flight: { icon: "✈️", label: "Flight" },
  hotel: { icon: "🏨", label: "Hotel" },
  meal: { icon: "🍴", label: "Meal" },
  bar: { icon: "🍸", label: "Bar" },
  experience: { icon: "🎟️", label: "Experience" },
  transit: { icon: "🚄", label: "Transit" },
  event: { icon: "🎆", label: "Event" },
  appointment: { icon: "📅", label: "Appointment" },
  wedding: { icon: "💒", label: "Wedding" },
}

// Cities differentiate by typography, not hue. Each city gets a short
// two-letter tag we render in `font-mono` against the warm parchment.
// Previously every city had its own gradient family (rose / sky /
// emerald / violet) — the dominant AI-tell on the route. Now the four
// cities share one parchment surface.
export const cityMeta: Record<string, { tag: string }> = {
  Seoul: { tag: "SE" },
  Busan: { tag: "BU" },
  Yangju: { tag: "YJ" },
  Incheon: { tag: "IC" },
}

// Callouts collapse from a 4-tone severity zoo (sky / amber / emerald /
// rose) to an ink-and-rose system. Confirmed-style "success" keeps
// emerald — it's the one place that earns a real semantic hue.
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

export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  const date = new Date(iso + "T00:00:00+09:00")
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Seoul",
    ...opts,
  }).format(date)
}

export function daysUntil(iso: string): number {
  const target = new Date(iso + "T00:00:00+09:00").getTime()
  const now = Date.now()
  return Math.ceil((target - now) / (24 * 60 * 60 * 1000))
}

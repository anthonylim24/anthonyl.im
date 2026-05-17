// Visual constants for the Korea section. Centralized so callout colors,
// status pills, and reservation type icons stay consistent across pages.

import type { ReservationStatus, ReservationType } from "./types"

export const statusMeta: Record<ReservationStatus, { label: string; chip: string; dot: string }> = {
  confirmed: {
    label: "Confirmed",
    chip: "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-900/60",
    dot: "bg-emerald-500",
  },
  tentative: {
    label: "Tentative",
    chip: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-900/60",
    dot: "bg-amber-500",
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

export const cityMeta: Record<string, { tint: string; ring: string }> = {
  Seoul: { tint: "from-rose-100 to-amber-50 dark:from-rose-950/40 dark:to-amber-950/30", ring: "ring-rose-200/60 dark:ring-rose-900/40" },
  Busan: { tint: "from-sky-100 to-cyan-50 dark:from-sky-950/40 dark:to-cyan-950/30", ring: "ring-sky-200/60 dark:ring-sky-900/40" },
  Yangju: { tint: "from-emerald-100 to-lime-50 dark:from-emerald-950/40 dark:to-lime-950/30", ring: "ring-emerald-200/60 dark:ring-emerald-900/40" },
  Incheon: { tint: "from-violet-100 to-fuchsia-50 dark:from-violet-950/40 dark:to-fuchsia-950/30", ring: "ring-violet-200/60 dark:ring-violet-900/40" },
}

export function calloutTone(tone: "info" | "warn" | "success" | "alert"): string {
  switch (tone) {
    case "info":
      return "border-sky-200 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-900/50"
    case "warn":
      return "border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/50"
    case "success":
      return "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900/50"
    case "alert":
      return "border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900/60"
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

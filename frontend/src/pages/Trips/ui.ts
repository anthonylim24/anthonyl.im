/** Shared Trips UI vocabulary — keep chrome consistent across list / create / editor / dossier. */

import type { TripStatus } from "./types"

export const SERIF = { fontFamily: "'Cormorant Garamond', Georgia, serif" } as const
export const MONO = { fontFamily: "'Fragment Mono', ui-monospace, monospace" } as const
export const EASE = [0.16, 1, 0.3, 1] as const

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
  completed: "Completed",
}

export const labelClass =
  "block text-[11px] font-medium uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400"

export const inputClass =
  "w-full min-h-11 rounded-xl border border-stone-300/90 bg-[var(--trips-surface)] px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 transition focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/25 dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-100 dark:placeholder:text-stone-500"

export const softPanelClass =
  "rounded-2xl border border-stone-200/80 bg-[var(--trips-surface)] dark:border-stone-800/80 dark:bg-stone-900/50"

export const primaryBtnClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-800 px-5 py-2.5 text-sm font-semibold text-amber-50 shadow-sm transition hover:bg-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--trips-canvas)] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-600 dark:text-amber-50 dark:hover:bg-amber-500 dark:focus-visible:ring-offset-stone-950"

export const secondaryBtnClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300/90 bg-transparent px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700/40 dark:border-stone-700 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:bg-stone-800/50"

export const ghostBtnClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-200/60 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700/40 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-100"

export const inkBtnClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-stone-50 transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--trips-canvas)] dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 dark:focus-visible:ring-offset-stone-950"

export const chipBtnClass =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-stone-200 px-3 text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700/40 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"

export const quietBtnClass =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700/40 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"

export const destructiveBtnClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-800 px-4 py-2 text-sm font-semibold text-red-50 transition hover:bg-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--trips-canvas)] disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"

export const alertErrorClass =
  "rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"

export const alertNoticeClass =
  "rounded-xl border border-amber-200/80 bg-amber-50/90 p-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"

export function formatRangeFull(start: string, end: string): string {
  const startY = start.slice(0, 4)
  const endY = end.slice(0, 4)
  const fmt = (iso: string, withYear: boolean) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    })
  if (startY !== endY) return `${fmt(start, true)} – ${fmt(end, true)}`
  return `${fmt(start, false)} – ${fmt(end, true)}`
}

export function dayCountInclusive(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime()
  const b = new Date(`${end}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000) + 1
}

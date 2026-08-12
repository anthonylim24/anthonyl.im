/** Editor-local vocabulary. Everything general enough for other Trips pages
 *  belongs in `../ui`; these three are candidates for that promotion once a
 *  second page needs them. */

import type { ItemStatus } from "../types"

export interface DayOption {
  id: string
  label: string
}

export const STATUS_OPTIONS: Array<{ value: ItemStatus; label: string }> = [
  { value: "none", label: "No status" },
  { value: "optional", label: "Optional" },
  { value: "booked", label: "Booked" },
  { value: "completed", label: "Completed" },
  { value: "needs_review", label: "Needs review" },
]

/** 11px mono field label for the editor's dense forms — the quieter sibling
 *  of `labelClass`, which is sized for full-width form pages. */
export const fieldLabelClass =
  "block font-mono-trips text-[11px] uppercase tracking-[0.14em] text-stone-600 dark:text-stone-400"

/** Destructive action with a text label, sized like `chipBtnClass`. */
export const dangerChipBtnClass =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-red-300/80 bg-transparent px-3 text-xs font-medium text-red-700 transition hover:bg-red-50 hover:text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40 dark:hover:text-red-200"

/** Fixed-width mono time cell — keeps titles aligned down a day's rows. */
export const timeCellClass =
  "font-mono-trips text-[11px] tabular-nums text-stone-600 dark:text-stone-400"

/** Shared Trips UI vocabulary — every interactive element on every Trips page
 *  composes from this file. Pages define no local class strings.
 *
 *  Accent behaviour is automatic: interactive colour reads `--trips-accent` /
 *  `--trips-focus`, which are amber in app chrome and swapped to the trip's
 *  accent inside any `data-trip-accent` subtree (see index.css).
 *
 *  Radius vocabulary: `rounded-xl` for buttons/inputs/panels, `rounded-lg` for
 *  compact controls, `rounded-full` only for dots, accent swatches, and the
 *  floating save pill.
 */

export const SERIF = { fontFamily: "'Cormorant Garamond', Georgia, serif" } as const
export const MONO = { fontFamily: "'Fragment Mono', ui-monospace, monospace" } as const
export const EASE = [0.16, 1, 0.3, 1] as const

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--trips-focus)]"
const FOCUS_INSET = `${FOCUS} focus-visible:ring-inset`
const BTN = "inline-flex items-center justify-center gap-2 rounded-xl transition"

/** Visible focus ring for elements that aren't buttons/inputs (links, rows). */
export const focusRingClass = FOCUS
export const focusRingInsetClass = FOCUS_INSET

// ── Labels ───────────────────────────────────────────────────────────────

export const labelClass =
  "block text-[11px] font-medium uppercase tracking-[0.16em] text-stone-600 dark:text-stone-400"

/** Mono eyebrow above a section or field group. */
export const eyebrowClass =
  "font-mono-trips text-[11px] uppercase tracking-[0.2em] text-stone-600 dark:text-stone-400"

// ── Inputs ───────────────────────────────────────────────────────────────

export const inputClass = `w-full min-h-11 rounded-xl border border-stone-300/90 bg-[var(--trips-surface)] px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-500 transition focus:border-[color:var(--trips-accent)] focus:outline-none ${FOCUS} dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-100 dark:placeholder:text-stone-400`

/** Bordered control for dense editor grids — smaller than `inputClass`.
 *  Width is left to the call site so it can sit in a flex row. */
export const compactInputClass = `min-h-9 rounded-lg border border-stone-300/90 bg-[var(--trips-surface)] px-2.5 py-1.5 text-sm text-stone-900 placeholder:text-stone-500 transition focus:border-[color:var(--trips-accent)] focus:outline-none ${FOCUS} dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-400`

/** Borderless inline edit — the field only reveals itself on hover/focus.
 *  Width is left to the call site so it can sit in a flex row. */
export const subtleInputClass = `min-h-9 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-stone-900 transition placeholder:text-stone-500 hover:border-stone-300 focus:border-[color:var(--trips-accent)] focus:bg-[var(--trips-surface)] focus:outline-none ${FOCUS} dark:text-stone-100 dark:placeholder:text-stone-400 dark:hover:border-stone-700 dark:focus:bg-stone-900`

export const selectClass = `min-h-11 rounded-xl border border-stone-300/90 bg-[var(--trips-surface)] px-3 py-2 text-sm text-stone-900 transition focus:border-[color:var(--trips-accent)] focus:outline-none ${FOCUS} dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100`

export const compactSelectClass = `min-h-9 rounded-lg border border-stone-300/90 bg-[var(--trips-surface)] px-2 py-1 text-xs text-stone-800 transition focus:border-[color:var(--trips-accent)] focus:outline-none ${FOCUS} dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200`

export const checkboxClass = `h-4 w-4 rounded border-stone-400 accent-[var(--trips-accent)] ${FOCUS} dark:border-stone-600`

/** Bordered shell wrapping a bare input plus an icon (combobox fields). */
export const fieldShellClass =
  "flex items-center gap-3 rounded-xl border border-stone-300/90 bg-[var(--trips-surface)] px-3 transition focus-within:border-[color:var(--trips-accent)] focus-within:ring-2 focus-within:ring-[color:var(--trips-focus)] hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-600"

/** Borderless input that lives inside `fieldShellClass`. */
export const bareInputClass =
  "w-full min-h-11 bg-transparent text-sm text-stone-900 placeholder:text-stone-500 focus:outline-none dark:text-stone-100 dark:placeholder:text-stone-400"

/** Leading accent glyph inside a field or heading. */
export const accentIconClass = "text-[color:var(--trips-accent)]"

// ── Surfaces ─────────────────────────────────────────────────────────────

export const softPanelClass =
  "rounded-2xl border border-stone-200/80 bg-[var(--trips-surface)] dark:border-stone-800/80 dark:bg-stone-900/50"

/** Floating panel for date pickers / comboboxes. */
export const popoverClass =
  "rounded-2xl border border-stone-200 bg-[var(--trips-surface)] shadow-xl shadow-stone-950/10 dark:border-stone-700 dark:bg-stone-900 dark:shadow-black/40"

/** Highlighted row inside a `popoverClass` listbox. */
export const menuItemActiveClass = "bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-stone-100"

export const alertErrorClass =
  "rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"

export const alertNoticeClass =
  "rounded-xl border border-amber-200/80 bg-amber-50/90 p-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"

// ── Buttons ──────────────────────────────────────────────────────────────

/** Primary action. Accent-filled: amber in chrome, trip accent in a trip. */
export const primaryBtnClass = `${BTN} min-h-11 bg-[color:var(--trips-accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[color:var(--trips-accent-hover)] ${FOCUS} focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--trips-canvas)] disabled:cursor-not-allowed disabled:opacity-50 dark:text-stone-950`

export const secondaryBtnClass = `${BTN} min-h-11 border border-stone-300/90 bg-transparent px-4 py-2.5 text-sm font-medium text-stone-700 hover:border-stone-400 hover:bg-stone-100/70 ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:bg-stone-800/50`

export const ghostBtnClass = `${BTN} min-h-11 px-3.5 py-2 text-sm font-medium text-stone-600 hover:bg-stone-200/60 hover:text-stone-900 ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-100`

/** Neutral-ink action — reserved for the one "enter Map Mode" style CTA. */
export const inkBtnClass = `${BTN} min-h-11 bg-stone-900 px-5 py-2.5 text-sm font-semibold text-stone-50 hover:bg-stone-700 ${FOCUS} focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300`

/** State-advancing action (Publish) — the only emerald button. */
export const successBtnClass = `${BTN} min-h-11 border border-emerald-600/40 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/70`

export const dangerBtnClass = `${BTN} min-h-11 bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50`

/** Small bordered action (Maps / Call / Booking / Map Mode chip).
 *  Full 44px target on touch layouts, tightens to 36px from `sm`. */
export const chipBtnClass = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-stone-300/90 bg-transparent px-3 text-xs font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-100/70 ${FOCUS} disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9 dark:border-stone-700 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:bg-stone-800/60`

/** Accent-tinted small action (Enhance day, active filters). */
export const accentChipBtnClass = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[color:var(--ta-ring)] bg-[color:var(--ta-soft)] px-3 text-xs font-medium text-[color:var(--ta)] transition hover:text-[color:var(--ta-strong)] ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9`

/** Quiet add-affordance ("Place / Note / Section", "Add callout"). */
export const quietBtnClass = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium text-stone-600 transition hover:bg-stone-200/60 hover:text-stone-900 ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-100`

/** 44x44 icon-only button. */
export const iconBtnClass = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-200/60 hover:text-stone-900 ${FOCUS} disabled:cursor-not-allowed disabled:opacity-30 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-100`

/** 44x44 destructive icon-only button. The glyph reddens on hover over a
 *  neutral surface — no red tint under gray text, no stacked tints. */
export const dangerIconBtnClass = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-200/60 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-30 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-red-300`

// ── Formatting helpers ───────────────────────────────────────────────────

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

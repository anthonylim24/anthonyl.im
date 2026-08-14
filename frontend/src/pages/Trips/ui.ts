/** Shared Trips UI vocabulary. Every interactive element on every Trips page
 *  composes from this file; pages define no local colour, radius, or type
 *  scale of their own.
 *
 *  ## How colour works here
 *  Colour is entirely token-driven (`--tr-*` for the neutral field, `--ta*`
 *  for the trip's accent, both declared in the `.trips` block of index.css).
 *  A class here writes `text-[color:var(--tr-ink)]`, never `text-stone-900
 *  dark:text-stone-100`, so dark mode is one class on the shell rather than a
 *  variant on every element, and a trip's accent flows into chrome, chips, and
 *  focus rings without a single page branching on which accent it uses.
 *
 *  ## Shape
 *  Panels and cards use `--tr-r-panel` (12px), controls and chips use
 *  `--tr-r-control` (8px). `rounded-full` is reserved for exactly three
 *  things: the floating save pill, toggle thumbs, and status dots.
 *
 *  ## Type
 *  Display is `font-display` (Bricolage Grotesque). Body is the shell's Geist.
 *  Numbers, times, and counts use `font-mono-trips` (Geist Mono, tabular).
 */

export const DISPLAY = {
  fontFamily: 'var(--font-display-trips, "Bricolage Grotesque Variable"), ui-sans-serif, sans-serif',
} as const

export const MONO = { fontFamily: '"Geist Mono Variable", ui-monospace, monospace' } as const

export const EASE = [0.16, 1, 0.3, 1] as const
const EASE_CSS = "ease-[cubic-bezier(0.16,1,0.3,1)]"

// ── Motion ───────────────────────────────────────────────────────────────

/** One reveal length for every entry fade. */
export const REVEAL_DURATION = 0.22

/** Staggered reveals climb in 25ms steps and stop climbing at the seventh
 *  element, so the last thing on any page settles within 400ms of the first. */
export function revealDelay(step: number): number {
  return Math.min(step, 6) * 0.025
}

/** Springs for surfaces that arrive on top of the page (save pill, undo
 *  toast): they settle rather than slide to a stop. */
export const ENTER_SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.7 } as const

/** Exits stay a short fade - anything longer keeps a focusable control alive
 *  in the DOM after focus has already moved on. */
export const EXIT_FADE = { duration: 0.12, ease: EASE } as const

/** Indeterminate progress. Rotation is motion, so it stops when asked to. */
export const spinnerClass = "animate-spin motion-reduce:animate-none"

const ARROW_NUDGE = `transition duration-200 ${EASE_CSS} motion-reduce:transition-none motion-reduce:group-hover:translate-x-0`

/** The "go here" nudge on an arrow inside a `group` link. */
export const hoverArrowClass = `${ARROW_NUDGE} group-hover:translate-x-0.5`

/** The same nudge pointing back, for previous/up links. */
export const hoverArrowBackClass = `${ARROW_NUDGE} group-hover:-translate-x-0.5`

/** Physical press feedback. Paired with every button vocabulary entry. */
const PRESS = "active:translate-y-px motion-reduce:active:translate-y-0"

// ── Focus ────────────────────────────────────────────────────────────────

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ta-ring)]"
const FOCUS_INSET = `${FOCUS} focus-visible:ring-inset`

/** Visible focus ring for elements that aren't buttons/inputs (links, rows). */
export const focusRingClass = FOCUS
export const focusRingInsetClass = FOCUS_INSET

// ── Ink ──────────────────────────────────────────────────────────────────

/** Primary ink. Only needed where an element sits outside the shell's colour
 *  inheritance (portals, overlays); most text can simply inherit. */
export const inkClass = "text-[color:var(--tr-ink)]"

/** Secondary ink: 7.5:1 on the light canvas, 8.1:1 on the dark one. The named
 *  floor for muted copy - anything lighter fails AA. */
export const mutedInkClass = "text-[color:var(--tr-ink-muted)]"

/** Tertiary ink. Large type and non-text marks only; it does not clear AA at
 *  body sizes and must never carry a sentence. */
export const faintInkClass = "text-[color:var(--tr-ink-faint)]"

/** User-authored strings (titles, addresses, notes) that may be one long
 *  unbroken run - Korean addresses overflow narrow columns without this. */
export const wrapAnywhereClass = "break-words [overflow-wrap:anywhere]"

/** Long lists of rows: skip layout and paint for anything off screen. */
export const rowPerfClass = "trip-row"

// ── Layout ───────────────────────────────────────────────────────────────

const PAGE_MAX = { form: "max-w-2xl", reading: "max-w-3xl", wide: "max-w-6xl" } as const

/** Page gutters. `<main>` is unconstrained so trip heroes can bleed to the
 *  viewport edge, so every routed page opens with one of these. */
export function pageClass(width: keyof typeof PAGE_MAX = "wide"): string {
  return `mx-auto ${PAGE_MAX[width]} px-4 pt-6 sm:px-6 sm:pt-10`
}

/** Hairline divider between rows. One border, never a top AND bottom rule. */
export const dividerClass = "divide-y divide-[color:var(--tr-line)]"

/** Section rhythm. Sections breathe more than the blocks inside them. */
export const sectionSpaceClass = "mt-14 sm:mt-20"

// ── Labels ───────────────────────────────────────────────────────────────

/** Form field label. Sits above its input, always. */
export const labelClass = `block text-[13px] font-medium ${mutedInkClass}`

/** Mono eyebrow above a section. Rationed: at most one per three sections on
 *  a page, because a label above every heading is the templated-AI rhythm. */
export const eyebrowClass = `font-mono-trips text-[11px] uppercase tracking-[0.18em] ${mutedInkClass}`

/** Mono field label for the editor's dense forms - the quieter sibling of
 *  `labelClass`, sized for a grid rather than a full-width form page. */
export const fieldLabelClass = `block font-mono-trips text-[11px] uppercase tracking-[0.14em] ${mutedInkClass}`

/** Term label in a fact grid (Destinations, Time zone, ...). */
export const metaLabelClass = `text-[12px] font-medium ${mutedInkClass}`

/** Explanatory line under a field. */
export const hintClass = `mt-1.5 text-xs leading-relaxed ${mutedInkClass}`

/** Mono tabular time - keeps times aligned down a list of rows. */
export const timeCellClass = `font-mono-trips text-[11px] tabular-nums ${mutedInkClass}`

/** Display heading sizes. Pass `style={DISPLAY}` alongside. */
export const displayTitleClass =
  "font-display text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.02] tracking-[-0.03em]"
export const displaySectionClass =
  "font-display text-[clamp(1.5rem,2.6vw,2rem)] leading-[1.1] tracking-[-0.02em]"
export const displayCardClass = "font-display text-lg leading-snug tracking-[-0.015em]"

// ── Inputs ───────────────────────────────────────────────────────────────

/** Single-line inputs cannot wrap, so overflowing text needs an ellipsis
 *  rather than a cut mid-glyph. Pair with `title` to expose the full value. */
const ELLIPSIS = "text-ellipsis"

const FIELD_BASE = `${ELLIPSIS} border border-[color:var(--tr-line-strong)] bg-[var(--tr-raised)] text-[color:var(--tr-ink)] placeholder:text-[color:var(--tr-ink-muted)] transition focus:border-[color:var(--ta)] focus:outline-none ${FOCUS}`

export const inputClass = `${FIELD_BASE} w-full min-h-11 rounded-[var(--tr-r-control)] px-3.5 py-2.5 text-sm`

/** Bordered control for dense editor grids - smaller than `inputClass`.
 *  Width is left to the call site so it can sit in a flex row. Keeps a full
 *  44px target on touch layouts and tightens to 36px from `sm`. */
export const compactInputClass = `${FIELD_BASE} min-h-11 sm:min-h-9 rounded-[var(--tr-r-control)] px-2.5 py-1.5 text-sm`

/** Borderless inline edit - the field only reveals itself on hover/focus. */
export const subtleInputClass = `${ELLIPSIS} min-h-11 sm:min-h-9 rounded-[var(--tr-r-control)] border border-transparent bg-transparent px-2 py-1 text-sm text-[color:var(--tr-ink)] placeholder:text-[color:var(--tr-ink-muted)] transition hover:border-[color:var(--tr-line-strong)] focus:border-[color:var(--ta)] focus:bg-[var(--tr-raised)] focus:outline-none ${FOCUS}`

export const selectClass = `${FIELD_BASE} min-h-11 rounded-[var(--tr-r-control)] px-3 py-2 text-sm`

export const compactSelectClass = `${FIELD_BASE} min-h-11 sm:min-h-9 rounded-[var(--tr-r-control)] px-2 py-1 text-xs`

export const checkboxClass = `h-4 w-4 rounded-[var(--tr-r-mark)] border-[color:var(--tr-line-strong)] accent-[var(--ta)] ${FOCUS}`

/** Bordered shell wrapping a bare input plus an icon (combobox fields). */
export const fieldShellClass =
  "flex items-center gap-3 rounded-[var(--tr-r-control)] border border-[color:var(--tr-line-strong)] bg-[var(--tr-raised)] px-3 transition focus-within:border-[color:var(--ta)] focus-within:ring-2 focus-within:ring-[color:var(--ta-ring)]"

/** Borderless input that lives inside `fieldShellClass`. */
export const bareInputClass = `${ELLIPSIS} w-full min-h-11 bg-transparent text-sm text-[color:var(--tr-ink)] placeholder:text-[color:var(--tr-ink-muted)] focus:outline-none`

/** Leading accent glyph inside a field or heading. */
export const accentIconClass = "text-[color:var(--ta)]"

/** Read-only stand-in for `subtleInputClass`: same box metrics, plain text.
 *  Viewers get real text rather than a `disabled` input, which screen readers
 *  skip and which renders below AA contrast. */
export const staticValueClass = "min-h-9 px-2 py-1 text-sm text-[color:var(--tr-ink)]"

/** Read-only stand-in for `compactInputClass`. */
export const staticFieldClass = `mt-1 block px-0.5 text-sm text-[color:var(--tr-ink)] ${wrapAnywhereClass}`

// ── Surfaces ─────────────────────────────────────────────────────────────

/** The one card in the vocabulary. Used where elevation carries real
 *  hierarchy; everything else groups with hairlines and space. */
export const panelClass =
  "rounded-[var(--tr-r-panel)] border border-[color:var(--tr-line)] bg-[var(--tr-surface)]"

/** Older name for `panelClass`, kept so call sites can migrate in place. */
export const softPanelClass = panelClass

/** A panel that responds to pointer as a whole (a linked card). */
export const panelInteractiveClass = `${panelClass} transition duration-200 ${EASE_CSS} hover:border-[color:var(--tr-line-strong)] hover:bg-[var(--tr-raised)] motion-reduce:transition-none`

/** Floating panel for date pickers / comboboxes. */
export const popoverClass =
  "rounded-[var(--tr-r-panel)] border border-[color:var(--tr-line-strong)] bg-[var(--tr-raised)] shadow-[var(--tr-shadow)]"

/** Highlighted row inside a `popoverClass` listbox. */
export const menuItemActiveClass = "bg-[var(--tr-overlay)] text-[color:var(--tr-ink)]"

/** Accent-tinted band (today's day, an applied suggestion). */
export const accentBandClass =
  "border-[color:var(--ta-ring)] bg-[color:var(--ta-soft)] text-[color:var(--tr-ink)]"

export const alertErrorClass =
  "rounded-[var(--tr-r-panel)] border border-[color:var(--tr-danger-ring)] bg-[var(--tr-danger-soft)] p-4 text-sm text-[color:var(--tr-danger)]"

export const alertNoticeClass =
  "rounded-[var(--tr-r-panel)] border border-[color:var(--tr-line-strong)] bg-[var(--tr-warn-soft)] p-4 text-sm text-[color:var(--tr-warn)]"

/** Skeleton block. Shaped like the content it stands in for, never a spinner. */
export const skeletonClass =
  "animate-pulse rounded-[var(--tr-r-control)] bg-[var(--tr-overlay)] motion-reduce:animate-none"

// ── Buttons ──────────────────────────────────────────────────────────────

const BTN = `inline-flex items-center justify-center gap-2 rounded-[var(--tr-r-control)] transition duration-200 ${EASE_CSS} motion-reduce:transition-none ${PRESS}`

/** Primary action. Accent-filled: ember in chrome, the trip's accent inside a
 *  trip. `--ta-ink` is solved per theme so the label always clears AA. */
export const primaryBtnClass = `${BTN} min-h-11 bg-[color:var(--ta)] px-5 py-2.5 text-sm font-semibold text-[color:var(--ta-ink)] hover:bg-[color:var(--ta-strong)] ${FOCUS} focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tr-canvas)] disabled:cursor-not-allowed disabled:opacity-50`

export const secondaryBtnClass = `${BTN} min-h-11 border border-[color:var(--tr-line-strong)] bg-transparent px-4 py-2.5 text-sm font-medium text-[color:var(--tr-ink)] hover:bg-[var(--tr-overlay)] ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`

export const ghostBtnClass = `${BTN} min-h-11 px-3.5 py-2 text-sm font-medium ${mutedInkClass} hover:bg-[var(--tr-overlay)] hover:text-[color:var(--tr-ink)] ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`

/** Neutral hover for anything sitting on a tinted surface: an ink overlay
 *  layers over the tint, where a solid hover colour would replace it. */
export const overlayHoverClass = "hover:bg-[var(--tr-overlay)]"

/** `ghostBtnClass` for tinted bands, where a neutral hover fill would muddy
 *  against the surface it sits on. */
export const ghostOnTintBtnClass = `${BTN} min-h-11 px-3.5 py-2 text-sm font-medium text-[color:var(--tr-ink)] ${overlayHoverClass} ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`

/** Neutral-ink action - reserved for the one "enter Map Mode" style CTA. */
export const inkBtnClass = `${BTN} min-h-11 bg-[color:var(--tr-ink)] px-5 py-2.5 text-sm font-semibold text-[color:var(--tr-canvas)] hover:opacity-90 ${FOCUS} focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`

/** State-advancing action (Publish) - the only success-tinted button. */
export const successBtnClass = `${BTN} min-h-11 border border-[color:var(--tr-ok)] bg-[var(--tr-ok-soft)] px-4 py-2 text-sm font-semibold text-[color:var(--tr-ok)] hover:bg-[var(--tr-overlay)] ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`

export const dangerBtnClass = `${BTN} min-h-11 bg-[color:var(--tr-danger)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--tr-danger-ring)] disabled:cursor-not-allowed disabled:opacity-50`

/** Small bordered action (Maps / Call / Booking / Map Mode chip).
 *  Full 44px target on touch layouts, tightens to 36px from `sm`. */
export const chipBtnClass = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[var(--tr-r-control)] border border-[color:var(--tr-line-strong)] bg-transparent px-3 text-xs font-medium text-[color:var(--tr-ink)] transition duration-200 ${EASE_CSS} hover:bg-[var(--tr-overlay)] motion-reduce:transition-none ${PRESS} ${FOCUS} disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9`

/** Accent-tinted small action (Enhance day, active filters). */
export const accentChipBtnClass = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[var(--tr-r-control)] border border-[color:var(--ta-ring)] bg-[color:var(--ta-soft)] px-3 text-xs font-medium text-[color:var(--ta)] transition duration-200 ${EASE_CSS} hover:text-[color:var(--ta-strong)] motion-reduce:transition-none ${PRESS} ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9`

/** Quiet add-affordance ("Place / Note / Section", "Add callout"). */
export const quietBtnClass = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[var(--tr-r-control)] px-3 text-xs font-medium ${mutedInkClass} transition duration-200 ${EASE_CSS} hover:bg-[var(--tr-overlay)] hover:text-[color:var(--tr-ink)] motion-reduce:transition-none ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9`

/** Destructive action with a text label, sized like `chipBtnClass`. */
export const dangerChipBtnClass = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[var(--tr-r-control)] border border-[color:var(--tr-danger-ring)] bg-transparent px-3 text-xs font-medium text-[color:var(--tr-danger)] transition duration-200 ${EASE_CSS} hover:bg-[var(--tr-danger-soft)] motion-reduce:transition-none ${PRESS} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--tr-danger-ring)] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9`

/** Secondary link or button inside a sentence. The vertical padding buys a
 *  44px-tall target without changing the line box it sits in. */
export const inlineLinkClass = `inline-block rounded-[var(--tr-r-mark)] py-1.5 -my-1.5 underline underline-offset-2 decoration-[color:var(--ta-ring)] hover:decoration-[color:var(--ta)] ${FOCUS}`

/** 44x44 icon-only button. */
export const iconBtnClass = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--tr-r-control)] ${mutedInkClass} transition duration-200 ${EASE_CSS} hover:bg-[var(--tr-overlay)] hover:text-[color:var(--tr-ink)] motion-reduce:transition-none ${FOCUS} disabled:cursor-not-allowed disabled:opacity-30`

/** 44x44 destructive icon-only button. The glyph reddens on hover over a
 *  neutral surface - no red tint under grey text, no stacked tints. */
export const dangerIconBtnClass = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--tr-r-control)] ${mutedInkClass} transition duration-200 ${EASE_CSS} hover:bg-[var(--tr-overlay)] hover:text-[color:var(--tr-danger)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--tr-danger-ring)] disabled:cursor-not-allowed disabled:opacity-30`

// ── Formatting helpers ───────────────────────────────────────────────────

/** `Mar 3 - Mar 11, 2026`, dropping the year only where it is redundant.
 *  `year: false` omits it entirely, for rows that state the year elsewhere.
 *  The separator is a plain hyphen: en and em dashes are banned in this UI. */
export function formatRangeFull(start: string, end: string, opts?: { year?: boolean }): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  const withYear = opts?.year !== false
  const fmt = (iso: string, year: boolean) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(year ? { year: "numeric" } : {}),
      timeZone: "UTC",
    })
  if (!withYear) return `${fmt(start, false)} - ${fmt(end, false)}`
  if (!sameYear) return `${fmt(start, true)} - ${fmt(end, true)}`
  return `${fmt(start, false)} - ${fmt(end, true)}`
}

export function dayCountInclusive(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime()
  const b = new Date(`${end}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000) + 1
}

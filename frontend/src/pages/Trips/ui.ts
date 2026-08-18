/** Shared Trips UI vocabulary — every interactive element on every Trips page
 *  composes from this file. Pages define no local class strings.
 *
 *  World: pocket timetable. Condensed times, tinted print stock, cover band.
 *  Not Linear, not Notion, not Korea parchment.
 */

export const SERIF = { fontFamily: '"Archivo Narrow", "Arial Narrow", sans-serif' } as const
export const MONO = { fontFamily: '"Archivo Narrow", "Arial Narrow", sans-serif' } as const
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

/** Hover lift for surfaces that should feel physical. Keep 150–250ms elsewhere. */
export const LIFT_SPRING = { type: "spring", stiffness: 380, damping: 32, mass: 0.55 } as const

/** Exits stay a short fade — anything longer keeps a focusable control alive
 *  in the DOM after focus has already moved on. */
export const EXIT_FADE = { duration: 0.12, ease: EASE } as const

/** Indeterminate progress. Rotation is motion, so it stops when asked to. */
export const spinnerClass = "animate-spin motion-reduce:animate-none"

const ARROW_NUDGE = `transition duration-200 ${EASE_CSS} motion-reduce:transition-none motion-reduce:group-hover:translate-x-0`

/** The "go here" nudge on an arrow inside a `group` link. */
export const hoverArrowClass = `${ARROW_NUDGE} group-hover:translate-x-0.5`

/** The same nudge pointing back, for previous/up links. */
export const hoverArrowBackClass = `${ARROW_NUDGE} group-hover:-translate-x-0.5`

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--trips-focus)]"
const FOCUS_INSET = `${FOCUS} focus-visible:ring-inset`
const RADIUS = "rounded-[length:var(--trips-radius)]"
const BTN = `inline-flex items-center justify-center gap-2 ${RADIUS} transition`

/** Recessed well: darker than the canvas so a field sits in the stock. */
const FIELD = `${RADIUS} border border-[color:var(--trips-border)] bg-[color:var(--trips-rail)] shadow-[inset_0_1px_2px_color-mix(in_oklch,var(--trips-ink)_12%,transparent)]`

/** Visible focus ring for elements that aren't buttons/inputs (links, rows). */
export const focusRingClass = FOCUS
export const focusRingInsetClass = FOCUS_INSET

// ── Type roles ───────────────────────────────────────────────────────────

/** Next booking / first reservation clock. The one large type moment. */
export const typeHeroTimeClass =
  "type-hero-time font-display font-semibold tabular-nums leading-none tracking-tight text-[2.5rem] sm:text-[3.25rem]"

/** Cover trip name. Steps below the hero clock. */
export const typeDisplayClass =
  "cover-title font-display font-semibold leading-none tracking-tight text-[1.875rem] sm:text-[2.25rem]"

/** Index, day, empty-state titles. One step below the cover display. */
export const typePageTitleClass =
  "font-display font-semibold tracking-tight text-[1.5rem] text-[color:var(--trips-ink)] sm:text-[1.75rem]"

/** Living-document section titles. */
export const typeSectionClass =
  "font-display font-semibold tracking-tight text-[1.25rem] text-[color:var(--trips-ink)]"

export const typeBodyClass = "text-base leading-relaxed"

export const typeMetaClass = "text-[0.8125rem] font-medium"

export const typeLabelClass = "text-xs font-medium"

export const typeStampClass = "text-[0.6875rem] font-medium uppercase tracking-[0.12em]"

// ── Ink ──────────────────────────────────────────────────────────────────

/** Secondary ink from the print-stock ladder — never raw stone-500. */
export const mutedInkClass = "text-[color:var(--trips-ink-secondary)]"

/** User-authored strings (titles, addresses, notes) that may be one long
 *  unbroken run — Korean addresses overflow narrow columns without this. */
export const wrapAnywhereClass = "break-words [overflow-wrap:anywhere]"

// ── Layout ───────────────────────────────────────────────────────────────

const PAGE_MAX = { form: "max-w-2xl", reading: "max-w-3xl", wide: "max-w-6xl" } as const

/** Page gutters. `<main>` is unconstrained; every routed page opens with one of these. */
export function pageClass(width: keyof typeof PAGE_MAX = "wide"): string {
  return `mx-auto ${PAGE_MAX[width]} px-4 pt-6 sm:px-6 sm:pt-8`
}

/** Horizontal gutter without the page's top padding. */
export const pageGutterClass = "mx-auto max-w-5xl px-4 sm:px-6"

/** Slim timetable chrome. Height comes from `--trips-chrome-h`. */
export const chromeHeaderClass =
  "sticky top-0 z-30 border-b border-[color:var(--trips-border)] bg-[color:var(--trips-canvas)]"

/** Cover band: committed line color, condensed title + next time. */
export const coverBandClass =
  "cover-band px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12"

/** Living document: print sheet, no card-in-a-rail. */
export const documentClass = "mx-auto max-w-5xl px-4 pb-16 pt-0 sm:px-6"

/** Legend rows under the cover (destination, dates). */
export const propertyTableClass =
  "divide-y divide-[color:var(--trips-border)] border-y border-[color:var(--trips-border)]"

export const propertyRowClass = "grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-4 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)]"

/** Dense schedule / reservation table. */
export const dataTableClass = "w-full border-collapse text-left text-sm"

export const dataThClass = `pb-2 pr-3 text-[12px] font-medium ${mutedInkClass}`

export const dataTdClass = "border-t border-[color:var(--trips-border)] py-3 pr-3 align-top"

// ── Labels ───────────────────────────────────────────────────────────────

export const labelClass = `block ${typeLabelClass} ${mutedInkClass}`

/** Small section label. Product UI: sentence case, no tracked mono. */
export const eyebrowClass = `${typeMetaClass} ${mutedInkClass}`

/** Field label for the editor's dense forms. */
export const fieldLabelClass = `block ${typeLabelClass} ${mutedInkClass}`

/** Term label in a properties row (Destinations, Time zone). */
export const metaLabelClass = `${typeMetaClass} ${mutedInkClass}`

/** Explanatory line under a field. */
export const hintClass = `mt-1.5 ${typeLabelClass} leading-relaxed ${mutedInkClass}`

/** Mono tabular time — keeps times aligned down a list of rows. */
export const timeCellClass = `font-mono-trips ${typeLabelClass} tabular-nums ${mutedInkClass}`

// ── Inputs ───────────────────────────────────────────────────────────────

/** Single-line inputs cannot wrap, so overflowing text needs an ellipsis
 *  rather than a cut mid-glyph. Pair with `title` to expose the full value. */
const ELLIPSIS = "text-ellipsis"

export const inputClass = `${ELLIPSIS} ${FIELD} w-full min-h-11 px-3.5 py-2.5 text-[0.9375rem] text-[color:var(--trips-ink)] placeholder:text-[color:var(--trips-ink-tertiary)] transition focus:border-[color:var(--trips-accent)] focus:outline-none ${FOCUS}`

/** Timetable title: condensed, 44px target. */
export const displayInputClass = `trip-display-input ${typeDisplayClass} w-full min-h-11 bg-transparent text-[color:var(--trips-ink)] placeholder:text-[color:var(--trips-ink-tertiary)] focus:outline-none ${FOCUS}`

/** Bordered control for dense editor grids — smaller than `inputClass`.
 *  Width is left to the call site so it can sit in a flex row. Keeps a full
 *  44px target on touch layouts and tightens to 36px from `sm`, like the
 *  compact buttons. */
export const compactInputClass = `${ELLIPSIS} ${FIELD} min-h-11 sm:min-h-9 px-2.5 py-1.5 text-[0.9375rem] text-[color:var(--trips-ink)] placeholder:text-[color:var(--trips-ink-tertiary)] transition focus:border-[color:var(--trips-accent)] focus:outline-none ${FOCUS}`

/** Borderless inline edit — the field only reveals itself on hover/focus.
 *  Width is left to the call site so it can sit in a flex row. */
export const subtleInputClass = `${ELLIPSIS} ${RADIUS} min-h-11 sm:min-h-9 border border-transparent bg-transparent px-2 py-1 text-[0.9375rem] text-[color:var(--trips-ink)] transition placeholder:text-[color:var(--trips-ink-tertiary)] hover:border-[color:var(--trips-border)] focus:border-[color:var(--trips-accent)] focus:bg-[color:var(--trips-rail)] focus:outline-none ${FOCUS}`

export const selectClass = `${FIELD} min-h-11 px-3 py-2 text-[0.9375rem] text-[color:var(--trips-ink)] transition focus:border-[color:var(--trips-accent)] focus:outline-none ${FOCUS}`

export const compactSelectClass = `${FIELD} min-h-11 sm:min-h-9 px-2 py-1 text-xs text-[color:var(--trips-ink)] transition focus:border-[color:var(--trips-accent)] focus:outline-none ${FOCUS}`

export const checkboxClass = `h-4 w-4 ${RADIUS} border-[color:var(--trips-border)] accent-[var(--trips-accent)] ${FOCUS}`

/** Bordered shell wrapping a bare input plus an icon (combobox fields). */
export const fieldShellClass = `flex items-center gap-3 ${FIELD} px-3 transition focus-within:border-[color:var(--trips-accent)] focus-within:ring-2 focus-within:ring-[color:var(--trips-focus)]`

/** Borderless input that lives inside `fieldShellClass`. */
export const bareInputClass =
  `${ELLIPSIS} w-full min-h-11 bg-transparent text-[0.9375rem] text-[color:var(--trips-ink)] placeholder:text-[color:var(--trips-ink-tertiary)] focus:outline-none`

/** Leading accent glyph inside a field or heading. */
export const accentIconClass = "text-[color:var(--trips-accent)]"

/** Read-only stand-in for `subtleInputClass`: same box metrics, plain text.
 *  Viewers get real text rather than a `disabled` input, which screen readers
 *  skip and which renders below AA contrast. */
export const staticValueClass = "min-h-9 px-2 py-1 text-[0.9375rem] text-[color:var(--trips-ink)]"

/** Read-only stand-in for `compactInputClass`. */
export const staticFieldClass = `mt-1 block px-0.5 text-[0.9375rem] text-[color:var(--trips-ink)] ${wrapAnywhereClass}`

// ── Surfaces ─────────────────────────────────────────────────────────────

/** Opaque sheet sitting on the stock. Dialogs, reviews, popovers. */
export const softPanelClass = `${RADIUS} border border-[color:var(--trips-border)] bg-[color:var(--trips-surface)]`

/** Floating panel for date pickers / comboboxes. Always opaque. */
export const popoverClass = `${softPanelClass} shadow-[0_10px_28px_color-mix(in_oklch,var(--trips-ink)_16%,transparent)]`

/** Remount the timetable token world on `document.body` portals. */
export const tripsPortalClass = "trips"

/** Scrim behind a modal: opaque ink wash plus blur so copy stays readable. */
export const scrimClass =
  "fixed inset-0 z-[65] bg-[color:var(--trips-scrim)] backdrop-blur-[8px] motion-reduce:backdrop-blur-none"

/** Same wash, stacked under chat / map so those layers keep their own z-index. */
export const overlayScrimClass =
  "fixed inset-0 bg-[color:var(--trips-scrim)] backdrop-blur-[8px] motion-reduce:backdrop-blur-none"

/** Loading bones on the print stock — never raw stone. */
export const skeletonClass = `animate-pulse ${RADIUS} bg-[color:var(--trips-rail)]`

/** Hairline schedule / suggestion / concierge card. */
export const scheduleRowClass = `${RADIUS} border border-[color:var(--trips-border)] bg-[color:var(--trips-surface)]`

/** Recessed band for section rows and grounded action bars. */
export const railBandClass = `${RADIUS} bg-[color:var(--trips-rail)]`

/** Docked toast / save chip — opaque surface, shared radius. */
export const toastClass = `${RADIUS} border border-[color:var(--trips-border)] bg-[color:var(--trips-surface)] text-[0.8125rem] font-medium text-[color:var(--trips-ink-secondary)] shadow-[0_10px_28px_color-mix(in_oklch,var(--trips-ink)_16%,transparent)]`

/** Highlighted row inside a `popoverClass` listbox. */
export const menuItemActiveClass =
  "bg-[color:var(--trips-rail)] text-[color:var(--trips-ink)]"

export const alertErrorClass = `${RADIUS} border border-red-300 bg-red-50 p-4 text-[0.9375rem] text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100`

export const alertNoticeClass = `${RADIUS} border border-amber-300/80 bg-amber-50 p-4 text-[0.9375rem] text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100`

/** Segmented control track (AI vs blank, and similar pairs). */
export const segmentTrackClass = `inline-flex w-full ${RADIUS} border border-[color:var(--trips-border)] bg-[color:var(--trips-rail)] p-1 sm:w-auto`

/** One option inside `segmentTrackClass`. Selected is a surface pill, not an accent fill.
 *  Focus lives on the nested radio (`sr-only`), so the ring is `has-[:focus-visible]`. */
export function segmentOptionClass(selected: boolean): string {
  return `inline-flex min-h-11 flex-1 items-center justify-center gap-2 ${RADIUS} px-4 py-2 text-[0.9375rem] font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[color:var(--trips-focus)] sm:flex-none ${
    selected
      ? "bg-[color:var(--trips-surface)] text-[color:var(--trips-ink)]"
      : `${mutedInkClass} hover:text-[color:var(--trips-ink)]`
  }`
}

/** Hairline tag / destination stamp. */
export const stampChipClass = `${RADIUS} border border-[color:var(--trips-border)] bg-[color:var(--trips-rail)] px-2 py-0.5 text-xs`

// ── Buttons ──────────────────────────────────────────────────────────────

/** Primary action. Accent-filled: amber in chrome, trip accent in a trip. */
export const bandBtnClass = `${BTN} min-h-11 bg-[color:var(--trips-band-ink)] px-5 py-2.5 text-sm font-semibold text-[color:var(--trips-band)] hover:bg-[color:var(--trips-band-ink)]/90 ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`

export const bandChipClass = `inline-flex min-h-11 items-center justify-center gap-1.5 ${RADIUS} border border-[color:var(--trips-band-ink)]/35 bg-transparent px-3 text-xs font-medium text-[color:var(--trips-band-ink)] transition hover:bg-[color:var(--trips-band-ink)]/10 ${FOCUS} disabled:cursor-not-allowed disabled:opacity-40`

export const primaryBtnClass = `${BTN} min-h-11 bg-[color:var(--trips-accent)] px-5 py-2.5 text-[0.9375rem] font-semibold text-white hover:bg-[color:var(--trips-accent-hover)] ${FOCUS} focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--trips-canvas)] disabled:cursor-not-allowed disabled:opacity-50 dark:text-[color:var(--trips-canvas)]`

export const secondaryBtnClass = `${BTN} min-h-11 border border-[color:var(--trips-border)] bg-transparent px-4 py-2.5 text-[0.9375rem] font-medium text-[color:var(--trips-ink-secondary)] hover:bg-[color:var(--trips-rail)] hover:text-[color:var(--trips-ink)] ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`

export const ghostBtnClass = `${BTN} min-h-11 px-3.5 py-2 text-[0.9375rem] font-medium text-[color:var(--trips-ink-secondary)] hover:bg-[color:var(--trips-rail)] hover:text-[color:var(--trips-ink)] ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`

/** Neutral hover for anything sitting on a tinted surface: an ink overlay
 *  layers over the tint, where a `bg-stone-*` hover would replace it. */
export const overlayHoverClass = "hover:bg-[color:var(--trips-ink)]/5"

/** `ghostBtnClass` for tinted bands (the red delete-confirm strip), where the
 *  stone hover tint muddies against the surface it sits on. */
export const ghostOnTintBtnClass = `${BTN} min-h-11 px-3.5 py-2 text-sm font-medium text-stone-700 ${overlayHoverClass} hover:text-stone-950 ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50 dark:text-stone-300 dark:hover:text-stone-50`

/** Neutral-ink action — reserved for the one "enter Map Mode" style CTA. */
export const inkBtnClass = `${BTN} min-h-11 bg-[color:var(--trips-ink)] px-5 py-2.5 text-[0.9375rem] font-semibold text-[color:var(--trips-canvas)] hover:opacity-90 ${FOCUS} focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`

/** State-advancing action (Publish) — the only emerald button. */
export const successBtnClass = `${BTN} min-h-11 border border-emerald-600/40 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/70`

export const dangerBtnClass = `${BTN} min-h-11 bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50`

/** Small bordered action (Maps / Call / Booking / Map Mode chip).
 *  Full 44px target on touch layouts, tightens to 36px from `sm`. */
export const chipBtnClass = `inline-flex min-h-11 items-center justify-center gap-1.5 ${RADIUS} border border-[color:var(--trips-border)] bg-transparent px-3 text-xs font-medium text-[color:var(--trips-ink-secondary)] transition hover:bg-[color:var(--trips-rail)] hover:text-[color:var(--trips-ink)] ${FOCUS} disabled:cursor-not-allowed disabled:opacity-40`

/** Accent-tinted small action (Enhance day, active filters). */
export const accentChipBtnClass = `inline-flex min-h-11 items-center justify-center gap-1.5 ${RADIUS} border border-[color:var(--ta-ring)] bg-[color:var(--ta-soft)] px-3 text-xs font-medium text-[color:var(--ta)] transition hover:text-[color:var(--ta-strong)] ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`

/** Quiet add-affordance ("Place / Note / Section", "Add callout"). */
export const quietBtnClass = `inline-flex min-h-11 items-center justify-center gap-1.5 ${RADIUS} px-3 text-xs font-medium text-[color:var(--trips-ink-secondary)] transition hover:bg-[color:var(--trips-rail)] hover:text-[color:var(--trips-ink)] ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`

/** Destructive action with a text label, sized like `chipBtnClass`. */
export const dangerChipBtnClass = `inline-flex min-h-11 items-center justify-center gap-1.5 ${RADIUS} border border-red-300/80 bg-transparent px-3 text-xs font-medium text-red-700 transition hover:bg-red-50 hover:text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40 dark:hover:text-red-200`

/** Secondary link or button inside a sentence. The vertical padding buys a
 *  44px-tall target without changing the line box it sits in. */
export const inlineLinkClass = `inline-block rounded py-1.5 -my-1.5 underline underline-offset-2 ${FOCUS}`

/** 44x44 icon-only button. */
export const iconBtnClass = `inline-flex h-11 w-11 shrink-0 items-center justify-center ${RADIUS} text-[color:var(--trips-ink-secondary)] transition hover:bg-[color:var(--trips-rail)] hover:text-[color:var(--trips-ink)] ${FOCUS} disabled:cursor-not-allowed disabled:opacity-30`

/** 44x44 destructive icon-only button. The glyph reddens on hover over a
 *  neutral surface — no red tint under gray text, no stacked tints. */
export const dangerIconBtnClass = `inline-flex h-11 w-11 shrink-0 items-center justify-center ${RADIUS} text-[color:var(--trips-ink-secondary)] transition hover:bg-[color:var(--trips-rail)] hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:text-red-300`

// ── Formatting helpers ───────────────────────────────────────────────────

/** `Mar 3 to Mar 11, 2026`, dropping the year only where it is redundant.
 *  `year: false` omits it entirely, for rows that state the year elsewhere. */
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
  if (!withYear) return `${fmt(start, false)} to ${fmt(end, false)}`
  if (!sameYear) return `${fmt(start, true)} to ${fmt(end, true)}`
  return `${fmt(start, false)} to ${fmt(end, true)}`
}

export function dayCountInclusive(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime()
  const b = new Date(`${end}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000) + 1
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> }
}

/** Same-document View Transition, or a synchronous update when unsupported. */
export function runTripsViewTransition(update: () => void): void {
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const doc = document as ViewTransitionDocument
  if (reduced || typeof doc.startViewTransition !== "function") {
    update()
    return
  }
  void doc.startViewTransition(update).finished.catch(() => undefined)
}

/** Sticky snap rail sits under chrome, then the compact cover when it sticks. */
export const snapRailStickyClass =
  "snap-rail-sticky sticky z-20 -mx-4 mb-5 border-b border-[color:var(--trips-border)] bg-[color:var(--trips-canvas)] px-4 py-2 sm:-mx-6 sm:px-6"

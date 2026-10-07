/** Shared Trips UI vocabulary — every interactive element on every Trips page
 *  composes from this file. Pages define no local class strings.
 *
 *  World: toy-world travel diorama. Pastel papercraft and clay — stickers
 *  with an ink outline and a hard offset shadow, luggage tags, stamps.
 *  Toy pieces only the redesigned pages use live in toy.stylex.ts.
 */

import {
  pageStyle,
  segmentOption,
  styles,
} from './trips.stylex'

export { fontDisplay, styles, pageStyle, segmentOption, suggestionChipStyle, calloutToneStyle, accentSwatchStyle } from './trips.stylex'

export const EASE = [0.16, 1, 0.3, 1] as const

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
export const ENTER_SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 } as const

/** Hover lift for surfaces that should feel physical. Keep 150–250ms elsewhere. */
export const LIFT_SPRING = { type: 'spring', stiffness: 380, damping: 32, mass: 0.55 } as const

/** Exits stay a short fade — anything longer keeps a focusable control alive
 *  in the DOM after focus has already moved on. */
export const EXIT_FADE = { duration: 0.12, ease: EASE } as const

export const spinnerClass = styles.spinner
export const hoverArrowClass = styles.hoverArrow
export const hoverArrowBackClass = styles.hoverArrowBack

export const focusRingClass = styles.focusRing
export const focusRingInsetClass = styles.focusRingInset

// ── Type roles ───────────────────────────────────────────────────────────

export const typeHeroTimeClass = styles.typeHeroTime
export const typeDisplayClass = styles.typeDisplay
export const typePageTitleClass = styles.typePageTitle
export const typeSectionClass = styles.typeSection
export const typeBodyClass = styles.typeBody
export const typeMetaClass = styles.typeMeta
export const typeLabelClass = styles.typeLabel
export const typeStampClass = styles.typeStamp

// ── Ink ──────────────────────────────────────────────────────────────────

export const mutedInkClass = styles.mutedInk
export const wrapAnywhereClass = styles.wrapAnywhere

// ── Layout ───────────────────────────────────────────────────────────────

export const pageClass = pageStyle
export const pageGutterClass = styles.pageGutter
export const chromeHeaderClass = styles.chromeHeader
/** Semantic cover-band class + padding — pass to sx('cover-band', coverBandClass). */
export const coverBandClass = styles.coverBandPad
/** Semantic cover-dock class + padding — pass to sx('cover-dock', coverDockClass). */
export const coverDockClass = styles.coverDockPad
export const documentClass = styles.document
export const propertyTableClass = styles.propertyTable
export const propertyRowClass = styles.propertyRow
export const dataTableClass = styles.dataTable
export const dataThClass = styles.dataTh
export const dataTdClass = styles.dataTd

// ── Labels ─────────────────────────────────────────────────────────────

export const labelClass = styles.label
export const eyebrowClass = styles.eyebrow
export const fieldLabelClass = styles.fieldLabel
export const metaLabelClass = styles.metaLabel
export const hintClass = styles.hint
export const timeCellClass = styles.timeCell

// ── Inputs ───────────────────────────────────────────────────────────────

export const inputClass = styles.input
export const displayInputClass = styles.displayInput
export const compactInputClass = styles.compactInput
export const subtleInputClass = styles.subtleInput
export const selectClass = styles.select
export const compactSelectClass = styles.compactSelect
export const checkboxClass = styles.checkbox
export const fieldShellClass = styles.fieldShell
export const bareInputClass = styles.bareInput
export const accentIconClass = styles.accentIcon
export const staticValueClass = styles.staticValue
export const staticFieldClass = styles.staticField

// ── Surfaces ───────────────────────────────────────────────────────────

export const softPanelClass = styles.softPanel
export const popoverClass = styles.popover
export const scrimClass = styles.scrim
export const overlayScrimClass = styles.overlayScrim
export const skeletonClass = styles.skeleton
export const scheduleRowClass = styles.scheduleRow
export const railBandClass = styles.railBand
export const toastClass = styles.toast
export const menuItemActiveClass = styles.menuItemActive
export const alertErrorClass = styles.alertError
export const alertNoticeClass = styles.alertNotice
export const segmentTrackClass = styles.segmentTrack
export const segmentOptionClass = segmentOption
export const stampChipClass = styles.stampChip

// ── Buttons ────────────────────────────────────────────────────────────

export const bandBtnClass = styles.bandBtn
export const bandChipClass = styles.bandChip
export const primaryBtnClass = styles.primaryBtn
export const secondaryBtnClass = styles.secondaryBtn
export const ghostBtnClass = styles.ghostBtn
export const ghostOnTintBtnClass = styles.ghostOnTintBtn
export const overlayHoverClass = styles.overlayHover
export const tripsPortalClass = 'trips'
export const sheetRuleClass = styles.sheetRule
export const hairlineListDividedClass = styles.hairlineListDivided
export const skeletonBarClass = styles.skeletonBar
export const inkBtnClass = styles.inkBtn
export const successBtnClass = styles.successBtn
export const dangerBtnClass = styles.dangerBtn
export const chipBtnClass = styles.chipBtn
export const accentChipBtnClass = styles.accentChipBtn
export const quietBtnClass = styles.quietBtn
export const dangerChipBtnClass = styles.dangerChipBtn
export const inlineLinkClass = styles.inlineLink
export const iconBtnClass = styles.iconBtn
export const dangerIconBtnClass = styles.dangerIconBtn

// ── Formatting helpers ───────────────────────────────────────────────────

export function formatRangeFull(start: string, end: string, opts?: { year?: boolean }): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  const withYear = opts?.year !== false
  const fmt = (iso: string, year: boolean) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(year ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
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
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const doc = document as ViewTransitionDocument
  if (reduced || typeof doc.startViewTransition !== 'function') {
    update()
    return
  }
  void doc.startViewTransition(update).finished.catch(() => undefined)
}

/** Semantic snap-rail-sticky class + layout — pass to sx('snap-rail-sticky', snapRailStickyClass). */
export const snapRailStickyClass = styles.snapRailSticky

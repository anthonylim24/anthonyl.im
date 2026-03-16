// palette.ts – Monochromatic parchment + ink color system.
// No technique colors — differentiation is through geometry, not color.

import type { TechniqueId } from './constants'
import { TECHNIQUE_IDS, BREATH_PHASES, type BreathPhase } from './constants'

// ── Canvas ──────────────────────────────────────────────────────────────
export const CANVAS = '#F5F2ED'
export const CANVAS_DARK = '#171613'
export const SURFACE = '#FFFEFA'

// ── Ink ─────────────────────────────────────────────────────────────────
export const INK = '#1C1917'
export const INK_SECONDARY = '#78716C'
export const INK_TERTIARY = '#A8A29E'
export const INK_FAINT = '#D6D3D1'

// Legacy aliases (for components not yet migrated)
export const BG = CANVAS_DARK
export const BG_ELEVATED = '#1F1E1A'
export const TEXT = INK
export const TEXT_MUTED = INK_SECONDARY
export const ACCENT = INK
export const ACCENT_BRIGHT = '#292524'
export const ACCENT_SUBTLE = '#0C0A09'

// ── Breath-phase colors (monochromatic ink shades) ──
export const PHASE = {
  inhale:      '#1C1917',
  deep_inhale: '#292524',
  hold_in:     '#44403C',
  exhale:      '#57534E',
  hold_out:    '#78716C',
  rest:        '#A8A29E',
} as const

// ── Per-technique phase colors (monochromatic — same for all) ───────────
const MONO_PHASES: Record<BreathPhase, string> = {
  [BREATH_PHASES.INHALE]:      '#1C1917',
  [BREATH_PHASES.DEEP_INHALE]: '#292524',
  [BREATH_PHASES.HOLD_IN]:     '#44403C',
  [BREATH_PHASES.EXHALE]:      '#57534E',
  [BREATH_PHASES.HOLD_OUT]:    '#78716C',
  [BREATH_PHASES.REST]:        '#A8A29E',
}

export const TECHNIQUE_PHASES: Record<TechniqueId, Record<BreathPhase, string>> = {
  [TECHNIQUE_IDS.BOX_BREATHING]:   MONO_PHASES,
  [TECHNIQUE_IDS.CO2_TOLERANCE]:   MONO_PHASES,
  [TECHNIQUE_IDS.POWER_BREATHING]: MONO_PHASES,
  [TECHNIQUE_IDS.CYCLIC_SIGHING]:  MONO_PHASES,
}

// ── Technique visual config (no color — geometry only) ──────────────────
export const TECHNIQUE = {
  box:     { primary: INK, secondary: INK_SECONDARY },
  co2:     { primary: INK, secondary: INK_SECONDARY },
  power:   { primary: INK, secondary: INK_SECONDARY },
  sighing: { primary: INK, secondary: INK_SECONDARY },
} as const

export const TECHNIQUE_GRADIENT = {
  box:     { from: INK, via: INK_SECONDARY, to: INK_TERTIARY },
  co2:     { from: INK, via: INK_SECONDARY, to: INK_TERTIARY },
  power:   { from: INK, via: INK_SECONDARY, to: INK_TERTIARY },
  sighing: { from: INK, via: INK_SECONDARY, to: INK_TERTIARY },
} as const

// ── Achievement / gamification ──────────────────────────────────────────
export const ACHIEVEMENT = INK
export const PERSONAL_BEST = INK_SECONDARY

// ── Destructive ─────────────────────────────────────────────────────────
export const DESTRUCTIVE = '#EF4444'

// ── Heatmap intensity stops (ink ramp) ──────────────────────────────────
export const HEATMAP = [
  'rgba(28, 25, 23, 0.06)',
  'rgba(28, 25, 23, 0.14)',
  'rgba(28, 25, 23, 0.28)',
  'rgba(28, 25, 23, 0.50)',
] as const

// ── FluidOrb/Ring phase color pairs (ink shades) ────────────────────────
export const PHASE_PAIR: Record<string, [string, string]> = {
  inhale:      [PHASE.inhale, PHASE.exhale],
  deep_inhale: [PHASE.deep_inhale, PHASE.inhale],
  hold_in:     [PHASE.hold_in, PHASE.inhale],
  exhale:      [PHASE.exhale, PHASE.hold_out],
  hold_out:    [PHASE.hold_out, PHASE.rest],
  rest:        [PHASE.rest, INK_FAINT],
  idle:        [INK_FAINT, PHASE.rest],
}

// ── Badge gradient ──────────────────────────────────────────────────────
export const BADGE_GRADIENT = { from: INK, to: INK_SECONDARY } as const

// ── Utilities ───────────────────────────────────────────────────────────
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

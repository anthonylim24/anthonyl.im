// palette.ts – Warm parchment + ink color system with amber accent.
// Techniques get subtle chromatic identity; UI stays mostly monochromatic.

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

// ── Warm accent ─────────────────────────────────────────────────────────
export const ACCENT_WARM = '#B8860B'
export const ACCENT_WARM_LIGHT = '#C9A227'
export const ACCENT_WARM_SUBTLE = 'rgba(184, 134, 11, 0.12)'
export const SUCCESS = '#6B8F71'

// Legacy aliases (for components not yet migrated)
export const BG = CANVAS_DARK
export const BG_ELEVATED = '#1F1E1A'
export const TEXT = INK
export const TEXT_MUTED = INK_SECONDARY
export const ACCENT = ACCENT_WARM
export const ACCENT_BRIGHT = ACCENT_WARM_LIGHT
export const ACCENT_SUBTLE = ACCENT_WARM_SUBTLE

// ── Technique ring colors (muted, calming tints for orb/rings only) ─────
export const TECHNIQUE_RING_COLORS: Record<TechniqueId, { primary: string; secondary: string }> = {
  [TECHNIQUE_IDS.BOX_BREATHING]:   { primary: '#8B7355', secondary: '#A89278' },
  [TECHNIQUE_IDS.CO2_TOLERANCE]:   { primary: '#6B8F71', secondary: '#8DAF92' },
  [TECHNIQUE_IDS.POWER_BREATHING]: { primary: '#A0654E', secondary: '#BF826B' },
  [TECHNIQUE_IDS.CYCLIC_SIGHING]:  { primary: '#7B8794', secondary: '#99A5B2' },
}

// Dark mode variants (same hues, adjusted lightness)
export const TECHNIQUE_RING_COLORS_DARK: Record<TechniqueId, { primary: string; secondary: string }> = {
  [TECHNIQUE_IDS.BOX_BREATHING]:   { primary: '#A89278', secondary: '#C4AD8E' },
  [TECHNIQUE_IDS.CO2_TOLERANCE]:   { primary: '#8DAF92', secondary: '#A3C4A8' },
  [TECHNIQUE_IDS.POWER_BREATHING]: { primary: '#BF826B', secondary: '#D49E87' },
  [TECHNIQUE_IDS.CYCLIC_SIGHING]:  { primary: '#99A5B2', secondary: '#B0BBC6' },
}

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

// ── Technique visual config (chromatic primary/secondary) ───────────────
export const TECHNIQUE = {
  box:     { primary: '#8B7355', secondary: '#A89278' },
  co2:     { primary: '#6B8F71', secondary: '#8DAF92' },
  power:   { primary: '#A0654E', secondary: '#BF826B' },
  sighing: { primary: '#7B8794', secondary: '#99A5B2' },
} as const

export const TECHNIQUE_GRADIENT = {
  box:     { from: '#8B7355', via: '#A89278', to: '#C4AD8E' },
  co2:     { from: '#6B8F71', via: '#8DAF92', to: '#A3C4A8' },
  power:   { from: '#A0654E', via: '#BF826B', to: '#D49E87' },
  sighing: { from: '#7B8794', via: '#99A5B2', to: '#B0BBC6' },
} as const

// ── Achievement / gamification ──────────────────────────────────────────
export const ACHIEVEMENT = ACCENT_WARM
export const PERSONAL_BEST = SUCCESS

// ── Destructive ─────────────────────────────────────────────────────────
export const DESTRUCTIVE = '#EF4444'

// ── Heatmap intensity stops (warm amber ramp) ───────────────────────────
export const HEATMAP = [
  'rgba(184, 134, 11, 0.08)',
  'rgba(184, 134, 11, 0.18)',
  'rgba(184, 134, 11, 0.35)',
  'rgba(184, 134, 11, 0.55)',
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

// ── Badge gradient (warm accent) ────────────────────────────────────────
export const BADGE_GRADIENT = { from: ACCENT_WARM, to: ACCENT_WARM_LIGHT } as const

// ── Utilities ───────────────────────────────────────────────────────────
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

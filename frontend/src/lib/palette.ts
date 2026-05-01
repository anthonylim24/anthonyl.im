// palette.ts – BreathFlow warm parchment + ink color system.

import type { TechniqueId } from './constants'
import { TECHNIQUE_IDS, BREATH_PHASES, type BreathPhase } from './constants'

// ── Canvas ──────────────────────────────────────────────────────────────
export const CANVAS = '#F5F2ED'
export const CANVAS_DARK = '#171613'
export const SURFACE = '#FFFEFA'

// ── Ink ─────────────────────────────────────────────────────────────────
export const INK = '#1C1917'
export const INK_SECONDARY = '#5F574F'
export const INK_TERTIARY = '#6F6760'
export const INK_FAINT = '#D8D1C7'

// ── Accent ──────────────────────────────────────────────────────────────
export const ACCENT_WARM = '#B8860B'
export const ACCENT_WARM_LIGHT = '#D6AD47'
export const ACCENT_WARM_SUBTLE = 'rgba(184, 134, 11, 0.12)'
export const SUCCESS = '#6B8F71'

// Legacy aliases
export const BG = CANVAS_DARK
export const BG_ELEVATED = '#111'
export const TEXT = INK
export const TEXT_MUTED = INK_SECONDARY
export const ACCENT = ACCENT_WARM
export const ACCENT_BRIGHT = ACCENT_WARM_LIGHT
export const ACCENT_SUBTLE = ACCENT_WARM_SUBTLE

// ── Technique ring colors (warm accent, restrained) ─────────────────────
const WARM_RING = { primary: ACCENT_WARM, secondary: ACCENT_WARM_LIGHT }
const WARM_RING_DARK = { primary: '#C9A227', secondary: '#E1C45C' }

export const TECHNIQUE_RING_COLORS: Record<TechniqueId, { primary: string; secondary: string }> = {
  [TECHNIQUE_IDS.BOX_BREATHING]:   WARM_RING,
  [TECHNIQUE_IDS.CO2_TOLERANCE]:   WARM_RING,
  [TECHNIQUE_IDS.POWER_BREATHING]: WARM_RING,
  [TECHNIQUE_IDS.CYCLIC_SIGHING]:  WARM_RING,
  [TECHNIQUE_IDS.RESONANCE_BREATHING]: WARM_RING,
  [TECHNIQUE_IDS.EXTENDED_EXHALE]: WARM_RING,
  [TECHNIQUE_IDS.FOUR_SEVEN_EIGHT]: WARM_RING,
  [TECHNIQUE_IDS.PURSED_LIP_RECOVERY]: WARM_RING,
}

export const TECHNIQUE_RING_COLORS_DARK: Record<TechniqueId, { primary: string; secondary: string }> = {
  [TECHNIQUE_IDS.BOX_BREATHING]:   WARM_RING_DARK,
  [TECHNIQUE_IDS.CO2_TOLERANCE]:   WARM_RING_DARK,
  [TECHNIQUE_IDS.POWER_BREATHING]: WARM_RING_DARK,
  [TECHNIQUE_IDS.CYCLIC_SIGHING]:  WARM_RING_DARK,
  [TECHNIQUE_IDS.RESONANCE_BREATHING]: WARM_RING_DARK,
  [TECHNIQUE_IDS.EXTENDED_EXHALE]: WARM_RING_DARK,
  [TECHNIQUE_IDS.FOUR_SEVEN_EIGHT]: WARM_RING_DARK,
  [TECHNIQUE_IDS.PURSED_LIP_RECOVERY]: WARM_RING_DARK,
}

// ── Breath-phase colors (ink scale) ──
export const PHASE = {
  inhale:      ACCENT_WARM,
  deep_inhale: '#C99A2E',
  hold_in:     '#8B6F47',
  exhale:      '#6F6760',
  hold_out:    '#8B8178',
  rest:        '#D8D1C7',
} as const

// ── Per-technique phase colors (shared warm scale) ──────────────────────
const WARM_PHASES: Record<BreathPhase, string> = {
  [BREATH_PHASES.INHALE]:      PHASE.inhale,
  [BREATH_PHASES.DEEP_INHALE]: PHASE.deep_inhale,
  [BREATH_PHASES.HOLD_IN]:     PHASE.hold_in,
  [BREATH_PHASES.EXHALE]:      PHASE.exhale,
  [BREATH_PHASES.HOLD_OUT]:    PHASE.hold_out,
  [BREATH_PHASES.REST]:        PHASE.rest,
}

export const TECHNIQUE_PHASES: Record<TechniqueId, Record<BreathPhase, string>> = {
  [TECHNIQUE_IDS.BOX_BREATHING]:   WARM_PHASES,
  [TECHNIQUE_IDS.CO2_TOLERANCE]:   WARM_PHASES,
  [TECHNIQUE_IDS.POWER_BREATHING]: WARM_PHASES,
  [TECHNIQUE_IDS.CYCLIC_SIGHING]:  WARM_PHASES,
  [TECHNIQUE_IDS.RESONANCE_BREATHING]: WARM_PHASES,
  [TECHNIQUE_IDS.EXTENDED_EXHALE]: WARM_PHASES,
  [TECHNIQUE_IDS.FOUR_SEVEN_EIGHT]: WARM_PHASES,
  [TECHNIQUE_IDS.PURSED_LIP_RECOVERY]: WARM_PHASES,
}

// ── Technique visual config ──────────────────────────────────────────────
export const TECHNIQUE = {
  box:     { primary: ACCENT_WARM, secondary: '#6F6760' },
  co2:     { primary: ACCENT_WARM, secondary: '#6F6760' },
  power:   { primary: ACCENT_WARM, secondary: '#6F6760' },
  sighing: { primary: ACCENT_WARM, secondary: '#6F6760' },
  resonance: { primary: ACCENT_WARM, secondary: '#6F6760' },
  exhale: { primary: ACCENT_WARM, secondary: '#6F6760' },
  sleep: { primary: ACCENT_WARM, secondary: '#6F6760' },
  recovery: { primary: ACCENT_WARM, secondary: '#6F6760' },
} as const

export const TECHNIQUE_GRADIENT = {
  box:     { from: ACCENT_WARM, via: ACCENT_WARM_LIGHT, to: '#6F6760' },
  co2:     { from: ACCENT_WARM, via: ACCENT_WARM_LIGHT, to: '#6F6760' },
  power:   { from: ACCENT_WARM, via: ACCENT_WARM_LIGHT, to: '#6F6760' },
  sighing: { from: ACCENT_WARM, via: ACCENT_WARM_LIGHT, to: '#6F6760' },
  resonance: { from: ACCENT_WARM, via: ACCENT_WARM_LIGHT, to: '#6F6760' },
  exhale: { from: ACCENT_WARM, via: ACCENT_WARM_LIGHT, to: '#6F6760' },
  sleep: { from: ACCENT_WARM, via: ACCENT_WARM_LIGHT, to: '#6F6760' },
  recovery: { from: ACCENT_WARM, via: ACCENT_WARM_LIGHT, to: '#6F6760' },
} as const

// ── Achievement / gamification ──────────────────────────────────────────
export const ACHIEVEMENT = ACCENT_WARM
export const PERSONAL_BEST = SUCCESS

// ── Destructive ─────────────────────────────────────────────────────────
export const DESTRUCTIVE = '#EF4444'

// ── Heatmap intensity stops (ink ramp) ───────────────────────────────────
export const HEATMAP = [
  'rgba(184, 134, 11, 0.1)',
  'rgba(184, 134, 11, 0.22)',
  'rgba(184, 134, 11, 0.4)',
  'rgba(184, 134, 11, 0.62)',
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

// ── Badge gradient ───────────────────────────────────────────────────────
export const BADGE_GRADIENT = { from: ACCENT_WARM, to: ACCENT_WARM_LIGHT } as const

// ── Utilities ───────────────────────────────────────────────────────────
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

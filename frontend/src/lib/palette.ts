// palette.ts – Monochrome ink color system. Editorial aesthetic, no chromatic accents.

import type { TechniqueId } from './constants'
import { TECHNIQUE_IDS, BREATH_PHASES, type BreathPhase } from './constants'

// ── Canvas ──────────────────────────────────────────────────────────────
export const CANVAS = '#f2efe9'
export const CANVAS_DARK = '#080808'
export const SURFACE = '#f2efe9'

// ── Ink ─────────────────────────────────────────────────────────────────
export const INK = '#1a1a1a'
export const INK_SECONDARY = '#888'
export const INK_TERTIARY = '#888'
export const INK_FAINT = '#d8d5cf'

// ── Accent (ink — no chromatic accent in editorial mode) ────────────────
export const ACCENT_WARM = '#1a1a1a'
export const ACCENT_WARM_LIGHT = '#888'
export const ACCENT_WARM_SUBTLE = 'rgba(26, 26, 26, 0.08)'
export const SUCCESS = '#1a1a1a'

// Legacy aliases
export const BG = CANVAS_DARK
export const BG_ELEVATED = '#111'
export const TEXT = INK
export const TEXT_MUTED = INK_SECONDARY
export const ACCENT = ACCENT_WARM
export const ACCENT_BRIGHT = ACCENT_WARM_LIGHT
export const ACCENT_SUBTLE = ACCENT_WARM_SUBTLE

// ── Technique ring colors (monochrome — all techniques identical) ────────
const MONO_RING = { primary: '#1a1a1a', secondary: '#888' }
const MONO_RING_DARK = { primary: '#b4b4b4', secondary: '#404040' }

export const TECHNIQUE_RING_COLORS: Record<TechniqueId, { primary: string; secondary: string }> = {
  [TECHNIQUE_IDS.BOX_BREATHING]:   MONO_RING,
  [TECHNIQUE_IDS.CO2_TOLERANCE]:   MONO_RING,
  [TECHNIQUE_IDS.POWER_BREATHING]: MONO_RING,
  [TECHNIQUE_IDS.CYCLIC_SIGHING]:  MONO_RING,
}

export const TECHNIQUE_RING_COLORS_DARK: Record<TechniqueId, { primary: string; secondary: string }> = {
  [TECHNIQUE_IDS.BOX_BREATHING]:   MONO_RING_DARK,
  [TECHNIQUE_IDS.CO2_TOLERANCE]:   MONO_RING_DARK,
  [TECHNIQUE_IDS.POWER_BREATHING]: MONO_RING_DARK,
  [TECHNIQUE_IDS.CYCLIC_SIGHING]:  MONO_RING_DARK,
}

// ── Breath-phase colors (ink scale) ──
export const PHASE = {
  inhale:      '#1a1a1a',
  deep_inhale: '#333',
  hold_in:     '#555',
  exhale:      '#666',
  hold_out:    '#888',
  rest:        '#aaa',
} as const

// ── Per-technique phase colors (monochromatic — same for all) ───────────
const MONO_PHASES: Record<BreathPhase, string> = {
  [BREATH_PHASES.INHALE]:      '#1a1a1a',
  [BREATH_PHASES.DEEP_INHALE]: '#333',
  [BREATH_PHASES.HOLD_IN]:     '#555',
  [BREATH_PHASES.EXHALE]:      '#666',
  [BREATH_PHASES.HOLD_OUT]:    '#888',
  [BREATH_PHASES.REST]:        '#aaa',
}

export const TECHNIQUE_PHASES: Record<TechniqueId, Record<BreathPhase, string>> = {
  [TECHNIQUE_IDS.BOX_BREATHING]:   MONO_PHASES,
  [TECHNIQUE_IDS.CO2_TOLERANCE]:   MONO_PHASES,
  [TECHNIQUE_IDS.POWER_BREATHING]: MONO_PHASES,
  [TECHNIQUE_IDS.CYCLIC_SIGHING]:  MONO_PHASES,
}

// ── Technique visual config (monochrome) ─────────────────────────────────
export const TECHNIQUE = {
  box:     { primary: '#1a1a1a', secondary: '#888' },
  co2:     { primary: '#1a1a1a', secondary: '#888' },
  power:   { primary: '#1a1a1a', secondary: '#888' },
  sighing: { primary: '#1a1a1a', secondary: '#888' },
} as const

export const TECHNIQUE_GRADIENT = {
  box:     { from: '#1a1a1a', via: '#555', to: '#888' },
  co2:     { from: '#1a1a1a', via: '#555', to: '#888' },
  power:   { from: '#1a1a1a', via: '#555', to: '#888' },
  sighing: { from: '#1a1a1a', via: '#555', to: '#888' },
} as const

// ── Achievement / gamification ──────────────────────────────────────────
export const ACHIEVEMENT = '#1a1a1a'
export const PERSONAL_BEST = '#1a1a1a'

// ── Destructive ─────────────────────────────────────────────────────────
export const DESTRUCTIVE = '#EF4444'

// ── Heatmap intensity stops (ink ramp) ───────────────────────────────────
export const HEATMAP = [
  'rgba(26, 26, 26, 0.08)',
  'rgba(26, 26, 26, 0.18)',
  'rgba(26, 26, 26, 0.35)',
  'rgba(26, 26, 26, 0.55)',
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

// ── Badge gradient (ink) ──────────────────────────────────────────────────
export const BADGE_GRADIENT = { from: '#1a1a1a', to: '#888' } as const

// ── Utilities ───────────────────────────────────────────────────────────
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

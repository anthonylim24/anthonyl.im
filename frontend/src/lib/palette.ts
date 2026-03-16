// palette.ts – Single source of truth for BreathFlow's color system.
// Professional light theme: zinc-900 accent, white backgrounds, technique colors for warmth.

import type { TechniqueId } from './constants'
import { TECHNIQUE_IDS, BREATH_PHASES, type BreathPhase } from './constants'

// ── Backgrounds ──────────────────────────────────────────────────────────────
// BG stays dark for the immersive breathing session only.
export const BG = '#050816'
export const BG_ELEVATED = '#0a0f1e'

// ── Text ─────────────────────────────────────────────────────────────────────
export const TEXT = '#18181B'
export const TEXT_MUTED = 'rgba(24, 24, 27, 0.45)'

// ── Accent (zinc-900 – professional, clean, non-AI-slop) ────────────────────
export const ACCENT = '#18181B'        // zinc-900 – primary interactive
export const ACCENT_BRIGHT = '#27272A' // zinc-800 – hover
export const ACCENT_SUBTLE = '#09090B' // zinc-950 – pressed

// ── Technique colors ────────────────────────────────────────────────────────
// Each technique owns a distinct hue — these are the only color moments.
//   Box Breathing  → Teal   (precision, structure, clarity)
//   CO2 Tolerance  → Amber  (endurance, warmth, challenge)
//   Power Breathing → Coral  (energy, activation, vitality)
//   Cyclic Sighing → Sage   (natural calm, parasympathetic)
export const TECHNIQUE = {
  box:     { primary: '#56B4A9', secondary: '#3D9088' },  // teal
  co2:     { primary: '#D4A04A', secondary: '#B58834' },  // amber
  power:   { primary: '#D47670', secondary: '#B45C56' },  // coral
  sighing: { primary: '#7CB88A', secondary: '#5E9A6C' },  // sage
} as const

// ── Breath-phase colors (FluidOrb defaults — stays vivid for dark session bg) ──
export const PHASE = {
  inhale:      '#818CF8',
  deep_inhale: '#99A5FF',
  hold_in:     '#A5B4FC',
  exhale:      '#6366F1',
  hold_out:    '#4F46E5',
  rest:        '#3730A3',
} as const

// ── Per-technique phase colors (lightness ramp within each hue) ─────────────
export const TECHNIQUE_PHASES: Record<TechniqueId, Record<BreathPhase, string>> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: {
    [BREATH_PHASES.INHALE]:      '#7AD0C6',
    [BREATH_PHASES.DEEP_INHALE]: '#8EDBD2',
    [BREATH_PHASES.HOLD_IN]:     '#A0E5DD',
    [BREATH_PHASES.EXHALE]:      '#56B4A9',
    [BREATH_PHASES.HOLD_OUT]:    '#3D9088',
    [BREATH_PHASES.REST]:        '#2A6B64',
  },
  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    [BREATH_PHASES.INHALE]:      '#E8BE72',
    [BREATH_PHASES.DEEP_INHALE]: '#F0D08E',
    [BREATH_PHASES.HOLD_IN]:     '#F5DDA6',
    [BREATH_PHASES.EXHALE]:      '#D4A04A',
    [BREATH_PHASES.HOLD_OUT]:    '#B58834',
    [BREATH_PHASES.REST]:        '#8E6A24',
  },
  [TECHNIQUE_IDS.POWER_BREATHING]: {
    [BREATH_PHASES.INHALE]:      '#EA9490',
    [BREATH_PHASES.DEEP_INHALE]: '#F0AAA6',
    [BREATH_PHASES.HOLD_IN]:     '#F4BCB9',
    [BREATH_PHASES.EXHALE]:      '#D47670',
    [BREATH_PHASES.HOLD_OUT]:    '#B45C56',
    [BREATH_PHASES.REST]:        '#8E4642',
  },
  [TECHNIQUE_IDS.CYCLIC_SIGHING]: {
    [BREATH_PHASES.INHALE]:      '#9CD4A8',
    [BREATH_PHASES.DEEP_INHALE]: '#AEE0B8',
    [BREATH_PHASES.HOLD_IN]:     '#BDE9C6',
    [BREATH_PHASES.EXHALE]:      '#7CB88A',
    [BREATH_PHASES.HOLD_OUT]:    '#5E9A6C',
    [BREATH_PHASES.REST]:        '#467552',
  },
}

// ── Achievement / gamification ──────────────────────────────────────────────
export const ACHIEVEMENT = '#D4A04A'   // warm amber (matches CO2 technique)
export const PERSONAL_BEST = '#E8BE72' // lighter gold

// ── Destructive ─────────────────────────────────────────────────────────────
export const DESTRUCTIVE = '#EF4444'

// ── Heatmap intensity stops (warm amber ramp) ───────────────────────────────
export const HEATMAP = [
  'rgba(212,160,74, 0.08)',
  'rgba(212,160,74, 0.20)',
  'rgba(212,160,74, 0.40)',
  'rgba(212,160,74, 0.65)',
] as const


// ── Gradient card backgrounds per technique ─────────────────────────────────
export const TECHNIQUE_GRADIENT = {
  box:     { from: '#2A6B64', via: '#56B4A9', to: '#7AD0C6' },
  co2:     { from: '#8E6A24', via: '#D4A04A', to: '#E8BE72' },
  power:   { from: '#8E4642', via: '#D47670', to: '#EA9490' },
  sighing: { from: '#467552', via: '#7CB88A', to: '#9CD4A8' },
} as const

// ── FluidOrb phase color pairs [primary, secondary] ──────────────────────────
// Hard-coded indigo values — decoupled from ACCENT so the immersive session
// keeps vivid orb colors regardless of the UI accent choice.
export const PHASE_PAIR: Record<string, [string, string]> = {
  inhale:      [PHASE.inhale, '#6366F1'],
  deep_inhale: [PHASE.deep_inhale, PHASE.inhale],
  hold_in:     [PHASE.hold_in, PHASE.inhale],
  exhale:      ['#6366F1', '#4F46E5'],
  hold_out:    ['#4F46E5', '#3730A3'],
  rest:        ['#3730A3', '#1E2550'],
  idle:        ['#1E2550', '#3730A3'],
}

// ── Badge gradient ────────────────────────────────────────────────────────────
export const BADGE_GRADIENT = { from: ACHIEVEMENT, to: '#8E6A24' } as const

// ── Utilities ─────────────────────────────────────────────────────────────────
/** Convert a hex color + alpha (0-1) to an rgba string */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

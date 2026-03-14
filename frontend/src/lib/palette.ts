// palette.ts – Single source of truth for BreathFlow's color system.
// Each technique has a distinct hue; indigo remains the primary UI accent.

import type { TechniqueId } from './constants'
import { TECHNIQUE_IDS, BREATH_PHASES, type BreathPhase } from './constants'

// ── Backgrounds ──────────────────────────────────────────────────────────────
export const BG = '#050816'
export const BG_ELEVATED = '#0a0f1e'

// ── Text ─────────────────────────────────────────────────────────────────────
export const TEXT = '#e8eaf0'
export const TEXT_MUTED = 'rgba(200,210,230,0.5)'

// ── Accent (indigo – primary UI color for buttons, links, nav) ──────────────
export const ACCENT = '#6366F1'        // indigo-500
export const ACCENT_BRIGHT = '#818CF8' // indigo-400
export const ACCENT_SUBTLE = '#4F46E5' // indigo-600

// ── Technique colors ────────────────────────────────────────────────────────
// Each technique owns a distinct hue to break the monochromatic indigo palette.
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

// ── Breath-phase colors (default fallback – indigo for non-technique contexts) ──
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
    [BREATH_PHASES.INHALE]:      '#7AD0C6', // teal bright
    [BREATH_PHASES.DEEP_INHALE]: '#8EDBD2',
    [BREATH_PHASES.HOLD_IN]:     '#A0E5DD',
    [BREATH_PHASES.EXHALE]:      '#56B4A9', // teal primary
    [BREATH_PHASES.HOLD_OUT]:    '#3D9088', // teal subtle
    [BREATH_PHASES.REST]:        '#2A6B64',
  },
  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    [BREATH_PHASES.INHALE]:      '#E8BE72', // amber bright
    [BREATH_PHASES.DEEP_INHALE]: '#F0D08E',
    [BREATH_PHASES.HOLD_IN]:     '#F5DDA6',
    [BREATH_PHASES.EXHALE]:      '#D4A04A', // amber primary
    [BREATH_PHASES.HOLD_OUT]:    '#B58834', // amber subtle
    [BREATH_PHASES.REST]:        '#8E6A24',
  },
  [TECHNIQUE_IDS.POWER_BREATHING]: {
    [BREATH_PHASES.INHALE]:      '#EA9490', // coral bright
    [BREATH_PHASES.DEEP_INHALE]: '#F0AAA6',
    [BREATH_PHASES.HOLD_IN]:     '#F4BCB9',
    [BREATH_PHASES.EXHALE]:      '#D47670', // coral primary
    [BREATH_PHASES.HOLD_OUT]:    '#B45C56', // coral subtle
    [BREATH_PHASES.REST]:        '#8E4642',
  },
  [TECHNIQUE_IDS.CYCLIC_SIGHING]: {
    [BREATH_PHASES.INHALE]:      '#9CD4A8', // sage bright
    [BREATH_PHASES.DEEP_INHALE]: '#AEE0B8',
    [BREATH_PHASES.HOLD_IN]:     '#BDE9C6',
    [BREATH_PHASES.EXHALE]:      '#7CB88A', // sage primary
    [BREATH_PHASES.HOLD_OUT]:    '#5E9A6C', // sage subtle
    [BREATH_PHASES.REST]:        '#467552',
  },
}

// ── Achievement / gamification ──────────────────────────────────────────────
export const ACHIEVEMENT = '#E8BE72'   // warm gold
export const PERSONAL_BEST = '#F0D08E' // lighter gold

// ── Destructive ─────────────────────────────────────────────────────────────
export const DESTRUCTIVE = '#EF4444'

// ── Heatmap intensity stops (warm amber ramp) ───────────────────────────────
export const HEATMAP = [
  'rgba(212,160,74, 0.05)',
  'rgba(212,160,74, 0.25)',
  'rgba(212,160,74, 0.45)',
  'rgba(212,160,74, 0.70)',
] as const

// ── Glass tint (neutral – no hue bias) ──────────────────────────────────────
export const GLASS_TINT = 'rgba(180,185,200, 0.06)'
export const GLASS_BORDER = 'rgba(255,255,255,0.08)'

// ── Gradient card backgrounds per technique ─────────────────────────────────
export const TECHNIQUE_GRADIENT = {
  box:     { from: '#2A6B64', via: '#56B4A9', to: '#7AD0C6' },   // teal deep → bright
  co2:     { from: '#8E6A24', via: '#D4A04A', to: '#E8BE72' },   // amber deep → bright
  power:   { from: '#8E4642', via: '#D47670', to: '#EA9490' },   // coral deep → bright
  sighing: { from: '#467552', via: '#7CB88A', to: '#9CD4A8' },   // sage deep → bright
} as const

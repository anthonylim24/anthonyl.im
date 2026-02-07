// palette.ts – Single source of truth for the indigo color system.
// Uses Tailwind's indigo scale for consistency with the broader design system.

// ── Backgrounds ──────────────────────────────────────────────────────────────
export const BG = '#050816'
export const BG_ELEVATED = '#0a0f1e'

// ── Text ─────────────────────────────────────────────────────────────────────
export const TEXT = '#e8eaf0'
export const TEXT_MUTED = 'rgba(200,210,230,0.5)'

// ── Accent (indigo) ─────────────────────────────────────────────────────────
export const ACCENT = '#6366F1'        // indigo-500
export const ACCENT_BRIGHT = '#818CF8' // indigo-400
export const ACCENT_SUBTLE = '#4F46E5' // indigo-600

// ── Technique colors ────────────────────────────────────────────────────────
export const TECHNIQUE = {
  box:     { primary: '#818CF8', secondary: '#6366F1' },  // indigo-400 → 500
  co2:     { primary: '#6366F1', secondary: '#4F46E5' },  // indigo-500 → 600
  power:   { primary: '#A5B4FC', secondary: '#818CF8' },  // indigo-300 → 400
  sighing: { primary: '#7C8AFF', secondary: '#5B6AD4' },  // calming mid-range indigo
} as const

// ── Breath-phase colors (lightness ramp) ────────────────────────────────────
export const PHASE = {
  inhale:      '#818CF8', // indigo-400
  deep_inhale: '#99A5FF', // brighter inhale for the "sip"
  hold_in:     '#A5B4FC', // indigo-300
  exhale:      '#6366F1', // indigo-500
  hold_out:    '#4F46E5', // indigo-600
  rest:        '#3730A3', // indigo-800
} as const

// ── Achievement / gamification ──────────────────────────────────────────────
export const ACHIEVEMENT = '#A5B4FC'   // indigo-300
export const PERSONAL_BEST = '#C7D2FE' // indigo-200

// ── Destructive (the only non-indigo color) ─────────────────────────────────
export const DESTRUCTIVE = '#EF4444'

// ── Heatmap intensity stops (indigo at varying alpha) ───────────────────────
export const HEATMAP = [
  'rgba(99,102,241, 0.05)',
  'rgba(99,102,241, 0.25)',
  'rgba(99,102,241, 0.45)',
  'rgba(99,102,241, 0.70)',
] as const

// ── Glass tint ──────────────────────────────────────────────────────────────
export const GLASS_TINT = 'rgba(99,102,241, 0.08)'
export const GLASS_BORDER = 'rgba(255,255,255,0.08)'

// ── Gradient card backgrounds per technique ─────────────────────────────────
export const TECHNIQUE_GRADIENT = {
  box:     { from: '#4338CA', via: '#6366F1', to: '#818CF8' },   // deep → mid → bright
  co2:     { from: '#312E81', via: '#4338CA', to: '#6366F1' },   // darker spectrum
  power:   { from: '#6366F1', via: '#818CF8', to: '#A5B4FC' },   // bright spectrum
  sighing: { from: '#3730A3', via: '#5B6AD4', to: '#7C8AFF' },   // calm deep → mid
} as const

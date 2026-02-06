// palette.ts – Single source of truth for the indigo monochrome color system.
// Every color in the breathwork UI derives from this file.

// ── Backgrounds ──────────────────────────────────────────────────────────────
export const BG = '#080b16'
export const BG_ELEVATED = '#0d1121'

// ── Text ─────────────────────────────────────────────────────────────────────
export const TEXT = '#e8eaf0'
export const TEXT_MUTED = 'rgba(200,210,230,0.5)'

// ── Accent (indigo) ─────────────────────────────────────────────────────────
export const ACCENT = '#6E7BF2'
export const ACCENT_BRIGHT = '#8B96FF'
export const ACCENT_SUBTLE = '#4B55B8'

// ── Technique colors ────────────────────────────────────────────────────────
export const TECHNIQUE = {
  box:   { primary: '#7C8AFF', secondary: '#6E7BF2' },
  co2:   { primary: '#5B6AD4', secondary: '#4B5ABE' },
  power: { primary: '#99A5FF', secondary: '#8B96FF' },
} as const

// ── Breath-phase colors (lightness ramp) ────────────────────────────────────
export const PHASE = {
  inhale:   '#8B96FF',
  hold_in:  '#B0B8FF',
  exhale:   '#5B6AD4',
  hold_out: '#3D4A9E',
  rest:     '#2A3370',
} as const

// ── Achievement / gamification ──────────────────────────────────────────────
export const ACHIEVEMENT = '#B0B8FF'
export const PERSONAL_BEST = '#A898FF'

// ── Destructive (the only non-indigo color) ─────────────────────────────────
export const DESTRUCTIVE = '#E55B6B'

// ── Heatmap intensity stops (indigo at varying alpha) ───────────────────────
export const HEATMAP = [
  'rgba(110,123,242, 0.05)',
  'rgba(110,123,242, 0.25)',
  'rgba(110,123,242, 0.45)',
  'rgba(110,123,242, 0.70)',
] as const

// ── Glass tint ──────────────────────────────────────────────────────────────
export const GLASS_TINT = 'rgba(110,123,242, 0.08)'
export const GLASS_BORDER = 'rgba(255,255,255,0.10)'

export const BREATH_PHASES = {
  INHALE: 'inhale',
  HOLD_IN: 'hold_in',
  EXHALE: 'exhale',
  HOLD_OUT: 'hold_out',
  REST: 'rest',
} as const

export type BreathPhase = typeof BREATH_PHASES[keyof typeof BREATH_PHASES]

export const PHASE_LABELS: Record<BreathPhase, string> = {
  [BREATH_PHASES.INHALE]: 'Breathe In',
  [BREATH_PHASES.HOLD_IN]: 'Hold',
  [BREATH_PHASES.EXHALE]: 'Breathe Out',
  [BREATH_PHASES.HOLD_OUT]: 'Hold',
  [BREATH_PHASES.REST]: 'Rest',
}

export const TECHNIQUE_IDS = {
  CO2_TOLERANCE: 'co2_tolerance',
  BOX_BREATHING: 'box_breathing',
  POWER_BREATHING: 'power_breathing',
} as const

export type TechniqueId = typeof TECHNIQUE_IDS[keyof typeof TECHNIQUE_IDS]

export const STORAGE_KEYS = {
  SESSION_HISTORY: 'breathwork-session-history',
  USER_PREFERENCES: 'breathwork-user-preferences',
}

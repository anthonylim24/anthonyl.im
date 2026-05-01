import { BREATH_PHASES, PHASE_LABELS, type BreathPhase } from '@/lib/constants'

export const PHASE_DURATION_LIMITS = {
  [BREATH_PHASES.INHALE]: { min: 1, max: 12 },
  [BREATH_PHASES.DEEP_INHALE]: { min: 1, max: 8 },
  [BREATH_PHASES.HOLD_IN]: { min: 1, max: 45 },
  [BREATH_PHASES.EXHALE]: { min: 1, max: 20 },
  [BREATH_PHASES.HOLD_OUT]: { min: 1, max: 30 },
  [BREATH_PHASES.REST]: { min: 1, max: 30 },
} satisfies Record<BreathPhase, { min: number; max: number }>

export const PHASE_EDITOR_LABELS = {
  [BREATH_PHASES.INHALE]: PHASE_LABELS[BREATH_PHASES.INHALE],
  [BREATH_PHASES.DEEP_INHALE]: PHASE_LABELS[BREATH_PHASES.DEEP_INHALE],
  [BREATH_PHASES.HOLD_IN]: 'Hold after inhale',
  [BREATH_PHASES.EXHALE]: PHASE_LABELS[BREATH_PHASES.EXHALE],
  [BREATH_PHASES.HOLD_OUT]: 'Hold after exhale',
  [BREATH_PHASES.REST]: PHASE_LABELS[BREATH_PHASES.REST],
} satisfies Record<BreathPhase, string>

export function clampCadenceDuration(phase: BreathPhase, duration: number): number {
  const limit = PHASE_DURATION_LIMITS[phase]
  return Math.min(limit.max, Math.max(limit.min, Math.round(duration)))
}

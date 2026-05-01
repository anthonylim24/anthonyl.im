import { PHASE_LABELS, type BreathPhase } from '@/lib/constants'

export function getBreathingVisualizationLabel(phase: BreathPhase | null) {
  return phase
    ? `Breathing visualization: ${PHASE_LABELS[phase]} phase`
    : 'Breathing visualization: ready'
}

export function getInteractiveBreathingVisualizationLabel(phase: BreathPhase | null) {
  return `${getBreathingVisualizationLabel(phase)}. Activate repeatedly to toggle alternate visual.`
}

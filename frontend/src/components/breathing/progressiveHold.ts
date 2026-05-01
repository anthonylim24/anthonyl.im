import { BREATH_PHASES } from '@/lib/constants'
import type { BreathPhase } from '@/lib/constants'
import type { BreathingProtocol } from '@/lib/breathingProtocols'
import { getPhaseForRound } from '@/lib/breathingProtocols'

export function getProgressiveHoldDurations(
  protocol: BreathingProtocol,
  rounds: number,
  customDurations?: Partial<Record<BreathPhase, number>>,
): number[] {
  if (!protocol.progressiveHold || rounds <= 0) {
    return []
  }

  const holdIndex = protocol.phases.findIndex((phase) => phase.phase === BREATH_PHASES.HOLD_IN)
  if (holdIndex === -1) {
    return []
  }

  return Array.from({ length: rounds }, (_, round) =>
    getPhaseForRound(protocol, round, holdIndex, customDurations).duration
  )
}

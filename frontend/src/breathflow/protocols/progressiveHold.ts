import { BREATH_PHASES } from '@/lib/constants'
import { getPhaseBaseSeconds, type CustomPhaseDurations } from './cadence'
import type { BreathingProtocol } from './types'

/**
 * The full hold ladder for a progressive-hold protocol (CO2 Tolerance Table):
 * hold_in duration per round = base + roundIndex * holdIncrementSeconds.
 * A custom hold_in replaces the base; the increment still applies.
 * Returns an empty array for protocols without a hold increment.
 */
export function getHoldLadder(
  protocol: BreathingProtocol,
  rounds: number,
  custom?: CustomPhaseDurations,
): number[] {
  const increment = protocol.holdIncrementSeconds
  if (!increment) return []

  const base = getPhaseBaseSeconds(protocol, BREATH_PHASES.HOLD_IN, custom)
  return Array.from({ length: Math.max(0, rounds) }, (_, roundIndex) => base + roundIndex * increment)
}

export function hasProgressiveHolds(protocol: BreathingProtocol): boolean {
  return Boolean(protocol.holdIncrementSeconds)
}

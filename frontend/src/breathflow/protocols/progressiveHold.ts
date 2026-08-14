import { getProgressiveHoldSeconds, type CustomPhaseDurations } from './cadence'
import type { BreathingProtocol } from './types'

/**
 * The full hold ladder for a progressive-hold protocol (CO2 Tolerance Table):
 * hold_in duration per round = clamp(base + roundIndex * holdIncrementSeconds).
 * A custom hold_in replaces the base; the increment still applies, and every
 * rung is re-clamped so later rounds cannot exceed the hold_in maximum.
 * Returns an empty array for protocols without a hold increment.
 */
export function getHoldLadder(
  protocol: BreathingProtocol,
  rounds: number,
  custom?: CustomPhaseDurations,
): number[] {
  if (!protocol.holdIncrementSeconds) return []

  return Array.from(
    { length: Math.max(0, rounds) },
    (_, roundIndex) => getProgressiveHoldSeconds(protocol, roundIndex, custom),
  )
}

export function hasProgressiveHolds(protocol: BreathingProtocol): boolean {
  return Boolean(protocol.holdIncrementSeconds)
}

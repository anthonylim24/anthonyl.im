import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'
import type { BreathingProtocol } from './types'

export type CustomPhaseDurations = Partial<Record<BreathPhase, number>>

interface PhaseLimit {
  min: number
  max: number
}

/** Editable-cadence clamps per phase (seconds). */
export const PHASE_SECOND_LIMITS: Record<BreathPhase, PhaseLimit> = {
  [BREATH_PHASES.INHALE]: { min: 1, max: 12 },
  [BREATH_PHASES.DEEP_INHALE]: { min: 1, max: 8 },
  [BREATH_PHASES.HOLD_IN]: { min: 1, max: 45 },
  [BREATH_PHASES.EXHALE]: { min: 1, max: 20 },
  [BREATH_PHASES.HOLD_OUT]: { min: 1, max: 30 },
  [BREATH_PHASES.REST]: { min: 1, max: 30 },
}

export const MIN_ROUNDS = 1

/** Max rounds = max(40, defaultRounds) so Diaphragmatic (38) and Recovery (50) keep their defaults. */
export function getMaxRounds(protocol: BreathingProtocol): number {
  return Math.max(40, protocol.defaultRounds)
}

export function clampRounds(protocol: BreathingProtocol, rounds: number): number {
  if (!Number.isFinite(rounds)) return protocol.defaultRounds
  return Math.min(getMaxRounds(protocol), Math.max(MIN_ROUNDS, Math.round(rounds)))
}

export function clampPhaseSeconds(phase: BreathPhase, seconds: number): number {
  const { min, max } = PHASE_SECOND_LIMITS[phase]
  if (!Number.isFinite(seconds)) return min
  return Math.min(max, Math.max(min, Math.round(seconds)))
}

/**
 * Drop entries for phases the protocol does not have, clamp the rest, and
 * remove values equal to the protocol default. Returns undefined when nothing
 * is actually custom — so history/URLs only carry real customizations.
 */
export function sanitizeCustomDurations(
  protocol: BreathingProtocol,
  custom: CustomPhaseDurations | undefined,
): CustomPhaseDurations | undefined {
  if (!custom) return undefined

  const sanitized: CustomPhaseDurations = {}
  for (const { phase, seconds } of protocol.phases) {
    const value = custom[phase]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const clamped = clampPhaseSeconds(phase, value)
    if (clamped !== seconds) {
      sanitized[phase] = clamped
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

/**
 * Base duration of a phase (before any progressive-hold ladder), honoring a
 * custom override. For CO2's hold_in, a custom value replaces the ladder base.
 */
export function getPhaseBaseSeconds(
  protocol: BreathingProtocol,
  phase: BreathPhase,
  custom?: CustomPhaseDurations,
): number {
  const defaultSeconds = protocol.phases.find((entry) => entry.phase === phase)?.seconds ?? 0
  const customSeconds = custom?.[phase]
  if (typeof customSeconds === 'number' && Number.isFinite(customSeconds)) {
    return clampPhaseSeconds(phase, customSeconds)
  }
  return defaultSeconds
}

/**
 * Progressive-hold duration for a 0-based round. The increment is applied
 * to the (possibly custom) base, then clamped so later rounds cannot
 * exceed the hold_in maximum.
 */
export function getProgressiveHoldSeconds(
  protocol: BreathingProtocol,
  roundIndex: number,
  custom?: CustomPhaseDurations,
): number {
  const base = getPhaseBaseSeconds(protocol, BREATH_PHASES.HOLD_IN, custom)
  const increment = protocol.holdIncrementSeconds ?? 0
  return clampPhaseSeconds(BREATH_PHASES.HOLD_IN, base + roundIndex * increment)
}

/**
 * Actual duration of a phase in a given 0-based round, applying the
 * progressive-hold increment to hold_in when the protocol defines one.
 */
export function getPhaseSecondsForRound(
  protocol: BreathingProtocol,
  phase: BreathPhase,
  roundIndex: number,
  custom?: CustomPhaseDurations,
): number {
  if (phase === BREATH_PHASES.HOLD_IN && protocol.holdIncrementSeconds) {
    return getProgressiveHoldSeconds(protocol, roundIndex, custom)
  }
  return getPhaseBaseSeconds(protocol, phase, custom)
}

/** Duration of one full round (all phases) in a given 0-based round. */
export function getRoundSeconds(
  protocol: BreathingProtocol,
  roundIndex: number,
  custom?: CustomPhaseDurations,
): number {
  return protocol.phases.reduce(
    (total, { phase }) => total + getPhaseSecondsForRound(protocol, phase, roundIndex, custom),
    0,
  )
}

/**
 * Planned session duration: the sum of every phase across every round,
 * including progressive holds. This — never wall-clock — is what history
 * records as durationSeconds.
 */
export function plannedSessionSeconds(
  protocol: BreathingProtocol,
  rounds: number,
  custom?: CustomPhaseDurations,
): number {
  let total = 0
  for (let roundIndex = 0; roundIndex < rounds; roundIndex++) {
    total += getRoundSeconds(protocol, roundIndex, custom)
  }
  return total
}

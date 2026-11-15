import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'
import {
  getPhaseSecondsForRound,
  type CustomPhaseDurations,
} from '../protocols/cadence'
import type { BreathingProtocol } from '../protocols/types'

/**
 * The breath clock: where a session is (round, phase, seconds left) and how
 * one breathed second moves it. Pure and deterministic. The session's modes
 * (lead-in, running, paused, summary) live in `sessionMachine.ts`, which owns
 * a cursor while breathing.
 */

/** What the breath visuals need to know about the clock (see `breathDrive.ts`). */
export type EngineStatus = 'idle' | 'running' | 'paused' | 'complete'

export interface EngineConfig {
  protocol: BreathingProtocol
  rounds: number
  customDurations?: CustomPhaseDurations
}

export interface Cursor {
  /** 0-based round. */
  roundIndex: number
  /** 0-based index into protocol.phases. */
  phaseIndex: number
  secondsLeftInPhase: number
  /** Breathed seconds inside the current hold phase (pauses never count). */
  heldSecondsThisPhase: number
  /** Actual held seconds per completed hold phase, in order. */
  holdTimes: readonly number[]
}

export function isHoldPhase(phase: BreathPhase): boolean {
  return phase === BREATH_PHASES.HOLD_IN || phase === BREATH_PHASES.HOLD_OUT
}

export function getCurrentPhase(config: EngineConfig, cursor: Pick<Cursor, 'phaseIndex'>): BreathPhase {
  return config.protocol.phases[cursor.phaseIndex]?.phase ?? BREATH_PHASES.INHALE
}

export function getCurrentPhaseSeconds(config: EngineConfig, cursor: Pick<Cursor, 'phaseIndex' | 'roundIndex'>): number {
  return getPhaseSecondsForRound(
    config.protocol,
    getCurrentPhase(config, cursor),
    cursor.roundIndex,
    config.customDurations,
  )
}

/** Round 1, phase 1, nothing breathed. */
export function startCursor(config: EngineConfig): Cursor {
  return restartPhase(config, { roundIndex: 0, phaseIndex: 0, secondsLeftInPhase: 0, heldSecondsThisPhase: 0, holdTimes: [] })
}

/** The current phase from its first second (returning from the background). */
export function restartPhase(config: EngineConfig, cursor: Cursor): Cursor {
  return { ...cursor, heldSecondsThisPhase: 0, secondsLeftInPhase: getCurrentPhaseSeconds(config, cursor) }
}

export interface Step {
  /** `complete`: the final phase of the final round just ended. */
  boundary: 'none' | 'phase' | 'complete'
  cursor: Cursor
}

/** Advance by one breathed second. */
export function advanceOneSecond(config: EngineConfig, cursor: Cursor): Step {
  const phase = getCurrentPhase(config, cursor)
  const heldSecondsThisPhase = isHoldPhase(phase) ? cursor.heldSecondsThisPhase + 1 : cursor.heldSecondsThisPhase
  const secondsLeftInPhase = cursor.secondsLeftInPhase - 1

  if (secondsLeftInPhase > 0) {
    return { boundary: 'none', cursor: { ...cursor, secondsLeftInPhase, heldSecondsThisPhase } }
  }

  const holdTimes = isHoldPhase(phase) ? [...cursor.holdTimes, heldSecondsThisPhase] : cursor.holdTimes
  const isLastPhaseOfRound = cursor.phaseIndex >= config.protocol.phases.length - 1
  const isLastRound = cursor.roundIndex >= config.rounds - 1

  if (isLastPhaseOfRound && isLastRound) {
    return {
      boundary: 'complete',
      cursor: { ...cursor, secondsLeftInPhase: 0, heldSecondsThisPhase: 0, holdTimes, roundIndex: config.rounds },
    }
  }

  return {
    boundary: 'phase',
    cursor: restartPhase(config, {
      ...cursor,
      roundIndex: isLastPhaseOfRound ? cursor.roundIndex + 1 : cursor.roundIndex,
      phaseIndex: isLastPhaseOfRound ? 0 : cursor.phaseIndex + 1,
      holdTimes,
    }),
  }
}

/** Seconds breathed so far: every finished round and phase, plus the current phase. */
export function elapsedSessionSeconds(config: EngineConfig, cursor: Cursor): number {
  const rounds = Math.min(cursor.roundIndex, config.rounds)
  let elapsed = 0
  for (let round = 0; round < rounds; round++) {
    for (const { phase } of config.protocol.phases) {
      elapsed += getPhaseSecondsForRound(config.protocol, phase, round, config.customDurations)
    }
  }
  if (cursor.roundIndex >= config.rounds) return elapsed
  for (let index = 0; index < cursor.phaseIndex; index++) {
    elapsed += getPhaseSecondsForRound(config.protocol, config.protocol.phases[index].phase, cursor.roundIndex, config.customDurations)
  }
  return elapsed + getCurrentPhaseSeconds(config, cursor) - cursor.secondsLeftInPhase
}

import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'
import {
  getPhaseSecondsForRound,
  type CustomPhaseDurations,
} from '../protocols/cadence'
import type { BreathingProtocol } from '../protocols/types'

/**
 * Pure session state machine. The hook (useSessionEngine) drives this with a
 * single 1 Hz interval; everything here is deterministic and unit-testable.
 */

export type EngineStatus = 'idle' | 'running' | 'paused' | 'complete'

export interface EngineConfig {
  protocol: BreathingProtocol
  rounds: number
  customDurations?: CustomPhaseDurations
}

export interface EngineState {
  status: EngineStatus
  /** 0-based round. */
  roundIndex: number
  /** 0-based index into protocol.phases. */
  phaseIndex: number
  secondsLeftInPhase: number
  /** Running-tick count inside the current hold phase (pause-aware by construction). */
  heldSecondsThisPhase: number
  /** Actual held seconds per completed hold phase, in order. */
  holdTimes: number[]
}

export type EngineEvent =
  | { type: 'phase'; phase: BreathPhase; roundIndex: number }
  | { type: 'complete'; holdTimes: number[] }

export function isHoldPhase(phase: BreathPhase): boolean {
  return phase === BREATH_PHASES.HOLD_IN || phase === BREATH_PHASES.HOLD_OUT
}

export function getCurrentPhase(config: EngineConfig, state: EngineState): BreathPhase {
  return config.protocol.phases[state.phaseIndex]?.phase ?? BREATH_PHASES.INHALE
}

export function getCurrentPhaseSeconds(config: EngineConfig, state: EngineState): number {
  return getPhaseSecondsForRound(
    config.protocol,
    getCurrentPhase(config, state),
    state.roundIndex,
    config.customDurations,
  )
}

export function createIdleState(): EngineState {
  return {
    status: 'idle',
    roundIndex: 0,
    phaseIndex: 0,
    secondsLeftInPhase: 0,
    heldSecondsThisPhase: 0,
    holdTimes: [],
  }
}

/** Fresh running state at round 1, phase 1 (also used by Restart). */
export function createRunningState(config: EngineConfig): EngineState {
  const state: EngineState = {
    status: 'running',
    roundIndex: 0,
    phaseIndex: 0,
    secondsLeftInPhase: 0,
    heldSecondsThisPhase: 0,
    holdTimes: [],
  }
  state.secondsLeftInPhase = getCurrentPhaseSeconds(config, state)
  return state
}

export interface TickResult {
  state: EngineState
  events: EngineEvent[]
}

/**
 * Advance the machine by one running second. No-op unless status is
 * 'running'. Emits a 'phase' event at each phase boundary and a single
 * 'complete' event after the final phase of the final round.
 */
export function advanceOneSecond(config: EngineConfig, state: EngineState): TickResult {
  if (state.status !== 'running') {
    return { state, events: [] }
  }

  const phase = getCurrentPhase(config, state)
  const heldSecondsThisPhase = isHoldPhase(phase)
    ? state.heldSecondsThisPhase + 1
    : state.heldSecondsThisPhase
  const secondsLeftInPhase = state.secondsLeftInPhase - 1

  if (secondsLeftInPhase > 0) {
    return {
      state: { ...state, secondsLeftInPhase, heldSecondsThisPhase },
      events: [],
    }
  }

  // Phase finished: record actual held seconds for hold phases.
  const holdTimes = isHoldPhase(phase)
    ? [...state.holdTimes, heldSecondsThisPhase]
    : state.holdTimes

  const isLastPhaseOfRound = state.phaseIndex >= config.protocol.phases.length - 1
  const isLastRound = state.roundIndex >= config.rounds - 1

  if (isLastPhaseOfRound && isLastRound) {
    const completeState: EngineState = {
      ...state,
      status: 'complete',
      secondsLeftInPhase: 0,
      heldSecondsThisPhase: 0,
      holdTimes,
    }
    return { state: completeState, events: [{ type: 'complete', holdTimes }] }
  }

  const nextState: EngineState = {
    ...state,
    roundIndex: isLastPhaseOfRound ? state.roundIndex + 1 : state.roundIndex,
    phaseIndex: isLastPhaseOfRound ? 0 : state.phaseIndex + 1,
    heldSecondsThisPhase: 0,
    holdTimes,
    secondsLeftInPhase: 0,
  }
  nextState.secondsLeftInPhase = getCurrentPhaseSeconds(config, nextState)

  return {
    state: nextState,
    events: [{
      type: 'phase',
      phase: getCurrentPhase(config, nextState),
      roundIndex: nextState.roundIndex,
    }],
  }
}

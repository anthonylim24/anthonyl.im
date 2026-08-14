import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'
import type { EngineStatus } from '../engine/sessionEngine'
import type { ProtocolPhase } from '../protocols/types'

/** Breath amplitude per phase: 1 = fully inhaled, ~0.6 = fully exhaled. */
const PHASE_AMPLITUDE: Record<BreathPhase, number> = {
  [BREATH_PHASES.INHALE]: 1,
  [BREATH_PHASES.DEEP_INHALE]: 1.1,
  [BREATH_PHASES.HOLD_IN]: 1,
  [BREATH_PHASES.EXHALE]: 0.62,
  [BREATH_PHASES.HOLD_OUT]: 0.62,
  [BREATH_PHASES.REST]: 0.74,
}

export interface PhaseScaleTarget {
  phase: BreathPhase
  /** Amplitude at the start of the current phase. */
  from: number
  /** Scale to animate toward for the current phase. */
  target: number
  /** Frozen scale while paused (1s-granular interpolation). */
  frozen: number
  /** Seconds the animation should take (remaining phase time). */
  duration: number
  /** Whether the phase holds a steady amplitude (holds / rest). */
  steady: boolean
}

/**
 * The scale target driving the instrument / tide visualizations. Motion
 * animates from the currently rendered value, so resume-from-pause and
 * mid-phase mounting need no special casing: animate to `target` over
 * `duration` seconds while running, or settle on `frozen` when paused.
 */
export function getPhaseScaleTarget(
  phases: readonly ProtocolPhase[],
  phaseIndex: number,
  phaseSeconds: number,
  secondsLeftInPhase: number,
  status: EngineStatus,
): PhaseScaleTarget {
  const phase = phases[phaseIndex]?.phase ?? BREATH_PHASES.INHALE
  const previousPhase = phases[(phaseIndex + phases.length - 1) % phases.length]?.phase

  // Holds keep the amplitude they arrived at (after inhale = full, after exhale = empty).
  const isHold = phase === BREATH_PHASES.HOLD_IN || phase === BREATH_PHASES.HOLD_OUT
  const target = isHold && previousPhase
    ? PHASE_AMPLITUDE[previousPhase]
    : PHASE_AMPLITUDE[phase]
  const from = previousPhase ? PHASE_AMPLITUDE[previousPhase] : target

  const progress = phaseSeconds > 0
    ? Math.min(1, Math.max(0, (phaseSeconds - secondsLeftInPhase) / phaseSeconds))
    : 1

  return {
    phase,
    from,
    target,
    frozen: from + (target - from) * progress,
    duration: status === 'running' ? Math.max(0.2, secondsLeftInPhase) : 0.3,
    steady: isHold || phase === BREATH_PHASES.REST,
  }
}

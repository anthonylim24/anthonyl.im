import { useRef } from 'react'
import { cubicBezier } from 'motion/react'
import { BREATH_PHASES } from '@/lib/constants'
import type { EngineStatus } from '../engine/sessionEngine'
import { breathEase } from '../motion/tokens'
import type { ProtocolPhase } from '../protocols/types'
import { getPhaseScaleTarget } from '../components/usePhaseScale'

export interface BreathSample {
  /** 0 = fully exhaled, 1 = fully inhaled (a cyclic-sigh sip tops up past 1). */
  amplitude: number
  /** 0..1 through the current phase. */
  progress: number
  /** Holding (in or out): the bloom shivers instead of moving. */
  hold: boolean
  /** 0..1 through the whole breath cycle (box breathing traces it). */
  cycle: number
}

export interface BreathState {
  phases: readonly ProtocolPhase[]
  phaseIndex: number
  phaseSeconds: number
  secondsLeftInPhase: number
  status: EngineStatus
}

/** Amplitudes from usePhaseScale (0.62 empty … 1 full) mapped to 0 … 1. */
const toAmplitude = (scale: number) => (scale - 0.62) / 0.38

const easings = new Map<string, (t: number) => number>()
function ease(phase: ProtocolPhase['phase']) {
  const curve = breathEase(phase)
  const key = curve.join()
  let fn = easings.get(key)
  if (!fn) {
    fn = cubicBezier(...curve)
    easings.set(key, fn)
  }
  return fn
}

/**
 * Breath position at `elapsed` seconds into the current phase. The engine
 * ticks once a second; callers add the wall-clock time since the last tick
 * so the bloom moves continuously and lands exactly on each phase change.
 */
export function sampleBreath(state: BreathState, elapsed: number): BreathSample {
  const { phases, phaseIndex, phaseSeconds, secondsLeftInPhase, status } = state
  const t = getPhaseScaleTarget(phases, phaseIndex, phaseSeconds, secondsLeftInPhase, status)
  const progress = phaseSeconds > 0 ? Math.min(1, Math.max(0, elapsed / phaseSeconds)) : 1
  const value = t.from + (t.target - t.from) * ease(t.phase)(progress)
  return {
    amplitude: toAmplitude(value),
    progress,
    hold: t.phase === BREATH_PHASES.HOLD_IN || t.phase === BREATH_PHASES.HOLD_OUT,
    cycle: phases.length > 0 ? (phaseIndex + progress) / phases.length : progress,
  }
}

/** Ambient breathing for the idle bloom: 5.5 s in, 5.5 s out. */
export function idleBreath(seconds: number): BreathSample {
  const cycle = (seconds % 11) / 11
  return { amplitude: 0.5 - 0.5 * Math.cos(cycle * Math.PI * 2), progress: cycle, hold: false, cycle }
}

/**
 * A stable reader the render loop can call every frame. Re-renders (one per
 * engine tick) refresh the snapshot; reading interpolates between ticks.
 */
export function useBreathReader(state: BreathState): () => BreathSample {
  const snap = useRef({ state, at: performance.now(), pausedAt: 0 })
  const prev = snap.current.state
  if (
    prev.phaseIndex !== state.phaseIndex ||
    prev.secondsLeftInPhase !== state.secondsLeftInPhase ||
    prev.status !== state.status ||
    prev.phases !== state.phases
  ) {
    const now = performance.now()
    // Pausing freezes where the bloom actually was, not the last whole second.
    const pausedAt = state.status !== 'paused'
      ? 0
      : prev.status === 'running' ? elapsedOf(prev, now - snap.current.at) : snap.current.pausedAt
    snap.current = { state, at: now, pausedAt }
  }

  const reader = useRef<() => BreathSample>(null)
  reader.current ??= () => {
    const { state: s, at, pausedAt } = snap.current
    const elapsed = s.status === 'paused' && pausedAt > 0 ? pausedAt : elapsedOf(s, performance.now() - at)
    return sampleBreath(s, elapsed)
  }
  return reader.current
}

function elapsedOf(s: BreathState, sinceTickMs: number) {
  const whole = s.phaseSeconds - s.secondsLeftInPhase
  return s.status === 'running' ? whole + Math.min(1, sinceTickMs / 1000) : whole
}

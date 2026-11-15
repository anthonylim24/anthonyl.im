import { useCallback, useLayoutEffect, useRef } from 'react'
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

/** The engine's sub-second position, so the breath reads continuously between 1 Hz ticks. */
export interface BreathClock {
  /** Running: `performance.now()` when the current second began. */
  secondStartMs: number
  /** Paused: how far into the current second the pause landed, in ms. */
  carryMs: number
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
 * A stable reader the render loop can call every frame. The position comes
 * from the engine's own clock (the start of the current second, or the
 * fraction a pause landed on), so the bloom lands exactly on each phase
 * change and resumes from where it paused instead of snapping back.
 */
export function useBreathReader(state: BreathState & BreathClock): () => BreathSample {
  const latest = useRef(state)
  // Published before any child's effect reads it (layout effects run first).
  useLayoutEffect(() => {
    latest.current = state
  })
  return useCallback(() => {
    const s = latest.current
    return sampleBreath(s, breathElapsed(s, performance.now()))
  }, [])
}

/** Seconds into the current phase at `now`. */
export function breathElapsed(s: BreathState & BreathClock, now: number): number {
  const whole = s.phaseSeconds - s.secondsLeftInPhase
  if (s.status === 'running') return whole + Math.min(1, Math.max(0, (now - s.secondStartMs) / 1000))
  if (s.status === 'paused') return whole + s.carryMs / 1000
  return whole
}

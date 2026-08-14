import { describe, expect, it } from 'vitest'
import { BREATH_PHASES } from '@/lib/constants'
import { getPhaseScaleTarget } from '../usePhaseScale'

const phases = [
  { phase: BREATH_PHASES.INHALE, seconds: 4 },
  { phase: BREATH_PHASES.HOLD_IN, seconds: 4 },
  { phase: BREATH_PHASES.EXHALE, seconds: 4 },
  { phase: BREATH_PHASES.HOLD_OUT, seconds: 4 },
] as const

describe('getPhaseScaleTarget', () => {
  it('grows on inhale and keeps that amplitude through the full hold', () => {
    const inhale = getPhaseScaleTarget(phases, 0, 4, 4, 'running')
    expect(inhale.target).toBe(1)
    expect(inhale.phase).toBe(BREATH_PHASES.INHALE)

    const hold = getPhaseScaleTarget(phases, 1, 4, 4, 'running')
    expect(hold.target).toBe(1)
    expect(hold.steady).toBe(true)
  })

  it('freezes mid-phase progress while paused', () => {
    const paused = getPhaseScaleTarget(phases, 0, 4, 2, 'paused')
    expect(paused.frozen).toBeCloseTo(0.81, 2)
    expect(paused.duration).toBe(0.3)
  })
})

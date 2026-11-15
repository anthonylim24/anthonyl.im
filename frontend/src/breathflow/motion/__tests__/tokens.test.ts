import { describe, expect, it } from 'vitest'
import { BREATH_PHASES } from '@/lib/constants'
import { breathEase, EASE_EXHALE, EASE_INHALE, EASE_SETTLE, scaleToAmplitude } from '../tokens'

describe('breathEase', () => {
  it('uses fill-then-settle for inhales and a longer release for exhales', () => {
    expect(breathEase(BREATH_PHASES.INHALE)).toEqual(EASE_INHALE)
    expect(breathEase(BREATH_PHASES.DEEP_INHALE)).toEqual(EASE_INHALE)
    expect(breathEase(BREATH_PHASES.EXHALE)).toEqual(EASE_EXHALE)
    expect(breathEase(BREATH_PHASES.HOLD_IN)).toEqual(EASE_SETTLE)
    expect(EASE_INHALE).not.toEqual(EASE_EXHALE)
  })
})

describe('scaleToAmplitude', () => {
  it('maps the instrument scale range onto 0–1', () => {
    expect(scaleToAmplitude(0.62)).toBe(0)
    expect(scaleToAmplitude(1.1)).toBe(1)
    expect(scaleToAmplitude(0.86)).toBeCloseTo(0.5, 2)
  })
})

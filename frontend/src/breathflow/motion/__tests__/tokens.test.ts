import { describe, expect, it } from 'vitest'
import { BREATH_PHASES } from '@/lib/constants'
import { boxPoint, buildTideCrest, buildTidePath } from '../geometry'
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

describe('boxPoint', () => {
  it('traces the four sides of the box from the bottom-left corner', () => {
    expect(boxPoint(0)).toEqual({ x: 10, y: 230 })
    expect(boxPoint(1)).toEqual({ x: 10, y: 10 })
    expect(boxPoint(2)).toEqual({ x: 230, y: 10 })
    expect(boxPoint(3)).toEqual({ x: 230, y: 230 })
    expect(boxPoint(4)).toEqual({ x: 10, y: 230 })
  })
})

describe('buildTidePath', () => {
  it('closes a waved fill from the bottom of the instrument', () => {
    const path = buildTidePath(0.5)
    expect(path.startsWith('M 0 240')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
    expect(path).toContain(' L 240 240 Z')
  })

  it('shares crest points with the closed fill', () => {
    const crest = buildTideCrest(0.5)
    expect(crest.startsWith('M ')).toBe(true)
    expect(crest.includes('Z')).toBe(false)
    expect(buildTidePath(0.5)).toContain(crest.slice(2).trim())
  })
})

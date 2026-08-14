import { describe, expect, it } from 'vitest'
import {
  clampPhaseSeconds,
  clampRounds,
  getMaxRounds,
  getPhaseSecondsForRound,
  getRoundSeconds,
  PHASE_SECOND_LIMITS,
  plannedSessionSeconds,
  sanitizeCustomDurations,
} from '../cadence'
import { getHoldLadder, hasProgressiveHolds } from '../progressiveHold'
import { getProtocol } from '../catalog'

describe('phase clamps', () => {
  it('matches the spec clamp table', () => {
    expect(PHASE_SECOND_LIMITS).toEqual({
      inhale: { min: 1, max: 12 },
      deep_inhale: { min: 1, max: 8 },
      hold_in: { min: 1, max: 45 },
      exhale: { min: 1, max: 20 },
      hold_out: { min: 1, max: 30 },
      rest: { min: 1, max: 30 },
    })
  })

  it('clamps and rounds phase seconds', () => {
    expect(clampPhaseSeconds('inhale', 0)).toBe(1)
    expect(clampPhaseSeconds('inhale', 99)).toBe(12)
    expect(clampPhaseSeconds('hold_in', 50)).toBe(45)
    expect(clampPhaseSeconds('exhale', 6.6)).toBe(7)
    expect(clampPhaseSeconds('rest', Number.NaN)).toBe(1)
  })
})

describe('round limits', () => {
  it('max rounds = max(40, defaultRounds)', () => {
    expect(getMaxRounds(getProtocol('box_breathing'))).toBe(40)
    expect(getMaxRounds(getProtocol('diaphragmatic_breathing'))).toBe(40)
    expect(getMaxRounds(getProtocol('pursed_lip_recovery'))).toBe(50)
  })

  it('clamps rounds to [1, max] and falls back to default when invalid', () => {
    const box = getProtocol('box_breathing')
    expect(clampRounds(box, 0)).toBe(1)
    expect(clampRounds(box, 100)).toBe(40)
    expect(clampRounds(box, 10)).toBe(10)
    expect(clampRounds(box, Number.NaN)).toBe(box.defaultRounds)
  })
})

describe('custom durations', () => {
  it('drops values equal to defaults and phases the protocol lacks', () => {
    const box = getProtocol('box_breathing')
    expect(sanitizeCustomDurations(box, { inhale: 4, rest: 9 })).toBeUndefined()
    expect(sanitizeCustomDurations(box, { inhale: 5 })).toEqual({ inhale: 5 })
  })

  it('clamps custom values', () => {
    const box = getProtocol('box_breathing')
    expect(sanitizeCustomDurations(box, { inhale: 99 })).toEqual({ inhale: 12 })
  })

  it('returns undefined for empty or missing input', () => {
    const box = getProtocol('box_breathing')
    expect(sanitizeCustomDurations(box, undefined)).toBeUndefined()
    expect(sanitizeCustomDurations(box, {})).toBeUndefined()
  })
})

describe('planned durations', () => {
  it('box: 19 rounds of 16s', () => {
    const box = getProtocol('box_breathing')
    expect(getRoundSeconds(box, 0)).toBe(16)
    expect(plannedSessionSeconds(box, box.defaultRounds)).toBe(19 * 16)
  })

  it('custom box 5-5-5-5 for 10 rounds', () => {
    const box = getProtocol('box_breathing')
    const custom = { inhale: 5, hold_in: 5, exhale: 5, hold_out: 5 }
    expect(plannedSessionSeconds(box, 10, custom)).toBe(200)
  })

  it('co2 includes the progressive hold ladder', () => {
    const co2 = getProtocol('co2_tolerance')
    // Round i: 3 + (15 + 5i) + 3 + 10 = 31 + 5i
    expect(getRoundSeconds(co2, 0)).toBe(31)
    expect(getRoundSeconds(co2, 3)).toBe(46)
    const expected = Array.from({ length: 8 }, (_, i) => 31 + 5 * i).reduce((a, b) => a + b, 0)
    expect(plannedSessionSeconds(co2, 8)).toBe(expected)
  })

  it('cyclic sighing default is exactly 300s', () => {
    const sighing = getProtocol('cyclic_sighing')
    expect(plannedSessionSeconds(sighing, sighing.defaultRounds)).toBe(300)
  })
})

describe('progressive holds', () => {
  it('only co2 has progressive holds', () => {
    expect(hasProgressiveHolds(getProtocol('co2_tolerance'))).toBe(true)
    expect(hasProgressiveHolds(getProtocol('box_breathing'))).toBe(false)
    expect(getHoldLadder(getProtocol('box_breathing'), 5)).toEqual([])
  })

  it('default ladder is 15, 20, 25, …', () => {
    expect(getHoldLadder(getProtocol('co2_tolerance'), 4)).toEqual([15, 20, 25, 30])
  })

  it('custom hold_in replaces the base; increment still applies', () => {
    expect(getHoldLadder(getProtocol('co2_tolerance'), 3, { hold_in: 10 })).toEqual([10, 15, 20])
  })

  it('ladder tracks rounds so changing rounds previews the full ladder', () => {
    expect(getHoldLadder(getProtocol('co2_tolerance'), 8)).toHaveLength(8)
    expect(getHoldLadder(getProtocol('co2_tolerance'), 8)[7]).toBe(50)
  })

  it('per-round hold seconds flow into the engine phase durations', () => {
    const co2 = getProtocol('co2_tolerance')
    expect(getPhaseSecondsForRound(co2, 'hold_in', 0)).toBe(15)
    expect(getPhaseSecondsForRound(co2, 'hold_in', 2)).toBe(25)
    expect(getPhaseSecondsForRound(co2, 'hold_in', 1, { hold_in: 20 })).toBe(25)
  })
})

import { describe, expect, it } from 'vitest'
import {
  MOOD_OPTIONS,
  formatMoodShift,
  getAverageMoodShift,
  getMoodDelta,
  getMoodLabel,
  isMoodValue,
} from '../mood'

describe('mood scale', () => {
  it('exposes five ordered tense → calm options', () => {
    expect(MOOD_OPTIONS.map((option) => option.value)).toEqual([1, 2, 3, 4, 5])
    expect(MOOD_OPTIONS[0].label).toBe('Tense')
    expect(MOOD_OPTIONS[4].label).toBe('Calm')
  })

  it('validates mood values', () => {
    expect(isMoodValue(1)).toBe(true)
    expect(isMoodValue(5)).toBe(true)
    expect(isMoodValue(0)).toBe(false)
    expect(isMoodValue(6)).toBe(false)
    expect(isMoodValue(2.5)).toBe(false)
    expect(isMoodValue(undefined)).toBe(false)
    expect(isMoodValue('3')).toBe(false)
  })

  it('labels each value', () => {
    expect(getMoodLabel(1)).toBe('Tense')
    expect(getMoodLabel(3)).toBe('Neutral')
    expect(getMoodLabel(5)).toBe('Calm')
  })
})

describe('getMoodDelta', () => {
  it('returns after - before when both are present', () => {
    expect(getMoodDelta(2, 5)).toBe(3)
    expect(getMoodDelta(4, 2)).toBe(-2)
    expect(getMoodDelta(3, 3)).toBe(0)
  })

  it('returns null when a reading is missing', () => {
    expect(getMoodDelta(undefined, 5)).toBeNull()
    expect(getMoodDelta(2, undefined)).toBeNull()
    expect(getMoodDelta(null, null)).toBeNull()
  })
})

describe('formatMoodShift', () => {
  it('formats a tense → calm transition', () => {
    expect(formatMoodShift(1, 5)).toBe('Tense → Calm')
    expect(formatMoodShift(3, 4)).toBe('Neutral → Settled')
  })

  it('returns null when incomplete', () => {
    expect(formatMoodShift(undefined, 4)).toBeNull()
  })
})

describe('getAverageMoodShift', () => {
  it('returns null when no session has a complete pair', () => {
    expect(getAverageMoodShift([])).toBeNull()
    expect(getAverageMoodShift([{ moodBefore: 2 }, { moodAfter: 5 }])).toBeNull()
  })

  it('aggregates calm shift across complete pairs only', () => {
    const trend = getAverageMoodShift([
      { moodBefore: 2, moodAfter: 5 }, // +3
      { moodBefore: 3, moodAfter: 4 }, // +1
      { moodBefore: 4, moodAfter: 3 }, // -1
      { moodBefore: 1 }, // ignored (incomplete)
    ])

    expect(trend).not.toBeNull()
    expect(trend?.count).toBe(3)
    expect(trend?.averageShift).toBe(1) // (3 + 1 - 1) / 3 = 1.0
    expect(trend?.positiveRate).toBeCloseTo(2 / 3)
  })

  it('rounds the average shift to one decimal place', () => {
    const trend = getAverageMoodShift([
      { moodBefore: 1, moodAfter: 5 }, // +4
      { moodBefore: 3, moodAfter: 4 }, // +1
      { moodBefore: 3, moodAfter: 3 }, // 0
    ])
    // (4 + 1 + 0) / 3 = 1.666... → 1.7
    expect(trend?.averageShift).toBe(1.7)
  })
})

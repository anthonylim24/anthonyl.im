import { describe, it, expect } from 'vitest'
import { mergeUserState, mergeSessionHistory } from '../useCloudSync'

describe('mergeUserState', () => {
  it('takes the higher XP value', () => {
    const local = { xp: 500, earned_badges: [], selected_theme: 'default', personal_bests: {}, settings: {} }
    const cloud = { xp: 300, earned_badges: [], selected_theme: 'default', personal_bests: {}, settings: {} }
    const result = mergeUserState(local, cloud)
    expect(result.xp).toBe(500)
  })

  it('unions badge arrays without duplicates', () => {
    const local = { xp: 0, earned_badges: ['a', 'b'], selected_theme: 'default', personal_bests: {}, settings: {} }
    const cloud = { xp: 0, earned_badges: ['b', 'c'], selected_theme: 'default', personal_bests: {}, settings: {} }
    const result = mergeUserState(local, cloud)
    expect(result.earned_badges).toEqual(['a', 'b', 'c'])
  })

  it('takes the best personal best per technique', () => {
    const local = {
      xp: 0, earned_badges: [], selected_theme: 'default', settings: {},
      personal_bests: {
        box_breathing: { techniqueId: 'box_breathing', maxHoldTime: 30, date: '2026-01-01' },
      },
    }
    const cloud = {
      xp: 0, earned_badges: [], selected_theme: 'default', settings: {},
      personal_bests: {
        box_breathing: { techniqueId: 'box_breathing', maxHoldTime: 45, date: '2026-01-15' },
        co2_tolerance: { techniqueId: 'co2_tolerance', maxHoldTime: 60, date: '2026-01-10' },
      },
    }
    const result = mergeUserState(local, cloud)
    expect(result.personal_bests.box_breathing.maxHoldTime).toBe(45)
    expect(result.personal_bests.co2_tolerance.maxHoldTime).toBe(60)
  })

  it('prefers local settings over cloud', () => {
    const local = { xp: 0, earned_badges: [], selected_theme: 'aurora', personal_bests: {}, settings: { theme: 'dark', soundVolume: 0.8 } }
    const cloud = { xp: 0, earned_badges: [], selected_theme: 'default', personal_bests: {}, settings: { theme: 'light', soundVolume: 0.5 } }
    const result = mergeUserState(local, cloud)
    expect(result.settings.theme).toBe('dark')
    expect(result.settings.soundVolume).toBe(0.8)
    expect(result.selected_theme).toBe('aurora')
  })
})

describe('mergeSessionHistory', () => {
  it('deduplicates sessions by id', () => {
    const local = [
      { id: 'a', techniqueId: 'box_breathing' as const, date: '2026-01-01T00:00:00Z', durationSeconds: 300, rounds: 4, holdTimes: [], maxHoldTime: 0, avgHoldTime: 0 },
      { id: 'b', techniqueId: 'co2_tolerance' as const, date: '2026-01-02T00:00:00Z', durationSeconds: 600, rounds: 8, holdTimes: [], maxHoldTime: 0, avgHoldTime: 0 },
    ]
    const cloud = [
      { id: 'b', techniqueId: 'co2_tolerance' as const, date: '2026-01-02T00:00:00Z', durationSeconds: 600, rounds: 8, holdTimes: [], maxHoldTime: 0, avgHoldTime: 0 },
      { id: 'c', techniqueId: 'power_breathing' as const, date: '2026-01-03T00:00:00Z', durationSeconds: 120, rounds: 30, holdTimes: [], maxHoldTime: 0, avgHoldTime: 0 },
    ]
    const result = mergeSessionHistory(local, cloud)
    expect(result).toHaveLength(3)
    expect(result.map(s => s.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('returns sessions sorted by date descending', () => {
    const local = [
      { id: 'old', techniqueId: 'box_breathing' as const, date: '2026-01-01T00:00:00Z', durationSeconds: 300, rounds: 4, holdTimes: [], maxHoldTime: 0, avgHoldTime: 0 },
    ]
    const cloud = [
      { id: 'new', techniqueId: 'co2_tolerance' as const, date: '2026-02-01T00:00:00Z', durationSeconds: 600, rounds: 8, holdTimes: [], maxHoldTime: 0, avgHoldTime: 0 },
    ]
    const result = mergeSessionHistory(local, cloud)
    expect(result[0].id).toBe('new')
    expect(result[1].id).toBe('old')
  })
})

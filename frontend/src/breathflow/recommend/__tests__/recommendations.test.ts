import { describe, expect, it } from 'vitest'
import type { CompletedSession } from '@/stores/historyStore'
import { getProtocol } from '../../protocols/catalog'
import {
  getDefaultGoalForHour,
  getRoundsForWindow,
  recommendProtocols,
  type RecommendationInput,
} from '../recommendations'

function makeSession(overrides: Partial<CompletedSession> = {}): CompletedSession {
  return {
    id: crypto.randomUUID(),
    techniqueId: 'cyclic_sighing',
    date: new Date(2026, 7, 10, 12, 0).toISOString(),
    durationSeconds: 300,
    rounds: 30,
    holdTimes: [],
    maxHoldTime: 0,
    avgHoldTime: 0,
    ...overrides,
  }
}

function input(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    goal: 'calm',
    windowSeconds: 300,
    now: new Date(2026, 7, 14, 14, 0), // 2pm — not late night
    sessions: [makeSession()],
    dailyGoalMet: false,
    recoveryActive: false,
    ...overrides,
  }
}

describe('default goal by hour', () => {
  it('21:00–04:59 Sleep; 05:00–10:59 Focus; else Calm', () => {
    expect(getDefaultGoalForHour(21)).toBe('sleep')
    expect(getDefaultGoalForHour(23)).toBe('sleep')
    expect(getDefaultGoalForHour(0)).toBe('sleep')
    expect(getDefaultGoalForHour(4)).toBe('sleep')
    expect(getDefaultGoalForHour(5)).toBe('focus')
    expect(getDefaultGoalForHour(10)).toBe('focus')
    expect(getDefaultGoalForHour(11)).toBe('calm')
    expect(getDefaultGoalForHour(20)).toBe('calm')
  })
})

describe('rounds for the length window', () => {
  it('picks the rounds whose planned duration is closest to the window', () => {
    // Cyclic sighing cycle = 10s → Standard 300s = 30 rounds exactly.
    expect(getRoundsForWindow(getProtocol('cyclic_sighing'), 300)).toBe(30)
    // 4-7-8 cycle = 19s → Long 480s ≈ 25 rounds (475s).
    expect(getRoundsForWindow(getProtocol('four_seven_eight'), 480)).toBe(25)
    // Box cycle = 16s → Quick 180s ≈ 11 rounds (176s).
    expect(getRoundsForWindow(getProtocol('box_breathing'), 180)).toBe(11)
  })

  it('caps CO2 and Power at their default rounds', () => {
    expect(getRoundsForWindow(getProtocol('co2_tolerance'), 480)).toBeLessThanOrEqual(8)
    expect(getRoundsForWindow(getProtocol('power_breathing'), 480)).toBeLessThanOrEqual(30)
  })

  it('respects the normal max-round cap', () => {
    // Pursed-lip cycle 6s; long window would want 80 rounds — capped at 50.
    expect(getRoundsForWindow(getProtocol('pursed_lip_recovery'), 480)).toBeLessThanOrEqual(50)
  })
})

describe('recommendation engine', () => {
  it('new user, Calm + Standard → Cyclic Sighing at 30 rounds (~5 min)', () => {
    const result = recommendProtocols(input({ sessions: [] }))
    expect(result.top.protocol.id).toBe('cyclic_sighing')
    expect(result.top.rounds).toBe(30)
    expect(result.top.plannedSeconds).toBe(300)
    expect(result.alternatives).toHaveLength(2)
  })

  it('Sleep + Long → 4-7-8 with rounds matching the window', () => {
    const result = recommendProtocols(input({ goal: 'sleep', windowSeconds: 480 }))
    expect(result.top.protocol.id).toBe('four_seven_eight')
    expect(result.top.rounds).toBe(25)
  })

  it('Recover → Pursed-Lip Recovery leads', () => {
    const result = recommendProtocols(input({ goal: 'recover' }))
    expect(result.top.protocol.id).toBe('pursed_lip_recovery')
  })

  it('Focus → Box Breathing leads', () => {
    const result = recommendProtocols(input({ goal: 'focus' }))
    expect(result.top.protocol.id).toBe('box_breathing')
  })

  it('Perform → advanced protocols lead for experienced users', () => {
    const sessions = Array.from({ length: 10 }, () => makeSession())
    const result = recommendProtocols(input({ goal: 'perform', sessions }))
    expect(['co2_tolerance', 'power_breathing']).toContain(result.top.protocol.id)
  })

  it('never recommends advanced protocols outside Perform', () => {
    for (const goal of ['calm', 'sleep', 'focus', 'recover'] as const) {
      const result = recommendProtocols(input({ goal }))
      expect(['co2_tolerance', 'power_breathing']).not.toContain(result.top.protocol.id)
    }
  })

  it('recovery window pushes advanced protocols out even for Perform', () => {
    const sessions = Array.from({ length: 10 }, () => makeSession())
    const result = recommendProtocols(input({ goal: 'perform', sessions, recoveryActive: true }))
    expect(['co2_tolerance', 'power_breathing']).not.toContain(result.top.protocol.id)
    expect(result.top.protocol.id).toBe('box_breathing')
  })

  it('late night penalizes Power Breathing for Perform', () => {
    const sessions = Array.from({ length: 10 }, () => makeSession())
    const day = recommendProtocols(input({ goal: 'perform', sessions }))
    const night = recommendProtocols(input({
      goal: 'perform',
      sessions,
      now: new Date(2026, 7, 14, 23, 0),
    }))
    const nightPower = [night.top, ...night.alternatives]
      .find((r) => r.protocol.id === 'power_breathing')
    const dayPower = [day.top, ...day.alternatives]
      .find((r) => r.protocol.id === 'power_breathing')
    expect(nightPower && dayPower && nightPower.score < dayPower.score).toBe(true)
  })

  it('late night boosts sleep protocols under the default goal', () => {
    const result = recommendProtocols(input({
      goal: 'sleep',
      now: new Date(2026, 7, 14, 22, 30),
    }))
    expect(result.top.protocol.id).toBe('four_seven_eight')
  })

  it('daily goal met nudges toward gentle work', () => {
    const base = recommendProtocols(input({ goal: 'focus' }))
    const met = recommendProtocols(input({ goal: 'focus', dailyGoalMet: true }))
    // Box still leads for focus, but gentle alternatives gain ground.
    expect(met.top.protocol.id).toBe(base.top.protocol.id)
    const gentleScoreBase = [base.top, ...base.alternatives]
      .find((r) => r.protocol.id === 'resonance_breathing')?.score ?? 0
    const gentleScoreMet = [met.top, ...met.alternatives]
      .find((r) => r.protocol.id === 'resonance_breathing')?.score ?? 0
    expect(gentleScoreMet).toBeGreaterThan(gentleScoreBase)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { completeSession } from '../completeSession'

describe('completeSession persistence bridge', () => {
  beforeEach(() => {
    localStorage.clear()
    useHistoryStore.getState().clearHistory()
    useGamificationStore.getState().resetProgress()
  })

  it('saves the session, awards XP and first_session, and returns the summary data', () => {
    const result = completeSession({
      techniqueId: 'cyclic_sighing',
      rounds: 30,
      holdTimes: [],
    })

    expect(result.session.techniqueId).toBe('cyclic_sighing')
    expect(result.session.durationSeconds).toBe(300) // planned, not wall-clock
    expect(result.session.rounds).toBe(30)
    expect(result.streak).toBe(1)
    expect(result.xpEarned).toBe(Math.round(55 * 1.1)) // streak 1 after today
    expect(result.newBadgeIds).toContain('first_session')

    const history = useHistoryStore.getState()
    expect(history.sessions).toHaveLength(1)
    const gamification = useGamificationStore.getState()
    expect(gamification.xp).toBe(result.xpEarned)
    expect(gamification.earnedBadges).toContain('first_session')
    expect(gamification.dailySessionCount).toBe(1)
  })

  it('records hold stats and personal bests', () => {
    const first = completeSession({
      techniqueId: 'co2_tolerance',
      rounds: 2,
      holdTimes: [15, 20],
    })
    expect(first.session.maxHoldTime).toBe(20)
    expect(first.session.avgHoldTime).toBe(17.5)
    expect(first.isPersonalBest).toBe(true)

    const worse = completeSession({
      techniqueId: 'co2_tolerance',
      rounds: 1,
      holdTimes: [15],
    })
    expect(worse.isPersonalBest).toBe(false)

    const best = useHistoryStore.getState().personalBests.co2_tolerance
    expect(best?.maxHoldTime).toBe(20)
  })

  it('persists custom cadence and mood-before onto the history record', () => {
    const result = completeSession({
      techniqueId: 'box_breathing',
      rounds: 10,
      customDurations: { inhale: 5, hold_in: 5, exhale: 5, hold_out: 5 },
      holdTimes: Array.from({ length: 20 }, () => 5),
      moodBefore: 2,
    })
    expect(result.session.customPhaseDurations).toEqual({
      inhale: 5, hold_in: 5, exhale: 5, hold_out: 5,
    })
    expect(result.session.durationSeconds).toBe(200)
    expect(result.session.moodBefore).toBe(2)
  })

  it('includes the CO2 ladder in the planned duration', () => {
    const result = completeSession({
      techniqueId: 'co2_tolerance',
      rounds: 8,
      holdTimes: [15, 20, 25, 30, 35, 40, 45, 50],
    })
    const expected = Array.from({ length: 8 }, (_, i) => 31 + 5 * i).reduce((a, b) => a + b, 0)
    expect(result.session.durationSeconds).toBe(expected)
  })

  it('does not re-award already-earned badges', () => {
    completeSession({ techniqueId: 'cyclic_sighing', rounds: 30, holdTimes: [] })
    const second = completeSession({ techniqueId: 'cyclic_sighing', rounds: 30, holdTimes: [] })
    expect(second.newBadgeIds).not.toContain('first_session')
  })

  it('applies the streak multiplier from consecutive local days', () => {
    // Simulate an existing session yesterday.
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    useHistoryStore.getState().addSession({
      techniqueId: 'box_breathing',
      date: yesterday.toISOString(),
      durationSeconds: 304,
      rounds: 19,
      holdTimes: [],
      maxHoldTime: 0,
      avgHoldTime: 0,
    })

    const result = completeSession({ techniqueId: 'box_breathing', rounds: 19, holdTimes: [] })
    expect(result.streak).toBe(2)
    expect(result.xpEarned).toBe(Math.round(50 * 1.2))
  })
})

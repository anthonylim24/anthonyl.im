// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { useGamificationStore } from '../gamificationStore'

describe('gamificationStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useGamificationStore.setState({
      xp: 0,
      earnedBadges: [],
      selectedTheme: 'default',
      dailySessionCount: 0,
      weeklySessionCount: 0,
      lastDailyReset: new Date().toISOString().split('T')[0],
      lastWeeklyReset: getWeekStart(),
    })
  })

  it('starts at 0 XP', () => {
    const state = useGamificationStore.getState()
    expect(state.xp).toBe(0)
  })

  it('adds XP correctly', () => {
    const { addXP } = useGamificationStore.getState()
    addXP(100)
    expect(useGamificationStore.getState().xp).toBe(100)
    addXP(50)
    expect(useGamificationStore.getState().xp).toBe(150)
  })

  it('tracks badges without duplicates', () => {
    const { unlockBadges } = useGamificationStore.getState()
    unlockBadges(['first_session', 'streak_7'])
    expect(useGamificationStore.getState().earnedBadges).toEqual([
      'first_session',
      'streak_7',
    ])

    // Unlock same badges again - should not duplicate
    unlockBadges(['first_session', 'night_owl'])
    expect(useGamificationStore.getState().earnedBadges).toEqual([
      'first_session',
      'streak_7',
      'night_owl',
    ])
  })

  it('increments daily and weekly session counts', () => {
    const { recordSession } = useGamificationStore.getState()
    recordSession()
    recordSession()
    const state = useGamificationStore.getState()
    expect(state.dailySessionCount).toBe(2)
    expect(state.weeklySessionCount).toBe(2)
  })

  it('sets selected theme', () => {
    const { setSelectedTheme } = useGamificationStore.getState()
    setSelectedTheme('aurora')
    expect(useGamificationStore.getState().selectedTheme).toBe('aurora')
  })
})

function getWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday
  const monday = new Date(now)
  monday.setDate(diff)
  return monday.toISOString().split('T')[0]
}

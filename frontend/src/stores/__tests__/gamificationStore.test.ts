// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import {
  GAMIFICATION_STORAGE_VERSION,
  migratePersistedGamificationState,
  useGamificationStore,
} from '../gamificationStore'

describe('gamificationStore', () => {
  beforeEach(() => {
    useGamificationStore.setState({ xp: 0, earnedBadges: [], selectedTheme: 'default' })
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

  it('sets selected theme', () => {
    const { setSelectedTheme } = useGamificationStore.getState()
    setSelectedTheme('aurora')
    expect(useGamificationStore.getState().selectedTheme).toBe('aurora')
  })

  it('resets progress and theme unlock state to defaults', () => {
    useGamificationStore.setState({ xp: 420, earnedBadges: ['first_session'], selectedTheme: 'tidal' })

    useGamificationStore.getState().resetProgress()

    expect(useGamificationStore.getState()).toMatchObject({ xp: 0, earnedBadges: [], selectedTheme: 'default' })
  })

  it('versions and migrates persisted gamification state, ignoring the retired session counters', () => {
    const migrated = migratePersistedGamificationState({
      xp: 240,
      earnedBadges: ['first_session', 7, 'first_session'],
      selectedTheme: 'tidal',
      dailySessionCount: 2,
      weeklySessionCount: 5,
      lastDailyReset: '2026-05-01',
      lastWeeklyReset: 'not-a-date',
    })

    expect(GAMIFICATION_STORAGE_VERSION).toBeGreaterThan(0)
    expect(migrated).toEqual({ xp: 240, earnedBadges: ['first_session'], selectedTheme: 'tidal' })
    expect(migratePersistedGamificationState(null)).toEqual({ xp: 0, earnedBadges: [], selectedTheme: 'default' })
    expect(migratePersistedGamificationState({ xp: '120' }).xp).toBe(0)
  })
})

// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { formatLocalDateKey, getLocalWeekStartKey } from '@/lib/localDates'
import {
  GAMIFICATION_STORAGE_VERSION,
  migratePersistedGamificationState,
  useGamificationStore,
} from '../gamificationStore'

describe('gamificationStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useGamificationStore.setState({
      xp: 0,
      earnedBadges: [],
      selectedTheme: 'default',
      dailySessionCount: 0,
      weeklySessionCount: 0,
      lastDailyReset: formatLocalDateKey(new Date()),
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

  it('resets daily and weekly counters using local calendar keys', () => {
    useGamificationStore.setState({
      dailySessionCount: 3,
      weeklySessionCount: 8,
      lastDailyReset: '2026-04-01',
      lastWeeklyReset: '2026-03-30',
    })

    useGamificationStore.getState().checkResets()

    expect(useGamificationStore.getState()).toMatchObject({
      dailySessionCount: 0,
      weeklySessionCount: 0,
      lastDailyReset: formatLocalDateKey(new Date()),
      lastWeeklyReset: getWeekStart(),
    })
  })

  it('resets progress and theme unlock state to defaults', () => {
    useGamificationStore.setState({
      xp: 420,
      earnedBadges: ['first_session'],
      selectedTheme: 'tidal',
      dailySessionCount: 3,
      weeklySessionCount: 5,
      lastDailyReset: '2026-04-01',
      lastWeeklyReset: '2026-03-30',
    })

    useGamificationStore.getState().resetProgress()

    expect(useGamificationStore.getState()).toMatchObject({
      xp: 0,
      earnedBadges: [],
      selectedTheme: 'default',
      dailySessionCount: 0,
      weeklySessionCount: 0,
      lastDailyReset: formatLocalDateKey(new Date()),
      lastWeeklyReset: getWeekStart(),
    })
  })

  it('versions and migrates persisted gamification state', () => {
    const migrated = migratePersistedGamificationState({
      xp: 240,
      earnedBadges: ['first_session'],
      selectedTheme: 'tidal',
      dailySessionCount: 2,
      weeklySessionCount: 5,
      lastDailyReset: '2026-05-01',
      lastWeeklyReset: 'not-a-date',
    })

    expect(GAMIFICATION_STORAGE_VERSION).toBeGreaterThan(0)
    expect(migrated).toMatchObject({
      xp: 240,
      earnedBadges: ['first_session'],
      selectedTheme: 'tidal',
      dailySessionCount: 2,
      weeklySessionCount: 5,
      lastDailyReset: '2026-05-01',
      lastWeeklyReset: getWeekStart(),
    })
    expect(migratePersistedGamificationState(null)).toMatchObject({
      xp: 0,
      earnedBadges: [],
      selectedTheme: 'default',
    })
  })
})

function getWeekStart(): string {
  return getLocalWeekStartKey()
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/lib/constants'
import { useGamificationStore } from '../gamificationStore'
import { getEmptyHistoryState, useHistoryStore } from '../historyStore'
import { getDefaultPracticeState, usePracticeStore } from '../practiceStore'
import type { CompletedSession } from '../sessionRecord'
import { DEFAULT_SETTINGS_STATE, useSettingsStore } from '../settingsStore'

function session(id: string, date: string): CompletedSession {
  return { id, techniqueId: 'box_breathing', date, durationSeconds: 120, rounds: 3, holdTimes: [], maxHoldTime: 0, avgHoldTime: 0 }
}

/** What another tab's write looks like to this one: the value lands in storage, then a `storage` event fires. */
function writeFromOtherTab(key: string, state: unknown, version = 1) {
  const value = JSON.stringify({ state, version })
  localStorage.setItem(key, value)
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }))
}

function persist(key: string, state: unknown, version = 1) {
  localStorage.setItem(key, JSON.stringify({ state, version }))
}

function resetAll() {
  useHistoryStore.setState(getEmptyHistoryState())
  useGamificationStore.setState({ xp: 0, earnedBadges: [], selectedTheme: 'default' })
  useSettingsStore.setState({ ...DEFAULT_SETTINGS_STATE })
  usePracticeStore.setState(getDefaultPracticeState())
}

beforeEach(() => {
  resetAll()
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('same-version persisted data is cleaned on load', () => {
  // zustand runs `migrate` only when the version differs, so these all carry
  // the current version: before, they were shallow-merged raw and threw in render.
  it('history: wrong-shaped fields fall back and bad sessions are dropped one by one', async () => {
    persist(STORAGE_KEYS.SESSION_HISTORY, {
      sessions: [session('ok', '2026-05-01T10:00:00.000Z'), { id: 7 }, null, { ...session('nan', '2026-05-01T10:00:00.000Z'), durationSeconds: null }],
      personalBests: 'nope',
      vo2MaxHistory: [{ value: 'x' }],
    })
    await useHistoryStore.persist.rehydrate()
    const state = useHistoryStore.getState()
    expect(state.sessions.map((s) => s.id)).toEqual(['ok'])
    expect(state.personalBests).toEqual({})
    expect(state.vo2MaxHistory).toEqual([])
  })

  it('history: `sessions: null` becomes an empty log', async () => {
    persist(STORAGE_KEYS.SESSION_HISTORY, { sessions: null })
    await useHistoryStore.persist.rehydrate()
    expect(useHistoryStore.getState().sessions).toEqual([])
  })

  it('gamification: a string XP is not trusted', async () => {
    persist(STORAGE_KEYS.GAMIFICATION, { xp: '120', earnedBadges: 'first_session', selectedTheme: 3 })
    await useGamificationStore.persist.rehydrate()
    expect(useGamificationStore.getState()).toMatchObject({ xp: 0, earnedBadges: [], selectedTheme: 'default' })
  })

  it('settings and practice fall back to defaults field by field', async () => {
    persist(STORAGE_KEYS.SETTINGS, { theme: 'purple', soundVolume: 'loud', hapticsEnabled: false })
    persist(STORAGE_KEYS.PRACTICE, { dailyGoalMinutes: 7, journeys: 'x', activeJourneyId: 'nope' })
    await useSettingsStore.persist.rehydrate()
    await usePracticeStore.persist.rehydrate()
    expect(useSettingsStore.getState()).toMatchObject({ ...DEFAULT_SETTINGS_STATE, hapticsEnabled: false })
    expect(usePracticeStore.getState()).toMatchObject(getDefaultPracticeState())
  })

  it('actions survive a rehydrate', async () => {
    persist(STORAGE_KEYS.GAMIFICATION, { xp: 10 })
    await useGamificationStore.persist.rehydrate()
    useGamificationStore.getState().addXP(5)
    expect(useGamificationStore.getState().xp).toBe(15)
  })
})

describe('two tabs', () => {
  it("a session saved in another tab joins this tab's log instead of replacing it", async () => {
    useHistoryStore.getState().addSession({
      techniqueId: 'box_breathing', date: '2026-05-02T10:00:00.000Z', durationSeconds: 120, rounds: 3,
      holdTimes: [], maxHoldTime: 0, avgHoldTime: 0,
    })
    const mine = useHistoryStore.getState().sessions[0]

    writeFromOtherTab(STORAGE_KEYS.SESSION_HISTORY, { ...getEmptyHistoryState(), sessions: [session('theirs', '2026-05-03T10:00:00.000Z')] })

    await expect.poll(() => useHistoryStore.getState().sessions.map((s) => s.id)).toEqual(['theirs', mine.id])
  })

  it('a clear in another tab clears this one too', async () => {
    useHistoryStore.setState({ sessions: [session('old', '2026-05-01T10:00:00.000Z')] })
    writeFromOtherTab(STORAGE_KEYS.SESSION_HISTORY, { ...getEmptyHistoryState(), resetAt: '2026-05-02T00:00:00.000Z' })
    await expect.poll(() => useHistoryStore.getState().sessions).toEqual([])
  })

  it('settings, progress and practice follow the other tab', async () => {
    writeFromOtherTab(STORAGE_KEYS.SETTINGS, { ...DEFAULT_SETTINGS_STATE, theme: 'dark', updatedAt: 5 })
    writeFromOtherTab(STORAGE_KEYS.GAMIFICATION, { xp: 90, earnedBadges: ['first_session'], selectedTheme: 'default' })
    writeFromOtherTab(STORAGE_KEYS.PRACTICE, { ...getDefaultPracticeState(), dailyGoalMinutes: 10 })
    await expect.poll(() => useSettingsStore.getState().theme).toBe('dark')
    await expect.poll(() => useGamificationStore.getState().xp).toBe(90)
    await expect.poll(() => usePracticeStore.getState().dailyGoalMinutes).toBe(10)
  })

  it('ignores keys that are not its own', async () => {
    useSettingsStore.getState().setTheme('dark')
    writeFromOtherTab('someone-else', { theme: 'light' })
    await Promise.resolve()
    expect(useSettingsStore.getState().theme).toBe('dark')
  })
})

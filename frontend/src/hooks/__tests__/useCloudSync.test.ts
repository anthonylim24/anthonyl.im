import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BREATH_PHASES, STORAGE_KEYS, type TechniqueId } from '@/lib/constants'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore, type PersonalBest } from '@/stores/historyStore'
import { DEFAULT_SETTINGS_STATE, useSettingsStore } from '@/stores/settingsStore'

const localStorageMock = vi.hoisted(() => {
  const values = new Map<string, string>()
  const storage = {
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
  }

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })

  return storage
})

const clerkMock = vi.hoisted(() => ({
  auth: { isSignedIn: false },
  user: {
    user: null as null | {
      id: string
      primaryEmailAddress: { emailAddress: string } | null
      fullName: string | null
      imageUrl: string | null
    },
  },
  session: { session: null as null | { id: string } },
}))

const supabaseMock = vi.hoisted(() => ({
  createClerkSupabaseClient: vi.fn(),
}))

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => clerkMock.auth,
  useUser: () => clerkMock.user,
  useSession: () => clerkMock.session,
}))

vi.mock('@/lib/supabase', () => ({
  createClerkSupabaseClient: supabaseMock.createClerkSupabaseClient,
}))

import {
  hasNonDefaultSettings,
  mergeUserState,
  mergeSessionHistory,
  normalizeCloudSettings,
  useCloudSync,
} from '../useCloudSync'

interface SupabaseClientMockOptions {
  cloudSessions?: Record<string, unknown>[]
  cloudState?: Record<string, unknown> | null
  stateUpsertError?: unknown
}

function createSupabaseClientMock(options: SupabaseClientMockOptions = {}) {
  const userStateUpsert = vi.fn(async () => ({ error: options.stateUpsertError ?? null }))
  const userStateMaybeSingle = vi.fn(async () => ({
    data: options.cloudState ?? null,
    error: null,
  }))
  const userStateSelect = vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle: userStateMaybeSingle,
    })),
  }))

  const sessionsInsert = vi.fn(async () => ({ error: null }))
  const sessionsOrder = vi.fn(async () => ({
    data: options.cloudSessions ?? [],
    error: null,
  }))
  const sessionsSelect = vi.fn(() => ({
    eq: vi.fn(() => ({
      order: sessionsOrder,
    })),
  }))

  const profileUpsert = vi.fn(async () => ({ error: null }))

  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return { upsert: profileUpsert }
    }
    if (table === 'user_state') {
      return { select: userStateSelect, upsert: userStateUpsert }
    }
    if (table === 'sessions') {
      return { select: sessionsSelect, insert: sessionsInsert, upsert: vi.fn() }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    client: { from },
    sessionsInsert,
    userStateUpsert,
  }
}

function resetStores() {
  useHistoryStore.setState({
    sessions: [],
    personalBests: {} as Record<TechniqueId, PersonalBest | undefined>,
    vo2MaxManual: null,
    vo2MaxHistory: [],
  })
  useGamificationStore.setState({
    xp: 0,
    earnedBadges: [],
    selectedTheme: 'default',
    dailySessionCount: 0,
    weeklySessionCount: 0,
    lastDailyReset: '2026-05-01',
    lastWeeklyReset: '2026-04-27',
  })
  useSettingsStore.setState(DEFAULT_SETTINGS_STATE)
}

function signInAs(userId: string) {
  clerkMock.auth.isSignedIn = true
  clerkMock.user.user = {
    id: userId,
    primaryEmailAddress: { emailAddress: `${userId}@example.com` },
    fullName: 'BreathFlow User',
    imageUrl: 'https://example.com/avatar.png',
  }
  clerkMock.session.session = { id: `${userId}_session` }
}

beforeEach(() => {
  clerkMock.auth.isSignedIn = false
  clerkMock.user.user = null
  clerkMock.session.session = null
  supabaseMock.createClerkSupabaseClient.mockReset()
  localStorageMock.getItem.mockClear()
  localStorageMock.setItem.mockClear()
  localStorageMock.removeItem.mockClear()
  resetStores()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  resetStores()
  localStorage.clear()
})

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

describe('normalizeCloudSettings', () => {
  it('falls back to BreathFlow light defaults for partial cloud settings', () => {
    expect(normalizeCloudSettings({ soundVolume: 0.8 })).toEqual({
      theme: 'light',
      soundEnabled: true,
      soundVolume: 0.8,
      hapticsEnabled: true,
    })
  })

  it('rejects malformed cloud settings and clamps volume', () => {
    expect(normalizeCloudSettings({
      theme: 'system',
      soundEnabled: 'yes',
      soundVolume: 2,
      hapticsEnabled: false,
    })).toEqual({
      theme: 'light',
      soundEnabled: true,
      soundVolume: 1,
      hapticsEnabled: false,
    })
  })
})

describe('hasNonDefaultSettings', () => {
  it('treats BreathFlow defaults as unchanged', () => {
    expect(hasNonDefaultSettings(DEFAULT_SETTINGS_STATE)).toBe(false)
  })

  it('detects local settings changed before first sign-in', () => {
    expect(hasNonDefaultSettings({ ...DEFAULT_SETTINGS_STATE, theme: 'dark' })).toBe(true)
    expect(hasNonDefaultSettings({ ...DEFAULT_SETTINGS_STATE, soundEnabled: false })).toBe(true)
    expect(hasNonDefaultSettings({ ...DEFAULT_SETTINGS_STATE, soundVolume: 0.8 })).toBe(true)
    expect(hasNonDefaultSettings({ ...DEFAULT_SETTINGS_STATE, hapticsEnabled: false })).toBe(true)
  })
})

describe('useCloudSync', () => {
  it('uploads custom cadence sessions during first-login merge', async () => {
    const supabase = createSupabaseClientMock()

    signInAs('user_1')
    supabaseMock.createClerkSupabaseClient.mockReturnValue(supabase.client)
    useHistoryStore.setState({
      sessions: [
        {
          id: 'custom-session',
          techniqueId: 'resonance_breathing',
          date: '2026-05-01T12:00:00.000Z',
          durationSeconds: 330,
          rounds: 30,
          customPhaseDurations: {
            [BREATH_PHASES.INHALE]: 6,
            [BREATH_PHASES.EXHALE]: 5,
          },
          holdTimes: [],
          maxHoldTime: 0,
          avgHoldTime: 0,
        },
      ],
    })

    renderHook(() => useCloudSync())

    await waitFor(() => {
      expect(supabase.sessionsInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'custom-session',
          custom_phase_durations: {
            [BREATH_PHASES.INHALE]: 6,
            [BREATH_PHASES.EXHALE]: 5,
          },
        }),
      ])
    })
  })

  it('hydrates custom cadence sessions from cloud rows', async () => {
    const supabase = createSupabaseClientMock({
      cloudState: {
        xp: 0,
        earned_badges: [],
        selected_theme: 'default',
        personal_bests: {},
        settings: {},
      },
      cloudSessions: [
        {
          id: 'cloud-custom-session',
          technique_id: 'resonance_breathing',
          date: '2026-05-01T12:00:00.000Z',
          duration_seconds: 330,
          rounds: 30,
          custom_phase_durations: {
            [BREATH_PHASES.INHALE]: 6,
            [BREATH_PHASES.EXHALE]: 5,
          },
          hold_times: [],
          max_hold_time: 0,
          avg_hold_time: 0,
        },
      ],
    })

    signInAs('user_1')
    supabaseMock.createClerkSupabaseClient.mockReturnValue(supabase.client)

    renderHook(() => useCloudSync())

    await waitFor(() => {
      expect(useHistoryStore.getState().sessions[0]).toMatchObject({
        id: 'cloud-custom-session',
        customPhaseDurations: {
          [BREATH_PHASES.INHALE]: 6,
          [BREATH_PHASES.EXHALE]: 5,
        },
      })
    })
  })

  it('keeps local persisted data when first-login cloud upsert fails', async () => {
    const upsertError = new Error('permission denied')
    const supabase = createSupabaseClientMock({ stateUpsertError: upsertError })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    signInAs('user_1')
    supabaseMock.createClerkSupabaseClient.mockReturnValue(supabase.client)
    useSettingsStore.setState({ ...DEFAULT_SETTINGS_STATE, theme: 'dark' })

    renderHook(() => useCloudSync())

    await waitFor(() => {
      expect(supabase.userStateUpsert).toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledWith('[CloudSync] Failed to fetch/hydrate:', upsertError)
    })

    expect(supabase.sessionsInsert).not.toHaveBeenCalled()
    expect(localStorageMock.removeItem).not.toHaveBeenCalledWith(STORAGE_KEYS.SESSION_HISTORY)
    expect(localStorageMock.removeItem).not.toHaveBeenCalledWith(STORAGE_KEYS.GAMIFICATION)
    expect(localStorageMock.removeItem).not.toHaveBeenCalledWith(STORAGE_KEYS.SETTINGS)
  })

  it('runs the first-login merge separately for each signed-in user', async () => {
    const supabase = createSupabaseClientMock()

    signInAs('user_1')
    supabaseMock.createClerkSupabaseClient.mockReturnValue(supabase.client)
    useSettingsStore.setState({ ...DEFAULT_SETTINGS_STATE, theme: 'dark' })

    const { rerender } = renderHook(() => useCloudSync())

    await waitFor(() => {
      expect(supabase.userStateUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user_1' }),
        { onConflict: 'user_id' },
      )
    })

    signInAs('user_2')
    rerender()

    await waitFor(() => {
      expect(supabase.userStateUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user_2' }),
        { onConflict: 'user_id' },
      )
    })
  })
})

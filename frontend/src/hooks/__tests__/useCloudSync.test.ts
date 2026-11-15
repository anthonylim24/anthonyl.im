import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BREATH_PHASES, STORAGE_KEYS } from '@/lib/constants'
import { INITIAL_SYNC_STATE } from '@/lib/cloudSync/machine'
import { readSyncMeta, writeSyncMeta } from '@/lib/cloudSync/meta'
import { useSyncStore } from '@/lib/cloudSync/store'
import { useGamificationStore } from '@/stores/gamificationStore'
import { getEmptyHistoryState, useHistoryStore, type CompletedSession } from '@/stores/historyStore'
import { getDefaultPracticeState, usePracticeStore } from '@/stores/practiceStore'
import { DEFAULT_SETTINGS_STATE, useSettingsStore } from '@/stores/settingsStore'

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

const supabaseMock = vi.hoisted(() => ({ createClerkSupabaseClient: vi.fn() }))

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => clerkMock.auth,
  useUser: () => clerkMock.user,
  useSession: () => clerkMock.session,
}))
vi.mock('@/lib/supabase', () => ({ createClerkSupabaseClient: supabaseMock.createClerkSupabaseClient }))
vi.mock('@/lib/telemetry', () => ({ reportClientEvent: vi.fn() }))

import { useCloudSync } from '../useCloudSync'

type Row = Record<string, unknown>

/**
 * An in-memory stand-in for the two tables, with the query shapes the sync
 * uses. `hold` makes the next request of a kind wait until released, to put
 * a change in the middle of a pull or push.
 */
function createCloud(initial: { state?: Row | null; sessions?: Row[] } = {}) {
  const tables = { state: initial.state ?? null, sessions: [...(initial.sessions ?? [])] }
  const fail = { pull: 0, push: 0 }
  const gates: Partial<Record<'pull' | 'push', () => void>> = {}
  const pending: Partial<Record<'pull' | 'push', Promise<void>>> = {}

  const pass = async (kind: 'pull' | 'push') => {
    if (pending[kind]) await pending[kind]
    if (fail[kind] > 0) {
      fail[kind]--
      return { data: null, error: new Error(`${kind} refused`) }
    }
    return null
  }

  const stateUpserts = vi.fn(async (row: Row) => {
    const refused = await pass('push')
    if (refused) return refused
    tables.state = { ...row }
    return { error: null }
  })
  const sessionUpserts = vi.fn(async (rows: Row[]) => {
    const refused = await pass('push')
    if (refused) return refused
    for (const row of rows) {
      tables.sessions = [...tables.sessions.filter((existing) => existing.id !== row.id), row]
    }
    return { error: null }
  })
  const sessionDeletes = vi.fn()

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'profiles') return { upsert: vi.fn(async () => ({ error: null })) }
      if (table === 'user_state') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => (await pass('pull')) ?? { data: tables.state, error: null } }) }),
          upsert: stateUpserts,
        }
      }
      return {
        select: () => ({ eq: () => ({ order: async () => (await pass('pull')) ?? { data: [...tables.sessions], error: null } }) }),
        upsert: sessionUpserts,
        delete: () => ({
          eq: () => ({
            lte: async (_column: string, upTo: string) => {
              sessionDeletes(upTo)
              tables.sessions = tables.sessions.filter((row) => Date.parse(row.date as string) > Date.parse(upTo))
              return { error: null }
            },
          }),
        }),
      }
    }),
  }

  return {
    client,
    tables,
    fail,
    stateUpserts,
    sessionUpserts,
    sessionDeletes,
    hold(kind: 'pull' | 'push') {
      pending[kind] = new Promise((resolve) => {
        gates[kind] = () => {
          delete pending[kind]
          resolve()
        }
      })
    },
    release(kind: 'pull' | 'push') {
      gates[kind]?.()
    },
  }
}

function session(id: string, date = '2026-05-01T12:00:00.000Z', extra: Partial<CompletedSession> = {}): CompletedSession {
  return { id, techniqueId: 'box_breathing', date, durationSeconds: 240, rounds: 4, holdTimes: [], maxHoldTime: 0, avgHoldTime: 0, ...extra }
}

function sessionRow(id: string, extra: Row = {}): Row {
  return {
    id, technique_id: 'box_breathing', date: '2026-04-20T12:00:00.000Z', duration_seconds: 240, rounds: 4,
    hold_times: [], custom_phase_durations: null, max_hold_time: 0, avg_hold_time: 0, mood_before: null, mood_after: null, ...extra,
  }
}

function signInAs(userId: string) {
  clerkMock.auth.isSignedIn = true
  clerkMock.user.user = { id: userId, primaryEmailAddress: { emailAddress: `${userId}@example.com` }, fullName: 'Breath', imageUrl: null }
  clerkMock.session.session = { id: `${userId}_session` }
}

function signOut() {
  clerkMock.auth.isSignedIn = false
  clerkMock.user.user = null
  clerkMock.session.session = null
}

/** Lets timers and the promises they start run, inside act so React sees the updates. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function resetStores() {
  useHistoryStore.setState(getEmptyHistoryState())
  useGamificationStore.setState({ xp: 0, earnedBadges: [], selectedTheme: 'default' })
  useSettingsStore.setState({ ...DEFAULT_SETTINGS_STATE })
  usePracticeStore.setState(getDefaultPracticeState())
}

const tag = () => useSyncStore.getState().state.tag

beforeEach(() => {
  vi.useFakeTimers()
  signOut()
  supabaseMock.createClerkSupabaseClient.mockReset()
  useSyncStore.setState({ state: INITIAL_SYNC_STATE, client: null })
  resetStores()
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useCloudSync lifecycle', () => {
  it('never pushes before the pull has landed', async () => {
    const cloud = createCloud({ state: { xp: 900, earned_badges: ['streak_7'], settings: {} }, sessions: [sessionRow('cloud-1')] })
    cloud.hold('pull')
    signInAs('user_1')
    supabaseMock.createClerkSupabaseClient.mockReturnValue(cloud.client)

    renderHook(() => useCloudSync())
    await advance(0)
    useHistoryStore.setState({ sessions: [session('local-1')] })
    await advance(10_000)

    expect(tag()).toBe('pulling')
    expect(cloud.stateUpserts).not.toHaveBeenCalled()
    expect(cloud.sessionUpserts).not.toHaveBeenCalled()

    cloud.release('pull')
    await advance(3_000)

    expect(cloud.tables.state).toMatchObject({ user_id: 'user_1', xp: 900, earned_badges: ['streak_7'] })
    expect(useHistoryStore.getState().sessions.map((s) => s.id)).toEqual(['local-1', 'cloud-1'])
    expect(tag()).toBe('ready')
  })

  it('a failed pull writes nothing, shows offline, and retries with backoff', async () => {
    const cloud = createCloud({ state: { xp: 900, settings: {} } })
    cloud.fail.pull = 2 // both halves of the first pull
    vi.spyOn(console, 'error').mockImplementation(() => {})
    signInAs('user_1')
    supabaseMock.createClerkSupabaseClient.mockReturnValue(cloud.client)

    renderHook(() => useCloudSync())
    await advance(100)
    expect(tag()).toBe('error')
    expect(cloud.stateUpserts).not.toHaveBeenCalled()

    await advance(5_000)
    expect(cloud.tables.state).toMatchObject({ xp: 900 })
    expect(useGamificationStore.getState().xp).toBe(900)
  })

  it('retries at once when the browser comes back online', async () => {
    const cloud = createCloud({ state: { xp: 10, settings: {} } })
    cloud.fail.pull = 2
    vi.spyOn(console, 'error').mockImplementation(() => {})
    signInAs('user_1')
    supabaseMock.createClerkSupabaseClient.mockReturnValue(cloud.client)

    renderHook(() => useCloudSync())
    await advance(100)
    expect(tag()).toBe('error')

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await advance(100)
    expect(useGamificationStore.getState().xp).toBe(10)
  })

  it('a change made while a push is in flight is pushed next, not dropped', async () => {
    const cloud = createCloud()
    signInAs('user_1')
    supabaseMock.createClerkSupabaseClient.mockReturnValue(cloud.client)

    renderHook(() => useCloudSync())
    await advance(100)
    cloud.hold('push')
    await advance(2_500) // the post-pull push starts and waits
    expect(useSyncStore.getState().state).toMatchObject({ tag: 'ready', pushing: true })

    useHistoryStore.getState().addSession({
      techniqueId: 'cyclic_sighing', date: '2026-05-02T08:00:00.000Z', durationSeconds: 300, rounds: 30,
      holdTimes: [], maxHoldTime: 0, avgHoldTime: 0,
    })
    cloud.release('push')
    await advance(5_000)

    expect(cloud.tables.sessions.map((row) => row.technique_id)).toEqual(['cyclic_sighing'])
    expect(useSyncStore.getState().state).toMatchObject({ tag: 'ready', dirty: false, pushing: false })
  })

  it('a failed push backs off and the change still arrives', async () => {
    const cloud = createCloud()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    signInAs('user_1')
    supabaseMock.createClerkSupabaseClient.mockReturnValue(cloud.client)
    useHistoryStore.setState({ sessions: [session('local-1')] })

    renderHook(() => useCloudSync())
    await advance(100)
    cloud.fail.push = 1
    await advance(2_100)
    expect(tag()).toBe('error')

    await advance(10_000)
    expect(cloud.tables.sessions.map((row) => row.id)).toEqual(['local-1'])
    expect(tag()).toBe('ready')
  })
})

describe('useCloudSync merging', () => {
  it('a reload with default local settings keeps the synced ones (and keeps localStorage)', async () => {
    writeSyncMeta({ ownerId: 'user_1', xpBase: 0, dirty: false, pushedResetAt: null })
    const cloud = createCloud({ state: { xp: 0, settings: { ...DEFAULT_SETTINGS_STATE, theme: 'dark', soundVolume: 0.8 } } })
    signInAs('user_1')
    supabaseMock.createClerkSupabaseClient.mockReturnValue(cloud.client)
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem')

    renderHook(() => useCloudSync())
    await advance(3_000)

    expect(useSettingsStore.getState()).toMatchObject({ theme: 'dark', soundVolume: 0.8 })
    expect(cloud.tables.state).toMatchObject({ settings: expect.objectContaining({ theme: 'dark', soundVolume: 0.8 }) })
    expect(removeItem).not.toHaveBeenCalled()
    expect(localStorage.getItem(STORAGE_KEYS.SETTINGS)).toContain('"dark"')
  })

  it('adds XP earned on this device to XP earned elsewhere since the last sync', async () => {
    writeSyncMeta({ ownerId: 'user_1', xpBase: 100, dirty: true, pushedResetAt: null })
    useGamificationStore.setState({ xp: 130 })
    const cloud = createCloud({ state: { xp: 150, settings: {} } })
    signInAs('user_1')
    supabaseMock.createClerkSupabaseClient.mockReturnValue(cloud.client)

    renderHook(() => useCloudSync())
    await advance(3_000)

    expect(useGamificationStore.getState().xp).toBe(180)
    expect(cloud.tables.state).toMatchObject({ xp: 180 })
    expect(readSyncMeta()).toMatchObject({ ownerId: 'user_1', xpBase: 180, dirty: false })
  })

  it("another account's data on this device is set aside, never merged into this account", async () => {
    writeSyncMeta({ ownerId: 'user_a', xpBase: 300, dirty: true, pushedResetAt: null })
    useHistoryStore.setState({ sessions: [session('a-private')] })
    useGamificationStore.setState({ xp: 300, earnedBadges: ['first_session'] })
    const cloud = createCloud({ state: { xp: 20, settings: {} } })
    signInAs('user_b')
    supabaseMock.createClerkSupabaseClient.mockReturnValue(cloud.client)

    renderHook(() => useCloudSync())
    await advance(3_000)

    expect(useHistoryStore.getState().sessions).toEqual([])
    expect(useGamificationStore.getState()).toMatchObject({ xp: 20, earnedBadges: [] })
    expect(cloud.tables.sessions).toEqual([])
    expect(cloud.tables.state).toMatchObject({ user_id: 'user_b', xp: 20 })
    expect(readSyncMeta()?.ownerId).toBe('user_b')
  })

  it('signing out keeps the data usable offline and remembers whose it is', async () => {
    const cloud = createCloud({ sessions: [sessionRow('cloud-1')] })
    signInAs('user_1')
    supabaseMock.createClerkSupabaseClient.mockReturnValue(cloud.client)

    const { rerender } = renderHook(() => useCloudSync())
    await advance(3_000)
    signOut()
    rerender()
    await advance(100)

    expect(tag()).toBe('signedOut')
    expect(useHistoryStore.getState().sessions.map((s) => s.id)).toEqual(['cloud-1'])
    expect(readSyncMeta()?.ownerId).toBe('user_1')
  })

  it('anonymous local sessions are uploaded on the first sign-in, cadence included', async () => {
    const cloud = createCloud()
    signInAs('user_1')
    supabaseMock.createClerkSupabaseClient.mockReturnValue(cloud.client)
    useHistoryStore.setState({
      sessions: [session('custom-session', '2026-05-01T12:00:00.000Z', {
        techniqueId: 'resonance_breathing',
        customPhaseDurations: { [BREATH_PHASES.INHALE]: 6, [BREATH_PHASES.EXHALE]: 5 },
      })],
    })

    renderHook(() => useCloudSync())
    await advance(3_000)

    expect(cloud.tables.sessions).toEqual([
      expect.objectContaining({ id: 'custom-session', custom_phase_durations: { [BREATH_PHASES.INHALE]: 6, [BREATH_PHASES.EXHALE]: 5 } }),
    ])
  })

  it('cloud rows are cleaned: custom cadence and mood kept, broken rows dropped', async () => {
    const cloud = createCloud({
      sessions: [
        sessionRow('good', { custom_phase_durations: { [BREATH_PHASES.INHALE]: 6 }, mood_before: 2, mood_after: 9 }),
        sessionRow('no-duration', { duration_seconds: null }),
        sessionRow('bad-technique', { technique_id: 'yoga' }),
      ],
    })
    signInAs('user_1')
    supabaseMock.createClerkSupabaseClient.mockReturnValue(cloud.client)

    renderHook(() => useCloudSync())
    await advance(100)

    const sessions = useHistoryStore.getState().sessions
    expect(sessions.map((s) => s.id)).toEqual(['good'])
    expect(sessions[0]).toMatchObject({ customPhaseDurations: { [BREATH_PHASES.INHALE]: 6 }, moodBefore: 2 })
    expect(sessions[0]).not.toHaveProperty('moodAfter')
    expect(Number.isNaN(sessions[0].durationSeconds)).toBe(false)
  })

  it('a history erase made here deletes the older cloud rows on the next push', async () => {
    writeSyncMeta({ ownerId: 'user_1', xpBase: 0, dirty: false, pushedResetAt: null })
    const cloud = createCloud({ sessions: [sessionRow('old')] })
    signInAs('user_1')
    supabaseMock.createClerkSupabaseClient.mockReturnValue(cloud.client)

    renderHook(() => useCloudSync())
    await advance(3_000)
    expect(useHistoryStore.getState().sessions).toHaveLength(1)

    useHistoryStore.getState().clearHistory('2026-05-10T00:00:00.000Z')
    await advance(3_000)

    expect(cloud.sessionDeletes).toHaveBeenCalledWith('2026-05-10T00:00:00.000Z')
    expect(cloud.tables.sessions).toEqual([])
    expect(cloud.tables.state).toMatchObject({ settings: expect.objectContaining({ resetAt: '2026-05-10T00:00:00.000Z' }) })
  })
})

describe('useCloudSync flushing', () => {
  async function readyWithPendingChange() {
    const cloud = createCloud()
    signInAs('user_1')
    supabaseMock.createClerkSupabaseClient.mockReturnValue(cloud.client)
    const hook = renderHook(() => useCloudSync())
    await advance(3_000)
    cloud.stateUpserts.mockClear()
    useHistoryStore.setState({ sessions: [session('pending')] })
    await advance(0)
    expect(cloud.stateUpserts).not.toHaveBeenCalled()
    return { cloud, hook }
  }

  it('sends a pending change when the page is hidden', async () => {
    const { cloud, hook } = await readyWithPendingChange()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await advance(0)

    expect(cloud.stateUpserts).toHaveBeenCalled()
    expect(cloud.tables.sessions.map((row) => row.id)).toEqual(['pending'])
    hook.unmount()
    visibility.mockRestore()
  })

  it('sends a pending change when the hook unmounts', async () => {
    const { cloud, hook } = await readyWithPendingChange()
    hook.unmount()
    await advance(0)
    expect(cloud.tables.sessions.map((row) => row.id)).toEqual(['pending'])
  })
})

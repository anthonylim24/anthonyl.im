import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGamificationStore } from '@/stores/gamificationStore'
import { getEmptyHistoryState, useHistoryStore, type CompletedSession } from '@/stores/historyStore'
import { DEFAULT_SETTINGS_STATE, useSettingsStore } from '@/stores/settingsStore'
import { INITIAL_SYNC_STATE, type SyncState } from '../machine'
import { readSyncMeta, writeSyncMeta } from '../meta'
import { EraseUnavailableError, eraseAllData, useSyncStore } from '../store'

const NOW = new Date('2026-06-01T09:00:00.000Z')
const ready: SyncState = { tag: 'ready', userId: 'user_1', seq: 3, dirty: false, pushing: false, attempt: 0 }

function session(id: string): CompletedSession {
  return { id, techniqueId: 'box_breathing', date: '2026-05-01T12:00:00.000Z', durationSeconds: 240, rounds: 4, holdTimes: [], maxHoldTime: 0, avgHoldTime: 0 }
}

function createClient(options: { stateError?: unknown; deleteError?: unknown } = {}) {
  const stateUpsert = vi.fn(async () => ({ error: options.stateError ?? null }))
  const deleteUpTo = vi.fn(async () => ({ error: options.deleteError ?? null }))
  const eqUser = vi.fn(() => ({ lte: deleteUpTo }))
  const client = {
    from: vi.fn((table: string) => (table === 'user_state'
      ? { upsert: stateUpsert }
      : { delete: () => ({ eq: eqUser }) })),
  }
  return { client: client as unknown as SupabaseClient, stateUpsert, deleteUpTo, eqUser }
}

function seed() {
  useHistoryStore.setState({ ...getEmptyHistoryState(), sessions: [session('a')] })
  useGamificationStore.setState({ xp: 400, earnedBadges: ['first_session'], selectedTheme: 'default' })
  useSettingsStore.setState({ ...DEFAULT_SETTINGS_STATE, theme: 'dark', updatedAt: 1 })
}

beforeEach(() => {
  localStorage.clear()
  useSyncStore.setState({ state: INITIAL_SYNC_STATE, client: null })
  seed()
})

describe('eraseAllData', () => {
  it('signed out, erases this device only', async () => {
    await eraseAllData(NOW)
    expect(useHistoryStore.getState().sessions).toEqual([])
    expect(useHistoryStore.getState().resetAt).toBe(NOW.toISOString())
    expect(useGamificationStore.getState().xp).toBe(0)
    expect(useSettingsStore.getState().theme).toBe('light')
  })

  it("signed in, deletes the account's session rows and resets its progress, then this device", async () => {
    const { client, stateUpsert, deleteUpTo, eqUser } = createClient()
    writeSyncMeta({ ownerId: 'user_1', xpBase: 400, dirty: false, pushedResetAt: null })
    useSyncStore.setState({ state: ready, client })

    await eraseAllData(NOW)

    expect(stateUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user_1', xp: 0, earned_badges: [], personal_bests: {}, settings: expect.objectContaining({ resetAt: NOW.toISOString() }) }),
      { onConflict: 'user_id' },
    )
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user_1')
    expect(deleteUpTo).toHaveBeenCalledWith('date', NOW.toISOString())
    expect(useHistoryStore.getState().sessions).toEqual([])
    expect(useGamificationStore.getState().xp).toBe(0)
    expect(readSyncMeta()).toMatchObject({ ownerId: 'user_1', xpBase: 0, pushedResetAt: NOW.toISOString() })
    expect(useSyncStore.getState().state).toMatchObject({ tag: 'ready', pushing: false })
  })

  it('when the cloud cannot be reached, erases nothing and says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = createClient({ stateError: new Error('offline') })
    useSyncStore.setState({ state: ready, client })

    await expect(eraseAllData(NOW)).rejects.toBeInstanceOf(EraseUnavailableError)

    expect(useHistoryStore.getState().sessions.map((s) => s.id)).toEqual(['a'])
    expect(useGamificationStore.getState().xp).toBe(400)
    expect(useSyncStore.getState().state).toMatchObject({ tag: 'ready', pushing: false })
  })

  it('a failed row delete after the reset still erases, and leaves the delete for the next push', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = createClient({ deleteError: new Error('timeout') })
    useSyncStore.setState({ state: ready, client })

    await eraseAllData(NOW)

    expect(useHistoryStore.getState().sessions).toEqual([])
    expect(readSyncMeta()?.pushedResetAt).toBeNull()
  })

  it('refuses while sync is not connected, rather than erase only this device', async () => {
    const { client, stateUpsert } = createClient()
    for (const state of [
      { tag: 'pulling', userId: 'user_1', seq: 3, attempt: 0 },
      { tag: 'error', userId: 'user_1', seq: 3, attempt: 1, retryAt: 0 },
      { ...ready, pushing: true },
    ] satisfies SyncState[]) {
      useSyncStore.setState({ state, client })
      await expect(eraseAllData(NOW)).rejects.toBeInstanceOf(EraseUnavailableError)
    }
    expect(stateUpsert).not.toHaveBeenCalled()
    expect(useHistoryStore.getState().sessions).toHaveLength(1)
  })
})

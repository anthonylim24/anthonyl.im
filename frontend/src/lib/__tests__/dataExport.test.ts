import { describe, expect, it } from 'vitest'
import {
  buildBreathFlowExportData,
  parseBreathFlowImportData,
  replaceBreathFlowStorageData,
} from '../dataExport'
import { useGamificationStore } from '@/stores/gamificationStore'
import { getEmptyHistoryState, HISTORY_STORAGE_VERSION, useHistoryStore } from '@/stores/historyStore'
import { BREATHFLOW_STORAGE_KEYS, STORAGE_KEYS, TECHNIQUE_IDS } from '../constants'

function mutableStorageWith(values: Record<string, string>) {
  const storage = new Map(Object.entries(values))

  return {
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => {
      storage.delete(key)
    },
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    values: () => Object.fromEntries(storage),
  }
}

describe('buildBreathFlowExportData', () => {
  it('exports the live stores, not what localStorage happens to hold', () => {
    localStorage.clear()
    useHistoryStore.setState({ ...getEmptyHistoryState(), sessions: [] })
    useHistoryStore.getState().addSession({
      techniqueId: TECHNIQUE_IDS.BOX_BREATHING, date: '2026-05-01T10:00:00.000Z', durationSeconds: 120, rounds: 3,
      holdTimes: [], maxHoldTime: 0, avgHoldTime: 0,
    })
    useGamificationStore.setState({ xp: 75, earnedBadges: ['first_session'], selectedTheme: 'default' })
    // A signed-in device's localStorage can lag the stores (or, before, be emptied by sync).
    localStorage.clear()

    const data = buildBreathFlowExportData()

    expect(Object.keys(data).sort()).toEqual([...BREATHFLOW_STORAGE_KEYS].sort())
    const history = JSON.parse(data[STORAGE_KEYS.SESSION_HISTORY])
    expect(history.version).toBe(HISTORY_STORAGE_VERSION)
    expect(history.state.sessions).toHaveLength(1)
    expect(JSON.parse(data[STORAGE_KEYS.GAMIFICATION]).state).toEqual({ xp: 75, earnedBadges: ['first_session'], selectedTheme: 'default' })
  })

  it('round-trips through the importer', () => {
    expect(() => parseBreathFlowImportData(buildBreathFlowExportData())).not.toThrow()
  })
})

describe('parseBreathFlowImportData', () => {
  it('imports only BreathFlow-owned keys with JSON string values', () => {
    expect(
      parseBreathFlowImportData({
        [STORAGE_KEYS.SESSION_HISTORY]: '{"state":{"sessions":[]}}',
        [STORAGE_KEYS.GAMIFICATION]: '{"state":{"xp":120}}',
        'other-app': '{"keep":true}',
      })
    ).toEqual({
      [STORAGE_KEYS.SESSION_HISTORY]: '{"state":{"sessions":[]}}',
      [STORAGE_KEYS.GAMIFICATION]: '{"state":{"xp":120}}',
    })
  })

  it('accepts app-generated history sessions with current protocol defaults', () => {
    const history = JSON.stringify({
      state: {
        sessions: [
          {
            id: 'pursed-lip-session',
            techniqueId: TECHNIQUE_IDS.PURSED_LIP_RECOVERY,
            date: '2026-05-01T10:00:00.000Z',
            durationSeconds: 300,
            rounds: 50,
            holdTimes: [],
            maxHoldTime: 0,
            avgHoldTime: 0,
          },
        ],
      },
    })

    expect(
      parseBreathFlowImportData({
        [STORAGE_KEYS.SESSION_HISTORY]: history,
      })
    ).toEqual({
      [STORAGE_KEYS.SESSION_HISTORY]: history,
    })
  })

  it('rejects files without BreathFlow-owned keys', () => {
    expect(() => parseBreathFlowImportData({ other: '{}' })).toThrow(
      /does not contain BreathFlow data/i
    )
  })

  it('rejects malformed import values before writing storage', () => {
    expect(() =>
      parseBreathFlowImportData({
        [STORAGE_KEYS.SETTINGS]: '{not-json',
      })
    ).toThrow(/must be valid JSON/i)
  })

  it('rejects valid JSON that is not a persisted BreathFlow store', () => {
    expect(() =>
      parseBreathFlowImportData({
        [STORAGE_KEYS.SETTINGS]: '{"theme":"light"}',
      })
    ).toThrow(/persisted BreathFlow store object/i)
  })

  it('rejects invalid persisted settings values', () => {
    expect(() =>
      parseBreathFlowImportData({
        [STORAGE_KEYS.SETTINGS]: '{"state":{"theme":"neon","soundVolume":"loud"}}',
      })
    ).toThrow(/invalid theme/i)
  })

  it('rejects invalid persisted session history values', () => {
    expect(() =>
      parseBreathFlowImportData({
        [STORAGE_KEYS.SESSION_HISTORY]: JSON.stringify({
          state: {
            sessions: [
              {
                id: 'bad-session',
                techniqueId: 'unknown',
                date: '2026-05-01T10:00:00.000Z',
                durationSeconds: 120,
                rounds: 3,
                holdTimes: [],
                maxHoldTime: 0,
                avgHoldTime: 0,
              },
            ],
          },
        }),
      })
    ).toThrow(/invalid sessions/i)
  })

  it('rejects non-object imports', () => {
    expect(() => parseBreathFlowImportData(null)).toThrow(/JSON object/i)
    expect(() => parseBreathFlowImportData([])).toThrow(/JSON object/i)
  })
})

describe('replaceBreathFlowStorageData', () => {
  it('replaces BreathFlow-owned keys and preserves unrelated localStorage data', () => {
    const storage = mutableStorageWith({
      [STORAGE_KEYS.SESSION_HISTORY]: '{"state":{"sessions":[{"id":"old"}]}}',
      [STORAGE_KEYS.GAMIFICATION]: '{"state":{"xp":300}}',
      [STORAGE_KEYS.SETTINGS]: '{"state":{"theme":"dark"}}',
      'third-party-token': 'keep',
    })

    replaceBreathFlowStorageData(storage, {
      [STORAGE_KEYS.SESSION_HISTORY]: '{"state":{"sessions":[]}}',
    })

    expect(storage.values()).toEqual({
      [STORAGE_KEYS.SESSION_HISTORY]: '{"state":{"sessions":[]}}',
      'third-party-token': 'keep',
    })
  })
})

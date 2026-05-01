import { describe, expect, it } from 'vitest'
import {
  buildBreathFlowExportData,
  parseBreathFlowImportData,
  replaceBreathFlowStorageData,
} from '../dataExport'
import { STORAGE_KEYS, TECHNIQUE_IDS } from '../constants'

function storageWith(values: Record<string, string>) {
  return {
    getItem: (key: string) => values[key] ?? null,
  }
}

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
  it('exports only BreathFlow-owned localStorage keys', () => {
    const data = buildBreathFlowExportData(
      storageWith({
        [STORAGE_KEYS.SESSION_HISTORY]: '{"state":{"sessions":[]}}',
        [STORAGE_KEYS.SETTINGS]: '{"state":{"theme":"light"}}',
        'third-party-token': 'do-not-export',
      }),
    )

    expect(data).toEqual({
      [STORAGE_KEYS.SESSION_HISTORY]: '{"state":{"sessions":[]}}',
      [STORAGE_KEYS.SETTINGS]: '{"state":{"theme":"light"}}',
    })
    expect(data).not.toHaveProperty('third-party-token')
  })

  it('omits BreathFlow keys that are not present locally', () => {
    expect(buildBreathFlowExportData(storageWith({}))).toEqual({})
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

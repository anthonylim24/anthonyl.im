import { describe, expect, it } from 'vitest'
import { buildBreathFlowExportData, parseBreathFlowImportData } from '../dataExport'
import { STORAGE_KEYS } from '../constants'

function storageWith(values: Record<string, string>) {
  return {
    getItem: (key: string) => values[key] ?? null,
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

  it('rejects non-object imports', () => {
    expect(() => parseBreathFlowImportData(null)).toThrow(/JSON object/i)
    expect(() => parseBreathFlowImportData([])).toThrow(/JSON object/i)
  })
})

import { describe, expect, it } from 'vitest'
import { buildBreathFlowExportData } from '../dataExport'
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

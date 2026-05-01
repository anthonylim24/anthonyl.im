import { BREATHFLOW_STORAGE_KEYS } from './constants'

type ExportStorage = Pick<Storage, 'getItem'>
type BreathFlowStorageKey = typeof BREATHFLOW_STORAGE_KEYS[number]

export function buildBreathFlowExportData(storage: ExportStorage): Record<string, string> {
  const data: Record<string, string> = {}

  for (const key of BREATHFLOW_STORAGE_KEYS) {
    const value = storage.getItem(key)
    if (value !== null) {
      data[key] = value
    }
  }

  return data
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBreathFlowStorageKey(value: string): value is BreathFlowStorageKey {
  return BREATHFLOW_STORAGE_KEYS.includes(value as BreathFlowStorageKey)
}

export function parseBreathFlowImportData(rawData: unknown): Partial<Record<BreathFlowStorageKey, string>> {
  if (!isRecord(rawData)) {
    throw new Error('Import file must contain a JSON object.')
  }

  const importedData: Partial<Record<BreathFlowStorageKey, string>> = {}

  for (const [key, value] of Object.entries(rawData)) {
    if (!isBreathFlowStorageKey(key)) {
      continue
    }

    if (typeof value !== 'string') {
      throw new Error(`Import value for ${key} must be a string.`)
    }

    try {
      JSON.parse(value)
    } catch {
      throw new Error(`Import value for ${key} must be valid JSON.`)
    }

    importedData[key] = value
  }

  if (Object.keys(importedData).length === 0) {
    throw new Error('Import file does not contain BreathFlow data.')
  }

  return importedData
}

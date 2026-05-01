import { BREATHFLOW_STORAGE_KEYS } from './constants'

type ExportStorage = Pick<Storage, 'getItem'>

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

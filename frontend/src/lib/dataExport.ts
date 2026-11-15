import { isSoundscapeId } from '@/breathflow/engine/soundscape'
import { readLocalSnapshot, type Snapshot } from '@/lib/cloudSync/snapshot'
import { GAMIFICATION_STORAGE_VERSION } from '@/stores/gamificationStore'
import { HISTORY_STORAGE_VERSION } from '@/stores/historyStore'
import { PRACTICE_STORAGE_VERSION } from '@/stores/practiceStore'
import {
  isLocalDateKey,
  isNonNegativeNumber,
  isRecord,
  parsePersonalBest,
  parseSession,
  parseVO2Entry,
} from '@/stores/sessionRecord'
import { SETTINGS_STORAGE_VERSION } from '@/stores/settingsStore'
import { BREATHFLOW_STORAGE_KEYS, STORAGE_KEYS } from './constants'

type ImportStorage = Pick<Storage, 'removeItem' | 'setItem'>
type BreathFlowStorageKey = typeof BREATHFLOW_STORAGE_KEYS[number]

/**
 * The backup file: each store as zustand persists it (`{ state, version }`,
 * stringified), keyed by its localStorage key, so an import is a plain write
 * of those keys. Built from the live stores rather than read back from
 * localStorage, which may be behind them.
 */
export function buildBreathFlowExportData(snapshot: Snapshot = readLocalSnapshot()): Record<BreathFlowStorageKey, string> {
  const entry = (state: unknown, version: number) => JSON.stringify({ state, version })
  return {
    [STORAGE_KEYS.SESSION_HISTORY]: entry(snapshot.history, HISTORY_STORAGE_VERSION),
    [STORAGE_KEYS.GAMIFICATION]: entry(snapshot.gamification, GAMIFICATION_STORAGE_VERSION),
    [STORAGE_KEYS.SETTINGS]: entry(snapshot.settings, SETTINGS_STORAGE_VERSION),
    [STORAGE_KEYS.PRACTICE]: entry(snapshot.practice, PRACTICE_STORAGE_VERSION),
  }
}

function isBreathFlowStorageKey(value: string): value is BreathFlowStorageKey {
  return BREATHFLOW_STORAGE_KEYS.includes(value as BreathFlowStorageKey)
}

function assertStringArray(value: unknown, key: string, field: string) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`Import value for ${key} has invalid ${field}.`)
  }
}

function validateHistoryState(state: Record<string, unknown>, key: BreathFlowStorageKey) {
  if (state.sessions !== undefined) {
    if (!Array.isArray(state.sessions) || !state.sessions.every((session) => parseSession(session) !== null)) {
      throw new Error(`Import value for ${key} has invalid sessions.`)
    }
  }

  if (state.personalBests !== undefined) {
    if (!isRecord(state.personalBests) || !Object.values(state.personalBests).every((best) => parsePersonalBest(best) !== null)) {
      throw new Error(`Import value for ${key} has invalid personal bests.`)
    }
  }

  if (
    state.vo2MaxManual !== undefined &&
    state.vo2MaxManual !== null &&
    !isNonNegativeNumber(state.vo2MaxManual)
  ) {
    throw new Error(`Import value for ${key} has invalid VO2 max.`)
  }

  if (state.vo2MaxHistory !== undefined) {
    if (!Array.isArray(state.vo2MaxHistory) || !state.vo2MaxHistory.every((entry) => parseVO2Entry(entry) !== null)) {
      throw new Error(`Import value for ${key} has invalid VO2 max history.`)
    }
  }
}

function validateGamificationState(state: Record<string, unknown>, key: BreathFlowStorageKey) {
  if (state.xp !== undefined && !isNonNegativeNumber(state.xp)) {
    throw new Error(`Import value for ${key} has invalid XP.`)
  }
  if (state.earnedBadges !== undefined) {
    assertStringArray(state.earnedBadges, key, 'earned badges')
  }
  if (state.selectedTheme !== undefined && typeof state.selectedTheme !== 'string') {
    throw new Error(`Import value for ${key} has invalid selected theme.`)
  }
  // Exports from before session counts were derived from the log still carry these.
  for (const field of ['dailySessionCount', 'weeklySessionCount'] as const) {
    if (state[field] !== undefined && !isNonNegativeNumber(state[field])) {
      throw new Error(`Import value for ${key} has invalid ${field}.`)
    }
  }
  for (const field of ['lastDailyReset', 'lastWeeklyReset'] as const) {
    if (state[field] !== undefined && !isLocalDateKey(state[field])) {
      throw new Error(`Import value for ${key} has invalid ${field}.`)
    }
  }
}

function validateSettingsState(state: Record<string, unknown>, key: BreathFlowStorageKey) {
  if (state.theme !== undefined && state.theme !== 'light' && state.theme !== 'dark') {
    throw new Error(`Import value for ${key} has invalid theme.`)
  }
  for (const field of ['soundEnabled', 'hapticsEnabled', 'voiceGuidance'] as const) {
    if (state[field] !== undefined && typeof state[field] !== 'boolean') {
      throw new Error(`Import value for ${key} has invalid ${field}.`)
    }
  }
  if (state.soundscape !== undefined && !isSoundscapeId(state.soundscape)) {
    throw new Error(`Import value for ${key} has invalid soundscape.`)
  }
  if (
    state.soundVolume !== undefined &&
    (!isNonNegativeNumber(state.soundVolume) || state.soundVolume > 1)
  ) {
    throw new Error(`Import value for ${key} has invalid sound volume.`)
  }
}

function validatePersistedState(key: BreathFlowStorageKey, parsedValue: unknown) {
  if (!isRecord(parsedValue) || !isRecord(parsedValue.state)) {
    throw new Error(`Import value for ${key} must be a persisted BreathFlow store object.`)
  }

  if (key === STORAGE_KEYS.SESSION_HISTORY) {
    validateHistoryState(parsedValue.state, key)
    return
  }
  if (key === STORAGE_KEYS.GAMIFICATION) {
    validateGamificationState(parsedValue.state, key)
    return
  }
  if (key === STORAGE_KEYS.SETTINGS) {
    validateSettingsState(parsedValue.state, key)
  }
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

    let parsedValue: unknown
    try {
      parsedValue = JSON.parse(value) as unknown
    } catch {
      throw new Error(`Import value for ${key} must be valid JSON.`)
    }
    validatePersistedState(key, parsedValue)

    importedData[key] = value
  }

  if (Object.keys(importedData).length === 0) {
    throw new Error('Import file does not contain BreathFlow data.')
  }

  return importedData
}

export function replaceBreathFlowStorageData(
  storage: ImportStorage,
  data: Partial<Record<BreathFlowStorageKey, string>>,
) {
  for (const key of BREATHFLOW_STORAGE_KEYS) {
    const value = data[key]
    if (value !== undefined) {
      storage.setItem(key, value)
    }
  }

  for (const key of BREATHFLOW_STORAGE_KEYS) {
    if (data[key] === undefined) {
      storage.removeItem(key)
    }
  }
}

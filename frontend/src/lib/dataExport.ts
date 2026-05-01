import {
  BREATHFLOW_STORAGE_KEYS,
  BREATH_PHASES,
  STORAGE_KEYS,
  TECHNIQUE_IDS,
} from './constants'

type ExportStorage = Pick<Storage, 'getItem'>
type ImportStorage = Pick<Storage, 'removeItem' | 'setItem'>
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

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function isLocalDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function assertStringArray(value: unknown, key: string, field: string) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`Import value for ${key} has invalid ${field}.`)
  }
}

function assertNumberArray(value: unknown, key: string, field: string) {
  if (!Array.isArray(value) || !value.every(isNonNegativeNumber)) {
    throw new Error(`Import value for ${key} has invalid ${field}.`)
  }
}

const techniqueIds = new Set<string>(Object.values(TECHNIQUE_IDS))
const breathPhases = new Set<string>(Object.values(BREATH_PHASES))

function validateCustomPhaseDurations(value: unknown, key: string) {
  if (value === undefined) return
  if (!isRecord(value)) {
    throw new Error(`Import value for ${key} has invalid custom phase durations.`)
  }

  for (const [phase, duration] of Object.entries(value)) {
    if (!breathPhases.has(phase) || !isPositiveInteger(duration)) {
      throw new Error(`Import value for ${key} has invalid custom phase durations.`)
    }
  }
}

function validateHistoryState(state: Record<string, unknown>, key: BreathFlowStorageKey) {
  if (state.sessions !== undefined) {
    if (!Array.isArray(state.sessions)) {
      throw new Error(`Import value for ${key} has invalid sessions.`)
    }

    for (const session of state.sessions) {
      if (
        !isRecord(session) ||
        typeof session.id !== 'string' ||
        typeof session.techniqueId !== 'string' ||
        !techniqueIds.has(session.techniqueId) ||
        !isDateString(session.date) ||
        !isNonNegativeNumber(session.durationSeconds) ||
        !isPositiveInteger(session.rounds) ||
        !isNonNegativeNumber(session.maxHoldTime) ||
        !isNonNegativeNumber(session.avgHoldTime)
      ) {
        throw new Error(`Import value for ${key} has invalid sessions.`)
      }

      assertNumberArray(session.holdTimes, key, 'hold times')
      validateCustomPhaseDurations(session.customPhaseDurations, key)
    }
  }

  if (state.personalBests !== undefined) {
    if (!isRecord(state.personalBests)) {
      throw new Error(`Import value for ${key} has invalid personal bests.`)
    }

    for (const best of Object.values(state.personalBests)) {
      if (
        !isRecord(best) ||
        typeof best.techniqueId !== 'string' ||
        !techniqueIds.has(best.techniqueId) ||
        !isNonNegativeNumber(best.maxHoldTime) ||
        !isDateString(best.date)
      ) {
        throw new Error(`Import value for ${key} has invalid personal bests.`)
      }
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
    if (!Array.isArray(state.vo2MaxHistory)) {
      throw new Error(`Import value for ${key} has invalid VO2 max history.`)
    }

    for (const entry of state.vo2MaxHistory) {
      if (
        !isRecord(entry) ||
        !isNonNegativeNumber(entry.value) ||
        !isDateString(entry.date)
      ) {
        throw new Error(`Import value for ${key} has invalid VO2 max history.`)
      }
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
  for (const field of ['soundEnabled', 'hapticsEnabled'] as const) {
    if (state[field] !== undefined && typeof state[field] !== 'boolean') {
      throw new Error(`Import value for ${key} has invalid ${field}.`)
    }
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

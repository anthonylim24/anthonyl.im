import {
  getInitialProgressState,
  pickPersistedGamification,
  useGamificationStore,
  type PersistedGamificationState,
} from '@/stores/gamificationStore'
import { getEmptyHistoryState, pickPersistedHistory, useHistoryStore, type PersistedHistoryState } from '@/stores/historyStore'
import { getDefaultPracticeState, pickPersistedPractice, usePracticeStore, type PersistedPracticeState } from '@/stores/practiceStore'
import { DEFAULT_SETTINGS_STATE, pickPersistedSettings, useSettingsStore, type PersistedSettingsState } from '@/stores/settingsStore'

/** Everything BreathFlow keeps for a person, in one value: what is merged, pushed and exported. */
export interface Snapshot {
  history: PersistedHistoryState
  gamification: PersistedGamificationState
  settings: PersistedSettingsState
  practice: PersistedPracticeState
}

export function emptySnapshot(resetAt: string | null = null): Snapshot {
  return {
    history: { ...getEmptyHistoryState(), resetAt },
    gamification: getInitialProgressState(),
    settings: { ...DEFAULT_SETTINGS_STATE },
    practice: getDefaultPracticeState(),
  }
}

export function readLocalSnapshot(): Snapshot {
  return {
    history: pickPersistedHistory(useHistoryStore.getState()),
    gamification: pickPersistedGamification(useGamificationStore.getState()),
    settings: pickPersistedSettings(useSettingsStore.getState()),
    practice: pickPersistedPractice(usePracticeStore.getState()),
  }
}

export function applySnapshot(snapshot: Snapshot): void {
  useHistoryStore.setState(snapshot.history)
  useGamificationStore.setState(snapshot.gamification)
  useSettingsStore.setState(snapshot.settings)
  usePracticeStore.setState(snapshot.practice)
}

/** Every store back to a first run. `resetAt` marks history as cleared at that instant. */
export function resetLocalStores(resetAt: string | null): void {
  applySnapshot(emptySnapshot(resetAt))
}

/** Subscribes to a change in any BreathFlow store. */
export function subscribeToStores(listener: () => void): () => void {
  const unsubscribe = [
    useHistoryStore.subscribe(listener),
    useGamificationStore.subscribe(listener),
    useSettingsStore.subscribe(listener),
    usePracticeStore.subscribe(listener),
  ]
  return () => unsubscribe.forEach((stop) => stop())
}

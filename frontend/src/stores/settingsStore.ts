import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS } from '@/lib/constants'
import { createBrowserJSONStorage, followOtherTabs } from '@/lib/persistStorage'
import { isSoundscapeId, type SoundscapeId } from '@/breathflow/engine/soundscape'

export interface SettingsState {
  theme: 'dark' | 'light'
  soundEnabled: boolean
  soundVolume: number
  hapticsEnabled: boolean
  /** Ambience under a session; 'off' plays the cues alone. */
  soundscape: SoundscapeId
  /** Speak each phase aloud. */
  voiceGuidance: boolean
  /** When a preference was last changed here (ms since epoch), 0 for never. The newer copy wins a sync. */
  updatedAt: number

  setTheme: (theme: 'dark' | 'light') => void
  setSoundEnabled: (enabled: boolean) => void
  setSoundVolume: (volume: number) => void
  setHapticsEnabled: (enabled: boolean) => void
  setSoundscape: (soundscape: SoundscapeId) => void
  setVoiceGuidance: (enabled: boolean) => void
  resetSettings: () => void
}

export type PersistedSettingsState = Pick<
  SettingsState,
  'theme' | 'soundEnabled' | 'soundVolume' | 'hapticsEnabled' | 'soundscape' | 'voiceGuidance' | 'updatedAt'
>

/** The preferences themselves, without bookkeeping. */
export const SETTINGS_PREFERENCE_KEYS = [
  'theme', 'soundEnabled', 'soundVolume', 'hapticsEnabled', 'soundscape', 'voiceGuidance',
] as const satisfies readonly (keyof PersistedSettingsState)[]

export const DEFAULT_SETTINGS_STATE: PersistedSettingsState = {
  theme: 'light',
  soundEnabled: true,
  soundVolume: 0.3,
  hapticsEnabled: true,
  soundscape: 'off',
  voiceGuidance: false,
  updatedAt: 0,
}

export const SETTINGS_STORAGE_VERSION = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTheme(value: unknown): value is PersistedSettingsState['theme'] {
  return value === 'light' || value === 'dark'
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS_STATE.soundVolume
  }

  return Math.max(0, Math.min(1, value))
}

export function migratePersistedSettingsState(persistedState: unknown): PersistedSettingsState {
  if (!isRecord(persistedState)) {
    return { ...DEFAULT_SETTINGS_STATE }
  }

  return {
    theme: isTheme(persistedState.theme) ? persistedState.theme : DEFAULT_SETTINGS_STATE.theme,
    soundEnabled: readBoolean(persistedState.soundEnabled, DEFAULT_SETTINGS_STATE.soundEnabled),
    soundVolume: readVolume(persistedState.soundVolume),
    hapticsEnabled: readBoolean(persistedState.hapticsEnabled, DEFAULT_SETTINGS_STATE.hapticsEnabled),
    soundscape: isSoundscapeId(persistedState.soundscape) ? persistedState.soundscape : DEFAULT_SETTINGS_STATE.soundscape,
    voiceGuidance: readBoolean(persistedState.voiceGuidance, DEFAULT_SETTINGS_STATE.voiceGuidance),
    updatedAt: typeof persistedState.updatedAt === 'number' && Number.isFinite(persistedState.updatedAt) && persistedState.updatedAt > 0
      ? persistedState.updatedAt
      : 0,
  }
}

/** The stored half of the settings state: what localStorage and the cloud keep. */
export function pickPersistedSettings(state: PersistedSettingsState): PersistedSettingsState {
  return {
    theme: state.theme,
    soundEnabled: state.soundEnabled,
    soundVolume: state.soundVolume,
    hapticsEnabled: state.hapticsEnabled,
    soundscape: state.soundscape,
    voiceGuidance: state.voiceGuidance,
    updatedAt: state.updatedAt,
  }
}

export function hasNonDefaultSettings(settings: PersistedSettingsState): boolean {
  return SETTINGS_PREFERENCE_KEYS.some((key) => settings[key] !== DEFAULT_SETTINGS_STATE[key])
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS_STATE,

      setTheme: (theme) => {
        set({ theme, updatedAt: Date.now() })
      },

      setSoundEnabled: (enabled) => {
        set({ soundEnabled: enabled, updatedAt: Date.now() })
      },

      setSoundVolume: (volume) => {
        set({ soundVolume: Math.max(0, Math.min(1, volume)), updatedAt: Date.now() })
      },

      setHapticsEnabled: (enabled) => {
        set({ hapticsEnabled: enabled, updatedAt: Date.now() })
      },

      setSoundscape: (soundscape) => {
        set({ soundscape, updatedAt: Date.now() })
      },

      setVoiceGuidance: (enabled) => {
        set({ voiceGuidance: enabled, updatedAt: Date.now() })
      },

      resetSettings: () => {
        set(DEFAULT_SETTINGS_STATE)
      },
    }),
    {
      name: STORAGE_KEYS.SETTINGS,
      storage: createBrowserJSONStorage<PersistedSettingsState>(),
      version: SETTINGS_STORAGE_VERSION,
      partialize: (state): PersistedSettingsState => pickPersistedSettings(state),
      migrate: (persistedState) => migratePersistedSettingsState(persistedState),
      // zustand calls `migrate` only on a version change; same-version data is cleaned here.
      merge: (persisted, current) =>
        persisted === undefined ? current : { ...current, ...migratePersistedSettingsState(persisted) },
    },
  ),
)

followOtherTabs(useSettingsStore, STORAGE_KEYS.SETTINGS)

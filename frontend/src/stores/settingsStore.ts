import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS } from '@/lib/constants'
import { createBrowserJSONStorage } from '@/lib/persistStorage'

export interface SettingsState {
  theme: 'dark' | 'light'
  soundEnabled: boolean
  soundVolume: number
  hapticsEnabled: boolean

  setTheme: (theme: 'dark' | 'light') => void
  setSoundEnabled: (enabled: boolean) => void
  setSoundVolume: (volume: number) => void
  setHapticsEnabled: (enabled: boolean) => void
  resetSettings: () => void
}

export type PersistedSettingsState = Pick<
  SettingsState,
  'theme' | 'soundEnabled' | 'soundVolume' | 'hapticsEnabled'
>

export const DEFAULT_SETTINGS_STATE: PersistedSettingsState = {
  theme: 'light',
  soundEnabled: true,
  soundVolume: 0.3,
  hapticsEnabled: true,
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
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS_STATE,

      setTheme: (theme) => {
        set({ theme })
      },

      setSoundEnabled: (enabled) => {
        set({ soundEnabled: enabled })
      },

      setSoundVolume: (volume) => {
        set({ soundVolume: Math.max(0, Math.min(1, volume)) })
      },

      setHapticsEnabled: (enabled) => {
        set({ hapticsEnabled: enabled })
      },

      resetSettings: () => {
        set(DEFAULT_SETTINGS_STATE)
      },
    }),
    {
      name: STORAGE_KEYS.SETTINGS,
      storage: createBrowserJSONStorage<PersistedSettingsState>(),
      version: SETTINGS_STORAGE_VERSION,
      partialize: (state): PersistedSettingsState => ({
        theme: state.theme,
        soundEnabled: state.soundEnabled,
        soundVolume: state.soundVolume,
        hapticsEnabled: state.hapticsEnabled,
      }),
      migrate: (persistedState) => migratePersistedSettingsState(persistedState),
    },
  ),
)

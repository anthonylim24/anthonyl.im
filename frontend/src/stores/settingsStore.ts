import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS } from '@/lib/constants'

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
    },
  ),
)

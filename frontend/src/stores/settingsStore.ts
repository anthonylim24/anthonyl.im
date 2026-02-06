import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  theme: 'dark' | 'light'
  soundEnabled: boolean
  soundVolume: number
  hapticsEnabled: boolean

  setTheme: (theme: 'dark' | 'light') => void
  setSoundEnabled: (enabled: boolean) => void
  setSoundVolume: (volume: number) => void
  setHapticsEnabled: (enabled: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      soundEnabled: true,
      soundVolume: 0.3,
      hapticsEnabled: true,

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
    }),
    {
      name: 'breathwork-settings',
    },
  ),
)

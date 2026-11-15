import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS } from '@/lib/constants'
import { createBrowserJSONStorage, followOtherTabs } from '@/lib/persistStorage'
import { DEFAULT_ORB_THEME_ID } from '@/breathflow/gamify/orbThemes'
import { isNonNegativeNumber, isRecord } from './sessionRecord'

// Sessions per day / week are derived from the history log; they are not stored
// here. Older persisted and cloud copies may still carry `dailySessionCount`
// and friends: the cleaner below ignores them.

interface GamificationState {
  xp: number
  earnedBadges: string[]
  selectedTheme: string

  addXP: (amount: number) => void
  unlockBadges: (badgeIds: string[]) => void
  setSelectedTheme: (id: string) => void
  resetProgress: () => void
}

export type PersistedGamificationState = Pick<GamificationState, 'xp' | 'earnedBadges' | 'selectedTheme'>

export const GAMIFICATION_STORAGE_VERSION = 1

export function getInitialProgressState(): PersistedGamificationState {
  return { xp: 0, earnedBadges: [], selectedTheme: DEFAULT_ORB_THEME_ID }
}

export function migratePersistedGamificationState(
  persistedState: unknown
): PersistedGamificationState {
  const defaults = getInitialProgressState()
  if (!isRecord(persistedState)) {
    return defaults
  }

  return {
    xp: isNonNegativeNumber(persistedState.xp) ? persistedState.xp : defaults.xp,
    earnedBadges: Array.isArray(persistedState.earnedBadges)
      ? [...new Set(persistedState.earnedBadges.filter((badge): badge is string => typeof badge === 'string'))]
      : defaults.earnedBadges,
    selectedTheme: typeof persistedState.selectedTheme === 'string'
      ? persistedState.selectedTheme
      : defaults.selectedTheme,
  }
}

export function pickPersistedGamification(state: PersistedGamificationState): PersistedGamificationState {
  return { xp: state.xp, earnedBadges: state.earnedBadges, selectedTheme: state.selectedTheme }
}

export const useGamificationStore = create<GamificationState>()(
  persist(
    (set) => ({
      ...getInitialProgressState(),

      addXP: (amount) => {
        set((state) => ({ xp: state.xp + amount }))
      },

      unlockBadges: (badgeIds) => {
        set((state) => {
          const newBadges = badgeIds.filter(
            (id) => !state.earnedBadges.includes(id),
          )
          if (newBadges.length === 0) return state
          return { earnedBadges: [...state.earnedBadges, ...newBadges] }
        })
      },

      setSelectedTheme: (id) => {
        set({ selectedTheme: id })
      },

      resetProgress: () => {
        set(getInitialProgressState())
      },
    }),
    {
      name: STORAGE_KEYS.GAMIFICATION,
      storage: createBrowserJSONStorage<PersistedGamificationState>(),
      version: GAMIFICATION_STORAGE_VERSION,
      partialize: (state) => pickPersistedGamification(state),
      migrate: (persistedState) => migratePersistedGamificationState(persistedState),
      // zustand calls `migrate` only on a version change; same-version data is cleaned here.
      merge: (persisted, current) =>
        persisted === undefined ? current : { ...current, ...migratePersistedGamificationState(persisted) },
    },
  ),
)

followOtherTabs(useGamificationStore, STORAGE_KEYS.GAMIFICATION)

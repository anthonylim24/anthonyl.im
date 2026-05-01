import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS } from '@/lib/constants'
import { formatLocalDateKey, getLocalWeekStartKey } from '@/lib/localDates'

function getToday(): string {
  return formatLocalDateKey(new Date())
}

function getWeekStart(): string {
  return getLocalWeekStartKey()
}

interface GamificationState {
  xp: number
  earnedBadges: string[]
  selectedTheme: string
  dailySessionCount: number
  weeklySessionCount: number
  lastDailyReset: string
  lastWeeklyReset: string

  addXP: (amount: number) => void
  unlockBadges: (badgeIds: string[]) => void
  setSelectedTheme: (id: string) => void
  recordSession: () => void
  checkResets: () => void
  resetProgress: () => void
}

function getInitialProgressState(): Pick<
  GamificationState,
  | 'xp'
  | 'earnedBadges'
  | 'selectedTheme'
  | 'dailySessionCount'
  | 'weeklySessionCount'
  | 'lastDailyReset'
  | 'lastWeeklyReset'
> {
  return {
    xp: 0,
    earnedBadges: [],
    selectedTheme: 'default',
    dailySessionCount: 0,
    weeklySessionCount: 0,
    lastDailyReset: getToday(),
    lastWeeklyReset: getWeekStart(),
  }
}

export const useGamificationStore = create<GamificationState>()(
  persist(
    (set, get) => ({
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

      recordSession: () => {
        get().checkResets()
        set((state) => ({
          dailySessionCount: state.dailySessionCount + 1,
          weeklySessionCount: state.weeklySessionCount + 1,
        }))
      },

      checkResets: () => {
        const today = getToday()
        const weekStart = getWeekStart()
        const state = get()

        const updates: Partial<GamificationState> = {}

        if (state.lastDailyReset !== today) {
          updates.dailySessionCount = 0
          updates.lastDailyReset = today
        }

        if (state.lastWeeklyReset !== weekStart) {
          updates.weeklySessionCount = 0
          updates.lastWeeklyReset = weekStart
        }

        if (Object.keys(updates).length > 0) {
          set(updates)
        }
      },

      resetProgress: () => {
        set(getInitialProgressState())
      },
    }),
    {
      name: STORAGE_KEYS.GAMIFICATION,
    },
  ),
)

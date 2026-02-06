import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function getWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday
  const monday = new Date(now)
  monday.setDate(diff)
  return monday.toISOString().split('T')[0]
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
}

export const useGamificationStore = create<GamificationState>()(
  persist(
    (set, get) => ({
      xp: 0,
      earnedBadges: [],
      selectedTheme: 'default',
      dailySessionCount: 0,
      weeklySessionCount: 0,
      lastDailyReset: getToday(),
      lastWeeklyReset: getWeekStart(),

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
    }),
    {
      name: 'breathwork-gamification',
    },
  ),
)

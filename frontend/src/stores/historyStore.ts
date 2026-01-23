import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TechniqueId } from '@/lib/constants'
import { STORAGE_KEYS } from '@/lib/constants'

export interface CompletedSession {
  id: string
  techniqueId: TechniqueId
  date: string // ISO string
  durationSeconds: number
  rounds: number
  holdTimes: number[]
  maxHoldTime: number
  avgHoldTime: number
}

export interface PersonalBest {
  techniqueId: TechniqueId
  maxHoldTime: number
  date: string
}

interface HistoryState {
  sessions: CompletedSession[]
  personalBests: Record<TechniqueId, PersonalBest | undefined>
  vo2MaxManual: number | null
  vo2MaxHistory: { value: number; date: string }[]
  addSession: (session: Omit<CompletedSession, 'id'>) => void
  clearHistory: () => void
  setVO2Max: (value: number) => void
  getSessionsByTechnique: (techniqueId: TechniqueId) => CompletedSession[]
  getRecentSessions: (count: number) => CompletedSession[]
  getStreak: () => number
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      sessions: [],
      personalBests: {} as Record<TechniqueId, PersonalBest | undefined>,
      vo2MaxManual: null,
      vo2MaxHistory: [],

      addSession: (sessionData) => {
        const session: CompletedSession = {
          ...sessionData,
          id: crypto.randomUUID(),
        }

        set((state) => {
          // Update personal best if applicable
          const currentBest = state.personalBests[session.techniqueId]
          const newPersonalBests = { ...state.personalBests }

          if (!currentBest || session.maxHoldTime > currentBest.maxHoldTime) {
            newPersonalBests[session.techniqueId] = {
              techniqueId: session.techniqueId,
              maxHoldTime: session.maxHoldTime,
              date: session.date,
            }
          }

          return {
            sessions: [session, ...state.sessions],
            personalBests: newPersonalBests,
          }
        })
      },

      clearHistory: () => {
        set({
          sessions: [],
          personalBests: {} as Record<TechniqueId, PersonalBest | undefined>,
        })
      },

      setVO2Max: (value) => {
        set((state) => ({
          vo2MaxManual: value,
          vo2MaxHistory: [
            ...state.vo2MaxHistory,
            { value, date: new Date().toISOString() },
          ],
        }))
      },

      getSessionsByTechnique: (techniqueId) => {
        return get().sessions.filter((s) => s.techniqueId === techniqueId)
      },

      getRecentSessions: (count) => {
        return get().sessions.slice(0, count)
      },

      getStreak: () => {
        const sessions = get().sessions
        if (sessions.length === 0) return 0

        let streak = 0
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const checkDate = new Date(today)

        while (true) {
          const dateStr = checkDate.toISOString().split('T')[0]
          const hasSession = sessions.some(
            (s) => s.date.split('T')[0] === dateStr
          )

          if (hasSession) {
            streak++
            checkDate.setDate(checkDate.getDate() - 1)
          } else if (streak === 0) {
            // Check if there was a session yesterday (streak might still be valid)
            checkDate.setDate(checkDate.getDate() - 1)
            const yesterdayStr = checkDate.toISOString().split('T')[0]
            const hasYesterdaySession = sessions.some(
              (s) => s.date.split('T')[0] === yesterdayStr
            )
            if (!hasYesterdaySession) break
          } else {
            break
          }
        }

        return streak
      },
    }),
    {
      name: STORAGE_KEYS.SESSION_HISTORY,
    }
  )
)

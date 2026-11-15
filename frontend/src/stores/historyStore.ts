import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TechniqueId } from '@/lib/constants'
import { STORAGE_KEYS } from '@/lib/constants'
import type { MoodValue } from '@/lib/mood'
import {
  addLocalDays,
  formatLocalDateKey,
  getLocalDateKey,
  getLocalDayStart,
  getSessionDayKey,
} from '@/lib/localDates'
import { createBrowserJSONStorage, followOtherTabs } from '@/lib/persistStorage'
import { mergeHistoryStates, type PersistedHistoryState } from './historyMerge'
import {
  isDateString,
  isNonNegativeNumber,
  isRecord,
  parsePersonalBests,
  parseSessions,
  parseVO2History,
  type CompletedSession,
  type PersonalBest,
} from './sessionRecord'

export type { CompletedSession, PersonalBest } from './sessionRecord'
export type { PersistedHistoryState } from './historyMerge'

interface HistoryState extends PersistedHistoryState {
  addSession: (session: Omit<CompletedSession, 'id' | 'localDay'>) => void
  /** A key passed as `undefined` clears that rating; a key left out is untouched. */
  setSessionMood: (id: string, mood: { moodBefore?: MoodValue; moodAfter?: MoodValue }) => void
  /** Forgets everything. `resetAt` lets a caller share one instant with the cloud copy. */
  clearHistory: (resetAt?: string) => void
  setVO2Max: (value: number) => void
  getSessionsByTechnique: (techniqueId: TechniqueId) => CompletedSession[]
  getRecentSessions: (count: number) => CompletedSession[]
  getStreak: () => number
}

export const HISTORY_STORAGE_VERSION = 1

export function getEmptyHistoryState(): PersistedHistoryState {
  return {
    sessions: [],
    personalBests: {} as Record<TechniqueId, PersonalBest | undefined>,
    vo2MaxManual: null,
    vo2MaxHistory: [],
    resetAt: null,
  }
}

/** Cleans history from localStorage, an import file or the cloud; bad sessions are dropped one by one. */
export function migratePersistedHistoryState(persistedState: unknown): PersistedHistoryState {
  if (!isRecord(persistedState)) {
    return getEmptyHistoryState()
  }

  return {
    sessions: parseSessions(persistedState.sessions),
    personalBests: parsePersonalBests(persistedState.personalBests) as Record<TechniqueId, PersonalBest | undefined>,
    vo2MaxManual: isNonNegativeNumber(persistedState.vo2MaxManual)
      ? persistedState.vo2MaxManual
      : null,
    vo2MaxHistory: parseVO2History(persistedState.vo2MaxHistory),
    resetAt: isDateString(persistedState.resetAt) ? persistedState.resetAt : null,
  }
}

export function pickPersistedHistory(state: PersistedHistoryState): PersistedHistoryState {
  return {
    sessions: state.sessions,
    personalBests: state.personalBests,
    vo2MaxManual: state.vo2MaxManual,
    vo2MaxHistory: state.vo2MaxHistory,
    resetAt: state.resetAt,
  }
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      ...getEmptyHistoryState(),

      addSession: (sessionData) => {
        const localDay = getLocalDateKey(sessionData.date)
        const session: CompletedSession = {
          ...sessionData,
          ...(localDay ? { localDay } : {}),
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

      setSessionMood: (id, mood) => {
        set((state) => ({
          sessions: state.sessions.map((session) => {
            if (session.id !== id) return session

            const next = { ...session }
            for (const key of ['moodBefore', 'moodAfter'] as const) {
              if (!(key in mood)) continue
              const value = mood[key]
              if (value === undefined) delete next[key]
              else next[key] = value
            }
            return next
          }),
        }))
      },

      clearHistory: (resetAt = new Date().toISOString()) => {
        set({ ...getEmptyHistoryState(), resetAt })
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

        const sessionDays = new Set(
          sessions
            .map(getSessionDayKey)
            .filter((dateKey): dateKey is string => Boolean(dateKey))
        )
        let streak = 0
        let checkDate = getLocalDayStart()

        while (true) {
          const dateStr = formatLocalDateKey(checkDate)
          const hasSession = sessionDays.has(dateStr)

          if (hasSession) {
            streak++
            checkDate = addLocalDays(checkDate, -1)
          } else if (streak === 0) {
            // Check if there was a session yesterday (streak might still be valid)
            checkDate = addLocalDays(checkDate, -1)
            const yesterdayStr = formatLocalDateKey(checkDate)
            const hasYesterdaySession = sessionDays.has(yesterdayStr)
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
      storage: createBrowserJSONStorage<PersistedHistoryState>(),
      version: HISTORY_STORAGE_VERSION,
      partialize: (state) => pickPersistedHistory(state),
      migrate: (persistedState) => migratePersistedHistoryState(persistedState),
      // zustand calls `migrate` only on a version change, so same-version data
      // is cleaned here too. On a rehydrate from another tab's write the two
      // logs are merged by id, so neither tab's new session is lost.
      merge: (persisted, current) =>
        persisted === undefined
          ? current
          : { ...current, ...mergeHistoryStates(migratePersistedHistoryState(persisted), pickPersistedHistory(current)) },
    }
  )
)

followOtherTabs(useHistoryStore, STORAGE_KEYS.SESSION_HISTORY)

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS } from '@/lib/constants'
import { createBrowserJSONStorage } from '@/lib/persistStorage'
import { getJourney, isJourneyId, type JourneyId } from '@/breathflow/journeys/catalog'

/** Minutes a day a person can aim for. The first is the default. */
export const DAILY_GOAL_OPTIONS = [5, 3, 10, 15, 20] as const
export const DEFAULT_DAILY_GOAL_MINUTES = DAILY_GOAL_OPTIONS[0]

export interface JourneyProgress {
  startedAt: string
  /** Indexes of the steps finished, in the order they were finished. */
  done: number[]
}

interface PracticeState {
  dailyGoalMinutes: number
  /** The journey Home offers to continue, or null when none is under way. */
  activeJourneyId: JourneyId | null
  journeys: Partial<Record<JourneyId, JourneyProgress>>

  setDailyGoalMinutes: (minutes: number) => void
  startJourney: (id: JourneyId) => void
  leaveJourney: () => void
  /** Records a finished step. Returns true when it was the journey's last one. */
  completeJourneyStep: (id: JourneyId, step: number) => boolean
  resetPractice: () => void
}

export type PersistedPracticeState = Pick<PracticeState, 'dailyGoalMinutes' | 'activeJourneyId' | 'journeys'>

export const PRACTICE_STORAGE_VERSION = 1

export function getDefaultPracticeState(): PersistedPracticeState {
  return { dailyGoalMinutes: DEFAULT_DAILY_GOAL_MINUTES, activeJourneyId: null, journeys: {} }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Cleans practice state from localStorage, an import file or the cloud. */
export function migratePersistedPracticeState(persisted: unknown): PersistedPracticeState {
  const state = getDefaultPracticeState()
  if (!isRecord(persisted)) return state

  if ((DAILY_GOAL_OPTIONS as readonly unknown[]).includes(persisted.dailyGoalMinutes)) {
    state.dailyGoalMinutes = persisted.dailyGoalMinutes as number
  }
  if (isRecord(persisted.journeys)) {
    for (const [id, progress] of Object.entries(persisted.journeys)) {
      if (!isJourneyId(id) || !isRecord(progress)) continue
      const stepCount = getJourney(id).steps.length
      const done = Array.isArray(progress.done)
        ? [...new Set(progress.done.filter((step): step is number => Number.isInteger(step) && step >= 0 && step < stepCount))]
        : []
      const startedAt = typeof progress.startedAt === 'string' && !Number.isNaN(Date.parse(progress.startedAt))
        ? progress.startedAt
        : new Date().toISOString()
      state.journeys[id] = { startedAt, done }
    }
  }
  if (isJourneyId(persisted.activeJourneyId) && state.journeys[persisted.activeJourneyId]) {
    state.activeJourneyId = persisted.activeJourneyId
  }
  return state
}

export function pickPersistedPractice(state: PersistedPracticeState): PersistedPracticeState {
  return {
    dailyGoalMinutes: state.dailyGoalMinutes,
    activeJourneyId: state.activeJourneyId,
    journeys: state.journeys,
  }
}

export function isDefaultPractice(state: PersistedPracticeState): boolean {
  return state.dailyGoalMinutes === DEFAULT_DAILY_GOAL_MINUTES
    && state.activeJourneyId === null
    && Object.keys(state.journeys).length === 0
}

export const usePracticeStore = create<PracticeState>()(
  persist(
    (set, get) => ({
      ...getDefaultPracticeState(),

      setDailyGoalMinutes: (minutes) => {
        if ((DAILY_GOAL_OPTIONS as readonly number[]).includes(minutes)) set({ dailyGoalMinutes: minutes })
      },

      // Starting a finished journey again begins it afresh; an unfinished one resumes.
      startJourney: (id) => {
        set((state) => {
          const existing = state.journeys[id]
          const finished = existing && existing.done.length >= getJourney(id).steps.length
          return {
            activeJourneyId: id,
            journeys: existing && !finished
              ? state.journeys
              : { ...state.journeys, [id]: { startedAt: new Date().toISOString(), done: [] } },
          }
        })
      },

      leaveJourney: () => {
        set({ activeJourneyId: null })
      },

      completeJourneyStep: (id, step) => {
        const stepCount = getJourney(id).steps.length
        if (!Number.isInteger(step) || step < 0 || step >= stepCount) return false
        const existing = get().journeys[id] ?? { startedAt: new Date().toISOString(), done: [] }
        if (existing.done.includes(step)) return false
        const done = [...existing.done, step]
        set((state) => ({ journeys: { ...state.journeys, [id]: { ...existing, done } } }))
        return done.length >= stepCount
      },

      resetPractice: () => {
        set(getDefaultPracticeState())
      },
    }),
    {
      name: STORAGE_KEYS.PRACTICE,
      storage: createBrowserJSONStorage<PersistedPracticeState>(),
      version: PRACTICE_STORAGE_VERSION,
      partialize: (state): PersistedPracticeState => pickPersistedPractice(state),
      migrate: (persisted) => migratePersistedPracticeState(persisted),
    },
  ),
)

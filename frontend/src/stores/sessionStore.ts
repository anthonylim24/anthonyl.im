import { create } from 'zustand'
import type { BreathPhase } from '@/lib/constants'
import type { SessionConfig } from '@/lib/breathingProtocols'

export interface ActiveSession {
  config: SessionConfig
  startTime: Date
  currentRound: number
  currentPhaseIndex: number
  currentPhase: BreathPhase
  timeRemaining: number
  isPaused: boolean
  isComplete: boolean
  holdTimes: number[] // Track actual hold times for each round
}

interface SessionState {
  session: ActiveSession | null
  startSession: (config: SessionConfig, initialPhase: BreathPhase, initialDuration: number) => void
  updatePhase: (phase: BreathPhase, phaseIndex: number, duration: number) => void
  nextRound: () => void
  setTimeRemaining: (time: number) => void
  recordHoldTime: (duration: number) => void
  togglePause: () => void
  completeSession: () => void
  resetSession: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,

  startSession: (config, initialPhase, initialDuration) => {
    set({
      session: {
        config,
        startTime: new Date(),
        currentRound: 0,
        currentPhaseIndex: 0,
        currentPhase: initialPhase,
        timeRemaining: initialDuration,
        isPaused: false,
        isComplete: false,
        holdTimes: [],
      },
    })
  },

  updatePhase: (phase, phaseIndex, duration) => {
    set((state) => {
      if (!state.session) return state
      return {
        session: {
          ...state.session,
          currentPhase: phase,
          currentPhaseIndex: phaseIndex,
          timeRemaining: duration,
        },
      }
    })
  },

  nextRound: () => {
    set((state) => {
      if (!state.session) return state
      return {
        session: {
          ...state.session,
          currentRound: state.session.currentRound + 1,
          currentPhaseIndex: 0,
        },
      }
    })
  },

  setTimeRemaining: (time) => {
    set((state) => {
      if (!state.session) return state
      return {
        session: {
          ...state.session,
          timeRemaining: time,
        },
      }
    })
  },

  recordHoldTime: (duration) => {
    set((state) => {
      if (!state.session) return state
      return {
        session: {
          ...state.session,
          holdTimes: [...state.session.holdTimes, duration],
        },
      }
    })
  },

  togglePause: () => {
    set((state) => {
      if (!state.session) return state
      return {
        session: {
          ...state.session,
          isPaused: !state.session.isPaused,
        },
      }
    })
  },

  completeSession: () => {
    set((state) => {
      if (!state.session) return state
      return {
        session: {
          ...state.session,
          isComplete: true,
        },
      }
    })
  },

  resetSession: () => {
    set({ session: null })
  },
}))

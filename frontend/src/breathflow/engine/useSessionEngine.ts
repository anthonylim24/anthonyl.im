import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BreathPhase } from '@/lib/constants'
import {
  advanceOneSecond,
  createIdleState,
  createRunningState,
  getCurrentPhase,
  getCurrentPhaseSeconds,
  type EngineConfig,
  type EngineEvent,
  type EngineState,
} from './sessionEngine'

export interface SessionEngineHandle {
  status: EngineState['status']
  phase: BreathPhase
  phaseSeconds: number
  secondsLeftInPhase: number
  /** 1-based for display ("Round n of N"). */
  roundNumber: number
  totalRounds: number
  holdTimes: number[]
  start: () => void
  pause: () => void
  resume: () => void
  /** Discard the session entirely (no history, no XP). */
  stop: () => void
  /** Back to round 1, phase 1, discarding partial progress. */
  restart: () => void
}

/**
 * React driver for the pure session state machine: one 1 Hz interval while
 * running, no per-second side effects beyond the countdown itself. Events
 * (start/phase/complete/pause/resume/stop/restart) surface through onEvent for
 * audio, haptics, and the screen-reader announcer.
 */
export function useSessionEngine(
  config: EngineConfig,
  onEvent?: (event: EngineEvent | { type: 'start' | 'pause' | 'resume' | 'stop' | 'restart' }) => void,
): SessionEngineHandle {
  const [state, setState] = useState<EngineState>(createIdleState)
  const stateRef = useRef(state)
  const configRef = useRef(config)
  configRef.current = config
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const applyState = useCallback((next: EngineState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const emit = useCallback(
    (event: EngineEvent | { type: 'start' | 'pause' | 'resume' | 'stop' | 'restart' }) => {
      onEventRef.current?.(event)
    },
    [],
  )

  // The single 1 Hz clock, active only while running.
  const isRunning = state.status === 'running'
  useEffect(() => {
    if (!isRunning) return

    const interval = setInterval(() => {
      const { state: next, events } = advanceOneSecond(configRef.current, stateRef.current)
      applyState(next)
      for (const event of events) emit(event)
    }, 1000)

    return () => clearInterval(interval)
  }, [isRunning, applyState, emit])

  const start = useCallback(() => {
    if (stateRef.current.status !== 'idle') return
    applyState(createRunningState(configRef.current))
    emit({ type: 'start' })
  }, [applyState, emit])

  const pause = useCallback(() => {
    if (stateRef.current.status !== 'running') return
    applyState({ ...stateRef.current, status: 'paused' })
    emit({ type: 'pause' })
  }, [applyState, emit])

  const resume = useCallback(() => {
    if (stateRef.current.status !== 'paused') return
    applyState({ ...stateRef.current, status: 'running' })
    emit({ type: 'resume' })
  }, [applyState, emit])

  const stop = useCallback(() => {
    applyState(createIdleState())
    emit({ type: 'stop' })
  }, [applyState, emit])

  const restart = useCallback(() => {
    applyState(createRunningState(configRef.current))
    emit({ type: 'restart' })
  }, [applyState, emit])

  return useMemo(() => ({
    status: state.status,
    phase: getCurrentPhase(config, state),
    phaseSeconds: getCurrentPhaseSeconds(config, state),
    secondsLeftInPhase: state.secondsLeftInPhase,
    roundNumber: state.roundIndex + 1,
    totalRounds: config.rounds,
    holdTimes: state.holdTimes,
    start,
    pause,
    resume,
    stop,
    restart,
  }), [state, config, start, pause, resume, stop, restart])
}

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
  /** 0-based index into protocol.phases. */
  phaseIndex: number
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
 * React driver for the pure session state machine. A 1 Hz interval drives
 * the clock while running; each tick reconciles against a monotonic origin
 * so background-tab timer throttling cannot leave the session behind
 * wall-clock. Events surface through onEvent for audio, haptics, and the
 * screen-reader announcer.
 */
export function useSessionEngine(
  config: EngineConfig,
  onEvent?: (event: EngineEvent | { type: 'start' | 'pause' | 'resume' | 'stop' | 'restart' }) => void,
): SessionEngineHandle {
  const [state, setState] = useState<EngineState>(createIdleState)
  const [clockEpoch, setClockEpoch] = useState(0)
  const stateRef = useRef(state)
  const configRef = useRef(config)
  const onEventRef = useRef(onEvent)

  useEffect(() => {
    configRef.current = config
  }, [config])
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

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

  const bumpClock = useCallback(() => {
    setClockEpoch((epoch) => epoch + 1)
  }, [])

  // Monotonic 1 Hz clock, active only while running. Replays any seconds
  // the browser dropped between interval callbacks.
  const isRunning = state.status === 'running'
  useEffect(() => {
    if (!isRunning) return

    const origin = performance.now()
    let applied = 0

    const tick = () => {
      const elapsed = Math.floor((performance.now() - origin) / 1000)
      let missed = elapsed - applied
      if (missed <= 0) return

      let current = stateRef.current
      const events: EngineEvent[] = []
      while (missed > 0 && current.status === 'running') {
        const result = advanceOneSecond(configRef.current, current)
        current = result.state
        events.push(...result.events)
        missed -= 1
        applied += 1
      }
      applyState(current)
      for (const event of events) emit(event)
    }

    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [isRunning, clockEpoch, applyState, emit])

  const start = useCallback(() => {
    if (stateRef.current.status !== 'idle') return
    bumpClock()
    applyState(createRunningState(configRef.current))
    emit({ type: 'start' })
  }, [applyState, emit, bumpClock])

  const pause = useCallback(() => {
    if (stateRef.current.status !== 'running') return
    applyState({ ...stateRef.current, status: 'paused' })
    emit({ type: 'pause' })
  }, [applyState, emit])

  const resume = useCallback(() => {
    if (stateRef.current.status !== 'paused') return
    bumpClock()
    applyState({ ...stateRef.current, status: 'running' })
    emit({ type: 'resume' })
  }, [applyState, emit, bumpClock])

  const stop = useCallback(() => {
    applyState(createIdleState())
    emit({ type: 'stop' })
  }, [applyState, emit])

  const restart = useCallback(() => {
    bumpClock()
    applyState(createRunningState(configRef.current))
    emit({ type: 'restart' })
  }, [applyState, emit, bumpClock])

  return useMemo(() => ({
    status: state.status,
    phase: getCurrentPhase(config, state),
    phaseIndex: state.phaseIndex,
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
  }), [
    state,
    config.protocol,
    config.rounds,
    config.customDurations,
    start,
    pause,
    resume,
    stop,
    restart,
  ])
}

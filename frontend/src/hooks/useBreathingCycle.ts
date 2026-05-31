import { useCallback, useEffect, useRef, useLayoutEffect } from 'react'
import { useSessionStore } from '@/stores/sessionStore'
import { useHistoryStore } from '@/stores/historyStore'
import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'
import {
  calculateSessionDuration,
  getProtocol,
  getPhaseForRound,
  type SessionConfig,
} from '@/lib/breathingProtocols'
import { BreathingAudioEngine, cueForPhase } from '@/lib/breathingAudio'

interface UseBreathingCycleOptions {
  onPhaseChange?: (phase: BreathPhase) => void
  onRoundComplete?: (round: number) => void
  onSessionComplete?: () => void
  enableAudio?: boolean
  audioVolume?: number
}

function isHoldPhase(phase: BreathPhase | undefined): boolean {
  return phase === BREATH_PHASES.HOLD_IN || phase === BREATH_PHASES.HOLD_OUT
}

export function useBreathingCycle(options: UseBreathingCycleOptions = {}) {
  const {
    onPhaseChange,
    onRoundComplete,
    onSessionComplete,
    enableAudio = true,
    audioVolume = 0.3,
  } = options

  // Store callbacks in refs to avoid effect re-subscriptions
  // This prevents unnecessary interval restarts when callbacks change
  const onPhaseChangeRef = useRef(onPhaseChange)
  const onRoundCompleteRef = useRef(onRoundComplete)
  const onSessionCompleteRef = useRef(onSessionComplete)

  // Update refs when callbacks change (synchronously before effects)
  useLayoutEffect(() => {
    onPhaseChangeRef.current = onPhaseChange
    onRoundCompleteRef.current = onRoundComplete
    onSessionCompleteRef.current = onSessionComplete
  })

  const {
    session,
    startSession,
    updatePhase,
    nextRound,
    setTimeRemaining,
    recordHoldTime,
    togglePause,
    completeSession,
    resetSession,
  } = useSessionStore()

  const { addSession } = useHistoryStore()

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioEngineRef = useRef<BreathingAudioEngine | null>(null)
  const holdStartTimeRef = useRef<number | null>(null)
  const accumulatedHoldMsRef = useRef(0)

  const resetHoldTimer = useCallback(() => {
    holdStartTimeRef.current = null
    accumulatedHoldMsRef.current = 0
  }, [])

  const startHoldTimer = useCallback(() => {
    holdStartTimeRef.current = Date.now()
    accumulatedHoldMsRef.current = 0
  }, [])

  const pauseHoldTimer = useCallback(() => {
    if (holdStartTimeRef.current === null) return

    accumulatedHoldMsRef.current += Date.now() - holdStartTimeRef.current
    holdStartTimeRef.current = null
  }, [])

  const getActiveHoldSeconds = useCallback(() => {
    const activeMs = holdStartTimeRef.current === null
      ? 0
      : Date.now() - holdStartTimeRef.current

    return Math.round((accumulatedHoldMsRef.current + activeMs) / 1000)
  }, [])

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // A single shared audio engine instance per hook, created lazily on first cue
  // (which always follows a user gesture, so the AudioContext can start).
  const getAudioEngine = useCallback(() => {
    if (!audioEngineRef.current) {
      audioEngineRef.current = new BreathingAudioEngine({
        enabled: enableAudio,
        volume: audioVolume,
      })
    }
    return audioEngineRef.current
  }, [audioVolume, enableAudio])

  const playCue = useCallback(
    (cue: Parameters<BreathingAudioEngine['play']>[0]) => {
      if (!enableAudio || audioVolume <= 0) return
      getAudioEngine().play(cue)
    },
    [audioVolume, enableAudio, getAudioEngine],
  )

  const playPhaseCue = useCallback(
    (phase: BreathPhase) => {
      playCue(cueForPhase(phase))
    },
    [playCue],
  )

  // Keep a live engine's settings in sync with preference changes mid-session.
  useEffect(() => {
    const engine = audioEngineRef.current
    if (!engine) return
    engine.setEnabled(enableAudio)
    engine.setVolume(audioVolume)
  }, [audioVolume, enableAudio])

  const start = useCallback((config: SessionConfig) => {
    const protocol = getProtocol(config.techniqueId)
    const firstPhase = getPhaseForRound(protocol, 0, 0, config.customPhaseDurations)
    if (isHoldPhase(firstPhase.phase)) {
      startHoldTimer()
    } else {
      resetHoldTimer()
    }
    startSession(config, firstPhase.phase, firstPhase.duration)
    playCue('start')
  }, [resetHoldTimer, startHoldTimer, startSession, playCue])

  const pause = useCallback(() => {
    const activeSession = useSessionStore.getState().session

    if (isHoldPhase(activeSession?.currentPhase)) {
      if (activeSession?.isPaused) {
        holdStartTimeRef.current = Date.now()
      } else {
        pauseHoldTimer()
      }
    }

    togglePause()
  }, [pauseHoldTimer, togglePause])

  const stop = useCallback(() => {
    clearTimer()
    resetHoldTimer()
    resetSession()
  }, [clearTimer, resetHoldTimer, resetSession])

  const sessionRunning = Boolean(session && !session.isPaused && !session.isComplete)

  // Main timer effect
  useEffect(() => {
    if (!sessionRunning) {
      clearTimer()
      return
    }

    if (intervalRef.current) return

    intervalRef.current = setInterval(() => {
      const activeSession = useSessionStore.getState().session

      if (!activeSession || activeSession.isPaused || activeSession.isComplete) {
        clearTimer()
        return
      }

      const protocol = getProtocol(activeSession.config.techniqueId)
      const currentTime = activeSession.timeRemaining

      if (currentTime <= 1) {
        // Phase complete
        const currentPhaseConfig = protocol.phases[activeSession.currentPhaseIndex]
        let holdTimesForCompletion = activeSession.holdTimes

        // Record hold time if it was a hold phase
        if (isHoldPhase(currentPhaseConfig.phase)) {
          const holdDuration = getActiveHoldSeconds()
          recordHoldTime(holdDuration)
          holdTimesForCompletion = [...activeSession.holdTimes, holdDuration]
          resetHoldTimer()
        }

        // Check if there are more phases in this round
        const nextPhaseIndex = activeSession.currentPhaseIndex + 1

        if (nextPhaseIndex < protocol.phases.length) {
          // Move to next phase
          const nextPhaseConfig = getPhaseForRound(
            protocol,
            activeSession.currentRound,
            nextPhaseIndex,
            activeSession.config.customPhaseDurations
          )
          updatePhase(nextPhaseConfig.phase, nextPhaseIndex, nextPhaseConfig.duration)
          onPhaseChangeRef.current?.(nextPhaseConfig.phase)
          playPhaseCue(nextPhaseConfig.phase)

          // Start tracking hold time
          if (isHoldPhase(nextPhaseConfig.phase)) {
            startHoldTimer()
          } else {
            resetHoldTimer()
          }
        } else {
          // Round complete
          const nextRoundNum = activeSession.currentRound + 1
          onRoundCompleteRef.current?.(activeSession.currentRound)

          if (nextRoundNum >= activeSession.config.rounds) {
            // Session complete
            completeSession()
            onSessionCompleteRef.current?.()
            playCue('complete')

            // Save to history
            const durationSeconds = calculateSessionDuration(activeSession.config)

            addSession({
              techniqueId: activeSession.config.techniqueId,
              date: activeSession.startTime.toISOString(),
              durationSeconds,
              rounds: activeSession.config.rounds,
              ...(activeSession.config.customPhaseDurations
                ? { customPhaseDurations: { ...activeSession.config.customPhaseDurations } }
                : {}),
              holdTimes: holdTimesForCompletion,
              maxHoldTime: Math.max(...holdTimesForCompletion, 0),
              avgHoldTime:
                holdTimesForCompletion.length > 0
                  ? Math.round(
                      holdTimesForCompletion.reduce((a, b) => a + b, 0) /
                        holdTimesForCompletion.length
                    )
                  : 0,
            })
            clearTimer()
          } else {
            // Start next round
            nextRound()
            const firstPhase = getPhaseForRound(
              protocol,
              nextRoundNum,
              0,
              activeSession.config.customPhaseDurations
            )
            updatePhase(firstPhase.phase, 0, firstPhase.duration)
            onPhaseChangeRef.current?.(firstPhase.phase)
            playPhaseCue(firstPhase.phase)
            if (isHoldPhase(firstPhase.phase)) {
              startHoldTimer()
            } else {
              resetHoldTimer()
            }
          }
        }
      } else {
        // Countdown. We intentionally do NOT play per-second ticks here — a
        // calm breathwork session should never sound like a kitchen timer.
        // Cues fire only at phase transitions (see playPhaseCue above).
        setTimeRemaining(currentTime - 1)
      }
    }, 1000)

    return clearTimer
  }, [
    sessionRunning,
    clearTimer,
    updatePhase,
    nextRound,
    setTimeRemaining,
    recordHoldTime,
    completeSession,
    addSession,
    getActiveHoldSeconds,
    resetHoldTimer,
    startHoldTimer,
    // Removed callback props from deps - they're now accessed via refs
    // This prevents effect re-runs when parent re-renders with new callback refs
    playCue,
    playPhaseCue,
  ])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resetHoldTimer()
      if (audioEngineRef.current) {
        audioEngineRef.current.close()
        audioEngineRef.current = null
      }
    }
  }, [resetHoldTimer])

  return {
    session,
    start,
    pause,
    stop,
    isActive: !!session && !session.isComplete,
    isPaused: session?.isPaused ?? false,
    isComplete: session?.isComplete ?? false,
  }
}

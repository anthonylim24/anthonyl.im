import { useCallback, useEffect, useRef, useLayoutEffect } from 'react'
import { useSessionStore } from '@/stores/sessionStore'
import { useHistoryStore } from '@/stores/historyStore'
import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'
import { getProtocol, getPhaseForRound, type SessionConfig } from '@/lib/breathingProtocols'

interface UseBreathingCycleOptions {
  onPhaseChange?: (phase: BreathPhase) => void
  onRoundComplete?: (round: number) => void
  onSessionComplete?: () => void
  enableAudio?: boolean
}

export function useBreathingCycle(options: UseBreathingCycleOptions = {}) {
  const {
    onPhaseChange,
    onRoundComplete,
    onSessionComplete,
    enableAudio = true,
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
  const audioContextRef = useRef<AudioContext | null>(null)
  const holdStartTimeRef = useRef<number | null>(null)

  const playBeep = useCallback((frequency: number = 440, duration: number = 100) => {
    if (!enableAudio) return

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }

      const ctx = audioContextRef.current
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.frequency.value = frequency
      oscillator.type = 'sine'

      gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000)

      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + duration / 1000)
    } catch {
      // Audio not supported
    }
  }, [enableAudio])

  const start = useCallback((config: SessionConfig) => {
    const protocol = getProtocol(config.techniqueId)
    const firstPhase = getPhaseForRound(protocol, 0, 0, config.customPhaseDurations)
    startSession(config, firstPhase.phase, firstPhase.duration)
    playBeep(660, 150)
  }, [startSession, playBeep])

  const pause = useCallback(() => {
    togglePause()
  }, [togglePause])

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    resetSession()
  }, [resetSession])

  // Main timer effect
  useEffect(() => {
    if (!session || session.isPaused || session.isComplete) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    const protocol = getProtocol(session.config.techniqueId)

    intervalRef.current = setInterval(() => {
      const currentTime = session.timeRemaining

      if (currentTime <= 1) {
        // Phase complete
        const currentPhaseConfig = protocol.phases[session.currentPhaseIndex]

        // Record hold time if it was a hold phase
        if (
          currentPhaseConfig.phase === BREATH_PHASES.HOLD_IN ||
          currentPhaseConfig.phase === BREATH_PHASES.HOLD_OUT
        ) {
          if (holdStartTimeRef.current) {
            const holdDuration = Math.round((Date.now() - holdStartTimeRef.current) / 1000)
            recordHoldTime(holdDuration)
            holdStartTimeRef.current = null
          }
        }

        // Check if there are more phases in this round
        const nextPhaseIndex = session.currentPhaseIndex + 1

        if (nextPhaseIndex < protocol.phases.length) {
          // Move to next phase
          const nextPhaseConfig = getPhaseForRound(
            protocol,
            session.currentRound,
            nextPhaseIndex,
            session.config.customPhaseDurations
          )
          updatePhase(nextPhaseConfig.phase, nextPhaseIndex, nextPhaseConfig.duration)
          onPhaseChangeRef.current?.(nextPhaseConfig.phase)
          playBeep(nextPhaseConfig.phase === BREATH_PHASES.INHALE || nextPhaseConfig.phase === BREATH_PHASES.DEEP_INHALE ? 660 : 440, 100)

          // Start tracking hold time
          if (
            nextPhaseConfig.phase === BREATH_PHASES.HOLD_IN ||
            nextPhaseConfig.phase === BREATH_PHASES.HOLD_OUT
          ) {
            holdStartTimeRef.current = Date.now()
          }
        } else {
          // Round complete
          const nextRoundNum = session.currentRound + 1
          onRoundCompleteRef.current?.(session.currentRound)

          if (nextRoundNum >= session.config.rounds) {
            // Session complete
            completeSession()
            onSessionCompleteRef.current?.()
            playBeep(880, 300)

            // Save to history
            const endTime = new Date()
            const durationSeconds = Math.round(
              (endTime.getTime() - session.startTime.getTime()) / 1000
            )

            addSession({
              techniqueId: session.config.techniqueId,
              date: session.startTime.toISOString(),
              durationSeconds,
              rounds: session.config.rounds,
              holdTimes: session.holdTimes,
              maxHoldTime: Math.max(...session.holdTimes, 0),
              avgHoldTime:
                session.holdTimes.length > 0
                  ? Math.round(
                      session.holdTimes.reduce((a, b) => a + b, 0) /
                        session.holdTimes.length
                    )
                  : 0,
            })
          } else {
            // Start next round
            nextRound()
            const firstPhase = getPhaseForRound(
              protocol,
              nextRoundNum,
              0,
              session.config.customPhaseDurations
            )
            updatePhase(firstPhase.phase, 0, firstPhase.duration)
            onPhaseChangeRef.current?.(firstPhase.phase)
            playBeep(660, 150)
          }
        }
      } else {
        // Countdown
        setTimeRemaining(currentTime - 1)

        // Play beep on last 3 seconds
        if (currentTime <= 4) {
          playBeep(550, 50)
        }
      }
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [
    session,
    updatePhase,
    nextRound,
    setTimeRemaining,
    recordHoldTime,
    completeSession,
    addSession,
    // Removed callback props from deps - they're now accessed via refs
    // This prevents effect re-runs when parent re-renders with new callback refs
    playBeep,
  ])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

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

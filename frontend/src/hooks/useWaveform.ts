import { useCallback, useEffect, useRef, useState } from 'react'
import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'

interface WaveformState {
  amplitude: number // 0 to 1
  targetAmplitude: number
  animationProgress: number
}

interface UseWaveformOptions {
  phase: BreathPhase | null
  phaseDuration: number
  timeRemaining: number
  isActive: boolean
}

export function useWaveform({
  phase,
  phaseDuration,
  timeRemaining,
  isActive,
}: UseWaveformOptions) {
  const [waveState, setWaveState] = useState<WaveformState>({
    amplitude: 0.2,
    targetAmplitude: 0.2,
    animationProgress: 0,
  })

  const animationRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)

  const getTargetAmplitude = useCallback((currentPhase: BreathPhase | null): number => {
    switch (currentPhase) {
      case BREATH_PHASES.INHALE:
        return 1.0
      case BREATH_PHASES.DEEP_INHALE:
        return 1.0
      case BREATH_PHASES.HOLD_IN:
        return 1.0
      case BREATH_PHASES.EXHALE:
        return 0.2
      case BREATH_PHASES.HOLD_OUT:
        return 0.2
      case BREATH_PHASES.REST:
        return 0.3
      default:
        return 0.2
    }
  }, [])

  // Calculate progress within current phase
  const phaseProgress = phaseDuration > 0 ? 1 - timeRemaining / phaseDuration : 0

  useEffect(() => {
    if (!isActive || !phase) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      setWaveState({
        amplitude: 0.2,
        targetAmplitude: 0.2,
        animationProgress: 0,
      })
      return
    }

    const targetAmplitude = getTargetAmplitude(phase)

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp
      }

      const elapsed = timestamp - lastTimeRef.current

      if (elapsed > 16) { // ~60fps
        lastTimeRef.current = timestamp

        setWaveState((prev) => {
          // Smooth interpolation towards target
          const isExpanding = phase === BREATH_PHASES.INHALE
          const isDeepInhale = phase === BREATH_PHASES.DEEP_INHALE
          const isContracting = phase === BREATH_PHASES.EXHALE

          let newAmplitude = prev.amplitude

          if (isExpanding) {
            // Gradual rise during inhale
            newAmplitude = 0.2 + phaseProgress * 0.8
          } else if (isDeepInhale) {
            // Second sip: continue expanding from current amplitude towards 1.0
            newAmplitude = 0.85 + phaseProgress * 0.15
          } else if (isContracting) {
            // Gradual fall during exhale
            newAmplitude = 1.0 - phaseProgress * 0.8
          } else {
            // Hold phases - maintain position with slight wobble
            const wobble = Math.sin(timestamp / 500) * 0.02
            newAmplitude = targetAmplitude + wobble
          }

          return {
            amplitude: Math.max(0.1, Math.min(1, newAmplitude)),
            targetAmplitude,
            animationProgress: phaseProgress,
          }
        })
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      lastTimeRef.current = 0
    }
  }, [isActive, phase, phaseProgress, getTargetAmplitude])

  return waveState
}

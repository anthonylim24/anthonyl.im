import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'

/** Inhale fills quickly, then settles into fullness. */
export const EASE_INHALE = [0.22, 1, 0.36, 1] as const

/** Exhale starts gently, then releases. */
export const EASE_EXHALE = [0.37, 0, 0.18, 1] as const

/** Holds, chrome, and pause settle. Expo-out, no bounce. */
export const EASE_SETTLE = [0.16, 1, 0.3, 1] as const

export function breathEase(phase: BreathPhase): readonly [number, number, number, number] {
  switch (phase) {
    case BREATH_PHASES.INHALE:
    case BREATH_PHASES.DEEP_INHALE:
      return EASE_INHALE
    case BREATH_PHASES.EXHALE:
      return EASE_EXHALE
    default:
      return EASE_SETTLE
  }
}

export const inkSpring = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 36,
  mass: 0.7,
}

export const pressSpring = {
  type: 'spring' as const,
  stiffness: 520,
  damping: 34,
  mass: 0.65,
}

export const toggleSpring = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 32,
  mass: 0.6,
}

export const chromeTransition = {
  duration: 0.2,
  ease: EASE_SETTLE,
}

export function scaleToAmplitude(scale: number): number {
  return Math.min(1, Math.max(0, (scale - 0.62) / 0.48))
}

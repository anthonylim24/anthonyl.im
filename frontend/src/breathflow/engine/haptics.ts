import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'

/**
 * Haptic vocabulary: light on nav/selection, success on start/complete, error
 * on stop/destructive, patterned celebration on personal bests or new badges.
 * The three breath kinds mark each phase change so a session can be followed
 * with eyes closed: one long press in, two short taps out, a single tick to hold.
 * Every call checks the haptics setting and degrades silently without the
 * Vibration API.
 */

export type HapticKind = 'light' | 'success' | 'error' | 'celebration' | 'breathIn' | 'breathOut' | 'breathHold'

const PATTERNS: Record<HapticKind, number[]> = {
  light: [10],
  success: [15, 60, 25],
  error: [40, 70, 40],
  celebration: [15, 50, 15, 50, 30, 90, 60],
  breathIn: [45],
  breathOut: [14, 70, 14],
  breathHold: [8],
}

export function phaseHaptic(phase: BreathPhase): HapticKind {
  if (phase === BREATH_PHASES.INHALE || phase === BREATH_PHASES.DEEP_INHALE) return 'breathIn'
  if (phase === BREATH_PHASES.EXHALE) return 'breathOut'
  return 'breathHold'
}

export function vibrate(kind: HapticKind, enabled: boolean): void {
  if (!enabled) return
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    // Browsers refuse (and log) a vibration before the first tap, which is
    // what a session opened from an autostart link would otherwise ask for.
    if (navigator.userActivation?.hasBeenActive === false) return
    {
      navigator.vibrate(PATTERNS[kind])
    }
  } catch {
    // Haptics are an enhancement, never a requirement.
  }
}

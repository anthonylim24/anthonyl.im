/**
 * Haptic vocabulary: light on nav/selection, success on start/complete, error
 * on stop/destructive, patterned celebration on personal bests or new badges.
 * Every call checks the haptics setting and degrades silently without the
 * Vibration API.
 */

export type HapticKind = 'light' | 'success' | 'error' | 'celebration'

const PATTERNS: Record<HapticKind, number[]> = {
  light: [10],
  success: [15, 60, 25],
  error: [40, 70, 40],
  celebration: [15, 50, 15, 50, 30, 90, 60],
}

export function vibrate(kind: HapticKind, enabled: boolean): void {
  if (!enabled) return
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERNS[kind])
    }
  } catch {
    // Haptics are an enhancement, never a requirement.
  }
}

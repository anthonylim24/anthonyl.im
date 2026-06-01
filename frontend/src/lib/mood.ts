/**
 * Mood reflection — the "evidence of change" layer.
 *
 * Best-in-class breathwork apps (Othership, Apple Reflect) bracket a session with
 * a before/after state check-in, then show the user proof that breathing shifted
 * their state. We model state on a simple 5-point *calm* scale (1 = tense,
 * 5 = calm) captured optionally before and after a session. The delta is the
 * payoff: "Tense → Calm".
 *
 * This is a local-first layer — mood is persisted in the history store and is not
 * round-tripped through the Supabase columns (which are fixed). It always works
 * locally for every user.
 */

export const MOOD_MIN = 1
export const MOOD_MAX = 5

export type MoodValue = 1 | 2 | 3 | 4 | 5

export interface MoodOption {
  value: MoodValue
  /** Full descriptive label. */
  label: string
}

/** Ordered tense → calm. Index 0 is the most tense state. */
export const MOOD_OPTIONS: readonly MoodOption[] = [
  { value: 1, label: 'Tense' },
  { value: 2, label: 'Unsettled' },
  { value: 3, label: 'Neutral' },
  { value: 4, label: 'Settled' },
  { value: 5, label: 'Calm' },
] as const

export function isMoodValue(value: unknown): value is MoodValue {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MOOD_MIN &&
    value <= MOOD_MAX
  )
}

export function getMoodLabel(value: MoodValue): string {
  return MOOD_OPTIONS.find((option) => option.value === value)?.label ?? 'Neutral'
}

/**
 * Calm shift for a single session: `after - before`. Positive means calmer.
 * Returns null when either reading is missing.
 */
export function getMoodDelta(
  before: MoodValue | undefined | null,
  after: MoodValue | undefined | null,
): number | null {
  if (!isMoodValue(before) || !isMoodValue(after)) return null
  return after - before
}

/** Human-readable transition, e.g. "Tense → Calm". Null if either reading is missing. */
export function formatMoodShift(
  before: MoodValue | undefined | null,
  after: MoodValue | undefined | null,
): string | null {
  if (!isMoodValue(before) || !isMoodValue(after)) return null
  return `${getMoodLabel(before)} → ${getMoodLabel(after)}`
}

export interface MoodTrend {
  /** Number of sessions that recorded both a before and after reading. */
  count: number
  /** Mean calm shift (after - before) across those sessions, rounded to 1dp. */
  averageShift: number
  /** Fraction (0..1) of those sessions where the user ended calmer. */
  positiveRate: number
}

interface MoodSessionLike {
  moodBefore?: MoodValue
  moodAfter?: MoodValue
}

/**
 * Aggregate calm shift across sessions that recorded both readings.
 * Returns null when no session has a complete before/after pair.
 */
export function getAverageMoodShift(sessions: readonly MoodSessionLike[]): MoodTrend | null {
  const deltas: number[] = []
  for (const session of sessions) {
    const delta = getMoodDelta(session.moodBefore, session.moodAfter)
    if (delta !== null) deltas.push(delta)
  }

  if (deltas.length === 0) return null

  const sum = deltas.reduce((total, delta) => total + delta, 0)
  const positive = deltas.filter((delta) => delta > 0).length

  return {
    count: deltas.length,
    averageShift: Math.round((sum / deltas.length) * 10) / 10,
    positiveRate: positive / deltas.length,
  }
}

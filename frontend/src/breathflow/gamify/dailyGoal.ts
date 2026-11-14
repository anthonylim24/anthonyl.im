import { getLocalDateKey, formatLocalDateKey } from '@/lib/localDates'
import type { CompletedSession } from '@/stores/historyStore'

export interface DailyGoalStatus {
  /** Seconds practiced today (local day). */
  seconds: number
  goalSeconds: number
  /** 0..1, capped. */
  progress: number
  met: boolean
}

/** Today's practice against the daily goal. `now` is a test seam. */
export function getDailyGoalStatus(
  sessions: readonly CompletedSession[],
  goalMinutes: number,
  now: Date = new Date(),
): DailyGoalStatus {
  const today = formatLocalDateKey(now)
  let seconds = 0
  for (const session of sessions) {
    if (getLocalDateKey(session.date) === today) seconds += session.durationSeconds
  }
  const goalSeconds = Math.max(60, goalMinutes * 60)
  return { seconds, goalSeconds, progress: Math.min(1, seconds / goalSeconds), met: seconds >= goalSeconds }
}

import type { TechniqueId } from '@/lib/constants'
import type { CompletedSession, PersonalBest, VO2Entry } from './sessionRecord'

/** The stored half of the history store: what localStorage, an export and the cloud keep. */
export interface PersistedHistoryState {
  sessions: CompletedSession[]
  personalBests: Record<TechniqueId, PersonalBest | undefined>
  vo2MaxManual: number | null
  vo2MaxHistory: VO2Entry[]
  /**
   * When history was last cleared (ISO), or null. A merge drops anything the
   * other side holds from before it, so a clear in one tab or on one device is
   * not undone by a copy that has not heard of it yet.
   */
  resetAt: string | null
}

function time(iso: string): number {
  return Date.parse(iso)
}

function latestReading(history: readonly VO2Entry[]): number | null {
  return history.length > 0 ? history[history.length - 1].value : null
}

function laterReset(a: string | null, b: string | null): string | null {
  if (a === null) return b
  if (b === null) return a
  return time(b) > time(a) ? b : a
}

/** What `state` still holds once everything up to `resetAt` is forgotten. */
function forgetBefore(state: PersistedHistoryState, resetAt: string | null): PersistedHistoryState {
  if (resetAt === null || state.resetAt === resetAt) return state
  const cutoff = time(resetAt)
  const after = (iso: string) => time(iso) > cutoff
  const personalBests = {} as Record<TechniqueId, PersonalBest | undefined>
  for (const best of Object.values(state.personalBests)) {
    if (best && after(best.date)) personalBests[best.techniqueId] = best
  }
  const vo2MaxHistory = state.vo2MaxHistory.filter((entry) => after(entry.date))
  return {
    sessions: state.sessions.filter((session) => after(session.date)),
    personalBests,
    vo2MaxHistory,
    vo2MaxManual: latestReading(vo2MaxHistory),
    resetAt,
  }
}

function byNewest(a: CompletedSession, b: CompletedSession): number {
  return time(b.date) - time(a.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * Union of two session logs by id. A session both sides hold is taken whole
 * from `primary` (its mood ratings may have been changed or cleared there),
 * keeping the other side's `localDay` when the primary copy lacks one (cloud
 * rows do not carry it).
 */
export function mergeSessionLogs(
  primary: readonly CompletedSession[],
  secondary: readonly CompletedSession[],
): CompletedSession[] {
  const byId = new Map<string, CompletedSession>()
  for (const session of secondary) byId.set(session.id, session)
  for (const session of primary) {
    const other = byId.get(session.id)
    byId.set(
      session.id,
      !session.localDay && other?.localDay ? { ...session, localDay: other.localDay } : session,
    )
  }
  return [...byId.values()].sort(byNewest)
}

/**
 * Merges two copies of history. Nothing is lost except what a clear on either
 * side has forgotten: sessions are a union by id (`primary` wins a conflict),
 * personal bests keep the longer hold, VO2 readings are a union. Idempotent,
 * and commutative apart from which side's copy of a shared session is kept.
 */
export function mergeHistoryStates(
  primary: PersistedHistoryState,
  secondary: PersistedHistoryState,
): PersistedHistoryState {
  const resetAt = laterReset(primary.resetAt, secondary.resetAt)
  const a = forgetBefore(primary, resetAt)
  const b = forgetBefore(secondary, resetAt)

  const personalBests = { ...b.personalBests }
  for (const best of Object.values(a.personalBests)) {
    if (!best) continue
    const other = personalBests[best.techniqueId]
    if (!other || best.maxHoldTime >= other.maxHoldTime) personalBests[best.techniqueId] = best
  }

  const readings = new Map<string, VO2Entry>()
  for (const entry of [...b.vo2MaxHistory, ...a.vo2MaxHistory]) readings.set(`${entry.date}|${entry.value}`, entry)
  const vo2MaxHistory = [...readings.values()].sort((x, y) => time(x.date) - time(y.date) || x.value - y.value)

  return {
    sessions: mergeSessionLogs(a.sessions, b.sessions),
    personalBests,
    vo2MaxHistory,
    vo2MaxManual: latestReading(vo2MaxHistory) ?? a.vo2MaxManual ?? b.vo2MaxManual,
    resetAt,
  }
}

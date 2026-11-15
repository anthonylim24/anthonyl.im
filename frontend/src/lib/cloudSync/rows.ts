import { migratePersistedGamificationState } from '@/stores/gamificationStore'
import { migratePersistedHistoryState } from '@/stores/historyStore'
import { migratePersistedPracticeState } from '@/stores/practiceStore'
import { migratePersistedSettingsState } from '@/stores/settingsStore'
import { isRecord, parseSession, type CompletedSession } from '@/stores/sessionRecord'
import type { Snapshot } from './snapshot'

/**
 * The edge between the stores and Supabase's `sessions` and `user_state`
 * tables (`supabase/schema.sql`). Rows are untrusted: each goes through the
 * same cleaner as localStorage, so a null column or a stray type is dropped
 * here and never reaches a render.
 *
 * Two values ride inside existing jsonb columns because the schema has no
 * column for them: `settings.updatedAt` (which copy of the preferences is
 * newer) and `settings.resetAt` (when history was last erased).
 */

export function sessionToRow(session: CompletedSession, userId: string) {
  return {
    id: session.id,
    user_id: userId,
    technique_id: session.techniqueId,
    date: session.date,
    duration_seconds: session.durationSeconds,
    rounds: session.rounds,
    hold_times: session.holdTimes,
    custom_phase_durations: session.customPhaseDurations ?? null,
    max_hold_time: session.maxHoldTime,
    avg_hold_time: session.avgHoldTime,
    mood_before: session.moodBefore ?? null,
    mood_after: session.moodAfter ?? null,
  }
}

/** A clean session, or null for a row that is not one. */
export function rowToSession(row: unknown): CompletedSession | null {
  if (!isRecord(row)) return null
  return parseSession({
    id: row.id,
    techniqueId: row.technique_id,
    date: row.date,
    durationSeconds: row.duration_seconds,
    rounds: row.rounds,
    holdTimes: row.hold_times ?? [],
    customPhaseDurations: row.custom_phase_durations,
    maxHoldTime: row.max_hold_time,
    avgHoldTime: row.avg_hold_time,
    moodBefore: row.mood_before,
    moodAfter: row.mood_after,
  })
}

export function snapshotToStateRow(snapshot: Snapshot, userId: string) {
  return {
    user_id: userId,
    xp: snapshot.gamification.xp,
    earned_badges: snapshot.gamification.earnedBadges,
    selected_theme: snapshot.gamification.selectedTheme,
    personal_bests: snapshot.history.personalBests,
    vo2_max_manual: snapshot.history.vo2MaxManual,
    vo2_max_history: snapshot.history.vo2MaxHistory,
    settings: { ...snapshot.settings, resetAt: snapshot.history.resetAt },
    practice: snapshot.practice,
    updated_at: new Date().toISOString(),
  }
}

/** The cloud copy as a snapshot. A missing `user_state` row reads as a first run. */
export function parseCloudSnapshot(stateRow: unknown, sessionRows: readonly unknown[]): Snapshot {
  const state = isRecord(stateRow) ? stateRow : {}
  const settings = isRecord(state.settings) ? state.settings : {}
  return {
    history: {
      ...migratePersistedHistoryState({
        personalBests: state.personal_bests,
        vo2MaxManual: state.vo2_max_manual,
        vo2MaxHistory: state.vo2_max_history,
        resetAt: settings.resetAt,
      }),
      sessions: sessionRows.map(rowToSession).filter((session): session is CompletedSession => session !== null),
    },
    gamification: migratePersistedGamificationState({
      xp: state.xp,
      earnedBadges: state.earned_badges,
      selectedTheme: state.selected_theme,
    }),
    settings: migratePersistedSettingsState(settings),
    practice: migratePersistedPracticeState(state.practice),
  }
}

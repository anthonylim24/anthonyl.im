import { getJourney, type JourneyId } from '@/breathflow/journeys/catalog'
import { DEFAULT_ORB_THEME_ID } from '@/breathflow/gamify/orbThemes'
import type { PersistedGamificationState } from '@/stores/gamificationStore'
import { mergeHistoryStates } from '@/stores/historyMerge'
import type { JourneyProgress, PersistedPracticeState } from '@/stores/practiceStore'
import { hasNonDefaultSettings, type PersistedSettingsState } from '@/stores/settingsStore'
import type { Snapshot } from './snapshot'

/**
 * Pure merges of this device's copy with the cloud's. The rule throughout:
 * progress is never lost (union, longest, newest), and where two values
 * genuinely compete the one changed more recently wins.
 */

/** The newer copy of the preferences wins. Copies from before changes were stamped tie at 0: the cloud wins unless only this device holds anything but defaults. */
export function mergeSettings(local: PersistedSettingsState, cloud: PersistedSettingsState): PersistedSettingsState {
  if (local.updatedAt !== cloud.updatedAt) return local.updatedAt > cloud.updatedAt ? local : cloud
  return !hasNonDefaultSettings(cloud) && hasNonDefaultSettings(local) ? local : cloud
}

function isFinished(id: JourneyId, progress: JourneyProgress): boolean {
  return progress.done.length >= getJourney(id).steps.length
}

/**
 * Steps finished on either device both count, under the earlier start. The
 * exception is a restart: when one copy finished the journey and the other
 * began it again later, the restart is the journey now under way.
 */
export function mergeJourneyProgress(id: JourneyId, a: JourneyProgress, b: JourneyProgress): JourneyProgress {
  const [earlier, later] = Date.parse(a.startedAt) <= Date.parse(b.startedAt) ? [a, b] : [b, a]
  if (earlier.startedAt !== later.startedAt && isFinished(id, earlier) && !isFinished(id, later)) return later
  const done = [...earlier.done]
  for (const step of later.done) if (!done.includes(step)) done.push(step)
  return { startedAt: earlier.startedAt, done }
}

/** Goal and active journey: the more recently changed copy (ties to `primary`). Journey progress: per journey, merged. */
export function mergePractice(primary: PersistedPracticeState, secondary: PersistedPracticeState): PersistedPracticeState {
  const journeys: PersistedPracticeState['journeys'] = { ...secondary.journeys }
  for (const [id, progress] of Object.entries(primary.journeys) as [JourneyId, JourneyProgress | undefined][]) {
    if (!progress) continue
    const other = journeys[id]
    journeys[id] = other ? mergeJourneyProgress(id, progress, other) : progress
  }

  const goal = secondary.goalUpdatedAt > primary.goalUpdatedAt ? secondary : primary
  const active = secondary.activeJourneyUpdatedAt > primary.activeJourneyUpdatedAt ? secondary : primary
  return {
    dailyGoalMinutes: goal.dailyGoalMinutes,
    goalUpdatedAt: goal.goalUpdatedAt,
    activeJourneyId: active.activeJourneyId !== null && journeys[active.activeJourneyId] ? active.activeJourneyId : null,
    activeJourneyUpdatedAt: active.activeJourneyUpdatedAt,
    journeys,
  }
}

/**
 * XP is an earned total, so two devices that each earned from the same
 * starting point must add up. `xpBase` is the cloud total this device last
 * agreed with: what it holds above that is its own unsynced earning. With no
 * base (data from before sync tracked one) the larger total is kept, which
 * never double-counts but can under-count.
 */
export function mergeXP(localXP: number, cloudXP: number, xpBase: number | null): number {
  if (xpBase === null) return Math.max(localXP, cloudXP)
  return cloudXP + Math.max(0, localXP - xpBase)
}

export function mergeGamification(
  local: PersistedGamificationState,
  cloud: PersistedGamificationState,
  xpBase: number | null,
): PersistedGamificationState {
  return {
    xp: mergeXP(local.xp, cloud.xp, xpBase),
    earnedBadges: [...new Set([...cloud.earnedBadges, ...local.earnedBadges])],
    selectedTheme: local.selectedTheme !== DEFAULT_ORB_THEME_ID ? local.selectedTheme : cloud.selectedTheme,
  }
}

export interface MergeOptions {
  /** See `mergeXP`. */
  xpBase: number | null
  /** Whose copy wins a true conflict (a session's ratings, a tie): this device's when it holds unpushed changes. */
  prefer: 'local' | 'cloud'
  /**
   * Whether this device's copy is the signed-in person's own. A clear made
   * before signing in (or by unknown data) must not erase their cloud history.
   */
  localIsOwn: boolean
}

function isLater(a: string | null, b: string | null): boolean {
  return a !== null && (b === null || Date.parse(a) > Date.parse(b))
}

export function mergeSnapshots(local: Snapshot, cloud: Snapshot, options: MergeOptions): Snapshot {
  const localHistory = options.localIsOwn ? local.history : { ...local.history, resetAt: null }

  // Everything was erased on another device after this copy last synced: what
  // this device holds from before then is gone too.
  if (isLater(cloud.history.resetAt, localHistory.resetAt)) {
    return {
      ...cloud,
      history: mergeHistoryStates(cloud.history, localHistory),
    }
  }

  const [primary, secondary] = options.prefer === 'local' ? [localHistory, cloud.history] : [cloud.history, localHistory]
  const [primaryPractice, secondaryPractice] = options.prefer === 'local'
    ? [local.practice, cloud.practice]
    : [cloud.practice, local.practice]

  return {
    history: mergeHistoryStates(primary, secondary),
    gamification: mergeGamification(local.gamification, cloud.gamification, options.xpBase),
    settings: mergeSettings(local.settings, cloud.settings),
    practice: mergePractice(primaryPractice, secondaryPractice),
  }
}

import type { TechniqueId } from '@/lib/constants'
import type { MoodValue } from '@/lib/mood'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore, type CompletedSession } from '@/stores/historyStore'
import { plannedSessionSeconds, type CustomPhaseDurations } from '../protocols/cadence'
import { getProtocol } from '../protocols/catalog'
import { checkBadgeUnlocks } from '../gamify/badges'
import { calculateXP } from '../gamify/xp'

export interface CompletionInput {
  techniqueId: TechniqueId
  /** Rounds actually breathed. */
  rounds: number
  /** Rounds the session was set up for; above `rounds` when it was ended early. Defaults to `rounds`. */
  plannedRounds?: number
  customDurations?: CustomPhaseDurations
  /** Actual held seconds per hold phase, from the session engine. */
  holdTimes: readonly number[]
  moodBefore?: MoodValue
  /** This session finishes a journey (for the Wayfinder badge). */
  journeyFinished?: boolean
  /** Test seam. */
  now?: Date
}

export interface CompletionResult {
  session: CompletedSession
  xpEarned: number
  newBadgeIds: string[]
  isPersonalBest: boolean
  streak: number
  plannedRounds: number
}

/**
 * The single persistence bridge for a *completed* session: writes history,
 * awards XP and badges, and updates daily/weekly counts. A session ended
 * early arrives with the rounds it finished; one discarded inside its first
 * round must never reach this function.
 */
export function completeSession(input: CompletionInput): CompletionResult {
  const protocol = getProtocol(input.techniqueId)
  const history = useHistoryStore.getState()
  const gamification = useGamificationStore.getState()

  const plannedRounds = Math.max(input.rounds, input.plannedRounds ?? input.rounds)
  const holdTimes = [...input.holdTimes]
  const maxHoldTime = holdTimes.length > 0 ? Math.max(...holdTimes) : 0
  const avgHoldTime = holdTimes.length > 0
    ? Math.round((holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length) * 10) / 10
    : 0

  const previousBest = history.personalBests[protocol.id]
  const isPersonalBest = maxHoldTime > 0 && (!previousBest || maxHoldTime > previousBest.maxHoldTime)

  // Duration is always the planned sum of phases, never wall-clock.
  const durationSeconds = plannedSessionSeconds(protocol, input.rounds, input.customDurations)

  history.addSession({
    techniqueId: protocol.id,
    date: (input.now ?? new Date()).toISOString(),
    durationSeconds,
    rounds: input.rounds,
    ...(input.customDurations ? { customPhaseDurations: input.customDurations } : {}),
    holdTimes,
    maxHoldTime,
    avgHoldTime,
    ...(input.moodBefore !== undefined ? { moodBefore: input.moodBefore } : {}),
  })

  const updatedHistory = useHistoryStore.getState()
  const session = updatedHistory.sessions[0]
  const streak = updatedHistory.getStreak()

  const xpEarned = calculateXP(protocol.id, input.rounds, streak, input.rounds / Math.max(1, plannedRounds))
  gamification.addXP(xpEarned)
  gamification.recordSession()

  const newBadgeIds = checkBadgeUnlocks({
    sessions: updatedHistory.sessions,
    completedSession: session,
    streak,
    earnedBadgeIds: useGamificationStore.getState().earnedBadges,
    journeyFinished: input.journeyFinished,
  })
  if (newBadgeIds.length > 0) {
    gamification.unlockBadges(newBadgeIds)
  }

  return { session, xpEarned, newBadgeIds, isPersonalBest, streak, plannedRounds }
}

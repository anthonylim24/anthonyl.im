import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import type { CompletedSession } from '@/stores/historyStore'

export interface BadgeDefinition {
  id: string
  name: string
  description: string
  /** Secret badges stay hidden in the grid until earned. */
  secret?: boolean
}

/** Badge ids are persisted — never rename them. */
export const BADGES: readonly BadgeDefinition[] = [
  { id: 'first_session', name: 'First Breath', description: 'Complete your first session' },
  { id: 'streak_7', name: 'One Week', description: 'Practice 7 days in a row' },
  { id: 'streak_30', name: 'One Month', description: 'Practice 30 days in a row' },
  { id: 'sessions_100', name: 'Century', description: 'Complete 100 sessions' },
  { id: 'hour_total', name: 'First Hour', description: 'Accumulate one hour of practice' },
  { id: 'ten_hours', name: 'Ten Hours', description: 'Accumulate ten hours of practice' },
  { id: 'box_master', name: 'Box Master', description: 'Complete 50 Box Breathing sessions' },
  { id: 'co2_explorer', name: 'CO2 Explorer', description: 'Complete 50 CO2 Tolerance sessions' },
  { id: 'power_adept', name: 'Power Adept', description: 'Complete 50 Power Breathing sessions' },
  { id: 'protocol_sampler', name: 'Sampler', description: 'Try 4 different techniques' },
  { id: 'resonance_keeper', name: 'Resonance Keeper', description: 'Complete 30 Resonance sessions' },
  { id: 'sleep_ritual', name: 'Sleep Ritual', description: 'Complete 20 sessions of 4-7-8' },
  { id: 'night_owl', name: 'Night Owl', description: 'Practice between 10pm and 4am', secret: true },
  { id: 'early_bird', name: 'Early Bird', description: 'Practice between 5am and 7am', secret: true },
  { id: 'marathon', name: 'Marathon', description: 'Complete a session of 30 minutes or more', secret: true },
]

export interface BadgeCheckContext {
  /** All sessions including the just-completed one. */
  sessions: readonly CompletedSession[]
  /** The session that just completed. */
  completedSession: CompletedSession
  /** Current consecutive-local-day streak (including today). */
  streak: number
  earnedBadgeIds: readonly string[]
}

function countByTechnique(sessions: readonly CompletedSession[], techniqueId: TechniqueId): number {
  return sessions.reduce((count, session) => count + (session.techniqueId === techniqueId ? 1 : 0), 0)
}

function getLocalHour(dateIso: string): number | null {
  const date = new Date(dateIso)
  return Number.isNaN(date.getTime()) ? null : date.getHours()
}

/** Returns badge ids newly earned by the just-completed session. */
export function checkBadgeUnlocks(ctx: BadgeCheckContext): string[] {
  const { sessions, completedSession, streak } = ctx
  const earned = new Set(ctx.earnedBadgeIds)
  const unlocked: string[] = []

  const totalSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0)
  const distinctTechniques = new Set(sessions.map((session) => session.techniqueId)).size
  const hour = getLocalHour(completedSession.date)

  const checks: Record<string, boolean> = {
    first_session: sessions.length >= 1,
    streak_7: streak >= 7,
    streak_30: streak >= 30,
    sessions_100: sessions.length >= 100,
    hour_total: totalSeconds >= 3600,
    ten_hours: totalSeconds >= 36_000,
    box_master: countByTechnique(sessions, TECHNIQUE_IDS.BOX_BREATHING) >= 50,
    co2_explorer: countByTechnique(sessions, TECHNIQUE_IDS.CO2_TOLERANCE) >= 50,
    power_adept: countByTechnique(sessions, TECHNIQUE_IDS.POWER_BREATHING) >= 50,
    protocol_sampler: distinctTechniques >= 4,
    resonance_keeper: countByTechnique(sessions, TECHNIQUE_IDS.RESONANCE_BREATHING) >= 30,
    sleep_ritual: countByTechnique(sessions, TECHNIQUE_IDS.FOUR_SEVEN_EIGHT) >= 20,
    night_owl: hour !== null && (hour >= 22 || hour < 4),
    early_bird: hour !== null && hour >= 5 && hour < 7,
    marathon: completedSession.durationSeconds >= 1800,
  }

  for (const badge of BADGES) {
    if (!earned.has(badge.id) && checks[badge.id]) {
      unlocked.push(badge.id)
    }
  }

  return unlocked
}

export function getBadge(id: string): BadgeDefinition | undefined {
  return BADGES.find((badge) => badge.id === id)
}

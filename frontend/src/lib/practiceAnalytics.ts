import { getProtocol, type ProtocolCategory } from './breathingProtocols'
import { addLocalDays, getLocalDateKey, getLocalDayStart } from './localDates'
import type { CompletedSession } from '@/stores/historyStore'

export interface PracticeConsistencyInsight {
  activeDays: number
  sessionCount: number
  totalMinutes: number
  label: string
  description: string
  nextStep: string
  dominantCategory: ProtocolCategory | null
  dominantProtocolName: string | null
}

const RECENT_WINDOW_DAYS = 7

function getRecentSessions(
  sessions: CompletedSession[],
  now: Date,
): CompletedSession[] {
  const windowStart = addLocalDays(getLocalDayStart(now), -(RECENT_WINDOW_DAYS - 1)).getTime()
  return sessions.filter((session) => {
    const sessionDate = new Date(session.date)
    if (Number.isNaN(sessionDate.getTime())) return false

    return sessionDate.getTime() >= windowStart && sessionDate.getTime() <= now.getTime()
  })
}

function getDominantProtocolName(sessions: CompletedSession[]): string | null {
  const counts = new Map<string, number>()

  for (const session of sessions) {
    const protocolName = getProtocol(session.techniqueId).name
    counts.set(protocolName, (counts.get(protocolName) ?? 0) + 1)
  }

  let dominantName: string | null = null
  let dominantCount = 0

  for (const [protocolName, count] of counts) {
    if (count > dominantCount) {
      dominantName = protocolName
      dominantCount = count
    }
  }

  return dominantName
}

function getDominantCategory(sessions: CompletedSession[]): ProtocolCategory | null {
  const counts = new Map<ProtocolCategory, number>()

  for (const session of sessions) {
    const category = getProtocol(session.techniqueId).category
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }

  let dominantCategory: ProtocolCategory | null = null
  let dominantCount = 0

  for (const [category, count] of counts) {
    if (count > dominantCount) {
      dominantCategory = category
      dominantCount = count
    }
  }

  return dominantCategory
}

function getConsistencyCopy(
  activeDays: number,
  dominantCategory: ProtocolCategory | null,
): Pick<PracticeConsistencyInsight, 'label' | 'description' | 'nextStep'> {
  if (activeDays >= 5) {
    const advancedRecovery =
      dominantCategory === 'performance'
        ? 'Add one recovery or resonance session.'
        : 'Keep the same time of day. Do not add strain.'

    return {
      label: '5+ days',
      description: 'Five or more practice days this week.',
      nextStep: advancedRecovery,
    }
  }

  if (activeDays >= 3) {
    return {
      label: '3 to 4 days',
      description: 'Three or four practice days this week.',
      nextStep: 'Repeat the easiest useful protocol tomorrow.',
    }
  }

  if (activeDays >= 1) {
    return {
      label: 'Started',
      description: 'One or two sessions this week.',
      nextStep: 'Do another five-minute session in the next day.',
    }
  }

  return {
    label: 'No sessions yet',
    description: 'No sessions in the last seven days.',
    nextStep: 'Start with a five-minute protocol.',
  }
}

export function buildPracticeConsistencyInsight(
  sessions: CompletedSession[],
  now = new Date(),
): PracticeConsistencyInsight {
  const recentSessions = getRecentSessions(sessions, now)
  const activeDays = new Set(
    recentSessions
      .map((session) => getLocalDateKey(session.date))
      .filter((dateKey): dateKey is string => Boolean(dateKey))
  ).size
  const totalMinutes = Math.round(
    recentSessions.reduce((sum, session) => sum + session.durationSeconds, 0) / 60
  )
  const dominantCategory = getDominantCategory(recentSessions)
  const copy = getConsistencyCopy(activeDays, dominantCategory)

  return {
    ...copy,
    activeDays,
    sessionCount: recentSessions.length,
    totalMinutes,
    dominantCategory,
    dominantProtocolName: getDominantProtocolName(recentSessions),
  }
}

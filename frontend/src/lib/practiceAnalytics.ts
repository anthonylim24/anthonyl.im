import { getProtocol, type ProtocolCategory } from './breathingProtocols'
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

const MS_PER_DAY = 24 * 60 * 60 * 1000
const RECENT_WINDOW_DAYS = 7

function dayKey(date: Date): string {
  return date.toISOString().split('T')[0]
}

function getRecentSessions(
  sessions: CompletedSession[],
  now: Date,
): CompletedSession[] {
  const windowStart = now.getTime() - (RECENT_WINDOW_DAYS - 1) * MS_PER_DAY
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
        ? 'Balance the intensity with one gentle recovery or resonance session.'
        : 'Keep the same anchor time and avoid turning consistency into strain.'

    return {
      label: 'Consistent rhythm',
      description: 'Five or more practice days this week is enough repetition for a durable habit signal.',
      nextStep: advancedRecovery,
    }
  }

  if (activeDays >= 3) {
    return {
      label: 'Habit forming',
      description: 'Three to four practice days gives the nervous system repeated context without needing daily pressure.',
      nextStep: 'Repeat the easiest useful protocol tomorrow to make the habit automatic.',
    }
  }

  if (activeDays >= 1) {
    return {
      label: 'Early signal',
      description: 'You have a recent session on record. The next gain comes from repeating it before momentum fades.',
      nextStep: 'Schedule one five-minute calm or resonance session in the next 24 hours.',
    }
  }

  return {
    label: 'Ready to begin',
    description: 'No recent practice is recorded yet, so the trend line is waiting for a first data point.',
    nextStep: 'Start with a gentle five-minute protocol and let the app build your baseline.',
  }
}

export function buildPracticeConsistencyInsight(
  sessions: CompletedSession[],
  now = new Date(),
): PracticeConsistencyInsight {
  const recentSessions = getRecentSessions(sessions, now)
  const activeDays = new Set(recentSessions.map((session) => dayKey(new Date(session.date)))).size
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

import type { TechniqueId } from '@/lib/constants'
import { addLocalDays, formatLocalDateKey, getLocalDateKey, getLocalDayStart } from '@/lib/localDates'
import type { CompletedSession } from '@/stores/historyStore'
import { getProtocol } from '../protocols/catalog'
import type { ProtocolCategory } from '../protocols/types'

export interface WeekSummary {
  /** Distinct local days practiced in the last 7 days (including today). */
  activeDays: number
  minutes: number
  sessionCount: number
  topTechniqueId: TechniqueId | null
  dominantCategory: ProtocolCategory | null
  nextStep: string
  /** Extra line when a 5+ day week is dominated by performance work. */
  performanceNote: string | null
}

function getNextStep(activeDays: number): string {
  if (activeDays === 0) return 'Start with five minutes.'
  if (activeDays <= 2) return 'Another five minutes tomorrow.'
  if (activeDays <= 4) return 'Same protocol tomorrow, or an easier one.'
  return 'Same time of day. Do not add intensity.'
}

export function getWeekSummary(
  sessions: readonly CompletedSession[],
  now: Date = new Date(),
): WeekSummary {
  const windowKeys = new Set<string>()
  const todayStart = getLocalDayStart(now)
  for (let offset = 0; offset > -7; offset--) {
    windowKeys.add(formatLocalDateKey(addLocalDays(todayStart, offset)))
  }

  const weekSessions = sessions.filter((session) => {
    const key = getLocalDateKey(session.date)
    return key !== null && windowKeys.has(key)
  })

  const activeDayKeys = new Set<string>()
  const techniqueCounts = new Map<TechniqueId, number>()
  const categoryCounts = new Map<ProtocolCategory, number>()
  let totalSeconds = 0

  for (const session of weekSessions) {
    const key = getLocalDateKey(session.date)
    if (key) activeDayKeys.add(key)
    totalSeconds += session.durationSeconds
    techniqueCounts.set(session.techniqueId, (techniqueCounts.get(session.techniqueId) ?? 0) + 1)
    const category = getProtocol(session.techniqueId).category
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1)
  }

  let topTechniqueId: TechniqueId | null = null
  let topTechniqueCount = 0
  for (const [techniqueId, count] of techniqueCounts) {
    if (count > topTechniqueCount) {
      topTechniqueId = techniqueId
      topTechniqueCount = count
    }
  }

  let dominantCategory: ProtocolCategory | null = null
  let dominantCount = 0
  for (const [category, count] of categoryCounts) {
    if (count > dominantCount) {
      dominantCategory = category
      dominantCount = count
    }
  }

  const activeDays = activeDayKeys.size
  return {
    activeDays,
    minutes: Math.round(totalSeconds / 60),
    sessionCount: weekSessions.length,
    topTechniqueId,
    dominantCategory,
    nextStep: getNextStep(activeDays),
    performanceNote: activeDays >= 5 && dominantCategory === 'performance'
      ? 'Add one recovery or resonance session.'
      : null,
  }
}

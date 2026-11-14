import type { TechniqueId } from '@/lib/constants'
import { addLocalDays, formatLocalDateKey, getLocalDateKey, getLocalDayStart, getLocalWeekStartKey } from '@/lib/localDates'
import { getMoodDelta } from '@/lib/mood'
import type { CompletedSession } from '@/stores/historyStore'

/** Longer-range patterns in the session log. Every `now` is a test seam. */

export interface WeekTotal {
  /** Local date key of the week's Monday. */
  startKey: string
  minutes: number
  sessions: number
}

/** Minutes practised in each of the last `weeks` Monday-start weeks, oldest first (the last is this week). */
export function getWeeklyMinutes(sessions: readonly CompletedSession[], weeks = 8, now: Date = new Date()): WeekTotal[] {
  const thisMonday = getLocalDayStart(getLocalWeekStartKey(now))
  const seconds = new Map<string, { seconds: number; sessions: number }>()
  for (const session of sessions) {
    const date = new Date(session.date)
    if (Number.isNaN(date.getTime())) continue
    const key = getLocalWeekStartKey(date)
    const entry = seconds.get(key) ?? { seconds: 0, sessions: 0 }
    entry.seconds += session.durationSeconds
    entry.sessions += 1
    seconds.set(key, entry)
  }
  const totals: WeekTotal[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const startKey = formatLocalDateKey(addLocalDays(thisMonday, -7 * i))
    const entry = seconds.get(startKey)
    totals.push({ startKey, minutes: entry ? Math.round(entry.seconds / 60) : 0, sessions: entry?.sessions ?? 0 })
  }
  return totals
}

export const DAY_PARTS = ['morning', 'afternoon', 'evening', 'night'] as const
export type DayPart = (typeof DAY_PARTS)[number]

export const DAY_PART_LABELS: Record<DayPart, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
}

/** Morning 5:00–11:59, afternoon to 16:59, evening to 21:59, night otherwise (local time). */
export function getDayPart(date: Date): DayPart {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}

export interface DayPartSummary {
  counts: Record<DayPart, number>
  total: number
  /** The part of the day with the most sessions (earliest wins a tie); null with no sessions. */
  top: DayPart | null
}

export function getDayParts(sessions: readonly CompletedSession[]): DayPartSummary {
  const counts: Record<DayPart, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 }
  let total = 0
  for (const session of sessions) {
    const date = new Date(session.date)
    if (Number.isNaN(date.getTime())) continue
    counts[getDayPart(date)] += 1
    total += 1
  }
  let top: DayPart | null = null
  for (const part of DAY_PARTS) {
    if (counts[part] > 0 && (top === null || counts[part] > counts[top])) top = part
  }
  return { counts, total, top }
}

export interface TechniqueCalm {
  techniqueId: TechniqueId
  /** Sessions with both a before and an after rating. */
  count: number
  /** Mean calm shift (after − before), one decimal place. */
  averageShift: number
}

/**
 * Mean calm shift per technique, best first. A technique needs `minCount`
 * rated sessions to appear: one good afternoon is not a pattern.
 */
export function getCalmByTechnique(sessions: readonly CompletedSession[], minCount = 2): TechniqueCalm[] {
  const sums = new Map<TechniqueId, { sum: number; count: number }>()
  for (const session of sessions) {
    const delta = getMoodDelta(session.moodBefore, session.moodAfter)
    if (delta === null) continue
    const entry = sums.get(session.techniqueId) ?? { sum: 0, count: 0 }
    entry.sum += delta
    entry.count += 1
    sums.set(session.techniqueId, entry)
  }
  return [...sums]
    .filter(([, entry]) => entry.count >= minCount)
    .map(([techniqueId, entry]) => ({ techniqueId, count: entry.count, averageShift: Math.round((entry.sum / entry.count) * 10) / 10 }))
    .sort((a, b) => b.averageShift - a.averageShift || b.count - a.count)
}

export interface Lifetime {
  sessions: number
  minutes: number
  /** Distinct local days with a session. */
  days: number
  /** Longest run of consecutive practice days. */
  longestStreak: number
}

export function getLifetime(sessions: readonly CompletedSession[]): Lifetime {
  const dayKeys = new Set<string>()
  let seconds = 0
  for (const session of sessions) {
    seconds += session.durationSeconds
    const key = getLocalDateKey(session.date)
    if (key) dayKeys.add(key)
  }
  let longestStreak = 0
  for (const key of dayKeys) {
    const day = getLocalDayStart(key)
    // Count only from the first day of a run.
    if (dayKeys.has(formatLocalDateKey(addLocalDays(day, -1)))) continue
    let run = 1
    while (dayKeys.has(formatLocalDateKey(addLocalDays(day, run)))) run += 1
    longestStreak = Math.max(longestStreak, run)
  }
  return { sessions: sessions.length, minutes: Math.round(seconds / 60), days: dayKeys.size, longestStreak }
}

export interface WeekDay {
  key: string
  /** One-letter weekday in the viewer's locale. */
  label: string
  minutes: number
}

/** The last seven local days, oldest first, ending today. */
export function getLastSevenDays(sessions: readonly CompletedSession[], now: Date = new Date()): WeekDay[] {
  const today = getLocalDayStart(now)
  const seconds = new Map<string, number>()
  for (const session of sessions) {
    const key = getLocalDateKey(session.date)
    if (key) seconds.set(key, (seconds.get(key) ?? 0) + session.durationSeconds)
  }
  const days: WeekDay[] = []
  for (let offset = -6; offset <= 0; offset++) {
    const date = addLocalDays(today, offset)
    const key = formatLocalDateKey(date)
    days.push({ key, label: date.toLocaleDateString(undefined, { weekday: 'narrow' }), minutes: Math.round((seconds.get(key) ?? 0) / 60) })
  }
  return days
}

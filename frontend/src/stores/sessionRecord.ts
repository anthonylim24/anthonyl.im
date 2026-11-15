import { BREATH_PHASES, TECHNIQUE_IDS, type BreathPhase, type TechniqueId } from '@/lib/constants'
import { isMoodValue, type MoodValue } from '@/lib/mood'

/**
 * The one cleaner for history records, wherever they come from: localStorage,
 * an import file or a cloud row (after `rows.ts` renames its columns). Past
 * these functions, history code trusts the shape.
 */

export interface CompletedSession {
  id: string
  techniqueId: TechniqueId
  date: string // ISO string
  /**
   * The local calendar day (YYYY-MM-DD) the session was finished on, where it
   * was finished. Streaks and day buckets prefer it over `date`, so moving
   * timezone does not shift past days. Older sessions and cloud rows lack it.
   */
  localDay?: string
  durationSeconds: number
  rounds: number
  customPhaseDurations?: Partial<Record<BreathPhase, number>>
  holdTimes: number[]
  maxHoldTime: number
  avgHoldTime: number
  /** Optional 1–5 calm rating captured before the session (local-first reflection). */
  moodBefore?: MoodValue
  /** Optional 1–5 calm rating captured after the session. */
  moodAfter?: MoodValue
}

export interface PersonalBest {
  techniqueId: TechniqueId
  maxHoldTime: number
  date: string
}

export interface VO2Entry {
  value: number
  date: string
}

const techniqueIds = new Set<string>(Object.values(TECHNIQUE_IDS))
const breathPhases = new Set<string>(Object.values(BREATH_PHASES))

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function isDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

export function isLocalDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function isTechniqueId(value: unknown): value is TechniqueId {
  return typeof value === 'string' && techniqueIds.has(value)
}

function parseCustomPhaseDurations(value: unknown): CompletedSession['customPhaseDurations'] | null {
  if (!isRecord(value)) return null
  const entries = Object.entries(value)
  if (!entries.every(([phase, seconds]) => breathPhases.has(phase) && isPositiveInteger(seconds))) return null
  return value as CompletedSession['customPhaseDurations']
}

/**
 * A clean session, or null when a required field is missing or wrong. Optional
 * fields that fail their check are dropped rather than sinking the record.
 */
export function parseSession(value: unknown): CompletedSession | null {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || value.id.length === 0
    || !isTechniqueId(value.techniqueId)
    || !isDateString(value.date)
    || !isNonNegativeNumber(value.durationSeconds)
    || !isPositiveInteger(value.rounds)
    || !Array.isArray(value.holdTimes)
    || !value.holdTimes.every(isNonNegativeNumber)
    || !isNonNegativeNumber(value.maxHoldTime)
    || !isNonNegativeNumber(value.avgHoldTime)
  ) {
    return null
  }
  // A cadence that is present but wrong means the record is not ours to guess at.
  const custom = value.customPhaseDurations == null ? undefined : parseCustomPhaseDurations(value.customPhaseDurations)
  if (custom === null) return null

  return {
    id: value.id,
    techniqueId: value.techniqueId,
    date: value.date,
    ...(isLocalDateKey(value.localDay) ? { localDay: value.localDay } : {}),
    durationSeconds: value.durationSeconds,
    rounds: value.rounds,
    ...(custom ? { customPhaseDurations: custom } : {}),
    holdTimes: [...(value.holdTimes as number[])],
    maxHoldTime: value.maxHoldTime,
    avgHoldTime: value.avgHoldTime,
    ...(isMoodValue(value.moodBefore) ? { moodBefore: value.moodBefore } : {}),
    ...(isMoodValue(value.moodAfter) ? { moodAfter: value.moodAfter } : {}),
  }
}

/** Every valid session in `value`, invalid elements dropped. */
export function parseSessions(value: unknown): CompletedSession[] {
  if (!Array.isArray(value)) return []
  return value.map(parseSession).filter((session): session is CompletedSession => session !== null)
}

export function parsePersonalBest(value: unknown): PersonalBest | null {
  if (
    !isRecord(value)
    || !isTechniqueId(value.techniqueId)
    || !isNonNegativeNumber(value.maxHoldTime)
    || !isDateString(value.date)
  ) {
    return null
  }
  return { techniqueId: value.techniqueId, maxHoldTime: value.maxHoldTime, date: value.date }
}

export function parsePersonalBests(value: unknown): Partial<Record<TechniqueId, PersonalBest>> {
  const bests: Partial<Record<TechniqueId, PersonalBest>> = {}
  if (!isRecord(value)) return bests
  for (const [technique, raw] of Object.entries(value)) {
    const best = parsePersonalBest(raw)
    if (best && best.techniqueId === technique) bests[best.techniqueId] = best
  }
  return bests
}

export function parseVO2Entry(value: unknown): VO2Entry | null {
  if (!isRecord(value) || !isNonNegativeNumber(value.value) || !isDateString(value.date)) return null
  return { value: value.value, date: value.date }
}

export function parseVO2History(value: unknown): VO2Entry[] {
  if (!Array.isArray(value)) return []
  return value.map(parseVO2Entry).filter((entry): entry is VO2Entry => entry !== null)
}

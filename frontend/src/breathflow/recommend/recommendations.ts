import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import type { CompletedSession } from '@/stores/historyStore'
import { getProtocol, isAdvancedProtocol, PROTOCOLS } from '../protocols/catalog'
import { clampRounds, plannedSessionSeconds } from '../protocols/cadence'
import type { BreathingProtocol, ProtocolCategory } from '../protocols/types'

export type PracticeGoal = 'calm' | 'sleep' | 'focus' | 'recover' | 'perform'

export const GOALS: readonly { id: PracticeGoal; label: string }[] = [
  { id: 'calm', label: 'Calm' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'focus', label: 'Focus' },
  { id: 'recover', label: 'Recover' },
  { id: 'perform', label: 'Perform' },
]

export type LengthWindowId = 'quick' | 'standard' | 'long'

export const LENGTH_WINDOWS: readonly { id: LengthWindowId; label: string; seconds: number }[] = [
  { id: 'quick', label: 'Quick', seconds: 180 },
  { id: 'standard', label: 'Standard', seconds: 300 },
  { id: 'long', label: 'Long', seconds: 480 },
]

/** 21:00–04:59 Sleep; 05:00–10:59 Focus; else Calm. */
export function getDefaultGoalForHour(hour: number): PracticeGoal {
  if (hour >= 21 || hour < 5) return 'sleep'
  if (hour >= 5 && hour < 11) return 'focus'
  return 'calm'
}

const GOAL_CATEGORY: Record<PracticeGoal, ProtocolCategory> = {
  calm: 'calm',
  sleep: 'sleep',
  focus: 'focus',
  recover: 'recovery',
  perform: 'performance',
}

const PREFERRED: Record<PracticeGoal, readonly TechniqueId[]> = {
  calm: [
    TECHNIQUE_IDS.CYCLIC_SIGHING,
    TECHNIQUE_IDS.DIAPHRAGMATIC_BREATHING,
    TECHNIQUE_IDS.EXTENDED_EXHALE,
    TECHNIQUE_IDS.RESONANCE_BREATHING,
  ],
  sleep: [
    TECHNIQUE_IDS.FOUR_SEVEN_EIGHT,
    TECHNIQUE_IDS.EXTENDED_EXHALE,
    TECHNIQUE_IDS.RESONANCE_BREATHING,
  ],
  focus: [
    TECHNIQUE_IDS.BOX_BREATHING,
    TECHNIQUE_IDS.RESONANCE_BREATHING,
    TECHNIQUE_IDS.CYCLIC_SIGHING,
  ],
  recover: [
    TECHNIQUE_IDS.PURSED_LIP_RECOVERY,
    TECHNIQUE_IDS.DIAPHRAGMATIC_BREATHING,
    TECHNIQUE_IDS.EXTENDED_EXHALE,
    TECHNIQUE_IDS.RESONANCE_BREATHING,
  ],
  perform: [
    TECHNIQUE_IDS.CO2_TOLERANCE,
    TECHNIQUE_IDS.POWER_BREATHING,
    TECHNIQUE_IDS.BOX_BREATHING,
  ],
}

export interface RecommendationInput {
  goal: PracticeGoal
  windowSeconds: number
  now?: Date
  sessions: readonly CompletedSession[]
  dailyGoalMet: boolean
  /** Advanced techniques blocked by the 90s recovery window. */
  recoveryActive: boolean
}

export interface RankedProtocol {
  protocol: BreathingProtocol
  rounds: number
  plannedSeconds: number
  score: number
}

export interface Recommendation {
  top: RankedProtocol
  alternatives: [RankedProtocol, RankedProtocol]
}

/**
 * Rounds whose planned duration lands closest to the window.
 * CO2 and Power are capped at their default rounds.
 */
export function getRoundsForWindow(protocol: BreathingProtocol, windowSeconds: number): number {
  const cappedMax = isAdvancedProtocol(protocol)
    ? protocol.defaultRounds
    : clampRounds(protocol, Number.MAX_SAFE_INTEGER)

  let bestRounds = 1
  let bestDistance = Number.POSITIVE_INFINITY
  for (let rounds = 1; rounds <= cappedMax; rounds++) {
    const distance = Math.abs(plannedSessionSeconds(protocol, rounds) - windowSeconds)
    if (distance < bestDistance) {
      bestDistance = distance
      bestRounds = rounds
    }
  }
  return bestRounds
}

function isLateNight(hour: number): boolean {
  return hour >= 21 || hour < 5
}

export function scoreProtocol(
  protocol: BreathingProtocol,
  plannedSeconds: number,
  input: RecommendationInput,
): number {
  const { goal, windowSeconds } = input
  const hour = (input.now ?? new Date()).getHours()
  const isNewUser = input.sessions.length === 0
  const advanced = isAdvancedProtocol(protocol)
  let score = 0

  // Category fit.
  if (protocol.category === GOAL_CATEGORY[goal]) score += 100

  // Preferred technique for the goal (ordered).
  const preferredIndex = PREFERRED[goal].indexOf(protocol.id)
  if (preferredIndex >= 0) score += 60 - 10 * preferredIndex

  // Intensity preference.
  if (protocol.intensity === 'gentle' && (goal === 'calm' || goal === 'sleep' || goal === 'recover')) score += 20
  if (protocol.intensity === 'moderate' && goal === 'focus') score += 20
  if (protocol.intensity === 'advanced' && goal === 'perform') score += 30

  // Evidence.
  if (protocol.evidenceLevel === 'strong') score += 25
  else if (protocol.evidenceLevel === 'promising') score += 10

  // Closeness of computed duration to the window.
  score += 40 * Math.max(0, 1 - Math.abs(plannedSeconds - windowSeconds) / windowSeconds)

  // New users: boost gentle, penalize advanced unless goal is Perform.
  if (isNewUser) {
    if (protocol.intensity === 'gentle') score += 30
    if (advanced && goal !== 'perform') score -= 80
  }

  // Daily goal already met: slight gentle boost, slight advanced penalty unless Perform.
  if (input.dailyGoalMet) {
    if (protocol.intensity === 'gentle') score += 10
    if (advanced && goal !== 'perform') score -= 15
  }

  // Late night: boost sleep, penalize Power Breathing.
  if (isLateNight(hour)) {
    if (protocol.category === 'sleep') score += 30
    if (protocol.id === TECHNIQUE_IDS.POWER_BREATHING) score -= 50
  }

  // Safety-gated protocols: large penalty unless goal is Perform.
  if (advanced && goal !== 'perform') score -= 120

  // Recovery window: hard penalty for blocked advanced protocols.
  if (advanced && input.recoveryActive) score -= 200

  return score
}

/** Score every protocol; return the top pick plus two alternatives. */
export function recommendProtocols(input: RecommendationInput): Recommendation {
  const candidates = input.recoveryActive
    ? PROTOCOLS.filter((protocol) => !isAdvancedProtocol(protocol))
    : PROTOCOLS

  const ranked = candidates
    .map((protocol) => {
      const rounds = getRoundsForWindow(protocol, input.windowSeconds)
      const plannedSeconds = plannedSessionSeconds(protocol, rounds)
      return {
        protocol,
        rounds,
        plannedSeconds,
        score: scoreProtocol(protocol, plannedSeconds, input),
      }
    })
    .sort((a, b) => b.score - a.score)

  return {
    top: ranked[0],
    alternatives: [ranked[1], ranked[2]],
  }
}

/** Convenience for tests and Home: the default recommendation right now. */
export function getDefaultRecommendation(
  sessions: readonly CompletedSession[],
  dailyGoalMet: boolean,
  recoveryActive: boolean,
  now: Date = new Date(),
): Recommendation {
  return recommendProtocols({
    goal: getDefaultGoalForHour(now.getHours()),
    windowSeconds: 300,
    now,
    sessions,
    dailyGoalMet,
    recoveryActive,
  })
}

export function getProtocolById(id: TechniqueId): BreathingProtocol {
  return getProtocol(id)
}

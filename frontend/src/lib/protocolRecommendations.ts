import {
  breathingProtocols,
  calculateSessionDuration,
  clampProtocolRounds,
  getProtocolCatalog,
  getProtocolRoundLimit,
  type BreathingProtocol,
  type ProtocolCategory,
  type ProtocolIntensity,
} from './breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from './constants'

export type ProtocolGoal = 'calm' | 'sleep' | 'focus' | 'recovery' | 'performance'
export type SessionWindow = 'quick' | 'standard' | 'deep'

export interface ProtocolGoalOption {
  id: ProtocolGoal
  label: string
  shortLabel: string
  categories: ProtocolCategory[]
  preferredTechniqueIds: TechniqueId[]
  intensityPreference: ProtocolIntensity[]
}

export interface SessionWindowOption {
  id: SessionWindow
  label: string
  shortLabel: string
  targetSeconds: number
}

export interface ProtocolRecommendationQuery {
  goal: ProtocolGoal
  sessionWindow: SessionWindow
  isNewUser?: boolean
  dailyGoalMet?: boolean
  currentHour?: number
}

export interface ProtocolRecommendationOption {
  protocol: BreathingProtocol
  rounds: number
  estimatedDuration: number
  score: number
  reasons: string[]
}

export interface ProtocolRecommendation {
  primary: ProtocolRecommendationOption
  alternatives: ProtocolRecommendationOption[]
}

export const protocolGoalOptions: ProtocolGoalOption[] = [
  {
    id: 'calm',
    label: 'Calm',
    shortLabel: 'Calm',
    categories: ['calm'],
    preferredTechniqueIds: [
      TECHNIQUE_IDS.CYCLIC_SIGHING,
      TECHNIQUE_IDS.DIAPHRAGMATIC_BREATHING,
      TECHNIQUE_IDS.EXTENDED_EXHALE,
      TECHNIQUE_IDS.RESONANCE_BREATHING,
    ],
    intensityPreference: ['gentle', 'moderate'],
  },
  {
    id: 'sleep',
    label: 'Sleep',
    shortLabel: 'Sleep',
    categories: ['sleep', 'calm'],
    preferredTechniqueIds: [
      TECHNIQUE_IDS.FOUR_SEVEN_EIGHT,
      TECHNIQUE_IDS.EXTENDED_EXHALE,
      TECHNIQUE_IDS.RESONANCE_BREATHING,
    ],
    intensityPreference: ['moderate', 'gentle'],
  },
  {
    id: 'focus',
    label: 'Focus',
    shortLabel: 'Focus',
    categories: ['focus', 'calm'],
    preferredTechniqueIds: [
      TECHNIQUE_IDS.BOX_BREATHING,
      TECHNIQUE_IDS.RESONANCE_BREATHING,
      TECHNIQUE_IDS.CYCLIC_SIGHING,
    ],
    intensityPreference: ['moderate', 'gentle'],
  },
  {
    id: 'recovery',
    label: 'Recover',
    shortLabel: 'Recover',
    categories: ['recovery', 'calm'],
    preferredTechniqueIds: [
      TECHNIQUE_IDS.PURSED_LIP_RECOVERY,
      TECHNIQUE_IDS.DIAPHRAGMATIC_BREATHING,
      TECHNIQUE_IDS.EXTENDED_EXHALE,
      TECHNIQUE_IDS.RESONANCE_BREATHING,
    ],
    intensityPreference: ['gentle', 'moderate'],
  },
  {
    id: 'performance',
    label: 'Perform',
    shortLabel: 'Perform',
    categories: ['performance', 'focus'],
    preferredTechniqueIds: [
      TECHNIQUE_IDS.CO2_TOLERANCE,
      TECHNIQUE_IDS.POWER_BREATHING,
      TECHNIQUE_IDS.BOX_BREATHING,
    ],
    intensityPreference: ['advanced', 'moderate', 'gentle'],
  },
]

export const sessionWindowOptions: SessionWindowOption[] = [
  { id: 'quick', label: 'Quick', shortLabel: '3 min', targetSeconds: 180 },
  { id: 'standard', label: 'Standard', shortLabel: '5 min', targetSeconds: 300 },
  { id: 'deep', label: 'Deep', shortLabel: '8 min', targetSeconds: 480 },
]

const evidenceScore: Record<BreathingProtocol['evidenceLevel'], number> = {
  strong: 14,
  promising: 9,
  traditional: 4,
}

const maxRecommendedRounds: Partial<Record<TechniqueId, number>> = {
  [TECHNIQUE_IDS.CO2_TOLERANCE]: breathingProtocols[TECHNIQUE_IDS.CO2_TOLERANCE].defaultRounds,
  [TECHNIQUE_IDS.POWER_BREATHING]: breathingProtocols[TECHNIQUE_IDS.POWER_BREATHING].defaultRounds,
}

function getGoalOption(goal: ProtocolGoal): ProtocolGoalOption {
  return protocolGoalOptions.find((option) => option.id === goal) ?? protocolGoalOptions[0]
}

function getWindowOption(sessionWindow: SessionWindow): SessionWindowOption {
  return sessionWindowOptions.find((option) => option.id === sessionWindow) ?? sessionWindowOptions[1]
}

export function getDefaultProtocolGoal(currentHour = new Date().getHours()): ProtocolGoal {
  if (currentHour >= 21 || currentHour < 5) return 'sleep'
  if (currentHour >= 5 && currentHour < 11) return 'focus'
  return 'calm'
}

export function getRecommendedRounds(protocol: BreathingProtocol, targetSeconds: number): number {
  const maxRounds = maxRecommendedRounds[protocol.id] ?? getProtocolRoundLimit(protocol.id)
  let bestRounds = protocol.defaultRounds
  let bestDelta = Number.POSITIVE_INFINITY

  for (let rounds = 1; rounds <= maxRounds; rounds++) {
    const duration = calculateSessionDuration({ techniqueId: protocol.id, rounds })
    const delta = Math.abs(duration - targetSeconds)
    if (delta < bestDelta) {
      bestRounds = rounds
      bestDelta = delta
    }
  }

  return bestRounds
}

export function buildProtocolSessionPath(techniqueId: TechniqueId, rounds: number): string {
  const params = new URLSearchParams({
    technique: techniqueId,
    rounds: String(clampProtocolRounds(techniqueId, rounds)),
  })
  return `/breathwork/session?${params.toString()}`
}

function scoreProtocol(
  protocol: BreathingProtocol,
  goal: ProtocolGoalOption,
  windowOption: SessionWindowOption,
  query: ProtocolRecommendationQuery
): ProtocolRecommendationOption {
  const rounds = getRecommendedRounds(protocol, windowOption.targetSeconds)
  const estimatedDuration = calculateSessionDuration({ techniqueId: protocol.id, rounds })
  const preferredIndex = goal.preferredTechniqueIds.indexOf(protocol.id)
  const intensityIndex = goal.intensityPreference.indexOf(protocol.intensity)
  const durationDelta = Math.abs(estimatedDuration - windowOption.targetSeconds)
  const reasons: string[] = []
  let score = evidenceScore[protocol.evidenceLevel]

  if (goal.categories.includes(protocol.category)) {
    score += protocol.category === goal.id ? 48 : 30
    reasons.push(`${protocol.category} fit`)
  }

  if (preferredIndex >= 0) {
    score += 34 - preferredIndex * 6
    reasons.push('goal match')
  }

  if (intensityIndex >= 0) {
    score += 18 - intensityIndex * 5
  }

  score -= durationDelta / 12

  if (durationDelta <= 45) {
    score += 10
    reasons.push('time matched')
  }

  if (protocol.evidenceLevel === 'strong') {
    reasons.push('strong evidence')
  } else if (protocol.evidenceLevel === 'promising') {
    reasons.push('promising evidence')
  }

  if (query.isNewUser) {
    if (protocol.intensity === 'gentle') score += 16
    if (protocol.intensity === 'advanced' && goal.id !== 'performance') score -= 40
  }

  if (query.dailyGoalMet) {
    if (protocol.intensity === 'gentle') score += 8
    if (protocol.intensity === 'advanced' && goal.id !== 'performance') score -= 12
  }

  if (query.currentHour !== undefined && (query.currentHour >= 21 || query.currentHour < 5)) {
    if (protocol.category === 'sleep') score += 10
    if (protocol.id === TECHNIQUE_IDS.POWER_BREATHING) score -= 24
  }

  if (protocol.safetyChecklist?.length && goal.id !== 'performance') {
    score -= 44
  }

  const visibleReasons = protocol.safetyChecklist?.length
    ? ['safety gated', ...reasons.filter((reason) => reason !== 'safety gated')]
    : reasons

  return {
    protocol,
    rounds,
    estimatedDuration,
    score,
    reasons: visibleReasons.slice(0, 3),
  }
}

export function getProtocolRecommendation(
  query: ProtocolRecommendationQuery
): ProtocolRecommendation {
  const goal = getGoalOption(query.goal)
  const windowOption = getWindowOption(query.sessionWindow)
  const ranked = getProtocolCatalog()
    .map((protocol) => scoreProtocol(protocol, goal, windowOption, query))
    .sort((a, b) => b.score - a.score)

  return {
    primary: ranked[0],
    alternatives: ranked.slice(1, 3),
  }
}

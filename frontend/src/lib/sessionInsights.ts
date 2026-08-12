import { calculateSessionDuration, getProtocol, type ProtocolCategory } from './breathingProtocols'
import { TECHNIQUE_IDS, type TechniqueId } from './constants'

export interface SessionInsightInput {
  techniqueId: TechniqueId
  rounds: number
  durationSeconds: number
  holdTimes: number[]
  isNewPersonalBest: boolean
  newBadgeCount: number
}

export interface SessionInsight {
  effectLabel: string
  effectDescription: string
  score: number
  scoreLabel: string
  doseLabel: string
  nextStep: string
}

const CATEGORY_EFFECTS: Record<ProtocolCategory, Pick<SessionInsight, 'effectLabel' | 'effectDescription' | 'nextStep'>> = {
  calm: {
    effectLabel: 'Slower breathing',
    effectDescription: 'Slow breathing and longer exhales lower respiratory rate.',
    nextStep: 'Check jaw, shoulders, and breath rate before you stand.',
  },
  sleep: {
    effectLabel: 'Sleep prep',
    effectDescription: 'Long cycles with a hold and a longer exhale. Used before bed.',
    nextStep: 'Keep lights low. Wait a few minutes before another screen.',
  },
  focus: {
    effectLabel: 'Focus',
    effectDescription: 'A fixed cadence gives attention a timing target.',
    nextStep: 'Pick one next task. Keep the same pace for the first minute.',
  },
  recovery: {
    effectLabel: 'Recovery',
    effectDescription: 'A paced exhale slows the respiratory cycle.',
    nextStep: 'Stand up slowly. Keep the next minute of breathing quiet.',
  },
  performance: {
    effectLabel: 'Activation',
    effectDescription: 'Higher-intensity work around arousal and air hunger.',
    nextStep: 'Nasal breathing for a minute before another advanced set.',
  },
}

const TECHNIQUE_EFFECTS: Partial<Record<TechniqueId, Pick<SessionInsight, 'effectLabel' | 'effectDescription' | 'nextStep'>>> = {
  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    effectLabel: 'CO2 tolerance exposure',
    effectDescription: 'Progressive holds practice staying composed as the urge to breathe rises.',
    nextStep: 'Take at least a minute of relaxed nasal breathing before another hold set.',
  },
  [TECHNIQUE_IDS.POWER_BREATHING]: {
    effectLabel: 'Activation set',
    effectDescription: 'Fast cycles raise alertness. Not for quieting down.',
    nextStep: 'Stay seated until your breathing and balance feel completely normal.',
  },
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getDoseLabel(durationSeconds: number): string {
  if (durationSeconds >= 480) return 'Long'
  if (durationSeconds >= 300) return 'Full protocol'
  if (durationSeconds >= 120) return 'Short'
  return 'Brief'
}

function getScoreLabel(score: number): string {
  if (score >= 92) return 'High'
  if (score >= 82) return 'Strong'
  if (score >= 70) return 'Steady'
  return 'Started'
}

export function buildSessionInsight(input: SessionInsightInput): SessionInsight {
  const protocol = getProtocol(input.techniqueId)
  const defaultDuration = calculateSessionDuration({
    techniqueId: input.techniqueId,
    rounds: protocol.defaultRounds,
  })
  const fullDoseTarget = Math.min(Math.max(defaultDuration, 120), 300)
  const doseRatio = clamp(input.durationSeconds / fullDoseTarget, 0, 1)
  const holdBonus = input.holdTimes.length > 0 ? 3 : 0
  const score = clamp(
    Math.round(
      54 +
      doseRatio * 30 +
      (input.rounds >= protocol.defaultRounds ? 6 : 0) +
      holdBonus +
      (input.isNewPersonalBest ? 4 : 0) +
      Math.min(input.newBadgeCount, 2) * 3
    ),
    0,
    100
  )
  const effect = TECHNIQUE_EFFECTS[input.techniqueId] ?? CATEGORY_EFFECTS[protocol.category]

  return {
    ...effect,
    score,
    scoreLabel: getScoreLabel(score),
    doseLabel: getDoseLabel(input.durationSeconds),
  }
}

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
    effectLabel: 'Downshift signal',
    effectDescription: 'Slow breathing and longer exhales give the nervous system a repeatable cue to settle.',
    nextStep: 'Check your jaw, shoulders, and breath rate before moving back into the day.',
  },
  sleep: {
    effectLabel: 'Sleep runway',
    effectDescription: 'Long cycles and gentle retention create a deliberate off-ramp for late-night rumination.',
    nextStep: 'Keep lights low and give yourself a few quiet minutes before reaching for another screen.',
  },
  focus: {
    effectLabel: 'Pressure reset',
    effectDescription: 'A structured cadence gives attention a stable timing target under stress.',
    nextStep: 'Choose one next task and let this rhythm carry into the first minute of work.',
  },
  recovery: {
    effectLabel: 'Ventilation ease',
    effectDescription: 'A paced outflow can slow the respiratory cycle and support steadier recovery breathing.',
    nextStep: 'Stand up slowly and keep the next minute of breathing quiet and easy.',
  },
  performance: {
    effectLabel: 'Composure training',
    effectDescription: 'Higher-intensity breathwork trains attention around arousal, air hunger, and activation.',
    nextStep: 'Return to nasal breathing for a minute before starting another advanced set.',
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
    effectDescription: 'Fast cycles are designed for alertness and high-energy preparation, not quiet downshifting.',
    nextStep: 'Stay seated until your breathing and balance feel completely normal.',
  },
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getDoseLabel(durationSeconds: number): string {
  if (durationSeconds >= 480) return 'Deep protocol'
  if (durationSeconds >= 300) return 'Full protocol'
  if (durationSeconds >= 120) return 'Focused set'
  return 'Primer'
}

function getScoreLabel(score: number): string {
  if (score >= 92) return 'Exceptional'
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

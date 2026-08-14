import { TECHNIQUE_IDS } from '@/lib/constants'
import type { BreathingProtocol, ProtocolCategory } from '../protocols/types'

export type InsightLabel = 'High' | 'Strong' | 'Steady' | 'Started'
export type DoseLabel = 'Brief' | 'Short' | 'Full' | 'Long'

export interface SessionInsight {
  /** What this session likely did, by category (CO2/Power override). */
  effect: string
  /** 0–100 composite of dose, completion, holds, PB, and badges. */
  score: number
  label: InsightLabel
  doseLabel: DoseLabel
  /** One next-step coaching line. */
  nextStep: string
}

export interface InsightInput {
  protocol: BreathingProtocol
  rounds: number
  durationSeconds: number
  holdTimes: readonly number[]
  isPersonalBest: boolean
  newBadgeCount: number
}

const CATEGORY_EFFECTS: Record<ProtocolCategory, string> = {
  calm: 'Long, slow exhales like these nudge the nervous system toward its rest state.',
  focus: 'Even-count breathing steadies attention — the count itself clears mental noise.',
  sleep: 'The exhale-heavy pattern lowers arousal, easing the handoff into sleep.',
  performance: 'This was a training stimulus, not relaxation — treat it like a workout.',
  recovery: 'Slow pursed-lip exhales help the breath settle back to an easy rhythm.',
}

const EFFECT_OVERRIDES: Partial<Record<string, string>> = {
  [TECHNIQUE_IDS.CO2_TOLERANCE]:
    'You trained tolerance to air hunger — the urge to breathe should arrive a little later each week.',
  [TECHNIQUE_IDS.POWER_BREATHING]:
    'You deliberately raised arousal. Expect alertness now and a dip as it wears off.',
}

const NEXT_STEP_OVERRIDES: Partial<Record<string, string>> = {
  [TECHNIQUE_IDS.CO2_TOLERANCE]: 'Return to gentle nasal breathing and skip further holds today.',
  [TECHNIQUE_IDS.POWER_BREATHING]: 'Stay seated for a minute and let your breathing settle before standing.',
}

const CATEGORY_NEXT_STEPS: Record<ProtocolCategory, string> = {
  calm: 'Same time tomorrow — consistency is what compounds.',
  focus: 'Start the task now, while attention is primed.',
  sleep: 'Keep the lights low and head to bed while the calm holds.',
  performance: 'Balance training days with one gentle session.',
  recovery: 'Ease back into your day and keep the breath nasal.',
}

export function getDoseLabel(durationSeconds: number): DoseLabel {
  if (durationSeconds < 120) return 'Brief'
  if (durationSeconds < 240) return 'Short'
  if (durationSeconds < 420) return 'Full'
  return 'Long'
}

function getDosePoints(durationSeconds: number): number {
  // Full credit inside the ~2–5 minute effective-dose window.
  if (durationSeconds >= 120 && durationSeconds <= 300) return 40
  if (durationSeconds < 120) {
    return Math.max(0, Math.round((40 * (durationSeconds - 30)) / 90))
  }
  return Math.max(0, Math.round(40 * (1 - (durationSeconds - 300) / 600)))
}

export function getInsightLabel(score: number): InsightLabel {
  if (score >= 85) return 'High'
  if (score >= 65) return 'Strong'
  if (score >= 40) return 'Steady'
  return 'Started'
}

export function buildSessionInsight(input: InsightInput): SessionInsight {
  const { protocol, rounds, durationSeconds, holdTimes, isPersonalBest, newBadgeCount } = input

  let score = getDosePoints(durationSeconds)
  if (rounds >= protocol.defaultRounds) score += 25
  if (holdTimes.length > 0) score += 10
  if (isPersonalBest) score += 15
  if (newBadgeCount > 0) score += 10
  score = Math.max(0, Math.min(100, score))

  return {
    effect: EFFECT_OVERRIDES[protocol.id] ?? CATEGORY_EFFECTS[protocol.category],
    score,
    label: getInsightLabel(score),
    doseLabel: getDoseLabel(durationSeconds),
    nextStep: NEXT_STEP_OVERRIDES[protocol.id] ?? CATEGORY_NEXT_STEPS[protocol.category],
  }
}

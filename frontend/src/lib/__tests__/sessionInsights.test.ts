// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { TECHNIQUE_IDS } from '@/lib/constants'
import { buildSessionInsight } from '../sessionInsights'

describe('buildSessionInsight', () => {
  it('returns technique-specific guidance for CO2 tolerance sessions', () => {
    const insight = buildSessionInsight({
      techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE,
      rounds: 8,
      durationSeconds: 388,
      holdTimes: [15, 20, 25, 30],
      isNewPersonalBest: true,
      newBadgeCount: 1,
    })

    expect(insight.effectLabel).toBe('CO2 tolerance exposure')
    expect(insight.doseLabel).toBe('Full protocol')
    expect(insight.score).toBeGreaterThanOrEqual(90)
    expect(insight.nextStep).toMatch(/nasal breathing/i)
  })

  it('labels short sessions as primers without overstating the dose', () => {
    const insight = buildSessionInsight({
      techniqueId: TECHNIQUE_IDS.RESONANCE_BREATHING,
      rounds: 3,
      durationSeconds: 30,
      holdTimes: [],
      isNewPersonalBest: false,
      newBadgeCount: 0,
    })

    expect(insight.doseLabel).toBe('Primer')
    expect(insight.scoreLabel).toBe('Started')
    expect(insight.effectLabel).toBe('Downshift signal')
  })

  it('returns sleep-specific next steps for sleep protocols', () => {
    const insight = buildSessionInsight({
      techniqueId: TECHNIQUE_IDS.FOUR_SEVEN_EIGHT,
      rounds: 16,
      durationSeconds: 304,
      holdTimes: [7, 7, 7],
      isNewPersonalBest: false,
      newBadgeCount: 0,
    })

    expect(insight.effectLabel).toBe('Sleep runway')
    expect(insight.nextStep).toMatch(/lights low/i)
  })
})

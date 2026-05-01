// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { TECHNIQUE_IDS } from '@/lib/constants'
import {
  buildProtocolSessionPath,
  getDefaultProtocolGoal,
  getProtocolRecommendation,
  getRecommendedRounds,
} from '../protocolRecommendations'
import { breathingProtocols, calculateSessionDuration } from '../breathingProtocols'

describe('protocolRecommendations', () => {
  it('chooses sensible default goals by time of day', () => {
    expect(getDefaultProtocolGoal(4)).toBe('sleep')
    expect(getDefaultProtocolGoal(8)).toBe('focus')
    expect(getDefaultProtocolGoal(15)).toBe('calm')
    expect(getDefaultProtocolGoal(22)).toBe('sleep')
  })

  it('recommends a gentle evidence-backed protocol for a new calm user', () => {
    const recommendation = getProtocolRecommendation({
      goal: 'calm',
      sessionWindow: 'standard',
      isNewUser: true,
      currentHour: 14,
    })

    expect(recommendation.primary.protocol.id).toBe(TECHNIQUE_IDS.CYCLIC_SIGHING)
    expect(recommendation.primary.protocol.intensity).toBe('gentle')
    expect(recommendation.primary.protocol.safetyChecklist).toBeUndefined()
    expect(recommendation.primary.estimatedDuration).toBe(300)
  })

  it('surfaces safety-gated performance training when performance is selected', () => {
    const recommendation = getProtocolRecommendation({
      goal: 'performance',
      sessionWindow: 'standard',
      currentHour: 14,
    })

    expect(recommendation.primary.protocol.id).toBe(TECHNIQUE_IDS.CO2_TOLERANCE)
    expect(recommendation.primary.protocol.safetyChecklist?.length).toBeGreaterThan(0)
    expect(recommendation.primary.reasons).toContain('safety gated')
  })

  it('keeps advanced recommendations within safe catalog defaults', () => {
    const power = breathingProtocols[TECHNIQUE_IDS.POWER_BREATHING]
    const co2 = breathingProtocols[TECHNIQUE_IDS.CO2_TOLERANCE]
    const recovery = breathingProtocols[TECHNIQUE_IDS.PURSED_LIP_RECOVERY]

    expect(getRecommendedRounds(power, 480)).toBe(power.defaultRounds)
    expect(getRecommendedRounds(co2, 480)).toBe(co2.defaultRounds)
    expect(getRecommendedRounds(recovery, 300)).toBe(recovery.defaultRounds)
    expect(calculateSessionDuration({ techniqueId: co2.id, rounds: co2.defaultRounds })).toBe(388)
  })

  it('routes around advanced protocols when a recovery window is active', () => {
    const recommendation = getProtocolRecommendation({
      goal: 'performance',
      sessionWindow: 'standard',
      currentHour: 14,
      blockedTechniqueIds: [
        TECHNIQUE_IDS.CO2_TOLERANCE,
        TECHNIQUE_IDS.POWER_BREATHING,
      ],
    })

    expect(recommendation.primary.protocol.id).toBe(TECHNIQUE_IDS.BOX_BREATHING)
    expect(recommendation.primary.protocol.safetyChecklist).toBeUndefined()
    expect(recommendation.primary.reasons).not.toContain('recovery window')
  })

  it('builds bounded session setup links with round counts', () => {
    expect(buildProtocolSessionPath(TECHNIQUE_IDS.RESONANCE_BREATHING, 12)).toBe(
      '/breathwork/session?technique=resonance_breathing&rounds=12'
    )
    expect(buildProtocolSessionPath(TECHNIQUE_IDS.RESONANCE_BREATHING, 90)).toBe(
      '/breathwork/session?technique=resonance_breathing&rounds=40'
    )
    expect(buildProtocolSessionPath(TECHNIQUE_IDS.PURSED_LIP_RECOVERY, 90)).toBe(
      '/breathwork/session?technique=pursed_lip_recovery&rounds=50'
    )
  })
})

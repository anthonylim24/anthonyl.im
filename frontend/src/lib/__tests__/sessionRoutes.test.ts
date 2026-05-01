// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { BREATH_PHASES, TECHNIQUE_IDS } from '@/lib/constants'
import { buildSessionRoutePath, parseCustomPhaseDurations } from '../sessionRoutes'

describe('sessionRoutes', () => {
  it('builds session setup paths with technique and rounds', () => {
    expect(
      buildSessionRoutePath({
        techniqueId: TECHNIQUE_IDS.RESONANCE_BREATHING,
        rounds: 12,
      })
    ).toBe('/breathwork/session?technique=resonance_breathing&rounds=12')
  })

  it('serializes custom phase durations into stable query parameters', () => {
    expect(
      buildSessionRoutePath({
        techniqueId: TECHNIQUE_IDS.RESONANCE_BREATHING,
        rounds: 12,
        customPhaseDurations: {
          [BREATH_PHASES.INHALE]: 6,
          [BREATH_PHASES.EXHALE]: 7,
        },
      })
    ).toBe(
      '/breathwork/session?technique=resonance_breathing&rounds=12&phase_inhale=6&phase_exhale=7'
    )
  })

  it('parses and clamps custom phase durations from replay links', () => {
    const customDurations = parseCustomPhaseDurations(
      new URLSearchParams('phase_inhale=30&phase_exhale=0&phase_hold_in=29.6&phase_rest=nope')
    )

    expect(customDurations).toEqual({
      [BREATH_PHASES.INHALE]: 12,
      [BREATH_PHASES.HOLD_IN]: 30,
    })
  })
})

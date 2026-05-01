// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getPhaseCoachCue } from '../phaseCoaching'
import { BREATH_PHASES, TECHNIQUE_IDS } from '@/lib/constants'

describe('getPhaseCoachCue', () => {
  it('returns a ready cue before a session phase exists', () => {
    expect(getPhaseCoachCue(TECHNIQUE_IDS.BOX_BREATHING, null)).toMatch(/stable position/i)
  })

  it('returns technique-specific cues when available', () => {
    expect(
      getPhaseCoachCue(TECHNIQUE_IDS.DIAPHRAGMATIC_BREATHING, BREATH_PHASES.INHALE)
    ).toMatch(/belly soften outward/i)
  })

  it('falls back to default phase cues', () => {
    expect(
      getPhaseCoachCue(TECHNIQUE_IDS.PURSED_LIP_RECOVERY, BREATH_PHASES.HOLD_OUT)
    ).toMatch(/bottom without bracing/i)
  })
})

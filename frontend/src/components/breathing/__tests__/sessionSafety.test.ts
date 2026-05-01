// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getActiveSessionSafetyCue } from '../sessionSafety'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS } from '@/lib/constants'

describe('getActiveSessionSafetyCue', () => {
  it('returns null for gentle protocols without safety gates', () => {
    expect(
      getActiveSessionSafetyCue(breathingProtocols[TECHNIQUE_IDS.RESONANCE_BREATHING])
    ).toBeNull()
  })

  it('returns protocol-specific active reminders for safety-gated protocols', () => {
    expect(
      getActiveSessionSafetyCue(breathingProtocols[TECHNIQUE_IDS.CO2_TOLERANCE])
    ).toMatch(/stop before strain/i)
    expect(
      getActiveSessionSafetyCue(breathingProtocols[TECHNIQUE_IDS.POWER_BREATHING])
    ).toMatch(/stop if lightheaded/i)
  })
})

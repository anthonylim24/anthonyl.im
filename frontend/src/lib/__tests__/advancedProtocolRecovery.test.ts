// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { TECHNIQUE_IDS } from '@/lib/constants'
import type { CompletedSession } from '@/stores/historyStore'
import {
  ADVANCED_PROTOCOL_RECOVERY_SECONDS,
  getAdvancedProtocolRecoveryStatus,
  isAdvancedBreathingProtocol,
} from '../advancedProtocolRecovery'

function session(
  techniqueId: CompletedSession['techniqueId'],
  date: string,
): CompletedSession {
  return {
    id: `${techniqueId}-${date}`,
    techniqueId,
    date,
    durationSeconds: 120,
    rounds: 1,
    holdTimes: [],
    maxHoldTime: 0,
    avgHoldTime: 0,
  }
}

describe('advancedProtocolRecovery', () => {
  it('classifies safety-gated protocols as advanced', () => {
    expect(isAdvancedBreathingProtocol(TECHNIQUE_IDS.CO2_TOLERANCE)).toBe(true)
    expect(isAdvancedBreathingProtocol(TECHNIQUE_IDS.POWER_BREATHING)).toBe(true)
    expect(isAdvancedBreathingProtocol(TECHNIQUE_IDS.RESONANCE_BREATHING)).toBe(false)
  })

  it('does not apply recovery windows to gentle protocol setup', () => {
    const now = new Date('2026-05-01T10:00:00.000Z')
    const status = getAdvancedProtocolRecoveryStatus(
      [
        session(
          TECHNIQUE_IDS.POWER_BREATHING,
          '2026-05-01T09:59:30.000Z',
        ),
      ],
      TECHNIQUE_IDS.RESONANCE_BREATHING,
      now,
    )

    expect(status).toEqual({
      isActive: false,
      remainingSeconds: 0,
      lastProtocolName: null,
    })
  })

  it('returns the remaining recovery time after a recent advanced session', () => {
    const now = new Date('2026-05-01T10:00:00.000Z')
    const status = getAdvancedProtocolRecoveryStatus(
      [
        session(TECHNIQUE_IDS.BOX_BREATHING, '2026-05-01T09:59:45.000Z'),
        session(TECHNIQUE_IDS.POWER_BREATHING, '2026-05-01T09:59:30.000Z'),
        session(TECHNIQUE_IDS.CO2_TOLERANCE, '2026-05-01T09:55:00.000Z'),
      ],
      TECHNIQUE_IDS.CO2_TOLERANCE,
      now,
    )

    expect(status).toEqual({
      isActive: true,
      remainingSeconds: ADVANCED_PROTOCOL_RECOVERY_SECONDS - 30,
      lastProtocolName: 'Power Breathing',
    })
  })

  it('ignores stale, future, and invalid session dates', () => {
    const now = new Date('2026-05-01T10:00:00.000Z')
    const status = getAdvancedProtocolRecoveryStatus(
      [
        session(TECHNIQUE_IDS.CO2_TOLERANCE, 'invalid'),
        session(TECHNIQUE_IDS.POWER_BREATHING, '2026-05-01T10:00:30.000Z'),
        session(TECHNIQUE_IDS.CO2_TOLERANCE, '2026-05-01T09:57:00.000Z'),
      ],
      TECHNIQUE_IDS.POWER_BREATHING,
      now,
    )

    expect(status).toEqual({
      isActive: false,
      remainingSeconds: 0,
      lastProtocolName: null,
    })
  })
})

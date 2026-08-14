import { describe, expect, it } from 'vitest'
import type { CompletedSession } from '@/stores/historyStore'
import { ADVANCED_RECOVERY_SECONDS, getRecoveryStatus, isBlockedByRecovery } from '../recovery'

function makeSession(overrides: Partial<CompletedSession> = {}): CompletedSession {
  return {
    id: crypto.randomUUID(),
    techniqueId: 'co2_tolerance',
    date: '2026-08-14T12:00:00.000Z',
    durationSeconds: 388,
    rounds: 8,
    holdTimes: [15, 20],
    maxHoldTime: 20,
    avgHoldTime: 17.5,
    ...overrides,
  }
}

describe('advanced recovery window', () => {
  const completedAt = new Date('2026-08-14T12:00:00.000Z')
  const secondsLater = (s: number) => new Date(completedAt.getTime() + s * 1000)

  it('is 90 seconds', () => {
    expect(ADVANCED_RECOVERY_SECONDS).toBe(90)
  })

  it('activates right after a completed advanced session and counts down', () => {
    const sessions = [makeSession()]
    const at10 = getRecoveryStatus(sessions, secondsLater(10))
    expect(at10.isActive).toBe(true)
    expect(at10.remainingSeconds).toBe(80)
    expect(at10.sinceProtocolName).toBe('CO2 Tolerance Table')
  })

  it('expires at exactly 90 seconds', () => {
    const sessions = [makeSession()]
    expect(getRecoveryStatus(sessions, secondsLater(89)).isActive).toBe(true)
    expect(getRecoveryStatus(sessions, secondsLater(90)).isActive).toBe(false)
  })

  it('ignores non-advanced sessions entirely', () => {
    const sessions = [makeSession({ techniqueId: 'box_breathing' })]
    expect(getRecoveryStatus(sessions, secondsLater(5)).isActive).toBe(false)
  })

  it('uses the latest advanced session', () => {
    const sessions = [
      makeSession({ date: '2026-08-14T11:00:00.000Z' }),
      makeSession({ techniqueId: 'power_breathing', date: '2026-08-14T12:00:00.000Z' }),
    ]
    const status = getRecoveryStatus(sessions, secondsLater(30))
    expect(status.isActive).toBe(true)
    expect(status.sinceProtocolName).toBe('Power Breathing')
  })

  it('blocks only advanced techniques while active', () => {
    const active = getRecoveryStatus([makeSession()], secondsLater(5))
    expect(isBlockedByRecovery('power_breathing', active)).toBe(true)
    expect(isBlockedByRecovery('co2_tolerance', active)).toBe(true)
    expect(isBlockedByRecovery('cyclic_sighing', active)).toBe(false)

    const inactive = getRecoveryStatus([makeSession()], secondsLater(200))
    expect(isBlockedByRecovery('power_breathing', inactive)).toBe(false)
  })
})

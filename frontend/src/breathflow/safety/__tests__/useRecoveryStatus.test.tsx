import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useHistoryStore } from '@/stores/historyStore'
import { useRecoveryStatus } from '../useRecoveryStatus'

describe('useRecoveryStatus', () => {
  beforeEach(() => {
    localStorage.clear()
    useHistoryStore.getState().clearHistory()
  })

  it('activates when an advanced session is appended after an idle mount', () => {
    const { result } = renderHook(() => useRecoveryStatus())
    expect(result.current.isActive).toBe(false)

    act(() => {
      useHistoryStore.getState().addSession({
        techniqueId: 'co2_tolerance',
        date: new Date().toISOString(),
        durationSeconds: 383,
        rounds: 8,
        holdTimes: [15, 20],
        maxHoldTime: 20,
        avgHoldTime: 17.5,
      })
    })

    expect(result.current.isActive).toBe(true)
    expect(result.current.sinceProtocolName).toBe('CO2 Tolerance Table')
    expect(result.current.remainingSeconds).toBeGreaterThan(0)
  })
})

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getProtocol } from '../../protocols/catalog'
import { useSessionEngine } from '../useSessionEngine'

describe('useSessionEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const config = { protocol: getProtocol('box_breathing'), rounds: 1 }

  it('is idle until started', () => {
    const { result } = renderHook(() => useSessionEngine(config))
    expect(result.current.status).toBe('idle')

    act(() => result.current.start())
    expect(result.current.status).toBe('running')
    expect(result.current.roundNumber).toBe(1)
    expect(result.current.phase).toBe('inhale')
    expect(result.current.secondsLeftInPhase).toBe(4)
  })

  it('counts down at 1 Hz and advances phases', () => {
    const { result } = renderHook(() => useSessionEngine(config))
    act(() => result.current.start())

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.secondsLeftInPhase).toBe(3)

    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.phase).toBe('hold_in')
  })

  it('pause freezes the clock; resume continues; hold capture is pause-aware', () => {
    const { result } = renderHook(() => useSessionEngine(config))
    act(() => result.current.start())
    act(() => vi.advanceTimersByTime(5000)) // 1s into hold_in

    act(() => result.current.pause())
    act(() => vi.advanceTimersByTime(10_000))
    expect(result.current.status).toBe('paused')
    expect(result.current.phase).toBe('hold_in')
    expect(result.current.secondsLeftInPhase).toBe(3)

    act(() => result.current.resume())
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.phase).toBe('exhale')
    expect(result.current.holdTimes).toEqual([4]) // actual held seconds, not wall clock
  })

  it('stop discards the session back to idle', () => {
    const events: string[] = []
    const { result } = renderHook(() => useSessionEngine(config, (e) => events.push(e.type)))
    act(() => result.current.start())
    act(() => vi.advanceTimersByTime(6000))

    act(() => result.current.stop())
    expect(result.current.status).toBe('idle')
    expect(result.current.holdTimes).toEqual([])
    expect(events).toContain('stop')
    expect(events).not.toContain('complete')
  })

  it('restart returns to round 1 phase 1 running', () => {
    const { result } = renderHook(() => useSessionEngine(config))
    act(() => result.current.start())
    act(() => vi.advanceTimersByTime(9000))
    expect(result.current.phase).toBe('exhale')

    act(() => result.current.restart())
    expect(result.current.status).toBe('running')
    expect(result.current.phase).toBe('inhale')
    expect(result.current.secondsLeftInPhase).toBe(4)
    expect(result.current.holdTimes).toEqual([])
  })

  it('completes after the final round and emits complete exactly once', () => {
    const events: string[] = []
    const { result } = renderHook(() => useSessionEngine(config, (e) => events.push(e.type)))
    act(() => result.current.start())
    act(() => vi.advanceTimersByTime(16_000))

    expect(result.current.status).toBe('complete')
    expect(events.filter((type) => type === 'complete')).toHaveLength(1)

    // Clock stops after complete.
    act(() => vi.advanceTimersByTime(10_000))
    expect(events.filter((type) => type === 'complete')).toHaveLength(1)
  })
})

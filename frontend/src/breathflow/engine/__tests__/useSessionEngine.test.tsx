import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getProtocol } from '../../protocols/catalog'
import type { CompletionResult } from '../../session/completeSession'
import type { Completion, Saved, SessionEvent } from '../sessionMachine'
import { useSessionEngine, type OutputEffect } from '../useSessionEngine'

const config = { protocol: getProtocol('box_breathing'), rounds: 1 }

function setup(rounds = 1) {
  const performed: OutputEffect[] = []
  const persisted: Completion[] = []
  const persist = (completion: Completion): Saved => {
    persisted.push(completion)
    const result = { session: { id: 'x', rounds: completion.roundsCompleted }, plannedRounds: completion.plannedRounds, xpEarned: 1, newBadgeIds: [], isPersonalBest: false, streak: 1 }
    return { result: result as unknown as CompletionResult, journey: null }
  }
  const hook = renderHook(() => useSessionEngine({ ...config, rounds }, { perform: (effect) => performed.push(effect), persist }))
  const send = (event: SessionEvent) => act(() => hook.result.current.send(event))
  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
  const startBreathing = () => {
    send({ type: 'START' })
    advance(3000)
  }
  return { hook, performed, persisted, send, advance, startBreathing }
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

describe('useSessionEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    setVisibility('visible')
    vi.useRealTimers()
  })

  it('starts in setup and breathes after a three-second lead-in', () => {
    const { hook, send, advance } = setup()
    expect(hook.result.current.session.tag).toBe('setup')

    send({ type: 'START' })
    expect(hook.result.current.session).toMatchObject({ tag: 'leadIn', secondsLeft: 3 })
    advance(2000)
    expect(hook.result.current.session).toMatchObject({ tag: 'leadIn', secondsLeft: 1 })
    advance(1000)
    expect(hook.result.current.session).toMatchObject({ tag: 'running', cursor: { phaseIndex: 0, secondsLeftInPhase: 4 } })
  })

  it('ticks at 1 Hz and voices each phase change', () => {
    const { hook, performed, startBreathing, advance } = setup()
    startBreathing()
    performed.length = 0

    advance(1000)
    expect(hook.result.current.session).toMatchObject({ cursor: { secondsLeftInPhase: 3 } })
    advance(3000)
    expect(hook.result.current.session).toMatchObject({ cursor: { phaseIndex: 1 } })
    expect(performed.filter((effect) => effect.type === 'cue')).toEqual([{ type: 'cue', kind: 'hold_in' }])
  })

  it('pause freezes the clock and resume continues; holds count breathed seconds only', () => {
    const { hook, send, advance, startBreathing } = setup()
    startBreathing()
    advance(5000) // 1 s into hold_in
    send({ type: 'PAUSE', now: performance.now() })
    advance(10_000)
    expect(hook.result.current.session).toMatchObject({ tag: 'paused', cursor: { phaseIndex: 1, secondsLeftInPhase: 3 } })

    send({ type: 'RESUME', now: performance.now() })
    advance(3000)
    expect(hook.result.current.session).toMatchObject({ tag: 'running', cursor: { phaseIndex: 2, holdTimes: [4] } })
  })

  it('persists exactly once when the last second ends, then stops the clock', () => {
    const { hook, persisted, startBreathing, advance } = setup()
    startBreathing()
    advance(16_000)
    expect(hook.result.current.session.tag).toBe('summary')
    expect(persisted).toEqual([{ roundsCompleted: 1, plannedRounds: 1, holdTimes: [4, 4] }])

    advance(30_000)
    expect(persisted).toHaveLength(1)
  })

  it('a page hidden past the grace window pauses instead of finishing unseen', () => {
    const { hook, persisted, performed, startBreathing, advance } = setup()
    startBreathing()
    advance(1000)
    performed.length = 0

    setVisibility('hidden')
    advance(60_000)
    expect(hook.result.current.session).toMatchObject({ tag: 'paused', reason: 'background' })
    expect(persisted).toEqual([])
    // At most one phase change could happen inside the grace window, and the pause itself is silent.
    expect(performed.filter((effect) => effect.type === 'cue').length).toBeLessThanOrEqual(1)

    setVisibility('visible')
    expect(performed[performed.length - 1]).toMatchObject({ type: 'announce', text: expect.stringMatching(/^Welcome back/) })
  })

  it('a page frozen in the background (no timers at all) pauses on return', () => {
    const { hook, send, startBreathing } = setup(3)
    startBreathing()
    const hiddenAt = performance.now()
    send({ type: 'HIDDEN', now: hiddenAt })
    send({ type: 'VISIBLE', now: hiddenAt + 10 * 60_000 })
    expect(hook.result.current.session).toMatchObject({ tag: 'paused', reason: 'background', cursor: { roundIndex: 0 } })
  })
})

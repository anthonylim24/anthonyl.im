import { describe, expect, it } from 'vitest'
import { getProtocol } from '../../protocols/catalog'
import {
  advanceOneSecond,
  createIdleState,
  createRunningState,
  getCurrentPhase,
  getCurrentPhaseSeconds,
  type EngineConfig,
  type EngineEvent,
  type EngineState,
} from '../sessionEngine'

function runSeconds(config: EngineConfig, state: EngineState, seconds: number) {
  const events: EngineEvent[] = []
  let current = state
  for (let i = 0; i < seconds; i++) {
    const result = advanceOneSecond(config, current)
    current = result.state
    events.push(...result.events)
  }
  return { state: current, events }
}

describe('session engine state machine', () => {
  const box: EngineConfig = { protocol: getProtocol('box_breathing'), rounds: 2 }

  it('starts at round 1 phase 1 with the phase duration loaded', () => {
    const state = createRunningState(box)
    expect(state.roundIndex).toBe(0)
    expect(state.phaseIndex).toBe(0)
    expect(getCurrentPhase(box, state)).toBe('inhale')
    expect(state.secondsLeftInPhase).toBe(4)
  })

  it('does not advance unless running', () => {
    const idle = createIdleState()
    expect(advanceOneSecond(box, idle).state).toBe(idle)
    const paused = { ...createRunningState(box), status: 'paused' as const }
    expect(advanceOneSecond(box, paused).state).toBe(paused)
  })

  it('advances phases at 1 Hz and emits one event per phase boundary', () => {
    const { state, events } = runSeconds(box, createRunningState(box), 4)
    expect(getCurrentPhase(box, state)).toBe('hold_in')
    expect(events).toEqual([{ type: 'phase', phase: 'hold_in', roundIndex: 0 }])
  })

  it('advances rounds after the last phase', () => {
    const { state } = runSeconds(box, createRunningState(box), 16)
    expect(state.roundIndex).toBe(1)
    expect(state.phaseIndex).toBe(0)
    expect(getCurrentPhase(box, state)).toBe('inhale')
  })

  it('records actual held seconds for each hold phase', () => {
    const { state } = runSeconds(box, createRunningState(box), 32)
    expect(state.status).toBe('complete')
    expect(state.holdTimes).toEqual([4, 4, 4, 4])
  })

  it('emits complete exactly once, after the final phase of the final round', () => {
    const { state, events } = runSeconds(box, createRunningState(box), 40)
    expect(state.status).toBe('complete')
    const completeEvents = events.filter((event) => event.type === 'complete')
    expect(completeEvents).toHaveLength(1)
    expect(completeEvents[0]).toEqual({ type: 'complete', holdTimes: [4, 4, 4, 4] })
  })

  it('applies the CO2 progressive hold ladder to countdown and hold capture', () => {
    const co2: EngineConfig = { protocol: getProtocol('co2_tolerance'), rounds: 3 }
    const total = (31) + (36) + (41) // rounds 0..2, each 3 + hold + 3 + 10
    const { state } = runSeconds(co2, createRunningState(co2), total)
    expect(state.status).toBe('complete')
    expect(state.holdTimes).toEqual([15, 20, 25])
  })

  it('honors custom phase durations, including a custom CO2 hold base', () => {
    const co2: EngineConfig = {
      protocol: getProtocol('co2_tolerance'),
      rounds: 2,
      customDurations: { hold_in: 10 },
    }
    const state = createRunningState(co2)
    expect(getCurrentPhaseSeconds(co2, state)).toBe(3)
    const total = (3 + 10 + 3 + 10) + (3 + 15 + 3 + 10)
    const finished = runSeconds(co2, state, total)
    expect(finished.state.status).toBe('complete')
    expect(finished.state.holdTimes).toEqual([10, 15])
  })

  it('protocols without holds finish with empty holdTimes', () => {
    const sighing: EngineConfig = { protocol: getProtocol('cyclic_sighing'), rounds: 2 }
    const { state } = runSeconds(sighing, createRunningState(sighing), 20)
    expect(state.status).toBe('complete')
    expect(state.holdTimes).toEqual([])
  })
})

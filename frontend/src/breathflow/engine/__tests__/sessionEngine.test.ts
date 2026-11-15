import { describe, expect, it } from 'vitest'
import { getProtocol } from '../../protocols/catalog'
import {
  advanceOneSecond,
  elapsedSessionSeconds,
  getCurrentPhase,
  getCurrentPhaseSeconds,
  restartPhase,
  startCursor,
  type Cursor,
  type EngineConfig,
  type Step,
} from '../sessionEngine'

/** Breathe `seconds`, stopping at completion. */
function runSeconds(config: EngineConfig, cursor: Cursor, seconds: number) {
  const boundaries: Step['boundary'][] = []
  let current = cursor
  for (let i = 0; i < seconds; i++) {
    const step = advanceOneSecond(config, current)
    current = step.cursor
    boundaries.push(step.boundary)
    if (step.boundary === 'complete') break
  }
  return { cursor: current, boundaries, complete: boundaries[boundaries.length - 1] === 'complete' }
}

describe('breath clock', () => {
  const box: EngineConfig = { protocol: getProtocol('box_breathing'), rounds: 2 }

  it('starts at round 1 phase 1 with the phase duration loaded', () => {
    const cursor = startCursor(box)
    expect(cursor.roundIndex).toBe(0)
    expect(cursor.phaseIndex).toBe(0)
    expect(getCurrentPhase(box, cursor)).toBe('inhale')
    expect(cursor.secondsLeftInPhase).toBe(4)
  })

  it('advances phases at 1 Hz and marks one boundary per phase change', () => {
    const { cursor, boundaries } = runSeconds(box, startCursor(box), 4)
    expect(getCurrentPhase(box, cursor)).toBe('hold_in')
    expect(boundaries).toEqual(['none', 'none', 'none', 'phase'])
  })

  it('advances rounds after the last phase', () => {
    const { cursor } = runSeconds(box, startCursor(box), 16)
    expect(cursor.roundIndex).toBe(1)
    expect(cursor.phaseIndex).toBe(0)
    expect(getCurrentPhase(box, cursor)).toBe('inhale')
  })

  it('records actual held seconds for each hold phase', () => {
    const { cursor, complete } = runSeconds(box, startCursor(box), 32)
    expect(complete).toBe(true)
    expect(cursor.holdTimes).toEqual([4, 4, 4, 4])
  })

  it('completes exactly at the end of the final phase of the final round', () => {
    expect(runSeconds(box, startCursor(box), 31).complete).toBe(false)
    const { boundaries } = runSeconds(box, startCursor(box), 40)
    expect(boundaries).toHaveLength(32)
    expect(boundaries.filter((b) => b === 'complete')).toHaveLength(1)
  })

  it('applies the CO2 progressive hold ladder to countdown and hold capture', () => {
    const co2: EngineConfig = { protocol: getProtocol('co2_tolerance'), rounds: 3 }
    const total = (31) + (36) + (41) // rounds 0..2, each 3 + hold + 3 + 10
    const { cursor, complete } = runSeconds(co2, startCursor(co2), total)
    expect(complete).toBe(true)
    expect(cursor.holdTimes).toEqual([15, 20, 25])
  })

  it('honors custom phase durations, including a custom CO2 hold base', () => {
    const co2: EngineConfig = {
      protocol: getProtocol('co2_tolerance'),
      rounds: 2,
      customDurations: { hold_in: 10 },
    }
    const cursor = startCursor(co2)
    expect(getCurrentPhaseSeconds(co2, cursor)).toBe(3)
    const total = (3 + 10 + 3 + 10) + (3 + 15 + 3 + 10)
    const finished = runSeconds(co2, cursor, total)
    expect(finished.complete).toBe(true)
    expect(finished.cursor.holdTimes).toEqual([10, 15])
  })

  it('protocols without holds finish with empty holdTimes', () => {
    const sighing: EngineConfig = { protocol: getProtocol('cyclic_sighing'), rounds: 2 }
    const { cursor, complete } = runSeconds(sighing, startCursor(sighing), 20)
    expect(complete).toBe(true)
    expect(cursor.holdTimes).toEqual([])
  })

  it('restartPhase rewinds the current phase and forgets its partial hold', () => {
    const { cursor } = runSeconds(box, startCursor(box), 6) // 2 s into hold_in
    expect(cursor.heldSecondsThisPhase).toBe(2)
    const rewound = restartPhase(box, cursor)
    expect(getCurrentPhase(box, rewound)).toBe('hold_in')
    expect(rewound.secondsLeftInPhase).toBe(4)
    expect(rewound.heldSecondsThisPhase).toBe(0)
    expect(elapsedSessionSeconds(box, rewound)).toBe(4)
  })

  it('counts elapsed seconds across rounds and stops at the planned total', () => {
    expect(elapsedSessionSeconds(box, runSeconds(box, startCursor(box), 18).cursor)).toBe(18)
    expect(elapsedSessionSeconds(box, runSeconds(box, startCursor(box), 32).cursor)).toBe(32)
  })
})

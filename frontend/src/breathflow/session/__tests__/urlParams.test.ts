import { describe, expect, it } from 'vitest'
import { buildRepeatParams, buildSessionPath, buildSessionSearch, parseSessionSearch } from '../urlParams'

describe('session URL params', () => {
  it('parses a full deep link', () => {
    const params = parseSessionSearch('technique=box_breathing&rounds=19&phase_inhale=5')
    expect(params.techniqueId).toBe('box_breathing')
    expect(params.rounds).toBe(19)
    expect(params.customDurations).toEqual({ inhale: 5 })
  })

  it('unknown technique falls back to Cyclic Sighing with its default rounds', () => {
    const params = parseSessionSearch('technique=juggling&rounds=abc')
    expect(params.techniqueId).toBe('cyclic_sighing')
    expect(params.rounds).toBe(30)
    expect(params.customDurations).toBeUndefined()
  })

  it('invalid rounds fall back to the protocol default; valid ones are clamped', () => {
    expect(parseSessionSearch('technique=box_breathing').rounds).toBe(19)
    expect(parseSessionSearch('technique=box_breathing&rounds=-3').rounds).toBe(19)
    expect(parseSessionSearch('technique=box_breathing&rounds=999').rounds).toBe(40)
  })

  it('clamps phase params and drops defaults and unknown phases', () => {
    const params = parseSessionSearch(
      'technique=box_breathing&rounds=10&phase_inhale=99&phase_hold_in=4&phase_rest=9',
    )
    expect(params.customDurations).toEqual({ inhale: 12 })
  })

  it('round-trips custom cadences (Repeat restores them)', () => {
    const search = buildSessionSearch({
      techniqueId: 'box_breathing',
      rounds: 10,
      customDurations: { inhale: 5, hold_in: 5, exhale: 5, hold_out: 5 },
    })
    expect(search).toBe(
      'technique=box_breathing&rounds=10&phase_inhale=5&phase_hold_in=5&phase_exhale=5&phase_hold_out=5',
    )
    const parsed = parseSessionSearch(search)
    expect(parsed).toEqual({
      techniqueId: 'box_breathing',
      rounds: 10,
      customDurations: { inhale: 5, hold_in: 5, exhale: 5, hold_out: 5 },
    })
  })

  it('builds repeat params from a saved history session', () => {
    const params = buildRepeatParams({
      techniqueId: 'box_breathing',
      rounds: 10,
      customPhaseDurations: { inhale: 5 },
    })
    expect(buildSessionPath(params)).toBe(
      '/breathwork/session?technique=box_breathing&rounds=10&phase_inhale=5',
    )
  })

  it('omits phase params when the cadence is default', () => {
    expect(buildSessionSearch({ techniqueId: 'cyclic_sighing', rounds: 30 }))
      .toBe('technique=cyclic_sighing&rounds=30')
  })
})

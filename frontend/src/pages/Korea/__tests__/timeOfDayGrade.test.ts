import { describe, it, expect } from 'vitest'
import { gradeKindAt, cssFilterFor, arrivalStartFilter, kstHour } from '../timeOfDayGrade'

describe('time-of-day grade', () => {
  it('maps hours to the right named kind', () => {
    expect(gradeKindAt(2)).toBe('night')
    expect(gradeKindAt(5)).toBe('dawn')
    expect(gradeKindAt(6.49)).toBe('dawn')
    expect(gradeKindAt(8)).toBe('morning')
    expect(gradeKindAt(12)).toBe('midday')
    expect(gradeKindAt(15.9)).toBe('midday')
    expect(gradeKindAt(17)).toBe('afternoon')
    expect(gradeKindAt(18.5)).toBe('dusk')
    expect(gradeKindAt(20)).toBe('evening')
    expect(gradeKindAt(23)).toBe('night')
  })

  it('returns a non-empty CSS filter string at every hour', () => {
    for (let h = 0; h < 24; h += 0.5) {
      const f = cssFilterFor(h)
      expect(f).toMatch(/brightness|saturate|hue-rotate/)
    }
  })

  it('arrivalStartFilter composes onto the hour grade (dimmer + less saturated)', () => {
    const base = cssFilterFor(12)
    const start = arrivalStartFilter(12)
    expect(start.startsWith(base)).toBe(true)
    // Composed dim/desat must be present.
    expect(start).toContain('brightness(0.55)')
    expect(start).toContain('saturate(0.7)')
  })

  it('kstHour() returns a number in [0, 24)', () => {
    const h = kstHour()
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThan(24)
  })
})

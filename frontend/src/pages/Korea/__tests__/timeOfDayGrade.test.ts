import { describe, it, expect } from 'vitest'
import { gradeKindAt, cssFilterFor, arrivalStartFilter, kstHour, fogForHour } from '../timeOfDayGrade'

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

  describe('fogForHour', () => {
    it('returns a valid hex color + positive density at every hour', () => {
      for (let h = 0; h < 24; h += 0.5) {
        const fog = fogForHour(h)
        expect(fog.color).toMatch(/^#[0-9a-f]{6}$/i)
        expect(fog.density).toBeGreaterThan(0)
        // Sanity: dense fog (≥1e-3) would clip the city; values
        // should stay in the 1e-5 / 1e-4 atmosphere band.
        expect(fog.density).toBeLessThan(1e-3)
      }
    })

    it('uses cool tones for night/evening and warm for dawn/dusk', () => {
      // Cool — first hex byte (R) should be < last (B) for blue-ish.
      const night = fogForHour(2).color // #0e1a2e
      const evening = fogForHour(20).color // #3a4a66
      expect(parseInt(night.slice(1, 3), 16)).toBeLessThan(parseInt(night.slice(5, 7), 16))
      expect(parseInt(evening.slice(1, 3), 16)).toBeLessThan(parseInt(evening.slice(5, 7), 16))
      // Warm — R should exceed B.
      const dawn = fogForHour(6).color // #f3b6a0
      const dusk = fogForHour(19).color // #d68a4a
      expect(parseInt(dawn.slice(1, 3), 16)).toBeGreaterThan(parseInt(dawn.slice(5, 7), 16))
      expect(parseInt(dusk.slice(1, 3), 16)).toBeGreaterThan(parseInt(dusk.slice(5, 7), 16))
    })

    it('midday returns the thinnest fog (cleanest view of the city)', () => {
      const midday = fogForHour(12).density
      const night = fogForHour(2).density
      const dusk = fogForHour(19).density
      expect(midday).toBeLessThan(night)
      expect(midday).toBeLessThan(dusk)
    })
  })
})

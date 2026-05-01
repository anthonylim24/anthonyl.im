import { describe, expect, it } from 'vitest'
import {
  ACCENT_WARM,
  ACCENT_WARM_LIGHT,
  ACCENT_WARM_SUBTLE,
  BADGE_GRADIENT,
  HEATMAP,
  PHASE,
  TECHNIQUE,
  TECHNIQUE_GRADIENT,
  TECHNIQUE_RING_COLORS,
} from '../palette'

describe('BreathFlow warm palette', () => {
  it('uses the documented light-mode amber accent token', () => {
    expect(ACCENT_WARM).toBe('#B8860B')
    expect(ACCENT_WARM_LIGHT).toBe('#D6AD47')
    expect(ACCENT_WARM_SUBTLE).toBe('rgba(184, 134, 11, 0.12)')
  })

  it('uses the warm accent as the primary technique color', () => {
    expect(PHASE.inhale).toBe(ACCENT_WARM)
    expect(BADGE_GRADIENT.from).toBe(ACCENT_WARM)
    expect(HEATMAP[0]).toBe('rgba(184, 134, 11, 0.1)')

    expect(Object.values(TECHNIQUE_RING_COLORS).every((color) => color.primary === ACCENT_WARM)).toBe(true)
    expect(Object.values(TECHNIQUE).every((color) => color.primary === ACCENT_WARM)).toBe(true)
    expect(Object.values(TECHNIQUE_GRADIENT).every((color) => color.from === ACCENT_WARM)).toBe(true)
  })
})

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BADGES } from '../../gamify/badges'
import { SEAL_ART, WaxSeal } from '../BadgeGrid'

describe('wax seals', () => {
  it('has a rendered seal for every badge', () => {
    expect(BADGES.map((badge) => badge.id).filter((id) => !SEAL_ART[id])).toEqual([])
  })

  it('shows the pressed wax once earned and the pencilled ring until then', () => {
    const earned = render(<WaxSeal id="streak_7" name="One Week" earned />)
    expect(earned.container.querySelector('img')?.getAttribute('src')).toBe(SEAL_ART.streak_7)
    const locked = render(<WaxSeal id="streak_7" name="One Week" earned={false} />)
    expect(locked.container.querySelector('img')).toBeNull()
    expect(locked.container.textContent).toBe('O')
  })
})

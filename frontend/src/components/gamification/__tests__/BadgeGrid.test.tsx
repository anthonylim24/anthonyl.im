import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BadgeGrid } from '../BadgeGrid'
import { getBadgeMotionConfig } from '../badgeMotion'

describe('BadgeGrid', () => {
  it('renders all non-secret badges', () => {
    const { container } = render(<BadgeGrid earnedBadges={[]} />)
    const badges = container.querySelectorAll('[data-badge]')
    expect(badges.length).toBeGreaterThanOrEqual(9)
  })

  it('shows earned badge name', () => {
    render(<BadgeGrid earnedBadges={['first_session']} />)
    expect(screen.getByText('First Breath')).toBeTruthy()
  })

  it('reveals secret badge when earned', () => {
    render(<BadgeGrid earnedBadges={['night_owl']} />)
    expect(screen.getByText('Night Owl')).toBeTruthy()
  })

  it('shows secret placeholders when not earned', () => {
    const { container } = render(<BadgeGrid earnedBadges={[]} />)
    const secrets = container.querySelectorAll('[data-secret]')
    expect(secrets.length).toBe(3)
  })

  it('removes scale animations for reduced-motion badge states', () => {
    const reducedEarned = getBadgeMotionConfig(true, true)
    expect(reducedEarned.variants.hidden).toEqual({ opacity: 0 })
    expect(reducedEarned.whileHover).toBeUndefined()

    const animatedEarned = getBadgeMotionConfig(false, true)
    expect(animatedEarned.variants.hidden).toEqual({ opacity: 0, scale: 0.8 })
    expect(animatedEarned.whileHover).toEqual({ scale: 1.05 })
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BadgeGrid } from '../BadgeGrid'

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
})

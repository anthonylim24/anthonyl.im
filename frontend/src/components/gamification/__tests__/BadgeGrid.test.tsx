import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BadgeGrid } from '../BadgeGrid'
import { getBadgeMotionConfig } from '../badgeMotion'
import { BADGES } from '@/lib/gamification'

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

  it('summarizes achievement progress and badge states for assistive technology', () => {
    render(<BadgeGrid earnedBadges={['first_session']} />)

    expect(
      screen.getByRole('list', { name: `1 of ${BADGES.length} milestones earned` })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('listitem', {
        name: /First Breath earned\. Complete your first guided session\./i,
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('listitem', {
        name: /Seven-Day Rhythm locked\. Practice for 7 days in a row\./i,
      })
    ).toBeInTheDocument()
  })

  it('renders an icon for every earned milestone', () => {
    const { container } = render(
      <BadgeGrid earnedBadges={BADGES.map((badge) => badge.id)} />,
    )

    const milestonesMissingIcons = BADGES.filter((badge) => {
      const badgeNode = container.querySelector(`[data-badge="${badge.id}"]`)
      return !badgeNode?.querySelector('svg')
    }).map((badge) => badge.id)

    expect(milestonesMissingIcons).toEqual([])
  })

  it('reveals secret badge when earned', () => {
    render(<BadgeGrid earnedBadges={['night_owl']} />)
    expect(screen.getByText('Night Practice')).toBeTruthy()
  })

  it('shows secret placeholders when not earned', () => {
    const { container } = render(<BadgeGrid earnedBadges={[]} />)
    const secrets = container.querySelectorAll('[data-secret]')
    expect(secrets.length).toBe(3)
  })

  it('uses calm fade motion (no spring/bounce) per the interface-design system', () => {
    const reducedEarned = getBadgeMotionConfig(true, true)
    expect(reducedEarned.variants.hidden).toEqual({ opacity: 0 })
    expect(reducedEarned.whileHover).toBeUndefined()

    const animatedEarned = getBadgeMotionConfig(false, true)
    // No scale pop — opacity + a small y offset, decel tween.
    expect(animatedEarned.variants.hidden).toEqual({ opacity: 0, y: 6 })
    expect(animatedEarned.whileHover).toEqual({ opacity: 0.85 })
    expect(animatedEarned.transition).toMatchObject({ type: 'tween' })
  })
})

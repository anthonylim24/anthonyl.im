import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionSummary } from '../SessionSummary'

const defaultProps = {
  xpEarned: 75,
  newBadges: ['first_session'],
  rounds: 4,
  durationSeconds: 300,
  holdTimes: [18, 22, 20],
  isNewPersonalBest: true,
  onClose: vi.fn(),
}

describe('SessionSummary', () => {
  it('displays XP earned', () => {
    render(<SessionSummary {...defaultProps} />)
    expect(screen.getByText('+75 XP')).toBeTruthy()
  })

  it('displays round count', () => {
    render(<SessionSummary {...defaultProps} />)
    expect(screen.getByText('4')).toBeTruthy()
  })

  it('shows personal best indicator', () => {
    render(<SessionSummary {...defaultProps} />)
    expect(screen.getByText(/personal best/i)).toBeTruthy()
  })

  it('shows new badges', () => {
    render(<SessionSummary {...defaultProps} />)
    expect(screen.getByText('First Breath')).toBeTruthy()
  })

  it('shows hold stats', () => {
    render(<SessionSummary {...defaultProps} />)
    expect(screen.getByText('22s')).toBeTruthy()
  })
})

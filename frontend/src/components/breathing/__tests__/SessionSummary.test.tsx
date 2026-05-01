import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SessionSummary } from '../SessionSummary'
import { TECHNIQUE_IDS } from '@/lib/constants'

const defaultProps = {
  techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE,
  xpEarned: 75,
  newBadges: ['first_session'],
  rounds: 4,
  durationSeconds: 300,
  holdTimes: [18, 22, 20],
  isNewPersonalBest: true,
  onClose: vi.fn(),
}

describe('SessionSummary', () => {
  it('displays XP earned', async () => {
    render(<SessionSummary {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('+75 XP')).toBeTruthy()
    })
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

  it('shows hold stats', async () => {
    render(<SessionSummary {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('22s')).toBeTruthy()
    })
  })

  it('shows protocol-specific insight and next step guidance', () => {
    render(<SessionSummary {...defaultProps} />)

    expect(screen.getByText(/CO2 Tolerance Table/)).toBeTruthy()
    expect(screen.getAllByText('Full protocol').length).toBeGreaterThan(0)
    expect(screen.getByText('CO2 tolerance exposure')).toBeTruthy()
    expect(screen.getByText(/progressive holds practice/i)).toBeTruthy()
    expect(screen.getByText(/relaxed nasal breathing/i)).toBeTruthy()
  })

  it('exposes the summary as an accessible dialog', () => {
    render(<SessionSummary {...defaultProps} />)

    expect(screen.getByRole('dialog', { name: /session complete/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /close session summary/i })).toBeTruthy()
  })
})

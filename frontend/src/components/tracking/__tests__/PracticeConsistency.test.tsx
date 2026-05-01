import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TECHNIQUE_IDS } from '@/lib/constants'
import type { CompletedSession } from '@/stores/historyStore'
import { PracticeConsistency } from '../PracticeConsistency'

function session(id: string, date: string): CompletedSession {
  return {
    id,
    techniqueId: TECHNIQUE_IDS.RESONANCE_BREATHING,
    date,
    durationSeconds: 300,
    rounds: 30,
    holdTimes: [],
    maxHoldTime: 0,
    avgHoldTime: 0,
  }
}

describe('PracticeConsistency', () => {
  it('renders weekly practice metrics and guidance', () => {
    render(
      <PracticeConsistency
        sessions={[
          session('today', new Date().toISOString()),
          session('yesterday', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
          session('two-days', new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
        ]}
      />
    )

    expect(screen.getByRole('heading', { name: /practice signal/i })).toBeInTheDocument()
    expect(screen.getByText('3/7')).toBeInTheDocument()
    expect(screen.getByText('15m')).toBeInTheDocument()
    expect(screen.getByText('Resonance Breathing')).toBeInTheDocument()
    expect(screen.getByText(/next best action/i)).toBeInTheDocument()
  })

  it('renders an empty-state practice signal', () => {
    render(<PracticeConsistency sessions={[]} />)

    expect(screen.getByText('Ready to begin')).toBeInTheDocument()
    expect(screen.getByText('0/7')).toBeInTheDocument()
    expect(screen.getByText('No dominant protocol yet')).toBeInTheDocument()
  })
})

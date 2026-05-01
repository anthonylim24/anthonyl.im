import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProgressChart } from '../ProgressChart'
import { TECHNIQUE_IDS } from '@/lib/constants'
import type { CompletedSession } from '@/stores/historyStore'

function session(
  id: string,
  date: string,
  maxHoldTime: number,
  avgHoldTime: number
): CompletedSession {
  return {
    id,
    techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE,
    date,
    durationSeconds: 180,
    rounds: 4,
    holdTimes: [avgHoldTime, maxHoldTime],
    maxHoldTime,
    avgHoldTime,
  }
}

describe('ProgressChart', () => {
  it('announces the empty trend state', () => {
    render(<ProgressChart sessions={[]} />)

    expect(
      screen.getByRole('status', {
        name: /hold time progress: no hold-time sessions recorded yet/i,
      })
    ).toBeInTheDocument()
  })

  it('summarizes hold trends for assistive technology', () => {
    render(
      <ProgressChart
        sessions={[
          session('new', '2026-05-02T08:00:00.000Z', 32, 18),
          session('old', '2026-05-01T08:00:00.000Z', 24, 14),
        ]}
      />
    )

    expect(
      screen.getByRole('img', {
        name: /hold time progress: 2 sessions from .* to .* best hold 32 seconds\. latest average 18 seconds/i,
      })
    ).toBeInTheDocument()
  })

  it('renders a native SVG trend without a charting runtime', () => {
    const { container } = render(
      <ProgressChart
        sessions={[
          session('new', '2026-05-02T08:00:00.000Z', 32, 18),
          session('old', '2026-05-01T08:00:00.000Z', 24, 14),
        ]}
      />
    )

    expect(screen.getByTestId('progress-chart-svg')).toBeInTheDocument()
    expect(container.querySelector('[data-series="max-hold"]')?.getAttribute('d')).toMatch(/^M /)
    expect(container.querySelector('[data-series="avg-hold"]')?.getAttribute('d')).toMatch(/^M /)
    expect(screen.getByText('Best hold')).toBeInTheDocument()
    expect(screen.getByText('Average')).toBeInTheDocument()
  })
})

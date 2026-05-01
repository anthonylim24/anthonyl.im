import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ProgressChart } from '../ProgressChart'
import { TECHNIQUE_IDS } from '@/lib/constants'
import type { CompletedSession } from '@/stores/historyStore'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: ReactNode }) => (
    <svg data-testid="line-chart">{children}</svg>
  ),
  Line: () => <g data-testid="line" />,
  XAxis: () => <g data-testid="x-axis" />,
  YAxis: () => <g data-testid="y-axis" />,
  CartesianGrid: () => <g data-testid="grid" />,
  Tooltip: () => <g data-testid="tooltip" />,
}))

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
})

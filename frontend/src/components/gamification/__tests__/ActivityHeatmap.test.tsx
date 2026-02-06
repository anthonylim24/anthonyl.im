import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ActivityHeatmap } from '../ActivityHeatmap'

describe('ActivityHeatmap', () => {
  it('renders without sessions', () => {
    const { container } = render(<ActivityHeatmap sessions={[]} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders 84 data-cell elements', () => {
    const { container } = render(<ActivityHeatmap sessions={[]} />)
    const cells = container.querySelectorAll('[data-cell]')
    expect(cells.length).toBe(84)
  })

  it('highlights days with sessions', () => {
    // Use a date 40 days ago to ensure it falls within the 84-day heatmap window
    const target = new Date()
    target.setHours(0, 0, 0, 0)
    target.setDate(target.getDate() - 40)
    const dateStr = target.toISOString().split('T')[0]
    const { container } = render(
      <ActivityHeatmap sessions={[{ date: dateStr, count: 2 }]} />
    )
    const activeCells = container.querySelectorAll('[data-active="true"]')
    expect(activeCells.length).toBeGreaterThanOrEqual(1)
  })
})

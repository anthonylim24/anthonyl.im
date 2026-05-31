import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MoodTrendCard } from '../MoodTrendCard'

describe('MoodTrendCard', () => {
  it('renders the average calm shift with a positive sign', () => {
    const { container } = render(
      <MoodTrendCard trend={{ count: 4, averageShift: 1.8, positiveRate: 0.75 }} />,
    )

    expect(screen.getByText('+1.8')).toBeInTheDocument()
    const text = container.textContent ?? ''
    expect(text).toContain('75%')
    expect(text).toContain('4')
    expect(text).toContain('tracked sessions')
  })

  it('uses singular copy for a single session and omits the sign when negative', () => {
    const { container } = render(
      <MoodTrendCard trend={{ count: 1, averageShift: -0.5, positiveRate: 0 }} />,
    )

    expect(screen.getByText('-0.5')).toBeInTheDocument()
    const text = container.textContent ?? ''
    expect(text).toContain('tracked session.')
    expect(text).not.toContain('tracked sessions')
  })
})

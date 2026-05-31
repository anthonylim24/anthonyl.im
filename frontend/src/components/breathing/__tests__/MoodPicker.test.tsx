import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MoodPicker } from '../MoodPicker'

describe('MoodPicker', () => {
  it('renders an accessible radio group with all five options', () => {
    render(<MoodPicker label="How do you feel right now?" value={null} onChange={vi.fn()} />)

    const group = screen.getByRole('radiogroup', { name: 'How do you feel right now?' })
    expect(group).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(5)
  })

  it('marks the selected option as checked', () => {
    render(<MoodPicker label="Mood" value={5} onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'Calm' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Tense' })).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onChange with the chosen mood value', () => {
    const onChange = vi.fn()
    render(<MoodPicker label="Mood" value={null} onChange={onChange} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Settled' }))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('shows an optional hint', () => {
    render(<MoodPicker label="Mood" hint="You started: Tense" value={null} onChange={vi.fn()} />)
    expect(screen.getByText('You started: Tense')).toBeInTheDocument()
  })
})

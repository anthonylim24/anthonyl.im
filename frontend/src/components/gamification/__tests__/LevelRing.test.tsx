import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LevelRing } from '../LevelRing'

describe('LevelRing', () => {
  it('renders level number', () => {
    render(<LevelRing level={5} progress={0.5} />)
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('renders with zero progress', () => {
    const { container } = render(<LevelRing level={1} progress={0} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders with full progress', () => {
    const { container } = render(<LevelRing level={10} progress={1} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('accepts custom size', () => {
    const { container } = render(<LevelRing level={3} progress={0.5} size={120} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('120')
  })
})

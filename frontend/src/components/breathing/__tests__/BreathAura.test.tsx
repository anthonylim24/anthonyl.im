import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BreathAura } from '../BreathAura'

describe('BreathAura', () => {
  it('renders a proprietary aura SVG', () => {
    const { container } = render(<BreathAura amplitude={0.6} />)

    expect(screen.getByTestId('breath-aura')).toBeTruthy()
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('applies custom sizing and className', () => {
    const { container } = render(<BreathAura size={64} className="custom-aura" />)
    const aura = screen.getByTestId('breath-aura')

    expect(aura).toHaveStyle({ width: '64px', height: '64px' })
    expect(container.querySelector('.custom-aura')).toBeTruthy()
  })
})

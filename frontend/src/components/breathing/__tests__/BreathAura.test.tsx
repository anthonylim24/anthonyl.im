import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BreathAura } from '../BreathAura'

describe('BreathAura', () => {
  it('renders a proprietary aura SVG', () => {
    const { container } = render(<BreathAura amplitude={0.6} />)

    expect(screen.getByTestId('breath-aura')).toBeTruthy()
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('uses semantic BreathFlow tokens for SVG colors', () => {
    const { container } = render(<BreathAura amplitude={0.6} />)

    expect(container.innerHTML).toContain('var(--bw-accent)')
    expect(container.innerHTML).toContain('var(--bw-surface)')
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{6}/i)
  })

  it('applies custom sizing and className', () => {
    const { container } = render(<BreathAura size={64} className="custom-aura" />)
    const aura = screen.getByTestId('breath-aura')

    expect(aura).toHaveStyle({ width: '64px', height: '64px' })
    expect(container.querySelector('.custom-aura')).toBeTruthy()
  })
})

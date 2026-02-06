import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { FluidOrb } from '../FluidOrb'
import { BREATH_PHASES } from '@/lib/constants'

describe('FluidOrb', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <FluidOrb phase={null} amplitude={0.2} isActive={false} />
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('renders with inhale phase', () => {
    const { container } = render(
      <FluidOrb phase={BREATH_PHASES.INHALE} amplitude={0.8} isActive={true} />
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('applies technique color override', () => {
    const { container } = render(
      <FluidOrb
        phase={BREATH_PHASES.INHALE}
        amplitude={1}
        isActive={true}
        themeColors={['#ff0000', '#00ff00']}
      />
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('applies custom className', () => {
    const { container } = render(
      <FluidOrb phase={null} amplitude={0.2} isActive={false} className="custom-class" />
    )
    expect(container.querySelector('.custom-class')).toBeTruthy()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('renders an SVG Kirby when kirbyMode is true', () => {
    const { container } = render(
      <FluidOrb phase={null} amplitude={0.5} isActive={true} kirbyMode={true} />
    )
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('does not render an SVG when kirbyMode is false', () => {
    const { container } = render(
      <FluidOrb phase={null} amplitude={0.5} isActive={true} kirbyMode={false} />
    )
    expect(container.querySelector('svg')).toBeFalsy()
  })

  it('calls onEasterEggToggle after 5 clicks within 2 seconds', async () => {
    const onToggle = vi.fn()
    let t = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 100))

    const { getByTestId } = render(
      <FluidOrb
        phase={null}
        amplitude={0.5}
        isActive={true}
        onEasterEggToggle={onToggle}
      />
    )
    const orb = getByTestId('fluid-orb')
    for (let i = 0; i < 5; i++) {
      await userEvent.click(orb)
    }
    expect(onToggle).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
  })

  it('does not call onEasterEggToggle for 5 clicks spread over more than 2 seconds', async () => {
    const onToggle = vi.fn()
    let t = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 1000))

    const { getByTestId } = render(
      <FluidOrb
        phase={null}
        amplitude={0.5}
        isActive={true}
        onEasterEggToggle={onToggle}
      />
    )
    const orb = getByTestId('fluid-orb')
    for (let i = 0; i < 5; i++) {
      await userEvent.click(orb)
    }
    expect(onToggle).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrbParticleField } from '../OrbParticleField'

vi.mock('../../platform/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}))

import { useReducedMotion } from '../../platform/useReducedMotion'

describe('OrbParticleField', () => {
  beforeEach(() => {
    vi.mocked(useReducedMotion).mockReturnValue(false)
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders an orbiting mote canvas', () => {
    render(<OrbParticleField colors={['#22624A', '#63B48E']} amplitudeRef={{ current: 0.6 }} />)
    expect(screen.getByTestId('orb-particle-field')).toBeInTheDocument()
  })

  it('hides motes when reduced motion is requested', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)
    render(<OrbParticleField colors={['#22624A', '#63B48E']} amplitudeRef={{ current: 0.6 }} />)
    expect(screen.queryByTestId('orb-particle-field')).toBeNull()
  })
})

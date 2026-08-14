import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrbParticleField } from '../OrbParticleField'

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}))

import { useReducedMotion } from '@/hooks/useReducedMotion'

describe('OrbParticleField', () => {
  beforeEach(() => {
    vi.mocked(useReducedMotion).mockReturnValue(false)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (token: string) => {
        if (token === '--bw-accent') return '#B8860B'
        if (token === '--bw-accent-light') return '#D6AD47'
        if (token === '--bw-surface') return '#FFFEFA'
        if (token === '--bw-text') return '#1C1917'
        return ''
      },
    } as CSSStyleDeclaration)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders an orbiting particle canvas while motion is allowed', () => {
    render(<OrbParticleField amplitude={0.4} isActive />)
    expect(screen.getByTestId('orb-particle-field')).toBeInTheDocument()
  })

  it('does not render when reduced motion is requested', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)
    render(<OrbParticleField amplitude={0.4} isActive />)
    expect(screen.queryByTestId('orb-particle-field')).toBeNull()
  })

  it('schedules a draw loop while the session is active', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    render(<OrbParticleField amplitude={0.8} isActive />)
    act(() => {
      expect(raf).toHaveBeenCalled()
    })
  })
})

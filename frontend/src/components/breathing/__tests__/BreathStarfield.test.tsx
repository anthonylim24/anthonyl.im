import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BreathStarfield } from '../BreathStarfield'

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}))

import { useReducedMotion } from '@/hooks/useReducedMotion'

describe('BreathStarfield', () => {
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

  it('portals a page-level particle field', () => {
    render(<BreathStarfield />)
    const field = screen.getByTestId('breath-starfield')
    expect(field.parentElement).toBe(document.body)
  })

  it('does not render when reduced motion is requested', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)
    render(<BreathStarfield />)
    expect(screen.queryByTestId('breath-starfield')).toBeNull()
  })
})

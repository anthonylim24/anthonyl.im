import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { KirbyEasterEgg, KIRBY_COUNT } from '../KirbyEasterEgg'

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}))

beforeEach(() => {
  vi.mocked(useReducedMotion).mockReturnValue(false)
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 0))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('KirbyEasterEgg', () => {
  it('renders the overlay container', () => {
    render(<KirbyEasterEgg />)
    expect(screen.getByTestId('kirby-easter-egg')).toBeTruthy()
  })

  it('overlay has pointer-events-none', () => {
    render(<KirbyEasterEgg />)
    expect(screen.getByTestId('kirby-easter-egg').className).toContain('pointer-events-none')
  })

  it('renders 11 Kirby instances', () => {
    render(<KirbyEasterEgg />)
    expect(screen.getAllByTestId('kirby-instance')).toHaveLength(KIRBY_COUNT)
  })

  it('starts the animation loop on mount', () => {
    render(<KirbyEasterEgg />)
    expect(vi.mocked(requestAnimationFrame)).toHaveBeenCalledTimes(1)
  })

  it('does not render or animate when reduced motion is requested', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)

    render(<KirbyEasterEgg />)

    expect(screen.queryByTestId('kirby-easter-egg')).toBeNull()
    expect(vi.mocked(requestAnimationFrame)).not.toHaveBeenCalled()
  })
})

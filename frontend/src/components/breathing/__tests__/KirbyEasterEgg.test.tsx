import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { KIRBY_COUNT, KirbyEasterEgg } from '../KirbyEasterEgg'

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
  vi.restoreAllMocks()
})

describe('KirbyEasterEgg', () => {
  it('renders a non-interactive background overlay', () => {
    render(<KirbyEasterEgg />)

    expect(screen.getByTestId('kirby-easter-egg')).toHaveClass('pointer-events-none')
  })

  it('renders the expected number of Kirby instances', () => {
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

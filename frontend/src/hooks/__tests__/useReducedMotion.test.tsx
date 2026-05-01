import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useReducedMotion } from '../useReducedMotion'

const originalMatchMedia = window.matchMedia

function ReducedMotionProbe() {
  const reducedMotion = useReducedMotion()
  return <span>{reducedMotion ? 'reduced' : 'motion'}</span>
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  })
  vi.restoreAllMocks()
})

describe('useReducedMotion', () => {
  it('returns false without matchMedia support', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    })

    render(<ReducedMotionProbe />)

    expect(screen.getByText('motion')).toBeTruthy()
  })

  it('reads the current media query and reacts to changes', () => {
    let changeHandler: ((event: MediaQueryListEvent) => void) | undefined

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: vi.fn((_event: string, handler: (event: MediaQueryListEvent) => void) => {
          changeHandler = handler
        }),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    render(<ReducedMotionProbe />)

    expect(screen.getByText('reduced')).toBeTruthy()

    act(() => {
      changeHandler?.({ matches: false } as MediaQueryListEvent)
    })

    expect(screen.getByText('motion')).toBeTruthy()
  })
})

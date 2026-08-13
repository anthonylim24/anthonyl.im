import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FINE_HOVER_QUERY, useFineHover } from '../useFineHover'

const originalMatchMedia = window.matchMedia

function FineHoverProbe() {
  const fineHover = useFineHover()
  return <span>{fineHover ? 'fine' : 'coarse'}</span>
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  })
  vi.restoreAllMocks()
})

describe('useFineHover', () => {
  it('returns false without matchMedia support', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    })

    render(<FineHoverProbe />)
    expect(screen.getByText('coarse')).toBeTruthy()
  })

  it('tracks (hover: hover) and (pointer: fine)', () => {
    let changeHandler: ((event: MediaQueryListEvent) => void) | undefined

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn((query: string) => ({
        matches: query === FINE_HOVER_QUERY,
        media: query,
        addEventListener: (_type: string, handler: (event: MediaQueryListEvent) => void) => {
          changeHandler = handler
        },
        removeEventListener: () => {
          changeHandler = undefined
        },
      })),
    })

    render(<FineHoverProbe />)
    expect(screen.getByText('fine')).toBeTruthy()

    act(() => {
      changeHandler?.({ matches: false } as MediaQueryListEvent)
    })
    expect(screen.getByText('coarse')).toBeTruthy()
  })
})

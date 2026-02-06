import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { useViewportOffset } from '../useViewportOffset'

function Probe() {
  const { bottomOffset } = useViewportOffset()
  return <div data-testid="offset">{bottomOffset}</div>
}

describe('useViewportOffset', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 800,
    })
  })

  it('uses visualViewport delta to compute bottom offset', async () => {
    const listeners = new Map<string, Set<() => void>>()
    const visualViewport = {
      height: 760,
      offsetTop: 0,
      addEventListener: (type: string, cb: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)?.add(cb)
      },
      removeEventListener: (type: string, cb: () => void) => {
        listeners.get(type)?.delete(cb)
      },
    }

    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    })

    const rafSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0)
        return 1
      })

    render(<Probe />)

    await waitFor(() => {
      expect(screen.getByTestId('offset')).toHaveTextContent('40')
    })

    visualViewport.height = 780
    act(() => {
      listeners.get('resize')?.forEach((cb) => cb())
    })

    await waitFor(() => {
      expect(screen.getByTestId('offset')).toHaveTextContent('20')
    })

    rafSpy.mockRestore()
  })

  it('returns zero when visualViewport is unavailable', async () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: undefined,
    })

    render(<Probe />)

    await waitFor(() => {
      expect(screen.getByTestId('offset')).toHaveTextContent('0')
    })
  })
})

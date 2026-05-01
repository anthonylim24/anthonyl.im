import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { useViewportOffset } from '../useViewportOffset'

function Probe() {
  const { bottomOffset } = useViewportOffset()
  return <div data-testid="offset">{bottomOffset}</div>
}

describe('useViewportOffset', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 800,
    })
  })

  it('uses visualViewport delta to compute bottom offset', async () => {
    const windowAddListener = vi.spyOn(window, 'addEventListener')
    const windowRemoveListener = vi.spyOn(window, 'removeEventListener')
    const listeners = new Map<string, Set<() => void>>()
    const addCalls: Array<{ type: string; options?: AddEventListenerOptions | boolean }> = []
    const removeCalls: Array<{ type: string; options?: EventListenerOptions | boolean }> = []
    const visualViewport = {
      height: 760,
      offsetTop: 0,
      addEventListener: (
        type: string,
        cb: () => void,
        options?: AddEventListenerOptions | boolean
      ) => {
        addCalls.push({ type, options })
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)?.add(cb)
      },
      removeEventListener: (
        type: string,
        cb: () => void,
        options?: EventListenerOptions | boolean
      ) => {
        removeCalls.push({ type, options })
        listeners.get(type)?.delete(cb)
      },
    }

    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    })

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })

    const { unmount } = render(<Probe />)

    await waitFor(() => {
      expect(screen.getByTestId('offset')).toHaveTextContent('40')
    })

    expect(windowAddListener).toHaveBeenCalledWith(
      'resize',
      expect.any(Function),
      expect.objectContaining({ passive: true })
    )
    expect(windowAddListener).toHaveBeenCalledWith(
      'orientationchange',
      expect.any(Function),
      expect.objectContaining({ passive: true })
    )
    expect(addCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'resize',
          options: expect.objectContaining({ passive: true }),
        }),
        expect.objectContaining({
          type: 'scroll',
          options: expect.objectContaining({ passive: true }),
        }),
      ])
    )

    visualViewport.height = 780
    act(() => {
      listeners.get('resize')?.forEach((cb) => cb())
    })

    await waitFor(() => {
      expect(screen.getByTestId('offset')).toHaveTextContent('20')
    })

    unmount()

    expect(windowRemoveListener).toHaveBeenCalledWith(
      'resize',
      expect.any(Function),
      expect.objectContaining({ passive: true })
    )
    expect(windowRemoveListener).toHaveBeenCalledWith(
      'orientationchange',
      expect.any(Function),
      expect.objectContaining({ passive: true })
    )
    expect(removeCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'resize',
          options: expect.objectContaining({ passive: true }),
        }),
        expect.objectContaining({
          type: 'scroll',
          options: expect.objectContaining({ passive: true }),
        }),
      ])
    )
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

import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CelebrationParticles } from '../CelebrationParticles'

function installCanvasMock() {
  let frameCallback: FrameRequestCallback | null = null
  const fillStyles: string[] = []
  const context = {
    scale: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    set fillStyle(value: string) {
      fillStyles.push(value)
    },
    get fillStyle() {
      return fillStyles[fillStyles.length - 1] ?? ''
    },
  } as unknown as CanvasRenderingContext2D

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    ((contextId: string) => (contextId === '2d' ? context : null)) as HTMLCanvasElement['getContext']
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom: 100,
    height: 100,
    left: 0,
    right: 100,
    top: 0,
    width: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: (token: string) => (token === '--bw-accent' ? '#123456' : ''),
  } as CSSStyleDeclaration)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frameCallback = callback
    return 1
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

  return {
    fillStyles,
    flushFrame: () => {
      expect(frameCallback).toBeTypeOf('function')
      act(() => {
        frameCallback?.(0)
      })
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CelebrationParticles', () => {
  it('resolves canvas particle colors from BreathFlow CSS tokens', () => {
    const { fillStyles, flushFrame } = installCanvasMock()
    vi.spyOn(Math, 'random').mockReturnValue(0)

    render(<CelebrationParticles count={1} />)
    flushFrame()

    expect(fillStyles[0]).toMatch(/^rgba\(18,52,86,0\.59/)
    expect(fillStyles[0]).not.toContain('var(')
  })
})

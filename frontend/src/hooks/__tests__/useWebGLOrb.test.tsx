import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { useWebGLOrb } from '../useWebGLOrb'

function Probe() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const failed = useWebGLOrb({
    canvasRef,
    amplitude: 0.5,
    color1: [0.7, 0.5, 0.1],
    color2: [0.9, 0.7, 0.3],
    isActive: true,
    reducedMotion: false,
  })

  return (
    <>
      <canvas ref={canvasRef} data-testid="orb-canvas" />
      <div data-testid="orb-failed">{String(failed)}</div>
    </>
  )
}

describe('useWebGLOrb', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('marks the WebGL orb failed when the browser loses the GL context', () => {
    render(<Probe />)

    const canvas = screen.getByTestId('orb-canvas')
    const contextLost = new Event('webglcontextlost', { cancelable: true })
    act(() => {
      canvas.dispatchEvent(contextLost)
    })

    expect(contextLost.defaultPrevented).toBe(true)
    expect(screen.getByTestId('orb-failed')).toHaveTextContent('true')
  })
})

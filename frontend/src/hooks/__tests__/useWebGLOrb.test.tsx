import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { useWebGLOrb } from '../useWebGLOrb'

interface ProbeProps {
  reducedMotion?: boolean
  isActive?: boolean
  amplitude?: number
}

function Probe({
  reducedMotion = false,
  isActive = true,
  amplitude = 0.5,
}: ProbeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const failed = useWebGLOrb({
    canvasRef,
    amplitude,
    color1: [0.7, 0.5, 0.1],
    color2: [0.9, 0.7, 0.3],
    isActive,
    reducedMotion,
  })

  return (
    <>
      <canvas ref={canvasRef} data-testid="orb-canvas" />
      <div data-testid="orb-failed">{String(failed)}</div>
    </>
  )
}

function createWebGLContextMock() {
  const gl = {
    ARRAY_BUFFER: 0x8892,
    BLEND: 0x0be2,
    COLOR_BUFFER_BIT: 0x4000,
    COMPILE_STATUS: 0x8b81,
    FLOAT: 0x1406,
    FRAGMENT_SHADER: 0x8b30,
    LINK_STATUS: 0x8b82,
    NO_ERROR: 0,
    ONE: 1,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    STATIC_DRAW: 0x88e4,
    TRIANGLES: 0x0004,
    VERTEX_SHADER: 0x8b31,
    attachShader: vi.fn(),
    bindBuffer: vi.fn(),
    bindVertexArray: vi.fn(),
    blendFunc: vi.fn(),
    bufferData: vi.fn(),
    clear: vi.fn(),
    clearColor: vi.fn(),
    compileShader: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    createProgram: vi.fn(() => ({})),
    createShader: vi.fn(() => ({})),
    createVertexArray: vi.fn(() => ({})),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
    deleteShader: vi.fn(),
    deleteVertexArray: vi.fn(),
    detachShader: vi.fn(),
    drawArrays: vi.fn(),
    enable: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getError: vi.fn(() => 0),
    getProgramParameter: vi.fn(() => true),
    getShaderParameter: vi.fn(() => true),
    getUniformLocation: vi.fn(() => ({})),
    isContextLost: vi.fn(() => false),
    linkProgram: vi.fn(),
    shaderSource: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform3f: vi.fn(),
    uniform3fv: vi.fn(),
    useProgram: vi.fn(),
    vertexAttribPointer: vi.fn(),
    viewport: vi.fn(),
  } as unknown as WebGL2RenderingContext & { drawArrays: ReturnType<typeof vi.fn> }

  return gl
}

function installRenderableWebGLOrb() {
  const gl = createWebGLContextMock()
  const rafCallbacks = new Map<number, FrameRequestCallback>()
  let nextFrameId = 0
  class ResizeObserverMock {
    disconnect = vi.fn()
    observe = vi.fn()
    unobserve = vi.fn()
  }

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    ((contextId: string) => (contextId === 'webgl2' ? gl : null)) as HTMLCanvasElement['getContext']
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom: 200,
    height: 200,
    left: 0,
    right: 200,
    top: 0,
    width: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const frameId = ++nextFrameId
    rafCallbacks.set(frameId, callback)
    return frameId
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
    rafCallbacks.delete(frameId)
  })
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)

  const flushNextFrame = (now = 100) => {
    const next = rafCallbacks.entries().next().value
    if (!next) return false
    const [frameId, callback] = next
    rafCallbacks.delete(frameId)
    act(() => {
      callback(now)
    })
    return true
  }

  return {
    gl,
    flushNextFrame,
    getPendingFrameCount: () => rafCallbacks.size,
  }
}

describe('useWebGLOrb', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
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

  it('does not attach the WebGL loop while reduced motion is active', () => {
    render(<Probe reducedMotion />)

    const canvas = screen.getByTestId('orb-canvas')
    const contextLost = new Event('webglcontextlost', { cancelable: true })
    act(() => {
      canvas.dispatchEvent(contextLost)
    })

    expect(contextLost.defaultPrevented).toBe(false)
    expect(screen.getByTestId('orb-failed')).toHaveTextContent('false')
  })

  it('tears down the WebGL context listener when reduced motion turns on', () => {
    const { rerender } = render(<Probe />)

    rerender(<Probe reducedMotion />)

    const canvas = screen.getByTestId('orb-canvas')
    const contextLost = new Event('webglcontextlost', { cancelable: true })
    act(() => {
      canvas.dispatchEvent(contextLost)
    })

    expect(contextLost.defaultPrevented).toBe(false)
    expect(screen.getByTestId('orb-failed')).toHaveTextContent('false')
  })

  it('draws a single WebGL frame while inactive', () => {
    const { gl, flushNextFrame, getPendingFrameCount } = installRenderableWebGLOrb()

    render(<Probe isActive={false} />)

    act(() => {
      vi.advanceTimersByTime(50)
    })

    expect(gl.drawArrays).toHaveBeenCalledTimes(1)
    expect(getPendingFrameCount()).toBe(1)

    expect(flushNextFrame()).toBe(true)

    expect(gl.drawArrays).toHaveBeenCalledTimes(2)
    expect(getPendingFrameCount()).toBe(0)
  })

  it('continues the WebGL loop only while active', () => {
    const { gl, flushNextFrame, getPendingFrameCount } = installRenderableWebGLOrb()
    const { rerender } = render(<Probe isActive />)

    act(() => {
      vi.advanceTimersByTime(50)
    })

    expect(flushNextFrame(100)).toBe(true)
    expect(gl.drawArrays).toHaveBeenCalledTimes(2)
    expect(getPendingFrameCount()).toBe(1)

    rerender(<Probe isActive={false} />)

    expect(flushNextFrame(116)).toBe(true)
    expect(gl.drawArrays).toHaveBeenCalledTimes(3)
    expect(getPendingFrameCount()).toBe(0)
  })
})

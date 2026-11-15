import { act, render } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getProtocol } from '../../protocols/catalog'
import { BloomAnchor } from '../BloomAnchor'
import { bloomStatus, BloomCanvas, releaseBloomScene, resetBloomSceneForTests } from '../BloomCanvas'
import { breathElapsed, type BreathClock, type BreathState } from '../breathDrive'
import type { BloomSceneOptions } from '../catScene'
import { watchContextLoss } from '../contextLoss'

const created: BloomSceneOptions[] = []
let failNext = false

vi.mock('../catScene', () => ({
  createBloomScene: vi.fn(async (options: BloomSceneOptions) => {
    created.push(options)
    if (failNext) {
      failNext = false
      throw new Error('no GPU')
    }
    return {
      attach: vi.fn(),
      detach: vi.fn(),
      setPigment: vi.fn(),
      setNight: vi.fn(),
      poke: vi.fn(),
      requestRender: vi.fn(),
      dispose: vi.fn(),
    }
  }),
}))

const pigment = { name: 'test', mass: '#000000', glaze: '#111111' }
const rest = () => ({ amplitude: 0, progress: 0, hold: false, cycle: 0 })

function Stage({ onLive, onReady }: { onLive?: (live: boolean) => void; onReady?: () => void }) {
  const anchorRef = createRef<HTMLDivElement>()
  return (
    <>
      <div ref={anchorRef} />
      <BloomCanvas anchorRef={anchorRef} mode="calm" pigment={pigment} read={rest} onLive={onLive} onReady={onReady} />
    </>
  )
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
}

describe('BloomCanvas scene lifecycle', () => {
  beforeEach(() => {
    created.length = 0
    failNext = false
    resetBloomSceneForTests()
  })

  it('a lost GPU hands back to the painted wash, and the next page rebuilds', async () => {
    const onLive = vi.fn()
    const view = render(<Stage onLive={onLive} />)
    await flush()
    expect(bloomStatus()).toBe('loading')
    act(() => created[0].onFirstFrame())
    expect(bloomStatus()).toBe('live')
    expect(onLive).toHaveBeenLastCalledWith(true)

    act(() => created[0].onLost())
    expect(onLive).toHaveBeenLastCalledWith(false)
    expect(bloomStatus()).toBe('lost')
    view.unmount()

    render(<Stage />)
    await flush()
    expect(created).toHaveLength(2)
  })

  it('a GPU lost twice in one visit is not tried again', async () => {
    const first = render(<Stage />)
    await flush()
    act(() => created[0].onLost())
    first.unmount()
    const second = render(<Stage />)
    await flush()
    act(() => created[1].onLost())
    second.unmount()
    expect(bloomStatus()).toBe('failed')

    const onReady = vi.fn()
    render(<Stage onReady={onReady} />)
    await flush()
    expect(created).toHaveLength(2)
    expect(onReady).toHaveBeenCalled()
  })

  it('a scene that fails to build stays failed for the visit, across route changes and releases', async () => {
    failNext = true
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const first = render(<Stage />)
    await flush()
    expect(bloomStatus()).toBe('failed')
    first.unmount()
    releaseBloomScene()

    render(<Stage />)
    await flush()
    expect(created).toHaveLength(1)
  })
})

describe('watchContextLoss', () => {
  it('fires once on webglcontextlost and not after stopping', () => {
    const canvas = document.createElement('canvas')
    const onLost = vi.fn()
    watchContextLoss({}, canvas, onLost)
    canvas.dispatchEvent(new Event('webglcontextlost'))
    canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(onLost).toHaveBeenCalledTimes(1)

    const quiet = vi.fn()
    const stop = watchContextLoss({}, canvas, quiet)
    stop()
    canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(quiet).not.toHaveBeenCalled()
  })

  it('fires when a WebGPU device is lost, but not when it is destroyed on purpose', async () => {
    let lose: () => void = () => {}
    const device = { lost: new Promise<void>((resolve) => { lose = resolve }) }
    const onLost = vi.fn()
    watchContextLoss({ device }, document.createElement('canvas'), onLost)
    lose()
    await Promise.resolve()
    expect(onLost).toHaveBeenCalledTimes(1)

    let destroy: () => void = () => {}
    const destroyed = { lost: new Promise<void>((resolve) => { destroy = resolve }) }
    const quiet = vi.fn()
    const stop = watchContextLoss({ device: destroyed }, document.createElement('canvas'), quiet)
    stop()
    destroy()
    await Promise.resolve()
    expect(quiet).not.toHaveBeenCalled()
  })
})

describe('BloomAnchor', () => {
  let onScreen = true
  beforeEach(() => {
    onScreen = true
    vi.stubGlobal('IntersectionObserver', class {
      constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
      observe() {
        this.callback([{ isIntersecting: onScreen }])
      }
      disconnect() {}
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('runs no frame loop while off screen', () => {
    onScreen = false
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    render(<BloomAnchor pigment={pigment} read={rest} live={false} reducedMotion={false} />)
    expect(raf).not.toHaveBeenCalled()
  })

  it('runs no frame loop while the live scene paints and there is no stroke', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    render(<BloomAnchor pigment={pigment} read={rest} live reducedMotion={false} />)
    expect(raf).not.toHaveBeenCalled()
  })

  it('keeps the loop for the progress stroke, without writing the hidden wash', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
    const { container } = render(<BloomAnchor pigment={pigment} read={rest} live stroke="ring" reducedMotion={false} />)
    expect(raf).toHaveBeenCalled()
    expect((container.firstChild as HTMLElement).style.getPropertyValue('--bf-amp')).toBe('')
  })

  it('paints the wash when the live scene is not there', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
    const { container } = render(<BloomAnchor pigment={pigment} read={rest} live={false} reducedMotion={false} />)
    expect((container.firstChild as HTMLElement).style.getPropertyValue('--bf-amp')).toBe('0.000')
  })
})

describe('breath position', () => {
  const box = getProtocol('box_breathing')
  const state = (clock: Partial<BreathState & BreathClock>): BreathState & BreathClock => ({
    phases: box.phases,
    phaseIndex: 0,
    phaseSeconds: 4,
    secondsLeftInPhase: 2,
    status: 'running',
    secondStartMs: 1000,
    carryMs: 0,
    ...clock,
  })

  it('reads between ticks from the start of the current second', () => {
    expect(breathElapsed(state({}), 1250)).toBe(2.25)
    // A late tick never runs the breath past the second it is in.
    expect(breathElapsed(state({}), 5000)).toBe(3)
  })

  it('holds the fraction a pause landed on, so resuming does not snap back', () => {
    expect(breathElapsed(state({ status: 'paused', carryMs: 600 }), 99_999)).toBe(2.6)
    // Resumed with the carry: the same position at the moment of resuming.
    expect(breathElapsed(state({ secondStartMs: 10_000 - 600 }), 10_000)).toBe(2.6)
  })
})

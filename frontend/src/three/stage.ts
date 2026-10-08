/**
 * Shared render stage for the site's Three.js scenes: WebGPU renderer (falls
 * back to WebGL2 by itself), host-sized canvas, and a frame loop that only
 * runs while the host is on screen and the tab is visible. Under reduced
 * motion the shader clock is frozen and frames render on demand.
 *
 * A frame-rate governor keeps the loop at the display's rate: when frames
 * fall behind (under ~55 fps, or well under a 120 Hz display's rate) the
 * pixel ratio steps down, so slow GPUs trade a little sharpness for motion.
 * If it is already as low as it goes, `onStruggle` listeners hear about it so
 * scenes can drop optional effects.
 */
import * as THREE from 'three/webgpu'
import { float, time } from 'three/tsl'
import type { Node } from 'three/webgpu'

export type StageOptions = {
  canvas: HTMLCanvasElement
  /** Element whose box sizes the canvas and gates the loop by visibility. */
  host: HTMLElement
  reducedMotion: boolean
  maxDpr?: number
  alpha?: boolean
}

export type Stage = {
  renderer: THREE.WebGPURenderer
  /** Shader clock; a constant 0 under reduced motion. */
  time: Node<'float'>
  readonly size: { w: number; h: number }
  /** Starts the gated loop. `frame` gets dt (0 under reduced motion) in seconds. */
  start(frame: (dt: number) => void): void
  /** Render one frame now (reduced motion, or after a state change while paused). */
  requestRender(): void
  onResize(fn: (w: number, h: number) => void): void
  /** Frames keep falling behind at the lowest pixel ratio (fires once). */
  onStruggle(fn: () => void): void
  dispose(): void
}

export async function createStage({ canvas, host, reducedMotion, maxDpr = 1.75, alpha = false }: StageOptions): Promise<Stage> {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha })
  let dpr = Math.min(window.devicePixelRatio, host.clientWidth < 820 ? Math.min(maxDpr, 1.5) : maxDpr)
  renderer.setPixelRatio(dpr)
  renderer.toneMapping = THREE.NoToneMapping
  await renderer.init()

  const size = { w: 1, h: 1 }
  const resizers: ((w: number, h: number) => void)[] = []
  const strugglers: (() => void)[] = []
  const resize = () => {
    size.w = Math.max(1, host.clientWidth)
    size.h = Math.max(1, host.clientHeight)
    renderer.setSize(size.w, size.h, false)
    for (const fn of resizers) fn(size.w, size.h)
  }

  // ── Governor ──
  const intervals: number[] = []
  let best = Infinity // the display's own frame interval (fastest frames seen)
  let settle = 30 // frames ignored after a start or a resolution change
  const govern = (ms: number) => {
    if (settle > 0) {
      settle--
      return
    }
    intervals.push(ms)
    if (intervals.length < 60) return
    intervals.sort((a, b) => a - b)
    const median = intervals[30]
    best = Math.min(best, intervals[6])
    intervals.length = 0
    const fast = best < 10 // a 90/120 Hz display
    const slow = median > 18 || (fast && median > best * 1.35)
    // Below 60 fps anything goes; to hold 120 Hz keep at least 1.25× density.
    const floor = median > 18 ? 1 : 1.25
    if (slow && dpr > floor + 0.01) {
      dpr = Math.max(floor, dpr * 0.85)
      renderer.setPixelRatio(dpr)
      resize()
      settle = 30
    } else if (slow && strugglers.length) {
      for (const fn of strugglers.splice(0)) fn()
      settle = 30
    }
  }

  let frame: ((dt: number) => void) | null = null
  let last = performance.now()
  const tick = () => {
    const now = performance.now()
    const ms = now - last
    last = now
    if (running) govern(ms)
    frame?.(reducedMotion ? 0 : Math.min(1 / 30, ms / 1000))
  }

  let onScreen = true
  let running = false
  const sync = () => {
    const want = Boolean(frame) && onScreen && document.visibilityState === 'visible' && !reducedMotion
    if (want === running) return
    running = want
    last = performance.now()
    settle = 30
    renderer.setAnimationLoop(want ? tick : null)
  }
  const io = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting
    sync()
  })
  io.observe(host)
  document.addEventListener('visibilitychange', sync)
  const ro = new ResizeObserver(() => {
    resize()
    if (!running) tick()
  })
  ro.observe(host)
  resize()

  return {
    renderer,
    time: reducedMotion ? float(0) : time,
    size,
    start(fn) {
      frame = fn
      tick()
      sync()
    },
    requestRender() {
      if (!running) tick()
    },
    onResize(fn) {
      resizers.push(fn)
      fn(size.w, size.h)
    },
    onStruggle(fn) {
      strugglers.push(fn)
    },
    dispose() {
      frame = null
      renderer.setAnimationLoop(null)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', sync)
      renderer.dispose()
    },
  }
}

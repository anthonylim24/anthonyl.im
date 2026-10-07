/**
 * Shared render stage for the site's Three.js scenes: WebGPU renderer (falls
 * back to WebGL2 by itself), host-sized canvas, and a frame loop that only
 * runs while the host is on screen and the tab is visible. Under reduced
 * motion the shader clock is frozen and frames render on demand.
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
  dispose(): void
}

export async function createStage({ canvas, host, reducedMotion, maxDpr = 1.75, alpha = false }: StageOptions): Promise<Stage> {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, host.clientWidth < 820 ? Math.min(maxDpr, 1.5) : maxDpr))
  renderer.toneMapping = THREE.NoToneMapping
  await renderer.init()

  const size = { w: 1, h: 1 }
  const resizers: ((w: number, h: number) => void)[] = []
  const resize = () => {
    size.w = Math.max(1, host.clientWidth)
    size.h = Math.max(1, host.clientHeight)
    renderer.setSize(size.w, size.h, false)
    for (const fn of resizers) fn(size.w, size.h)
  }

  let frame: ((dt: number) => void) | null = null
  let last = performance.now()
  const tick = () => {
    const now = performance.now()
    const dt = Math.min(1 / 30, (now - last) / 1000)
    last = now
    frame?.(reducedMotion ? 0 : dt)
  }

  let onScreen = true
  let running = false
  const sync = () => {
    const want = Boolean(frame) && onScreen && document.visibilityState === 'visible' && !reducedMotion
    if (want === running) return
    running = want
    last = performance.now()
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

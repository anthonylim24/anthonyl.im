import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react'
import { sx } from '@/styles/merge'
import { useSettingsStore } from '@/stores/settingsStore'
import type { Pigment } from '../pigments'
import { useReducedMotion } from '../platform/useReducedMotion'
import { wc } from '../styles/watercolor.stylex'
import type { BreathSample } from './breathDrive'
import type { BloomMode, BloomScene, BloomTarget } from './catScene'

export interface BloomCanvasHandle {
  poke(clientX: number, clientY: number): void
}

interface BloomCanvasProps {
  /** Where the bloom sits; the painted fallback is drawn inside it too. */
  anchorRef: RefObject<HTMLElement | null>
  /** Receives drag/poke in play mode (defaults to the canvas host). */
  pointerHostRef?: RefObject<HTMLElement | null>
  mode: BloomMode
  pigment: Pigment
  read: () => BreathSample
  vignette?: boolean
  /** Re-render one frame when this changes (reduced motion renders on demand). */
  tick?: unknown
  /** The live scene painted its first frame (hide the CSS wash) or went away. */
  onLive?: (live: boolean) => void
  /** Time to show the page: the scene painted, failed, or is taking too long. */
  onReady?: () => void
  style?: Parameters<typeof sx>[0]
}

/** Pages hold their reveal this long at most before showing the painted wash. */
const REVEAL_TIMEOUT_MS = 5000

type Shared = { canvas: HTMLCanvasElement; reducedMotion: boolean; scene: Promise<BloomScene> }
/**
 * One live scene for all of BreathFlow. Building it (WebGPU device, shader
 * compile) is the slow part, so pages hand it their host and anchor instead
 * of rebuilding it on every route change.
 */
let shared: Shared | null = null
let owner: object | null = null

/** Drop the shared scene (leaving BreathFlow, or reduced motion flipped). */
export function releaseBloomScene() {
  const s = shared
  shared = null
  owner = null
  if (!s) return
  s.canvas.remove()
  void s.scene.then((scene) => scene.dispose(), () => {})
}

/**
 * Two layers: a painted CSS wash inside the anchor (stays if WebGPU/WebGL2
 * is unavailable) and the live scene, lazily imported so three.js stays out
 * of BreathFlow's first chunk. The scene and its canvas outlive the page:
 * unmounting detaches it, the next BloomCanvas re-attaches it.
 */
export const BloomCanvas = forwardRef<BloomCanvasHandle, BloomCanvasProps>(function BloomCanvas(
  { anchorRef, pointerHostRef, mode, pigment, read, vignette = false, tick, onLive, onReady, style },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<BloomScene | null>(null)
  const [live, setLive] = useState(false)
  const reducedMotion = useReducedMotion()
  const night = useSettingsStore((s) => s.theme === 'dark')
  const latest = useRef({ pigment, night, read, onLive, onReady })
  latest.current.read = read
  latest.current.onLive = onLive
  latest.current.onReady = onReady

  useImperativeHandle(ref, () => ({
    poke: (x, y) => sceneRef.current?.poke(x, y),
  }), [])

  useEffect(() => {
    const host = hostRef.current
    const anchor = anchorRef.current
    if (!host || !anchor) return
    const me = {}
    const reveal = () => {
      if (owner === me) latest.current.onReady?.()
    }
    const timer = setTimeout(reveal, REVEAL_TIMEOUT_MS)
    const target: BloomTarget = {
      host,
      anchor,
      pointerHost: pointerHostRef?.current ?? host,
      mode,
      vignette,
      read: () => latest.current.read(),
      onFirstFrame: () => {
        if (owner !== me) return
        setLive(true)
        latest.current.onLive?.(true)
        reveal()
      },
    }

    if (shared && shared.reducedMotion !== reducedMotion) releaseBloomScene()
    let s = shared
    if (!s) {
      const canvas = document.createElement('canvas')
      canvas.setAttribute('aria-hidden', 'true')
      Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' })
      const scene = import('./catScene').then(({ createBloomScene }) =>
        createBloomScene({
          canvas,
          reducedMotion,
          night: latest.current.night,
          pigment: latest.current.pigment,
          ...target,
        }),
      )
      s = shared = { canvas, reducedMotion, scene }
      scene.catch(() => {
        if (shared?.scene === scene) shared = null
      })
    }
    const { scene } = s
    host.appendChild(s.canvas)
    owner = me
    scene.then(
      (bloom) => {
        if (owner !== me) return
        sceneRef.current = bloom
        bloom.attach(target)
        bloom.setPigment(latest.current.pigment)
        bloom.setNight(latest.current.night)
      },
      (error: unknown) => {
        console.warn('[breathflow] live bloom unavailable; keeping the painted wash.', error)
        reveal()
      },
    )

    return () => {
      clearTimeout(timer)
      sceneRef.current = null
      setLive(false)
      latest.current.onLive?.(false)
      if (owner !== me) return
      owner = null
      // Detach unless the next page has already claimed it.
      void scene.then((bloom) => {
        if (owner === null) bloom.detach()
      }, () => {})
    }
  }, [anchorRef, pointerHostRef, mode, reducedMotion, vignette])

  const { mass, glaze } = pigment
  useEffect(() => {
    latest.current.pigment = { name: '', mass, glaze }
    sceneRef.current?.setPigment({ name: '', mass, glaze })
  }, [mass, glaze])

  useEffect(() => {
    latest.current.night = night
    sceneRef.current?.setNight(night)
  }, [night])

  useEffect(() => {
    if (reducedMotion) sceneRef.current?.requestRender()
  }, [tick, reducedMotion])

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      {...sx(wc.bloomHost, live && wc.bloomHostLive, style)}
    />
  )
})

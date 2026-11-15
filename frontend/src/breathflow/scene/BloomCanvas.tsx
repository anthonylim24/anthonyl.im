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

/** A GPU lost this many times in one visit is not trusted again: painted wash until reload. */
const MAX_LOSSES = 2

/**
 * One live scene for all of BreathFlow. Building it (WebGPU device, shader
 * compile) is the slow part, so pages hand it their host and anchor instead
 * of rebuilding it on every route change.
 *
 * - `idle` / `disposed`: nothing built; the next page builds.
 * - `loading` → `live` once a frame is painted.
 * - `lost`: the GPU went away mid-visit; released, and the painted wash
 *   shows. The next page tries again.
 * - `failed`: no WebGPU / WebGL2, or the build threw, or the GPU was lost
 *   too often. Sticky for the visit, so every route change does not retry.
 */
export type BloomStatus = 'idle' | 'loading' | 'live' | 'failed' | 'lost' | 'disposed'

type Slot =
  | { status: 'idle' | 'failed' | 'lost' | 'disposed' }
  | { status: 'loading' | 'live'; canvas: HTMLCanvasElement; reducedMotion: boolean; scene: Promise<BloomScene> }

let slot: Slot = { status: 'idle' }
let losses = 0
/** The mounted BloomCanvas, and what to tell it if the GPU goes away. */
let owner: { onLost: () => void } | null = null

export function bloomStatus(): BloomStatus {
  return slot.status
}

/** Drop the shared scene (leaving BreathFlow, reduced motion flipped, or the GPU lost). */
export function releaseBloomScene() {
  const s = slot
  owner = null
  if (s.status !== 'loading' && s.status !== 'live') return
  slot = { status: 'disposed' }
  s.canvas.remove()
  void s.scene.then((scene) => scene.dispose(), () => {})
}

function sceneLost(scene: Promise<BloomScene>) {
  if ((slot.status !== 'loading' && slot.status !== 'live') || slot.scene !== scene) return
  console.warn('[breathflow] GPU lost; showing the painted wash.')
  const lostOwner = owner
  releaseBloomScene()
  losses += 1
  slot = { status: losses >= MAX_LOSSES ? 'failed' : 'lost' }
  lostOwner?.onLost()
}

function sceneFailed(scene: Promise<BloomScene>, error: unknown) {
  if ((slot.status !== 'loading' && slot.status !== 'live') || slot.scene !== scene) return
  console.warn('[breathflow] live bloom unavailable; keeping the painted wash.', error)
  slot.canvas.remove()
  slot = { status: 'failed' }
}

/** Test seam: forget everything, including a sticky failure. */
export function resetBloomSceneForTests() {
  releaseBloomScene()
  slot = { status: 'idle' }
  losses = 0
}

/**
 * Two layers: a painted CSS wash inside the anchor (stays if WebGPU/WebGL2
 * is unavailable or lost) and the live scene, lazily imported so three.js
 * stays out of BreathFlow's first chunk. The scene and its canvas outlive
 * the page: unmounting detaches it, the next BloomCanvas re-attaches it.
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
    const me = {
      onLost: () => {
        sceneRef.current = null
        setLive(false)
        latest.current.onLive?.(false)
        latest.current.onReady?.()
      },
    }
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
        if (slot.status === 'loading') slot = { ...slot, status: 'live' }
        setLive(true)
        latest.current.onLive?.(true)
        reveal()
      },
    }

    if ((slot.status === 'loading' || slot.status === 'live') && slot.reducedMotion !== reducedMotion) releaseBloomScene()
    if (slot.status === 'failed') {
      // The painted wash is all there is this visit; show the page now.
      latest.current.onReady?.()
      clearTimeout(timer)
      return
    }
    if (slot.status !== 'loading' && slot.status !== 'live') {
      const canvas = document.createElement('canvas')
      canvas.setAttribute('aria-hidden', 'true')
      Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' })
      const scene: Promise<BloomScene> = import('./catScene').then(({ createBloomScene }) =>
        createBloomScene({
          canvas,
          reducedMotion,
          night: latest.current.night,
          pigment: latest.current.pigment,
          onLost: () => sceneLost(scene),
          ...target,
        }),
      )
      slot = { status: 'loading', canvas, reducedMotion, scene }
      scene.catch((error: unknown) => sceneFailed(scene, error))
    }
    const { scene, canvas } = slot
    host.appendChild(canvas)
    owner = me
    scene.then(
      (bloom) => {
        if (owner !== me) return
        sceneRef.current = bloom
        bloom.attach(target)
        bloom.setPigment(latest.current.pigment)
        bloom.setNight(latest.current.night)
      },
      () => reveal(),
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

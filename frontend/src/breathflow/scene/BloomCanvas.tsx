import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react'
import { sx } from '@/styles/merge'
import { useSettingsStore } from '@/stores/settingsStore'
import type { Pigment } from '../pigments'
import { useReducedMotion } from '../platform/useReducedMotion'
import { wc } from '../styles/watercolor.stylex'
import type { BreathSample } from './breathDrive'
import type { BloomMode, BloomScene } from './bloomScene'

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
  style?: Parameters<typeof sx>[0]
}

/**
 * Two layers: a painted CSS wash inside the anchor (shows at once, and stays
 * if WebGPU/WebGL2 is unavailable) and the live scene, lazily imported so
 * three.js stays out of BreathFlow's first chunk. The scene fades in on its
 * first frame. A fresh GL canvas per effect run keeps StrictMode's double
 * mount from sharing a GPU context.
 */
export const BloomCanvas = forwardRef<BloomCanvasHandle, BloomCanvasProps>(function BloomCanvas(
  { anchorRef, pointerHostRef, mode, pigment, read, vignette = false, tick, onLive, style },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<BloomScene | null>(null)
  const [live, setLive] = useState(false)
  const reducedMotion = useReducedMotion()
  const night = useSettingsStore((s) => s.theme === 'dark')
  const initial = useRef({ pigment, night, read, onLive })
  initial.current.read = read
  initial.current.onLive = onLive

  useImperativeHandle(ref, () => ({
    poke: (x, y) => sceneRef.current?.poke(x, y),
  }), [])

  useEffect(() => {
    const host = hostRef.current
    const anchor = anchorRef.current
    if (!host || !anchor) return
    let disposed = false
    const gl = document.createElement('canvas')
    gl.setAttribute('aria-hidden', 'true')
    Object.assign(gl.style, { width: '100%', height: '100%', display: 'block' })
    host.appendChild(gl)

    void import('./bloomScene')
      .then(({ createBloomScene }) =>
        createBloomScene({
          canvas: gl,
          host,
          anchor,
          pointerHost: pointerHostRef?.current ?? host,
          mode,
          reducedMotion,
          night: initial.current.night,
          pigment: initial.current.pigment,
          vignette,
          read: () => initial.current.read(),
          onFirstFrame: () => {
            if (disposed) return
            setLive(true)
            initial.current.onLive?.(true)
          },
        }),
      )
      .then((scene) => {
        if (disposed) scene.dispose()
        else sceneRef.current = scene
      })
      .catch((error: unknown) => {
        console.warn('[breathflow] live bloom unavailable; keeping the painted wash.', error)
      })

    return () => {
      disposed = true
      sceneRef.current?.dispose()
      sceneRef.current = null
      gl.remove()
      setLive(false)
      initial.current.onLive?.(false)
    }
  }, [anchorRef, pointerHostRef, mode, reducedMotion, vignette])

  const { mass, glaze } = pigment
  useEffect(() => {
    initial.current.pigment = { name: '', mass, glaze }
    sceneRef.current?.setPigment({ name: '', mass, glaze })
  }, [mass, glaze])

  useEffect(() => {
    initial.current.night = night
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

import { useEffect, useRef, useState, type RefObject } from 'react'
import { sx } from '@/styles/merge'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { hero } from './landing.stylex'

/**
 * Two layers: a static painted field (tiny chunk, shows at once and is the
 * fallback) and the live WebGPU scene (three.js chunk), which fades in on its
 * first frame. The GL canvas is created per effect run so StrictMode's double
 * mount never shares a GPU context between renderers.
 */
export function HeroCanvas({ hostRef }: { hostRef: RefObject<HTMLElement | null> }) {
  const stillRef = useRef<HTMLCanvasElement>(null)
  const liveRef = useRef<HTMLDivElement>(null)
  const [painted, setPainted] = useState(false)
  const [live, setLive] = useState(false)
  // Portrait vs landscape decides where the droplet (and the painting around
  // it) sits; flipping orientation rebuilds the scene instead of re-laying it.
  const [landscape, setLandscape] = useState<boolean | null>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (height > 0) setLandscape(width / height > 1)
    })
    ro.observe(host)
    return () => ro.disconnect()
  }, [hostRef])

  useEffect(() => {
    const host = hostRef.current
    const still = stillRef.current
    const liveSlot = liveRef.current
    if (!host || !still || !liveSlot || landscape === null) return

    let disposed = false
    let scene: { dispose: () => void } | null = null
    const gl = document.createElement('canvas')
    gl.setAttribute('aria-hidden', 'true')
    Object.assign(gl.style, { width: '100%', height: '100%', display: 'block' })
    liveSlot.appendChild(gl)

    void (async () => {
      const { paintField, dropletFocus } = await import('./scene/painter')
      if (disposed) return
      const w = Math.max(1, host.clientWidth)
      const h = Math.max(1, host.clientHeight)
      const scale = Math.min(1, (w < 820 ? 1100 : 1700) / Math.max(w, h))
      const field = paintField(Math.round(w * scale), Math.round(h * scale), dropletFocus(w / h))
      still.width = field.color.width
      still.height = field.color.height
      still.getContext('2d')?.drawImage(field.color, 0, 0)
      setPainted(true)

      const { createHeroScene } = await import('./scene/heroScene')
      if (disposed) return
      const created = await createHeroScene({
        canvas: gl,
        host,
        field,
        reducedMotion,
        onFirstFrame: () => {
          if (!disposed) setLive(true)
        },
      })
      if (disposed) created.dispose()
      else scene = created
    })().catch((error: unknown) => {
      // No WebGPU/WebGL2: the painted field stays as a still.
      console.warn('[landing] live hero unavailable; showing the painted still.', error)
    })

    return () => {
      disposed = true
      scene?.dispose()
      gl.remove()
      setLive(false)
    }
  }, [hostRef, reducedMotion, landscape])

  return (
    <div {...sx(hero.stage)} aria-hidden="true">
      <canvas ref={stillRef} {...sx(hero.still, painted && hero.stillShown)} />
      <div ref={liveRef} {...sx(hero.live, live && hero.liveShown)} />
    </div>
  )
}

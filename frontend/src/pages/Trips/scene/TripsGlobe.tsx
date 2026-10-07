import { useEffect, useMemo, useRef, useState } from 'react'
import { sx } from '@/lib/utils'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useLatestCallback } from '@/hooks/useLatestCallback'
import { globe } from '../toy.stylex'
import { TOY, atlasPaths, centroid, projectOrtho, type LatLng } from './worldMap'
import type { GlobeMode, GlobePin, GlobeScene } from './globeScene'

export type { GlobePin, GlobeMode }

/** WebGPU, or the WebGL2 fallback three.js drops to on its own. */
function canRender3D(): boolean {
  if (typeof window === 'undefined') return false
  return 'gpu' in navigator || typeof window.WebGL2RenderingContext === 'function'
}

/**
 * The clay planet. A painted SVG still shows at once (and stays when there is
 * no GPU); the live three.js scene loads in its own chunk and fades in on its
 * first frame. The canvas is created per effect run so StrictMode's double
 * mount never shares a GPU context between renderers.
 */
export function TripsGlobe({
  mode,
  pins,
  focus,
  onSelect,
  description,
}: {
  mode: GlobeMode
  pins: GlobePin[]
  focus?: LatLng | null
  onSelect?: (id: string) => void
  /** Spoken summary; pins themselves live in the page's list. */
  description: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const liveRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const sceneRef = useRef<GlobeScene | null>(null)
  const pinsRef = useRef(pins)
  const focusRef = useRef(focus)
  const [live, setLive] = useState(false)
  const reducedMotion = useReducedMotion()
  const select = useLatestCallback((id: string) => onSelect?.(id))

  useEffect(() => {
    const host = hostRef.current
    const slot = liveRef.current
    if (!host || !slot || !canRender3D()) return
    let disposed = false
    const gl = document.createElement('canvas')
    gl.setAttribute('aria-hidden', 'true')
    Object.assign(gl.style, { width: '100%', height: '100%', display: 'block', touchAction: 'pan-y' })
    slot.appendChild(gl)
    void import('./globeScene')
      .then(({ createGlobeScene }) =>
        disposed
          ? null
          : createGlobeScene({
              canvas: gl,
              host,
              mode,
              pins: pinsRef.current,
              focus: focusRef.current,
              reducedMotion,
              label: labelRef.current,
              onSelect: select,
              onFirstFrame: () => {
                if (!disposed) setLive(true)
              },
            }),
      )
      .then((scene) => {
        if (!scene) return
        if (disposed) return scene.dispose()
        sceneRef.current = scene
        // Pins (and the focus) may have arrived while the renderer was starting.
        scene.setPins(pinsRef.current)
        scene.setFocus(focusRef.current)
      })
      .catch((error: unknown) => {
        console.warn('[trips] clay globe unavailable; showing the paper still.', error)
      })
    return () => {
      disposed = true
      sceneRef.current?.dispose()
      sceneRef.current = null
      gl.remove()
      setLive(false)
    }
  }, [mode, reducedMotion, select])

  useEffect(() => {
    pinsRef.current = pins
    sceneRef.current?.setPins(pins)
  }, [pins])

  const focusLat = focus?.lat
  const focusLng = focus?.lng
  useEffect(() => {
    const at = focusLat != null && focusLng != null ? { lat: focusLat, lng: focusLng } : null
    focusRef.current = at
    sceneRef.current?.setFocus(at)
  }, [focusLat, focusLng])

  return (
    <div ref={hostRef} role="img" aria-label={description} {...sx(globe.host, mode === 'region' && globe.hostRegion)}>
      <GlobeStill mode={mode} pins={pins} focus={focus} hidden={live} />
      <div ref={liveRef} {...sx(globe.live, live && globe.liveShown)} />
      <span ref={labelRef} aria-hidden {...sx(globe.label)} />
    </div>
  )
}

/** The paper still: an orthographic SVG of the same atlas and pins. */
function GlobeStill({ mode, pins, focus, hidden }: { mode: GlobeMode; pins: GlobePin[]; focus?: LatLng | null; hidden: boolean }) {
  const center = useMemo<LatLng>(() => {
    const c = focus ?? centroid(pins) ?? { lat: 25, lng: 130 }
    return { lat: Math.max(-10, Math.min(32, c.lat * 0.55)), lng: c.lng }
  }, [focus, pins])
  const shapes = useMemo(() => (mode === 'world' ? atlasPaths(center, 100) : []), [mode, center])
  const dots = useMemo(() => {
    if (mode === 'world') {
      return pins.flatMap((p) => {
        const at = projectOrtho(p, center, 100)
        return at ? [{ id: p.id, fill: p.fill, ...at }] : []
      })
    }
    const c = centroid(pins)
    if (!c) return []
    const raw = pins.map((p) => ({ id: p.id, fill: p.fill, x: (p.lng - c.lng) * Math.cos((c.lat * Math.PI) / 180), y: p.lat - c.lat }))
    const ext = Math.max(1e-6, ...raw.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
    return raw.map((p) => ({ ...p, x: (p.x / ext) * 62, y: (-p.y / ext) * 34 - 38 }))
  }, [mode, pins, center])

  return (
    <svg viewBox="-130 -130 260 260" aria-hidden {...sx(globe.still, hidden && globe.stillHidden)}>
      <ellipse cx="0" cy="122" rx="74" ry="7" fill={TOY.ink} opacity="0.14" />
      <circle r="100" fill={mode === 'world' ? TOY.ocean : TOY.mint} />
      {shapes.map((s, i) => (
        <path key={i} d={s.d} fill={s.fill} stroke={TOY.ink} strokeWidth="1.6" strokeLinejoin="round" />
      ))}
      {mode === 'region' && <ellipse cx="18" cy="30" rx="26" ry="12" fill={TOY.ocean} stroke={TOY.ink} strokeWidth="1.6" />}
      <circle r="100" fill="none" stroke={TOY.ink} strokeWidth="3" />
      {dots.length > 1 && (
        <polyline
          points={dots.map((d) => `${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke="#ffffff"
          strokeWidth="2"
          strokeDasharray="5 5"
          strokeLinecap="round"
        />
      )}
      {dots.map((d) => (
        <g key={d.id} transform={`translate(${d.x.toFixed(1)} ${d.y.toFixed(1)})`}>
          <path d="M0 0 L-3.4 -8 L3.4 -8 Z" fill={TOY.ink} />
          <circle cy="-11" r="6" fill={d.fill} stroke={TOY.ink} strokeWidth="1.6" />
        </g>
      ))}
      <ellipse rx="122" ry="34" transform="rotate(-16)" fill="none" stroke={TOY.ink} strokeOpacity="0.3" strokeWidth="1.4" strokeDasharray="4 6" />
      <path d="M96 -58 l16 -5 l-9 12 z M96 -58 l7 7 l2 -6 z" fill={TOY.paper} stroke={TOY.ink} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

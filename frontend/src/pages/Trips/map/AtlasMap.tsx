import { useEffect, useRef, useState, type ReactNode } from "react"
import { Box, Minus, Plus, Scan } from "lucide-react"
import { sx } from "@/styles/merge"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { projectToBox, type AtlasPin, type LngLat } from "./geo"
import type { AtlasMapHandle, FrameOptions } from "./engine"
import { mapStyles as s } from "./map.stylex"

// React host for the Trips map. The MapLibre engine is a lazy chunk; until it
// arrives (and wherever WebGL is missing) a static chart of the same pins
// stands in, so the page never has a hole in it.

export interface AtlasMapProps {
  pins: readonly AtlasPin[]
  routes?: readonly LngLat[][]
  /** Small non-interactive dots under the pins. */
  dots?: readonly LngLat[]
  /** The camera re-frames whenever this string changes. */
  frameKey: string
  /** Points to frame; defaults to the pins. */
  framePoints?: readonly LngLat[]
  /** Where to look when there is nothing to frame. */
  restCenter?: LngLat
  restZoom?: number
  activeId?: string | null
  hotId?: string | null
  onSelect?: (id: string) => void
  onHover?: (id: string | null) => void
  /** Hero globe: slow spin, page scroll passes through, no controls. */
  ambient?: boolean
  padding?: FrameOptions["padding"]
  maxZoom?: number
  /** Hide the zoom / tilt / fit buttons (small decorative previews). */
  bare?: boolean
  /** Start top-down rather than tilted into the buildings. */
  flat?: boolean
  label: string
  children?: ReactNode
}

export function useIsDark(): boolean {
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  )
  useEffect(() => {
    const root = document.documentElement
    const sync = () => setDark(root.classList.contains("dark"))
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])
  return dark
}

export function canRenderMap(): boolean {
  if (typeof window === "undefined" || typeof WebGL2RenderingContext === "undefined") return false
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"))
  } catch {
    return false
  }
}

export function AtlasMap({
  pins,
  routes,
  dots,
  frameKey,
  framePoints,
  restCenter,
  restZoom,
  activeId = null,
  hotId = null,
  onSelect,
  onHover,
  ambient = false,
  padding,
  maxZoom,
  bare = false,
  flat = false,
  label,
  children,
}: AtlasMapProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<AtlasMapHandle | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "static">("loading")
  const [tilted, setTilted] = useState(!flat)
  const reducedMotion = useReducedMotion()
  const dark = useIsDark()
  const select = useLatestCallback((id: string) => onSelect?.(id))
  const hover = useLatestCallback((id: string | null) => onHover?.(id))
  const latest = useRef({ pins, routes, dots, framePoints, restCenter, restZoom, padding, maxZoom, activeId, hotId, dark })
  latest.current = { pins, routes, dots, framePoints, restCenter, restZoom, padding, maxZoom, activeId, hotId, dark }
  const framedRef = useRef(false)

  const frame = (animate: boolean) => {
    const handle = handleRef.current
    if (!handle) return
    const now = latest.current
    const points = now.framePoints ?? now.pins
    if (points.length > 0) handle.frame(points, { animate, padding: now.padding, maxZoom: now.maxZoom })
    else if (now.restCenter) handle.flyTo(now.restCenter, now.restZoom ?? 4, { animate, padding: now.padding })
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    if (!canRenderMap()) {
      setStatus("static")
      return
    }
    let cancelled = false
    let handle: AtlasMapHandle | null = null
    let observer: ResizeObserver | null = null
    void import("./engine")
      .then(({ createAtlasMap }) => {
        if (cancelled) return
        const now = latest.current
        handle = createAtlasMap(host, {
          dark: now.dark,
          reducedMotion,
          ambient,
          flat,
          center: now.restCenter,
          zoom: now.restZoom,
          onSelect: select,
          onHover: hover,
          onError: () => setStatus("static"),
          onTilt: setTilted,
          onReady: () => {
            if (cancelled) return
            setStatus("ready")
          },
        })
        handleRef.current = handle
        handle.setPins(now.pins)
        handle.setRoute(now.routes ?? [])
        handle.setDots(now.dots ?? [])
        handle.setActive(now.activeId)
        handle.setHot(now.hotId)
        frame(false)
        framedRef.current = true
        if (ambient) handle.setSpin(true)
        observer = new ResizeObserver(() => handle?.resize())
        observer.observe(host)
      })
      .catch(() => {
        if (!cancelled) setStatus("static")
      })
    return () => {
      cancelled = true
      observer?.disconnect()
      handle?.destroy()
      handleRef.current = null
      framedRef.current = false
    }
    // The engine is created once; later prop changes flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambient, reducedMotion])

  useEffect(() => {
    handleRef.current?.setPins(pins)
  }, [pins])
  useEffect(() => {
    handleRef.current?.setRoute(routes ?? [])
  }, [routes])
  useEffect(() => {
    handleRef.current?.setDots(dots ?? [])
  }, [dots])
  useEffect(() => {
    handleRef.current?.setActive(activeId)
  }, [activeId])
  useEffect(() => {
    handleRef.current?.setHot(hotId)
  }, [hotId])
  useEffect(() => {
    handleRef.current?.setDark(dark)
  }, [dark])
  useEffect(() => {
    if (!framedRef.current) return
    frame(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey])

  return (
    <div {...sx(s.root, ambient && s.rootAmbient)} role="region" aria-label={label}>
      <div ref={hostRef} {...sx(s.canvas, status === "ready" && s.canvasReady)} />
      {status !== "ready" && !(ambient && status === "loading") && <StaticChart pins={pins} loading={status === "loading"} />}
      {status === "ready" && ambient && <span {...sx(s.shade)} aria-hidden />}
      {status === "ready" && !ambient && !bare && (
        <div {...sx(s.controls)}>
          <button type="button" {...sx(s.control)} aria-label="Zoom in" onClick={() => handleRef.current?.zoomBy(1)}>
            <Plus size={16} strokeWidth={1.75} aria-hidden />
          </button>
          <button type="button" {...sx(s.control)} aria-label="Zoom out" onClick={() => handleRef.current?.zoomBy(-1)}>
            <Minus size={16} strokeWidth={1.75} aria-hidden />
          </button>
          <span {...sx(s.controlRule)} aria-hidden />
          <button
            type="button"
            {...sx(s.control, tilted && s.controlOn)}
            aria-label="3D tilt"
            aria-pressed={tilted}
            onClick={() => setTilted(handleRef.current?.toggleTilt() ?? tilted)}
          >
            <Box size={16} strokeWidth={1.75} aria-hidden />
          </button>
          <button type="button" {...sx(s.control)} aria-label="Fit all stops" onClick={() => frame(true)}>
            <Scan size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      )}
      {children}
    </div>
  )
}

/** Graticule + plotted pins: the loading state and the no-WebGL fallback. */
function StaticChart({ pins, loading }: { pins: readonly AtlasPin[]; loading: boolean }) {
  const W = 400
  const H = 300
  const points = projectToBox(pins, W, H, 56)
  return (
    <svg
      {...sx(s.chart, loading && s.chartLoading)}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {Array.from({ length: 9 }, (_, i) => (
        <line key={`v${i}`} x1={i * 50} y1={0} x2={i * 50} y2={H} {...sx(s.chartRule)} />
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={i * 50} x2={W} y2={i * 50} {...sx(s.chartRule)} />
      ))}
      {points.length > 1 && (
        <polyline points={points.map((p) => `${p.x},${p.y}`).join(" ")} {...sx(s.chartRoute)} />
      )}
      {points.map((p, i) => (
        <circle key={pins[i]!.id} cx={p.x} cy={p.y} r={4} {...sx(s.chartDot)} />
      ))}
    </svg>
  )
}

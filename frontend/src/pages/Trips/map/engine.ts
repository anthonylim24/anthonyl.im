import { AttributionControl, LngLatBounds, Map as MapLibre, Marker, setWorkerUrl, type GeoJSONSource } from "maplibre-gl"
import type { FeatureCollection } from "geojson"
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url"
import "maplibre-gl/dist/maplibre-gl.css"
import { buildMapStyle } from "./mapStyle"
import { centroid, spanMeters, type AtlasPin, type LngLat } from "./geo"

// Imperative MapLibre wrapper. Lazy-imported by AtlasMap so the map library
// stays out of the initial Trips chunk. Pins are DOM markers (real buttons:
// focusable, labelled, styled by `.atlas-pin` in index.css); the route is one
// GeoJSON line layer re-added whenever the style is swapped for the theme.

setWorkerUrl(workerUrl)

export interface AtlasMapOptions {
  dark: boolean
  reducedMotion: boolean
  /** Starting camera, used until the first `frame`. */
  center?: LngLat
  zoom?: number
  /** Hero globes: no scroll-zoom hijack, slow idle rotation. */
  ambient?: boolean
  onSelect?: (id: string) => void
  onHover?: (id: string | null) => void
  onReady?: () => void
  onError?: () => void
}

export interface FrameOptions {
  animate?: boolean
  /** Space kept clear of pins, in CSS pixels. */
  padding?: { top: number; right: number; bottom: number; left: number }
  maxZoom?: number
}

export interface AtlasMapHandle {
  setPins(pins: readonly AtlasPin[]): void
  setRoute(lines: readonly LngLat[][]): void
  setActive(id: string | null): void
  setHot(id: string | null): void
  frame(points: readonly LngLat[], opts?: FrameOptions): void
  flyTo(point: LngLat, zoom: number, opts?: FrameOptions): void
  setDark(dark: boolean): void
  zoomBy(delta: number): void
  toggleTilt(): boolean
  setSpin(on: boolean): void
  resize(): void
  destroy(): void
}

const ROUTE_SOURCE = "atlas-route"
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] }

interface PinEntry {
  pin: AtlasPin
  marker: Marker
  el: HTMLButtonElement
}

function pinElement(pin: AtlasPin): HTMLButtonElement {
  const el = document.createElement("button")
  el.type = "button"
  applyPin(el, pin)
  return el
}

function applyPin(el: HTMLButtonElement, pin: AtlasPin) {
  el.className = `atlas-pin atlas-pin--${pin.variant ?? "stop"}${pin.fresh ? " atlas-pin--fresh" : ""}`
  el.setAttribute("aria-label", pin.title)
  el.dataset.pinId = pin.id
  if (pin.accent) el.dataset.tripAccent = pin.accent
  else delete el.dataset.tripAccent
  const body = el.firstElementChild ?? el.appendChild(document.createElement("span"))
  body.className = "atlas-pin__body"
  body.textContent = pin.variant === "trip" ? pin.title : (pin.label ?? "")
}

export function createAtlasMap(container: HTMLElement, options: AtlasMapOptions): AtlasMapHandle {
  const { reducedMotion, ambient = false } = options
  let dark = options.dark
  let destroyed = false
  let route: readonly LngLat[][] = []
  let active: string | null = null
  let hot: string | null = null
  let tilted = true
  let spin = false
  let spinFrame = 0
  let lastSpin = 0
  let userBusy = false
  const pins = new Map<string, PinEntry>()

  const map = new MapLibre({
    container,
    style: buildMapStyle(dark),
    center: options.center ? [options.center.lng, options.center.lat] : [12, 24],
    zoom: options.zoom ?? 1.4,
    interactive: true,
    minZoom: 0.6,
    maxZoom: 18.5,
    maxPitch: 70,
    attributionControl: false,
    // The hero globe turns under a mouse drag but never traps the page:
    // no wheel zoom, and touch scrolls straight past it.
    scrollZoom: !ambient,
    doubleClickZoom: !ambient,
    touchZoomRotate: !ambient,
    touchPitch: !ambient,
    keyboard: !ambient,
    dragPan: !ambient || window.matchMedia?.("(pointer: fine)").matches !== false,
    dragRotate: !ambient,
    fadeDuration: reducedMotion ? 0 : 250,
    canvasContextAttributes: { antialias: true },
  })

  // Bottom-left on working maps: the concierge button owns the other corner.
  map.addControl(new AttributionControl({ compact: true }), ambient ? "bottom-right" : "bottom-left")

  const routeData = (): FeatureCollection =>
    route.length === 0
      ? EMPTY
      : {
          type: "FeatureCollection",
          features: route
            .filter((line) => line.length > 1)
            .map((line) => ({
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: line.map((p) => [p.lng, p.lat]) },
            })),
        }

  const accent = () => getComputedStyle(container).getPropertyValue("--ta-fill").trim() || "#f0582b"

  const installRoute = () => {
    if (map.getSource(ROUTE_SOURCE)) return
    map.addSource(ROUTE_SOURCE, { type: "geojson", data: routeData() })
    const beforeId = map.getLayer("water-label") ? "water-label" : undefined
    map.addLayer(
      {
        id: "atlas-route-glow",
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": accent(), "line-width": 9, "line-opacity": 0.14, "line-blur": 6 },
      },
      beforeId,
    )
    map.addLayer(
      {
        id: "atlas-route",
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": accent(), "line-width": 2.25, "line-dasharray": [0.2, 2.2] },
      },
      beforeId,
    )
  }

  map.on("style.load", installRoute)
  map.once("load", () => {
    if (destroyed) return
    options.onReady?.()
  })
  map.on("error", (event) => {
    // Tile hiccups are routine; only a dead GL context ends the map.
    if (map.getCanvas().getContext("webgl2")?.isContextLost()) options.onError?.()
    else if (import.meta.env.DEV) console.debug("[atlas-map]", event.error?.message)
  })

  const markBusy = () => {
    userBusy = true
  }
  const markIdle = () => {
    userBusy = false
    lastSpin = 0
  }
  map.on("mousedown", markBusy)
  map.on("touchstart", markBusy)
  map.on("mouseup", markIdle)
  map.on("touchend", markIdle)
  map.on("dragend", markIdle)

  const spinStep = (now: number) => {
    spinFrame = 0
    if (destroyed || !spin) return
    if (!userBusy && !map.isMoving() && document.visibilityState === "visible") {
      const dt = lastSpin ? Math.min(now - lastSpin, 80) : 16
      const center = map.getCenter()
      // One revolution every four minutes: readable, never dizzy.
      map.jumpTo({ center: [center.lng + (360 / 240_000) * dt, center.lat] })
    }
    lastSpin = now
    spinFrame = requestAnimationFrame(spinStep)
  }

  const classes = (entry: PinEntry) => {
    entry.el.classList.toggle("atlas-pin--active", entry.pin.id === active)
    entry.el.classList.toggle("atlas-pin--hot", entry.pin.id === hot)
  }

  const cameraFor = (points: readonly LngLat[]) => {
    const span = spanMeters(points)
    // City-scale frames tilt into the 3D buildings; country-scale stay flat.
    const pitch = !tilted ? 0 : span < 30_000 ? 52 : span < 400_000 ? 30 : 0
    const bearing = pitch > 40 ? -14 : 0
    return { pitch, bearing }
  }

  /** Zoom at which the globe just fits the container. */
  const globeZoom = () => {
    const size = Math.min(container.clientWidth, container.clientHeight) || 480
    return Math.log2((size * 0.86 * Math.PI) / 512)
  }

  const handle: AtlasMapHandle = {
    setPins(next) {
      const seen = new Set<string>()
      for (const pin of next) {
        seen.add(pin.id)
        const existing = pins.get(pin.id)
        if (existing) {
          const moved = existing.pin.lat !== pin.lat || existing.pin.lng !== pin.lng
          existing.pin = pin
          applyPin(existing.el, pin)
          if (moved) existing.marker.setLngLat([pin.lng, pin.lat])
          classes(existing)
          continue
        }
        const el = pinElement(pin)
        el.addEventListener("click", (event) => {
          event.stopPropagation()
          options.onSelect?.(pin.id)
        })
        el.addEventListener("mouseenter", () => options.onHover?.(pin.id))
        el.addEventListener("mouseleave", () => options.onHover?.(null))
        el.addEventListener("focus", () => options.onHover?.(pin.id))
        el.addEventListener("blur", () => options.onHover?.(null))
        const marker = new Marker({
          element: el,
          anchor: pin.variant === "stop" ? "bottom" : pin.variant === "trip" ? "left" : "center",
          subpixelPositioning: true,
        })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map)
        const entry = { pin, marker, el }
        pins.set(pin.id, entry)
        classes(entry)
      }
      for (const [id, entry] of pins) {
        if (seen.has(id)) continue
        entry.marker.remove()
        pins.delete(id)
      }
    },
    setRoute(lines) {
      route = lines
      const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined
      source?.setData(routeData())
    },
    setActive(id) {
      active = id
      for (const entry of pins.values()) classes(entry)
    },
    setHot(id) {
      hot = id
      for (const entry of pins.values()) classes(entry)
    },
    frame(points, opts = {}) {
      if (points.length === 0) return
      const animate = opts.animate !== false && !reducedMotion
      if (ambient) {
        // Hero globe: keep the whole sphere in view and just turn it to face
        // the points.
        const mid = centroid(points)!
        const target = { center: [mid.lng, Math.max(-38, Math.min(38, mid.lat))] as [number, number], zoom: globeZoom() }
        if (animate) map.easeTo({ ...target, duration: 1400, essential: true })
        else map.jumpTo(target)
        return
      }
      const padding = opts.padding ?? { top: 72, right: 72, bottom: 72, left: 72 }
      if (points.length === 1 || spanMeters(points) < 60) {
        const only = points[0]!
        const zoom = opts.maxZoom ?? 14.5
        const close = tilted && zoom > 11
        const target = {
          center: [only.lng, only.lat] as [number, number],
          zoom,
          padding,
          pitch: close ? 52 : 0,
          bearing: close ? -14 : 0,
        }
        if (animate) map.flyTo({ ...target, duration: 1800, essential: true })
        else map.jumpTo(target)
        return
      }
      const bounds = new LngLatBounds()
      for (const point of points) bounds.extend([point.lng, point.lat])
      map.fitBounds(bounds, {
        padding,
        maxZoom: opts.maxZoom ?? 15.6,
        ...cameraFor(points),
        duration: animate ? 1600 : 0,
        essential: true,
      })
    },
    flyTo(point, zoom, opts = {}) {
      const animate = opts.animate !== false && !reducedMotion
      const target = {
        center: [point.lng, point.lat] as [number, number],
        zoom,
        padding: opts.padding,
        pitch: tilted && zoom > 11 ? 52 : 0,
        bearing: tilted && zoom > 11 ? -14 : 0,
      }
      if (animate) map.flyTo({ ...target, duration: 2200, essential: true })
      else map.jumpTo(target)
    },
    setDark(next) {
      if (next === dark) return
      dark = next
      map.setStyle(buildMapStyle(dark), { diff: false })
    },
    zoomBy(delta) {
      map.easeTo({ zoom: map.getZoom() + delta, duration: reducedMotion ? 0 : 260 })
    },
    toggleTilt() {
      tilted = !tilted
      map.easeTo({ pitch: tilted ? 52 : 0, bearing: tilted ? -14 : 0, duration: reducedMotion ? 0 : 600 })
      return tilted
    },
    setSpin(on) {
      spin = on && !reducedMotion
      if (spin && !spinFrame) {
        lastSpin = 0
        spinFrame = requestAnimationFrame(spinStep)
      }
    },
    resize() {
      map.resize()
      if (ambient && !map.isMoving()) map.jumpTo({ zoom: globeZoom() })
    },
    destroy() {
      destroyed = true
      if (spinFrame) cancelAnimationFrame(spinFrame)
      for (const entry of pins.values()) entry.marker.remove()
      pins.clear()
      map.remove()
    },
  }
  return handle
}

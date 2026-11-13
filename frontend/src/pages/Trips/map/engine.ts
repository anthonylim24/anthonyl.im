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
  /** Fires when the camera settles, with whether it is tilted into 3D. */
  onTilt?: (tilted: boolean) => void
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
  /** Small non-interactive dots (every stop on the overview). */
  setDots(points: readonly LngLat[]): void
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
const DOTS_SOURCE = "atlas-dots"

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
  if (el.classList.contains("atlas-pin--flip-keep")) el.classList.add("atlas-pin--flip")
}

export function createAtlasMap(container: HTMLElement, options: AtlasMapOptions): AtlasMapHandle {
  const { reducedMotion, ambient = false } = options
  let dark = options.dark
  let destroyed = false
  let route: readonly LngLat[][] = []
  let dots: readonly LngLat[] = []
  let lastFrame: { points: readonly LngLat[]; opts: FrameOptions } | null = null
  let active: string | null = null
  let hot: string | null = null
  let tilted = true
  let spin = false
  let spinFrame = 0
  let lastSpin = 0
  let userBusy = false
  /** The user has moved the camera since the last programmatic frame. */
  let touched = false
  const pins = new Map<string, PinEntry>()

  const map = new MapLibre({
    container,
    style: buildMapStyle(dark, { labels: !ambient }),
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
  // Start the credit collapsed to its (i) button; it opens on tap. MapLibre
  // re-opens it when the first sources arrive, so collapse again on load.
  const collapseCredit = () => {
    const credit = container.querySelector(".maplibregl-ctrl-attrib")
    credit?.classList.remove("maplibregl-compact-show")
    credit?.removeAttribute("open")
  }
  collapseCredit()
  map.once("load", collapseCredit)

  // One feature per distinct leg, so an out-and-back walk draws one line.
  const routeData = (): FeatureCollection => {
    const seen = new Set<string>()
    const features: FeatureCollection["features"] = []
    for (const line of route) {
      for (let i = 1; i < line.length; i++) {
        const from = line[i - 1]!
        const to = line[i]!
        const a = `${from.lng.toFixed(5)},${from.lat.toFixed(5)}`
        const b = `${to.lng.toFixed(5)},${to.lat.toFixed(5)}`
        if (a === b) continue
        const key = a < b ? `${a}|${b}` : `${b}|${a}`
        if (seen.has(key)) continue
        seen.add(key)
        features.push({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [[from.lng, from.lat], [to.lng, to.lat]] },
        })
      }
    }
    return { type: "FeatureCollection", features }
  }

  const dotsData = (): FeatureCollection => ({
    type: "FeatureCollection",
    features: dots.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })),
  })

  const accent = () => getComputedStyle(container).getPropertyValue("--ta-fill").trim() || "#f0582b"

  const installRoute = () => {
    if (map.getSource(ROUTE_SOURCE)) return
    map.addSource(ROUTE_SOURCE, { type: "geojson", data: routeData() })
    const beforeId = map.getLayer("water-label") ? "water-label" : undefined
    const paper = getComputedStyle(container).getPropertyValue("--trips-raised").trim() || "#ffffff"
    map.addLayer(
      {
        id: "atlas-route-case",
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": paper, "line-width": 5, "line-opacity": 0.7 },
      },
      beforeId,
    )
    map.addLayer(
      {
        id: "atlas-route",
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": accent(), "line-width": 2, "line-opacity": 0.75 },
      },
      beforeId,
    )
    map.addSource(DOTS_SOURCE, { type: "geojson", data: dotsData() })
    map.addLayer(
      {
        id: "atlas-dots",
        type: "circle",
        source: DOTS_SOURCE,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 1.5, 10, 3, 14, 4.5],
          "circle-color": accent(),
          "circle-opacity": 0.7,
          "circle-stroke-color": paper,
          "circle-stroke-width": 1,
        },
      },
      beforeId,
    )
  }

  map.on("style.load", installRoute)
  map.once("load", () => {
    if (destroyed) return
    // A frame requested before the style loaded may not have taken: redo it.
    if (lastFrame) handle.frame(lastFrame.points, { ...lastFrame.opts, animate: false })
    options.onReady?.()
  })
  map.on("moveend", () => options.onTilt?.(map.getPitch() > 5))

  // Trip chips sit to the right of their dot, or to the left once the dot is
  // on the right half of the globe, so a label never hangs off the sphere.
  const placeLabels = () => {
    const mid = container.clientWidth / 2
    for (const entry of pins.values()) {
      if (entry.pin.variant !== "trip") continue
      const flip = map.project([entry.pin.lng, entry.pin.lat]).x > mid
      entry.el.classList.toggle("atlas-pin--flip", flip)
      entry.el.classList.toggle("atlas-pin--flip-keep", flip)
    }
  }
  map.on("move", placeLabels)
  map.on("error", (event) => {
    // Tile hiccups are routine; only a dead GL context ends the map.
    if (map.getCanvas().getContext("webgl2")?.isContextLost()) options.onError?.()
    else if (import.meta.env.DEV) console.debug("[atlas-map]", event.error?.message)
  })

  const markBusy = () => {
    userBusy = true
    touched = true
  }
  map.on("wheel", () => {
    touched = true
  })
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
    return Math.log2((size * 0.9 * Math.PI) / 512)
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
          anchor: pin.variant === "stop" ? "bottom" : "center",
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
      placeLabels()
    },
    setDots(points) {
      dots = points
      const source = map.getSource(DOTS_SOURCE) as GeoJSONSource | undefined
      source?.setData(dotsData())
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
      lastFrame = { points, opts }
      touched = false
      const animate = opts.animate !== false && !reducedMotion
      if (ambient) {
        // Hero globe: keep the whole sphere in view and just turn it to face
        // the points.
        const mid = centroid(points)!
        const lat = Math.max(-38, Math.min(38, mid.lat))
        const target = { center: [mid.lng, lat] as [number, number], zoom: globeZoom() }
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
      const view = cameraFor(points)
      const fit = map.cameraForBounds(bounds, { padding, maxZoom: opts.maxZoom ?? 15.6, bearing: view.bearing })
      if (!fit) return
      // cameraForBounds fits a top-down view; a tilted camera sees a little
      // further at the top, so sit slightly tighter.
      const target = { ...fit, pitch: view.pitch, bearing: view.bearing, padding }
      if (animate) map.easeTo({ ...target, duration: 1600, essential: true })
      else map.jumpTo(target)
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
      map.setStyle(buildMapStyle(dark, { labels: !ambient }), { diff: false })
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
      if (!ambient && lastFrame && !touched && !map.isMoving()) handle.frame(lastFrame.points, { ...lastFrame.opts, animate: false })
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

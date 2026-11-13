import { AttributionControl, LngLatBounds, Map as MapLibre, Marker, setWorkerUrl, type GeoJSONSource } from "maplibre-gl"
import type { FeatureCollection } from "geojson"
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url"
import "maplibre-gl/dist/maplibre-gl.css"
import { buildMapStyle } from "./mapStyle"
import { centroid, distanceMeters, spanMeters, type AtlasPin, type LngLat } from "./geo"

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
  /** Start top-down (small reference maps); the tilt button still works. */
  flat?: boolean
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
const GUARD_SOURCE = "atlas-guard"

interface PinEntry {
  pin: AtlasPin
  marker: Marker
  el: HTMLButtonElement
}

/**
 * A leg drawn as a shallow arc rather than a ruler line: it reads as "then
 * on to", never as a street, and two legs between the same stops bow apart.
 */
function arc(from: LngLat, to: LngLat, leg = 0): Array<[number, number]> {
  // Alternate the side and vary the depth so legs sharing a corridor bow apart.
  const bow = (leg % 2 === 0 ? 1 : -1) * (0.12 + (leg % 3) * 0.07)
  const k = Math.cos((((from.lat + to.lat) / 2) * Math.PI) / 180)
  const dx = (to.lng - from.lng) * k
  const dy = to.lat - from.lat
  // Control point: off the midpoint, perpendicular to the leg, 14% of its length.
  const cx = (from.lng + to.lng) / 2 + (-dy * bow) / k
  const cy = (from.lat + to.lat) / 2 + dx * bow
  const points: Array<[number, number]> = []
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    const u = 1 - t
    points.push([u * u * from.lng + 2 * u * t * cx + t * t * to.lng, u * u * from.lat + 2 * u * t * cy + t * t * to.lat])
  }
  return points
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
  let tilted = !options.flat
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
          // `leg` = position of the stop this leg arrives at (0-based).
          properties: { leg: i },
          geometry: { type: "LineString", coordinates: arc(from, to, i) },
        })
      }
    }
    return { type: "FeatureCollection", features }
  }

  const guardData = (): FeatureCollection => ({
    type: "FeatureCollection",
    features: [...pins.values()].map(({ pin }) => ({
      type: "Feature",
      properties: { kind: pin.variant ?? "stop", title: pin.title },
      geometry: { type: "Point", coordinates: [pin.lng, pin.lat] },
    })),
  })

  const dotsData = (): FeatureCollection => ({
    type: "FeatureCollection",
    features: dots.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })),
  })

  const accent = () => getComputedStyle(container).getPropertyValue("--ta-fill").trim() || "#f0582b"

  // With a stop selected, the legs into and out of it stay solid and the
  // rest of the day's route steps back.
  const emphasise = () => {
    if (!map.getLayer("atlas-route")) return
    const entry = active ? pins.get(active) : undefined
    const at = entry && entry.pin.variant !== "trip" ? Number(entry.pin.label) - 1 : NaN
    const opacity = Number.isFinite(at)
      ? (["case", ["any", ["==", ["get", "leg"], at], ["==", ["get", "leg"], at + 1]], 1, 0.25] as never)
      : 1
    map.setPaintProperty("atlas-route", "line-opacity", opacity)
    map.setPaintProperty("atlas-route-way", "text-opacity", opacity)
  }

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
        paint: { "line-color": paper, "line-width": 7, "line-opacity": 0.85 },
      },
      beforeId,
    )
    map.addLayer(
      {
        id: "atlas-route",
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": accent(), "line-width": 3.25 },
      },
      beforeId,
    )
    // Direction of travel: small chevrons riding each leg.
    map.addLayer({
      id: "atlas-route-way",
      type: "symbol",
      source: ROUTE_SOURCE,
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 140,
        "text-field": "›",
        "text-font": ["Noto Sans Bold"],
        "text-size": 34,
        "text-keep-upright": false,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": accent(), "text-halo-color": paper, "text-halo-width": 3 },
    })
    // Invisible collision boxes where the pins stand, placed above every
    // basemap label so place names step aside instead of running under a pin.
    map.addSource(GUARD_SOURCE, { type: "geojson", data: guardData() })
    map.addLayer({
      id: "atlas-guard",
      type: "symbol",
      source: GUARD_SOURCE,
      filter: ["!=", ["get", "kind"], "trip"],
      layout: { "text-field": "O", "text-font": ["Noto Sans Bold"], "text-size": 44, "text-anchor": "bottom", "text-allow-overlap": true, "text-padding": 4 },
      paint: { "text-opacity": 0 },
    })
    map.addLayer({
      id: "atlas-guard-chip",
      type: "symbol",
      source: GUARD_SOURCE,
      filter: ["==", ["get", "kind"], "trip"],
      layout: { "text-field": ["concat", "O ", ["get", "title"], " O"], "text-font": ["Noto Sans Bold"], "text-size": 22, "text-allow-overlap": true, "text-padding": 6 },
      paint: { "text-opacity": 0 },
    })
    emphasise()
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
  map.on("moveend", () => {
    // Camera readout for tests and screenshots tooling.
    container.dataset.camera = `${map.getZoom().toFixed(1)}z ${Math.round(map.getPitch())}p`
    options.onTilt?.(map.getPitch() > 5)
  })

  // Trip chips sit to the right of their dot, or to the left once the dot is
  // on the right half of the globe, so a label never hangs off the sphere.
  const placeLabels = () => {
    const mid = container.clientWidth / 2
    for (const entry of pins.values()) {
      if (entry.pin.variant !== "trip") continue
      const flip = map.project([entry.pin.lng, entry.pin.lat]).x > mid
      entry.el.classList.toggle("atlas-pin--flip", flip)
      entry.el.classList.toggle("atlas-pin--flip-keep", flip)
      // Near the limb a chip would hang off the sphere: keep just the dot.
      const centre = map.getCenter()
      const away = distanceMeters({ lat: centre.lat, lng: centre.lng }, entry.pin)
      entry.el.classList.toggle("atlas-pin--far", ambient && away > 6_200_000)
      entry.el.classList.toggle("atlas-pin--edge", ambient && away > 8_600_000)
    }
  }
  map.on("move", placeLabels)

  // Stops that land on top of each other are nudged apart sideways so every
  // number stays readable (and clickable) at the current zoom.
  const declutter = () => {
    const placed: Array<{ x: number; y: number }> = []
    const stops = [...pins.values()].filter((entry) => entry.pin.variant === "stop")
    const projected = stops
      .map((entry) => ({ entry, at: map.project([entry.pin.lng, entry.pin.lat]) }))
      .sort((a, b) => a.at.x - b.at.x)
    for (const { entry, at } of projected) {
      let x = at.x
      for (let pass = 0; pass < 6; pass++) {
        const hit = placed.find((p) => Math.abs(p.x - x) < 30 && Math.abs(p.y - at.y) < 26)
        if (!hit) break
        x = hit.x + 30
      }
      placed.push({ x, y: at.y })
      entry.marker.setOffset([Math.round(x - at.x), 0])
    }
  }
  map.on("moveend", declutter)
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
      declutter()
      ;(map.getSource(GUARD_SOURCE) as GeoJSONSource | undefined)?.setData(guardData())
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
      emphasise()
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
      // A host that has not been laid out yet (or is smaller than its
      // padding) makes MapLibre throw on a NaN camera; the resize observer
      // frames again once there is room.
      if (
        container.clientWidth <= padding.left + padding.right + 8 ||
        container.clientHeight <= padding.top + padding.bottom + 8
      ) {
        return
      }
      let fit: ReturnType<typeof map.cameraForBounds>
      try {
        fit = map.cameraForBounds(bounds, { padding, maxZoom: opts.maxZoom ?? 15.8, bearing: view.bearing })
      } catch {
        return
      }
      if (!fit) return
      // cameraForBounds fits a top-down view; a tilted camera sees a little
      // further at the top, so sit slightly tighter.
      // A tilted camera shows more ground above the centre than below it, so
      // the pins would ride high over an empty foreground: weight the top.
      const lift = view.pitch > 40 ? Math.round(container.clientHeight * 0.13) : 0
      const target = {
        ...fit,
        pitch: view.pitch,
        bearing: view.bearing,
        padding: { ...padding, top: padding.top + lift, bottom: Math.max(24, padding.bottom - lift / 2) },
      }
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

// ── Cover stills ─────────────────────────────────────────────────────────

export interface StillRequest {
  key: string
  points: readonly LngLat[]
  /** Used when the trip has no pinned stops yet. */
  center?: LngLat
  /** The trip's accent fill, as a CSS colour. */
  color: string
}

const STILL_W = 660
const STILL_H = 440

/**
 * Render small map pictures (one per trip card) with a single off-screen map,
 * one after another, and hand each back as a data URL. Returns a cancel
 * function; the map is torn down when the queue drains or on cancel.
 */
export function renderStills(
  requests: readonly StillRequest[],
  dark: boolean,
  onStill: (key: string, url: string) => void,
): () => void {
  if (requests.length === 0) return () => {}
  const host = document.createElement("div")
  host.setAttribute("aria-hidden", "true")
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${STILL_W}px;height:${STILL_H}px;pointer-events:none;visibility:hidden`
  document.body.appendChild(host)
  let cancelled = false
  const map = new MapLibre({
    container: host,
    // No basemap labels on covers: the card title names the place, and dots
    // would otherwise sit on top of the city's own label.
    style: buildMapStyle(dark, { labels: false }),
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    pixelRatio: 1,
    canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true },
  })
  const finish = () => {
    cancelled = true
    map.remove()
    host.remove()
  }
  const settled = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 9000)
      map.once("idle", () => {
        clearTimeout(timer)
        resolve()
      })
    })

  map.once("load", () => {
    void (async () => {
      const empty: FeatureCollection = { type: "FeatureCollection", features: [] }
      // Stops that would overprint each other merge into one counted badge.
      map.addSource("still", { type: "geojson", data: empty, cluster: true, clusterRadius: 26, clusterMaxZoom: 17 })
      map.addSource("still-route", { type: "geojson", data: empty })
      const ring = dark ? "#0b0d10" : "#ffffff"
      map.addLayer({
        id: "still-route",
        type: "line",
        source: "still-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 2, "line-opacity": dark ? 0.8 : 0.45 },
      })
      map.addLayer({
        id: "still-dot",
        type: "circle",
        source: "still",
        filter: ["!", ["has", "point_count"]],
        paint: { "circle-radius": 5.5, "circle-color": ["get", "color"], "circle-stroke-color": ring, "circle-stroke-width": 2 },
      })
      map.addLayer({
        id: "still-cluster",
        type: "circle",
        source: "still",
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 11, 20, 16, 80, 21],
          "circle-color": "#000000",
          "circle-stroke-color": ring,
          "circle-stroke-width": 2,
        },
      })
      map.addLayer({
        id: "still-count",
        type: "symbol",
        source: "still",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-allow-overlap": true },
        paint: { "text-color": "#ffffff" },
      })
      for (const request of requests) {
        if (cancelled) return
        const city = request.points.length > 1 && spanMeters(request.points) < 60_000
        ;(map.getSource("still") as GeoJSONSource).setData({
          type: "FeatureCollection",
          features: request.points.map((p) => ({
            type: "Feature",
            properties: { color: request.color },
            geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          })),
        })
        // Within one city the stops are joined in order, like the day map.
        ;(map.getSource("still-route") as GeoJSONSource).setData(
          city
            ? {
                type: "FeatureCollection",
                features: [
                  {
                    type: "Feature",
                    properties: { color: request.color },
                    geometry: { type: "LineString", coordinates: request.points.map((p) => [p.lng, p.lat]) },
                  },
                ],
              }
            : empty,
        )
        map.setPaintProperty("still-cluster", "circle-color", request.color)
        if (request.points.length > 1 && spanMeters(request.points) > 60) {
          const bounds = new LngLatBounds()
          for (const p of request.points) bounds.extend([p.lng, p.lat])
          const fit = map.cameraForBounds(bounds, { padding: { top: 90, right: 80, bottom: 70, left: 80 }, maxZoom: 14 })
          if (fit) map.jumpTo({ ...fit, pitch: city ? 40 : 0, bearing: city ? -12 : 0 })
        } else {
          const at = request.points[0] ?? request.center
          if (!at) continue
          map.jumpTo({ center: [at.lng, at.lat], zoom: request.points.length ? 12.5 : 9.5, pitch: 0, bearing: 0 })
        }
        await settled()
        if (cancelled) return
        try {
          onStill(request.key, map.getCanvas().toDataURL("image/webp", 0.82))
        } catch {
          /* A tainted or lost canvas just leaves the chart cover in place. */
        }
      }
      if (!cancelled) finish()
    })()
  })
  return () => {
    if (!cancelled) finish()
  }
}

import { AttributionControl, LngLatBounds, Map as MapLibre, Marker, setWorkerUrl, type GeoJSONSource } from "maplibre-gl"
import type { FeatureCollection } from "geojson"
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url"
import "maplibre-gl/dist/maplibre-gl.css"
import { buildMapStyle } from "./mapStyle"
import { centroid, distanceMeters, spanMeters, spreadPins, type AreaShape, type AtlasPin, type LngLat } from "./geo"
import { ideaHoverHandlers, type ReportIdeaHover } from "./ideaHover"
import { FOLD_MAX_ZOOM, HEART_REACH, foldIdeas } from "./ideaFolds"

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
  /** A wishlist pin was picked, with the idea's id. */
  onSelectIdea?: (ideaId: string) => void
  /** A wishlist pin was hovered or focused (null: no longer, or the camera moved). */
  onIdeaHover?: ReportIdeaHover
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
  /**
   * Top-down whatever the tilt. A tilted camera magnifies the near edge of
   * a fitted box past the sides of the view, which a pin's padding absorbs
   * but a drawn area's outline does not.
   */
  flat?: boolean
}

export interface AtlasMapHandle {
  setPins(pins: readonly AtlasPin[]): void
  /**
   * Wishlist pins: their own marker set, drawn over the stops (a hovered,
   * lit or active stop still rises over them). Hearts that would sit on
   * each other at the current zoom are drawn as one counted heart that
   * zooms in to them. They never frame the camera, join the stops'
   * declutter or the label guard, or light up as the active or hovered stop.
   */
  setIdeaPins(pins: readonly AtlasPin[]): void
  setRoute(lines: readonly LngLat[][]): void
  /** Small non-interactive dots (every stop on the overview). */
  setDots(points: readonly LngLat[]): void
  setActive(id: string | null): void
  setHot(id: string | null): void
  /** One neighborhood under the pins: a soft fill and a hairline edge, dashed when `approximate`. Null clears it. */
  setArea(area: AreaShape | null): void
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
const AREA_SOURCE = "atlas-area"
/** The ambient globe's spin step (see `spinStep`). */
const SPIN_STEP_MS = 66

interface PinEntry {
  pin: AtlasPin
  marker: Marker
  el: HTMLButtonElement
}

/** Wishlist hearts drawn as one: their ids in list order. */
interface FoldEntry {
  ids: string[]
  names: string[]
  /** The middle of its hearts, where the fold stands. */
  at: LngLat
  marker: Marker
  el: HTMLButtonElement
}

/** Room kept around a fold's hearts when it zooms in to them, in CSS pixels. */
const FOLD_PADDING = 64
/** How far above its point a stop's body is centred (a 30 px body on a 7 px stem). */
const STOP_BODY_RISE = 22

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

/** Lucide's heart, the wishlist's mark inside its pins. */
const HEART = "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"

function heart(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("aria-hidden", "true")
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
  path.setAttribute("d", HEART)
  svg.appendChild(path)
  return svg
}

/** Lucide's hotel, stroked: where the traveller sleeps. */
const HOTEL = [
  "M10 22v-6.57",
  "M12 11h.01",
  "M12 7h.01",
  "M14 15.43V22",
  "M15 16a5 5 0 0 0-6 0",
  "M16 11h.01",
  "M16 7h.01",
  "M8 11h.01",
  "M8 7h.01",
  "M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z",
]

function hotel(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(ns, "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("aria-hidden", "true")
  for (const d of HOTEL) {
    const path = document.createElementNS(ns, "path")
    path.setAttribute("d", d)
    svg.appendChild(path)
  }
  return svg
}

/** The hotel mark on a lodging stop's corner. Inside the body, so it lifts and scales with the pin. */
function hotelMark(): HTMLSpanElement {
  const mark = document.createElement("span")
  mark.className = "atlas-pin__mark"
  mark.appendChild(hotel())
  return mark
}

/** A heart with a count: several wishlist places that would sit on each other at this zoom. */
function foldElement(): HTMLButtonElement {
  const el = document.createElement("button")
  el.type = "button"
  el.className = "atlas-pin atlas-pin--idea atlas-pin--fold"
  const body = document.createElement("span")
  body.className = "atlas-pin__body"
  const count = document.createElement("span")
  count.className = "atlas-pin__count"
  count.setAttribute("aria-hidden", "true")
  body.append(heart(), count)
  el.append(body)
  return el
}

/** Reports a wishlist pin's hover and keyboard focus, for the map's preview card; a fold's report names its places. */
function watchIdeaHover(el: HTMLButtonElement, id: string, options: AtlasMapOptions, names?: readonly string[]) {
  const report = options.onIdeaHover
  if (!report) return
  const on = ideaHoverHandlers(id, report, names)
  el.setAttribute("aria-describedby", on["aria-describedby"])
  el.addEventListener("pointerenter", on.onPointerEnter)
  el.addEventListener("pointerleave", on.onPointerLeave)
  el.addEventListener("pointerdown", on.onPointerDown)
  el.addEventListener("focus", on.onFocus)
  el.addEventListener("blur", on.onBlur)
}

function applyPin(el: HTMLButtonElement, pin: AtlasPin) {
  el.className = `atlas-pin atlas-pin--${pin.variant ?? "stop"}${pin.fresh ? " atlas-pin--fresh" : ""}`
  if (pin.accent) el.dataset.tripAccent = pin.accent
  else delete el.dataset.tripAccent
  const body = el.firstElementChild ?? el.appendChild(document.createElement("span"))
  body.className = "atlas-pin__body"
  if (pin.variant === "idea") {
    // A wishlist place, named as one. No `title`: hovering shows the map's preview card instead.
    el.setAttribute("aria-label", `${pin.title}, on the wishlist`)
    el.dataset.ideaId = pin.id
    if (!body.firstElementChild) body.replaceChildren(heart())
    return
  }
  el.setAttribute("aria-label", pin.title)
  el.dataset.pinId = pin.id
  if (pin.variant === "hotel") {
    el.title = pin.title
    if (!body.firstElementChild) body.replaceChildren(hotel())
    return
  }
  if (pin.variant === "trip") body.textContent = pin.title
  else body.replaceChildren(pin.label ?? "", ...(pin.lodging ? [hotelMark()] : []))
  if (el.classList.contains("atlas-pin--flip-keep")) el.classList.add("atlas-pin--flip")
}

export function createAtlasMap(container: HTMLElement, options: AtlasMapOptions): AtlasMapHandle {
  const { reducedMotion, ambient = false } = options
  let dark = options.dark
  let destroyed = false
  let route: readonly LngLat[][] = []
  let dots: readonly LngLat[] = []
  let area: AreaShape | null = null
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
  /** Wishlist pins, kept apart from `pins` so nothing that reads stops sees them. */
  const ideas = new Map<string, PinEntry>()
  /** Hearts drawn as one at the current zoom, by their ids joined. */
  const folds = new Map<string, FoldEntry>()

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
    // A 3x phone would draw 2.25 times the pixels of 2x for a difference
    // nobody sees on a moving map with antialiased lines; past 2 it costs frames.
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    // The host (AtlasMap) watches the container and calls `resize()`, which
    // also re-frames; MapLibre's own observer would redraw a second time, and
    // redraw a hidden map at a placeholder size.
    trackResize: false,
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

  const areaData = (): FeatureCollection => ({
    type: "FeatureCollection",
    features: area ? [{ type: "Feature", properties: { approximate: area.approximate }, geometry: area.geometry }] : [],
  })

  // Over the streets and under the 3D buildings and the route, so a tilted
  // camera sees the area on the ground between the houses.
  const installArea = () => {
    if (map.getSource(AREA_SOURCE)) return
    map.addSource(AREA_SOURCE, { type: "geojson", data: areaData() })
    const color = accent()
    map.addLayer(
      { id: "atlas-area-fill", type: "fill", source: AREA_SOURCE, paint: { "fill-color": color, "fill-opacity": dark ? 0.2 : 0.13 } },
      map.getLayer("building-3d") ? "building-3d" : undefined,
    )
    const edge = map.getLayer("atlas-route-case") ? "atlas-route-case" : undefined
    const line = { "line-color": color, "line-width": 1.5, "line-opacity": 0.9 }
    map.addLayer(
      { id: "atlas-area-edge", type: "line", source: AREA_SOURCE, filter: ["!=", ["get", "approximate"], true], layout: { "line-join": "round" }, paint: line },
      edge,
    )
    // A dashed edge carries half the ink of a solid one, so it draws heavier to read as clearly.
    map.addLayer(
      { id: "atlas-area-guess", type: "line", source: AREA_SOURCE, filter: ["==", ["get", "approximate"], true], paint: { ...line, "line-width": 2, "line-dasharray": [3, 2] } },
      edge,
    )
  }

  map.on("style.load", installRoute)
  map.on("style.load", installArea)
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
  // Runs on every `move`, after MapLibre has written each marker's transform:
  // reading the container's size here would force a style and layout pass
  // per frame. The workspace maps have no chips at all, so they skip it.
  let chips = 0
  // Measured when the map is made and on each resize, where layout is already clean.
  let mid = container.clientWidth / 2
  map.on("resize", () => {
    mid = container.clientWidth / 2
  })
  const placeLabels = () => {
    if (chips === 0) return
    const centre = map.getCenter()
    for (const entry of pins.values()) {
      if (entry.pin.variant !== "trip") continue
      const flip = map.project([entry.pin.lng, entry.pin.lat]).x > mid
      entry.el.classList.toggle("atlas-pin--flip", flip)
      entry.el.classList.toggle("atlas-pin--flip-keep", flip)
      // Near the limb a chip would hang off the sphere: keep just the dot.
      const away = distanceMeters({ lat: centre.lat, lng: centre.lng }, entry.pin)
      entry.el.classList.toggle("atlas-pin--far", ambient && away > 6_200_000)
      entry.el.classList.toggle("atlas-pin--edge", ambient && away > 8_600_000)
    }
  }
  map.on("move", placeLabels)

  // Stops that land on top of each other are nudged apart sideways so every
  // number stays readable (and clickable) at the current zoom.
  const declutter = () => {
    const stops = [...pins.values()].filter((entry) => entry.pin.variant === "stop")
    const offsets = spreadPins(
      stops.map(({ pin }, i) => {
        const at = map.project([pin.lng, pin.lat])
        const rank = Number(pin.label)
        return { id: pin.id, x: at.x, y: at.y, rank: Number.isFinite(rank) ? rank : i }
      }),
    )
    for (const entry of stops) {
      const dx = offsets.get(entry.pin.id) ?? 0
      if (entry.marker.getOffset().x !== dx) entry.marker.setOffset([dx, 0])
    }
  }
  map.on("moveend", declutter)

  /** Zoom in until a fold's hearts stand apart (or, on one spot, as far as folding goes). */
  const zoomToIdeas = (ids: readonly string[]) => {
    const points = ids.flatMap((id) => {
      const pin = ideas.get(id)?.pin
      return pin ? [pin] : []
    })
    if (points.length === 0) return
    const lngs = points.map((point) => point.lng)
    const lats = points.map((point) => point.lat)
    const bearing = map.getBearing()
    let fit: ReturnType<typeof map.cameraForBounds>
    try {
      fit = map.cameraForBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: FOLD_PADDING, maxZoom: FOLD_MAX_ZOOM, bearing },
      )
    } catch {
      return
    }
    if (!fit) return
    touched = true
    map.easeTo({ ...fit, bearing, pitch: map.getPitch(), duration: reducedMotion ? 0 : 700, essential: true })
  }

  /**
   * Fold the hearts that would sit under each other's target at this zoom
   * into one counted heart each; past `FOLD_MAX_ZOOM`, spread the ones on
   * one spot sideways instead. Keyboard focus stays on the place it was on,
   * on whichever heart now stands for it.
   */
  const refold = () => {
    const shown = [...ideas.values()]
    const active = document.activeElement
    const focused = shown.find((entry) => entry.el === active)?.pin.id ?? [...folds.values()].find((entry) => entry.el === active)?.ids[0]
    const screen = shown.map(({ pin }, rank) => {
      const at = map.project([pin.lng, pin.lat])
      return { id: pin.id, x: at.x, y: at.y, rank }
    })
    // A camera that eased to the last zoom of folding can stop a hair short of it.
    const close = map.getZoom() < FOLD_MAX_ZOOM - 0.01
    const groups = close ? foldIdeas(screen) : screen.map((at) => [at.id])
    const kept = new Set<string>()
    for (const ids of groups) {
      for (const id of ids) {
        const { el } = ideas.get(id)!
        // A heart folded away from under the mouse hears no leave: its preview goes now.
        if (ids.length > 1 && !el.classList.contains("atlas-pin--folded") && el.matches(":hover")) options.onIdeaHover?.(null)
        el.classList.toggle("atlas-pin--folded", ids.length > 1)
      }
      if (ids.length < 2) continue
      const key = ids.join(" ")
      kept.add(key)
      const members = ids.map((id) => ideas.get(id)!.pin)
      const mid = centroid(members)!
      const names = members.map((pin) => pin.title)
      const existing = folds.get(key)
      if (existing && existing.names.join("\n") === names.join("\n")) {
        existing.marker.setLngLat([mid.lng, mid.lat])
        existing.at = mid
        continue
      }
      existing?.marker.remove()
      const el = foldElement()
      el.setAttribute("aria-label", `${ids.length} wishlist places here: zoom in`)
      el.dataset.ideaFold = ids.join(" ")
      el.querySelector(".atlas-pin__count")!.textContent = String(ids.length)
      el.addEventListener("click", (event) => {
        event.stopPropagation()
        zoomToIdeas(ids)
      })
      watchIdeaHover(el, ids[0]!, options, names)
      const marker = new Marker({ element: el, anchor: "center", subpixelPositioning: true }).setLngLat([mid.lng, mid.lat]).addTo(map)
      folds.set(key, { ids, names, at: mid, marker, el })
    }
    for (const [key, entry] of folds) {
      if (kept.has(key)) continue
      entry.marker.remove()
      folds.delete(key)
    }
    const spread = close ? new Map<string, number>() : spreadPins(screen)
    // Hearts stand over the stops, so a heart on a stop's body steps down to
    // the stop's foot: a tap on either body still lands on that pin.
    const bodies = [...pins.values()].flatMap(({ pin, marker }) => {
      if (pin.variant !== "stop" && pin.variant !== "hotel") return []
      const at = map.project([pin.lng, pin.lat])
      const offset = marker.getOffset()
      return [{ x: at.x + offset.x, y: at.y + offset.y - (pin.variant === "stop" ? STOP_BODY_RISE : 0) }]
    })
    const clearOf = (x: number, y: number) => {
      let dy = 0
      for (let pass = 0; pass < 3; pass++) {
        const under = bodies.filter((body) => Math.abs(body.x - x) < HEART_REACH && Math.abs(body.y - (y + dy)) < HEART_REACH)
        if (under.length === 0) break
        dy = Math.max(...under.map((body) => body.y + HEART_REACH + 2 - y))
      }
      return Math.round(dy)
    }
    const place = (marker: Marker, x: number, y: number, dx: number) => {
      const dy = clearOf(x + dx, y)
      const now = marker.getOffset()
      if (now.x !== dx || now.y !== dy) marker.setOffset([dx, dy])
    }
    shown.forEach((entry, rank) => {
      if (!entry.el.classList.contains("atlas-pin--folded")) place(entry.marker, screen[rank]!.x, screen[rank]!.y, spread.get(entry.pin.id) ?? 0)
    })
    for (const entry of folds.values()) {
      const at = map.project([entry.at.lng, entry.at.lat])
      place(entry.marker, at.x, at.y, 0)
    }
    if (focused === undefined) return
    const own = ideas.get(focused)
    const now = own?.el.classList.contains("atlas-pin--folded") ? [...folds.values()].find((entry) => entry.ids.includes(focused))?.el : own?.el
    if (now && now !== active) now.focus({ preventScroll: true })
  }
  map.on("moveend", refold)
  // A preview sits beside where its pin was: while the camera moves (a hover
  // that lands mid-flight included), it goes and none starts.
  map.on("move", () => options.onIdeaHover?.(null))
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
    // One revolution every four minutes moves the globe's face about a third
    // of a pixel in 66 ms. Redrawing the whole globe every frame for a tenth
    // of a pixel kept the index's main thread busy for good, so the spin
    // steps at ~15 fps: it still reads as a smooth turn.
    if (lastSpin && now - lastSpin < SPIN_STEP_MS) {
      spinFrame = requestAnimationFrame(spinStep)
      return
    }
    if (!userBusy && !map.isMoving() && document.visibilityState === "visible") {
      const dt = lastSpin ? Math.min(now - lastSpin, 120) : 16
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
        // One id can change kind between days (a hotel is a numbered stop on
        // its check-in day and a hotel pin on the next), and a marker's
        // anchor is fixed when it is made: a new kind gets a new marker.
        if (existing && (existing.pin.variant ?? "stop") !== (pin.variant ?? "stop")) {
          existing.marker.remove()
          pins.delete(pin.id)
        } else if (existing) {
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
        // Markers stack in page order: a stop made after the hearts goes in under them.
        const firstIdea = el.parentElement?.querySelector(":scope > .atlas-pin--idea")
        if (firstIdea) el.parentElement!.insertBefore(el, firstIdea)
        const entry = { pin, marker, el }
        pins.set(pin.id, entry)
        classes(entry)
      }
      for (const [id, entry] of pins) {
        if (seen.has(id)) continue
        entry.marker.remove()
        pins.delete(id)
      }
      chips = 0
      for (const entry of pins.values()) if (entry.pin.variant === "trip") chips++
      placeLabels()
      declutter()
      // The hearts step clear of the stops' bodies where they stand now.
      refold()
      ;(map.getSource(GUARD_SOURCE) as GeoJSONSource | undefined)?.setData(guardData())
    },
    setIdeaPins(next) {
      const seen = new Set<string>()
      for (const pin of next) {
        seen.add(pin.id)
        const existing = ideas.get(pin.id)
        if (existing) {
          const moved = existing.pin.lat !== pin.lat || existing.pin.lng !== pin.lng
          existing.pin = pin
          applyPin(existing.el, pin)
          if (moved) existing.marker.setLngLat([pin.lng, pin.lat])
          continue
        }
        const el = pinElement(pin)
        el.addEventListener("click", (event) => {
          event.stopPropagation()
          options.onSelectIdea?.(pin.id)
        })
        watchIdeaHover(el, pin.id, options)
        const marker = new Marker({ element: el, anchor: "center", subpixelPositioning: true }).setLngLat([pin.lng, pin.lat]).addTo(map)
        ideas.set(pin.id, { pin, marker, el })
      }
      for (const [id, entry] of ideas) {
        if (seen.has(id)) continue
        entry.marker.remove()
        ideas.delete(id)
      }
      refold()
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
    setArea(next) {
      area = next
      const source = map.getSource(AREA_SOURCE) as GeoJSONSource | undefined
      source?.setData(areaData())
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
        const close = tilted && zoom > 11 && !opts.flat
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
      const view = opts.flat ? { pitch: 0, bearing: 0 } : cameraFor(points)
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
      // From what the camera shows: a flat frame leaves the preference tilted.
      tilted = map.getPitch() <= 5
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
      for (const entry of ideas.values()) entry.marker.remove()
      for (const entry of folds.values()) entry.marker.remove()
      pins.clear()
      ideas.clear()
      folds.clear()
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
  /**
   * One label per point, in order ("1", "2"…). Labelled points are drawn as
   * numbered pins and never merged into a count badge.
   */
  labels?: readonly string[]
  /** Ink for the labels on `color`. */
  labelColor?: string
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
  /** The map is gone (drained or cancelled); pictures already taken still arrive unless cancelled. */
  let finished = false
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
    finished = true
    map.remove()
    host.remove()
  }
  // toBlob copies the pixels at once and encodes off the main thread, where
  // toDataURL encoded on it (about 15 ms a still: a dropped frame each).
  const deliver = (key: string) => {
    map.getCanvas().toBlob(
      (blob) => {
        if (!blob || cancelled) return
        const reader = new FileReader()
        reader.onload = () => {
          if (!cancelled && typeof reader.result === "string") onStill(key, reader.result)
        }
        reader.readAsDataURL(blob)
      },
      "image/webp",
      0.82,
    )
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
      // Numbered pins (print): never clustered, so "2" is always stop 2.
      map.addSource("still-pins", { type: "geojson", data: empty })
      map.addLayer({
        id: "still-pin",
        type: "circle",
        source: "still-pins",
        paint: { "circle-radius": 9, "circle-color": ["get", "color"], "circle-stroke-color": ring, "circle-stroke-width": 2 },
      })
      map.addLayer({
        id: "still-pin-label",
        type: "symbol",
        source: "still-pins",
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 11,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": ["get", "ink"] },
      })
      for (const request of requests) {
        if (cancelled) return
        const city = request.points.length > 1 && spanMeters(request.points) < 60_000
        const numbered = request.labels?.length === request.points.length
        const points: FeatureCollection = {
          type: "FeatureCollection",
          features: request.points.map((p, i) => ({
            type: "Feature",
            properties: { color: request.color, label: request.labels?.[i] ?? "", ink: request.labelColor ?? "#ffffff" },
            geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          })),
        }
        ;(map.getSource("still") as GeoJSONSource).setData(numbered ? empty : points)
        ;(map.getSource("still-pins") as GeoJSONSource).setData(numbered ? points : empty)
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
          deliver(request.key)
        } catch {
          /* A tainted or lost canvas just leaves the chart cover in place. */
        }
      }
      if (!finished) finish()
    })()
  })
  return () => {
    cancelled = true
    if (!finished) finish()
  }
}

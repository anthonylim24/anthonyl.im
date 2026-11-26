import { describe, expect, it, vi } from "vitest"
import type { AtlasPin } from "../map/geo"

// The engine against a stand-in MapLibre: enough of a map to place DOM
// markers and record camera moves, so the wishlist's marker set can be
// checked against the stops' without WebGL.

const { markers, camera, mapEvents, drawn } = vi.hoisted(() => {
  const camera = {
    moves: 0,
    zoom: 16,
    pitch: 0,
    fitted: null as unknown,
    fitPadding: null as unknown,
    eased: null as unknown,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    /** Where a jump left the camera; a zoom of null is `zoom`. */
    view: { lng: 0, lat: 0, zoom: null as number | null },
  }
  /**
   * Where the stand-in map draws a point: 1000 px a degree at `zoom`, twice
   * that a level in, about the middle of a map `width` by `height`. Tilted,
   * the near half spreads and the far half closes in, as a camera's do.
   */
  const drawn = ([lng, lat]: [number, number], width: number, height: number, view = camera.view) => {
    const k = 1000 * 2 ** ((view.zoom ?? camera.zoom) - camera.zoom)
    const dx = (lng - view.lng) * k
    const dy = -(lat - view.lat) * k
    const spread = camera.pitch > 0 ? (dy > 0 ? 1.6 : 0.8) : 1
    return { x: width / 2 + dx * spread, y: height / 2 + dy * spread }
  }
  return { markers: [] as Array<{ el: HTMLElement; removed: boolean; dx: number; dy: number }>, camera, mapEvents: new Map<string, Array<() => void>>(), drawn }
})

vi.mock("maplibre-gl", () => {
  class FakeMap {
    container: HTMLElement
    constructor(options: { container: HTMLElement }) {
      this.container = options.container
    }
    addControl() {}
    on(type: string, fn: () => void) {
      mapEvents.set(type, [...(mapEvents.get(type) ?? []), fn])
    }
    once() {}
    getSource() {
      return undefined
    }
    getLayer() {
      return undefined
    }
    getCanvasContainer() {
      return this.container
    }
    project(at: [number, number] | { lng: number; lat: number }) {
      return drawn(Array.isArray(at) ? at : [at.lng, at.lat], this.container.clientWidth, this.container.clientHeight)
    }
    unproject([x, y]: [number, number]) {
      const k = 1000 * 2 ** ((camera.view.zoom ?? camera.zoom) - camera.zoom)
      return { lng: camera.view.lng + (x - this.container.clientWidth / 2) / k, lat: camera.view.lat - (y - this.container.clientHeight / 2) / k }
    }
    getCenter() {
      return { lat: camera.view.lat, lng: camera.view.lng }
    }
    getZoom() {
      return camera.zoom
    }
    getBearing() {
      return 0
    }
    getPitch() {
      return camera.pitch
    }
    getPadding() {
      return camera.padding
    }
    /** A top-down fit about the box's middle, as MapLibre's; a map not laid out fits at the farthest zoom. */
    cameraForBounds(bounds: [[number, number], [number, number]], options: { maxZoom: number; padding: { top: number; right: number; bottom: number; left: number } }) {
      camera.fitted = bounds
      camera.fitPadding = options.padding
      const [[west, south], [east, north]] = bounds
      const { padding } = options
      const wide = this.container.clientWidth - padding.left - padding.right - camera.padding.left - camera.padding.right
      const tall = this.container.clientHeight - padding.top - padding.bottom - camera.padding.top - camera.padding.bottom
      if (wide <= 0 || tall <= 0) return { center: [0, 0], zoom: options.maxZoom }
      const fits = Math.min(wide / Math.max(1e-9, (east - west) * 1000), tall / Math.max(1e-9, (north - south) * 1000))
      return { center: [(west + east) / 2, (south + north) / 2], zoom: Math.min(options.maxZoom, camera.zoom + Math.log2(fits)) }
    }
    jumpTo(options: { center?: [number, number] | { lng: number; lat: number }; zoom?: number }) {
      camera.moves++
      if (options.center) {
        const [lng, lat] = Array.isArray(options.center) ? options.center : [options.center.lng, options.center.lat]
        camera.view.lng = lng
        camera.view.lat = lat
      }
      if (options.zoom !== undefined) camera.view.zoom = options.zoom === camera.zoom ? null : options.zoom
    }
    easeTo(options: unknown) {
      camera.moves++
      camera.eased = options
    }
    flyTo() {
      camera.moves++
    }
    remove() {}
  }
  class FakeMarker {
    entry: { el: HTMLElement; removed: boolean; dx: number; dy: number }
    offset = { x: 0, y: 0 }
    constructor(options: { element: HTMLElement }) {
      this.entry = { el: options.element, removed: false, dx: 0, dy: 0 }
      markers.push(this.entry)
    }
    setLngLat() {
      return this
    }
    addTo(map: FakeMap) {
      map.container.appendChild(this.entry.el)
      return this
    }
    getOffset() {
      return this.offset
    }
    setOffset([x, y]: [number, number]) {
      this.offset = { x, y }
      this.entry.dx = x
      this.entry.dy = y
      return this
    }
    remove() {
      this.entry.removed = true
      this.entry.el.remove()
    }
  }
  return {
    AttributionControl: class {},
    LngLatBounds: class {},
    Map: FakeMap,
    Marker: FakeMarker,
    setWorkerUrl: () => {},
  }
})
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?url", () => ({ default: "worker.js" }))
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}))

import { createAtlasMap } from "../map/engine"

const stop = (id: string, label: string, lng: number): AtlasPin => ({ id, lat: 38.7, lng, title: `Stop ${label}`, label, variant: "stop" })
const idea = (id: string, lng: number, title = `Idea ${id}`): AtlasPin => ({ id, lat: 38.71, lng, title, variant: "idea" })
const described = (container: HTMLElement, pin: Element) => container.querySelector(`[id="${pin.getAttribute("aria-describedby")}"]`)?.textContent

function setup({ overlays }: { overlays?: () => Element[] } = {}) {
  markers.length = 0
  camera.moves = 0
  camera.zoom = 16
  camera.fitted = null
  camera.fitPadding = null
  camera.eased = null
  camera.padding = { top: 0, right: 0, bottom: 0, left: 0 }
  camera.pitch = 0
  camera.view = { lng: 0, lat: 0, zoom: null }
  mapEvents.clear()
  const container = document.createElement("div")
  document.body.appendChild(container)
  const onSelect = vi.fn()
  const onSelectIdea = vi.fn()
  const onHover = vi.fn()
  const onIdeaHover = vi.fn()
  const handle = createAtlasMap(container, { dark: false, reducedMotion: true, onSelect, onSelectIdea, onHover, onIdeaHover, overlays })
  return { container, handle, onSelect, onSelectIdea, onHover, onIdeaHover }
}

describe("the map engine's wishlist pins", () => {
  it("draws ideas as their own buttons and names the idea when one is picked", () => {
    const { container, handle, onSelect, onSelectIdea, onHover } = setup()
    handle.setPins([stop("s1", "1", -9.1)])
    handle.setIdeaPins([idea("ramen", -9.12, "Ramen Jiro")])

    const pin = container.querySelector<HTMLButtonElement>('[data-idea-id="ramen"]')!
    expect(pin.className).toBe("atlas-pin atlas-pin--idea")
    expect(pin.getAttribute("aria-label")).toBe("Ramen Jiro, on the wishlist")
    // No native tooltip: hovering shows the map's preview card.
    expect(pin.title).toBe("")
    expect(pin.querySelector("svg")).not.toBeNull()

    pin.click()
    expect(onSelectIdea).toHaveBeenCalledWith("ramen")
    expect(onSelect).not.toHaveBeenCalled()
    // Hovering an idea never lights up a stop.
    pin.dispatchEvent(new MouseEvent("mouseenter"))
    pin.focus()
    expect(onHover).not.toHaveBeenCalled()
  })

  it("describes an idea from the start, and drops the description with it", () => {
    const { container, handle } = setup()
    handle.setIdeaPins([{ ...idea("ramen", -9.12, "Ramen Jiro"), description: "Food & cafés, Lisbon" }, idea("bare", -9.0)])
    const pin = container.querySelector<HTMLButtonElement>('[data-idea-id="ramen"]')!
    expect(described(container, pin)).toBe("Food & cafés, Lisbon")
    expect(container.querySelector('[data-idea-id="bare"]')!.hasAttribute("aria-describedby")).toBe(false)

    handle.setIdeaPins([{ ...idea("ramen", -9.12, "Ramen Jiro"), description: "Food & cafés, Lisbon. Rua da Rosa 1" }])
    expect(described(container, pin)).toBe("Food & cafés, Lisbon. Rua da Rosa 1")
    const note = pin.getAttribute("aria-describedby")!
    handle.setIdeaPins([])
    expect(document.getElementById(note)).toBeNull()
  })

  it("reports a mouse or keyboard focus resting on an idea for its preview, and never a tap", () => {
    const { container, handle, onIdeaHover, onHover } = setup()
    handle.setIdeaPins([idea("ramen", -9.12, "Ramen Jiro")])
    const pin = container.querySelector<HTMLButtonElement>('[data-idea-id="ramen"]')!

    pin.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "touch" }))
    expect(onIdeaHover).not.toHaveBeenCalled()

    pin.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }))
    expect(onIdeaHover).toHaveBeenLastCalledWith({ id: "ramen", anchor: pin, via: "pointer" })
    pin.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }))
    expect(onIdeaHover).toHaveBeenLastCalledWith(null, "leave")

    pin.focus()
    expect(onIdeaHover).toHaveBeenLastCalledWith({ id: "ramen", anchor: pin, via: "focus" })
    // While the camera moves the pin is somewhere else: the preview goes, even
    // for a hover that landed after the flight began.
    for (const fn of mapEvents.get("movestart") ?? []) fn()
    pin.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }))
    expect(onIdeaHover).toHaveBeenLastCalledWith({ id: "ramen", anchor: pin, via: "pointer" })
    for (const fn of mapEvents.get("move") ?? []) fn()
    expect(onIdeaHover).toHaveBeenLastCalledWith(null)
    expect(onHover).not.toHaveBeenCalled()
  })

  it("updates ideas without touching the stops' markers or the camera", () => {
    const { container, handle } = setup()
    handle.setPins([stop("s1", "1", -9.1), stop("s2", "2", -9.2)])
    handle.frame([{ lat: 38.7, lng: -9.1 }])
    const stopEls = [...container.querySelectorAll("[data-pin-id]")]
    const moves = camera.moves

    handle.setIdeaPins([idea("a", -9.11), idea("b", -9.12)])
    const first = container.querySelector('[data-idea-id="a"]')
    handle.setIdeaPins([idea("a", -9.11, "Renamed"), idea("c", -9.13)])

    expect([...container.querySelectorAll("[data-pin-id]")]).toEqual(stopEls)
    expect(stopEls.every((el) => el.isConnected)).toBe(true)
    expect(camera.moves).toBe(moves)
    // "a" kept its marker and took the new name; "b" went; "c" arrived.
    expect(container.querySelector('[data-idea-id="a"]')).toBe(first)
    expect(first!.getAttribute("aria-label")).toBe("Renamed, on the wishlist")
    expect(container.querySelector('[data-idea-id="b"]')).toBeNull()
    expect(container.querySelector('[data-idea-id="c"]')).not.toBeNull()

    handle.setIdeaPins([])
    expect(container.querySelectorAll("[data-idea-id]")).toHaveLength(0)
    expect(container.querySelectorAll("[data-pin-id]")).toHaveLength(2)
  })

  it("keeps ideas out of the stops' set: new stops leave them be, and destroy clears both", () => {
    const { container, handle } = setup()
    handle.setIdeaPins([idea("a", -9.11)])
    const ideaEl = container.querySelector('[data-idea-id="a"]')
    handle.setPins([stop("s1", "1", -9.1)])
    handle.setActive("a")
    expect(container.querySelector('[data-idea-id="a"]')).toBe(ideaEl)
    expect(ideaEl!.classList.contains("atlas-pin--active")).toBe(false)

    handle.destroy()
    expect(markers.every((m) => m.removed)).toBe(true)
  })
})

describe("the map engine's wishlist folds", () => {
  const moveEnd = () => {
    for (const fn of mapEvents.get("moveend") ?? []) fn()
  }
  const fold = (container: HTMLElement) => container.querySelector<HTMLButtonElement>(".atlas-pin--fold")
  const folded = (container: HTMLElement) => [...container.querySelectorAll(".atlas-pin--folded")].map((el) => (el as HTMLElement).dataset.ideaId)

  it("draws hearts over the stops, a stop made after them included", () => {
    const { container, handle } = setup()
    handle.setPins([stop("s1", "1", -9.1)])
    handle.setIdeaPins([idea("a", -9.11)])
    handle.setPins([stop("s1", "1", -9.1), stop("s2", "2", -9.2)])
    // The check-in stop becomes the next day's hotel: a new marker, still under the hearts.
    handle.setPins([{ id: "s2", lat: 38.7, lng: -9.2, title: "Hotel", variant: "hotel" }, stop("s3", "3", -9.3)])
    const order = [...container.children].map((el) => (el as HTMLElement).dataset.pinId ?? `idea:${(el as HTMLElement).dataset.ideaId}`)
    expect(order[order.length - 1]).toBe("idea:a")
  })

  it("steps a heart down off a stop's body, so a tap on either lands on its own pin", () => {
    const { handle } = setup()
    const offsetOf = (id: string) => markers.find((m) => !m.removed && m.el.dataset.ideaId === id)!
    // On this map a stop's body is centred 22 px above its point: y -38722 for s1.
    handle.setIdeaPins([idea("on", -9.1), idea("clear", -9.3)])
    expect(offsetOf("on").dy).toBe(0)
    handle.setPins([stop("s1", "1", -9.1)])
    expect(offsetOf("on").dy).toBe(12)
    expect(offsetOf("clear").dy).toBe(0)
    handle.setPins([])
    expect(offsetOf("on").dy).toBe(0)
  })

  it.each([
    // Wide: clear of the key by keeping the hearts to its left (820 - 670 + 22 from the right edge).
    ["a wide map", 820, 820, [764, 12, 808, 173], [670, 181, 808, 217], { top: 64, right: 100, bottom: 64, left: 64 }],
    // Narrow: that would leave a sliver, so the hearts go below the key instead (217 + 22 from the top).
    ["a phone's map", 390, 724, [334, 12, 378, 173], [240, 181, 378, 217], { top: 167, right: 64, bottom: 64, left: 64 }],
  ])("zooms a fold in clear of the controls and key drawn over %s", (_, width, height, controlsAt, keyAt, padding) => {
    const box = ([left, top, right, bottom]: number[]) => () => ({ left, top, right, bottom, width: right! - left!, height: bottom! - top!, x: left, y: top }) as DOMRect
    const controls = document.createElement("div")
    const key = document.createElement("div")
    controls.getBoundingClientRect = box(controlsAt)
    key.getBoundingClientRect = box(keyAt)
    const { container, handle } = setup({ overlays: () => [controls, key] })
    Object.defineProperties(container, { clientWidth: { value: width }, clientHeight: { value: height } })
    container.getBoundingClientRect = box([0, 0, width, height])
    camera.padding = { top: 72, right: 72, bottom: 72, left: 72 }
    camera.zoom = 11
    handle.setIdeaPins([idea("a", -9.12), idea("b", -9.11)])
    fold(container)!.click()
    // Past the map's own 72 px all round.
    expect(camera.fitPadding).toEqual(padding)
  })

  it("zooms out from the top-down fit until a tilted camera shows the hearts inside the room", () => {
    const { container, handle } = setup()
    Object.defineProperties(container, { clientWidth: { value: 820 }, clientHeight: { value: 820 } })
    container.getBoundingClientRect = () => ({ left: 0, top: 0, right: 820, bottom: 820, width: 820, height: 820, x: 0, y: 0 }) as DOMRect
    camera.zoom = 11
    camera.pitch = 50
    // 20 px apart at this zoom, so folded; top-down, the fit at zoom 16 puts them 640 px apart, inside the 692 px room.
    const hearts = [{ ...idea("a", -9.12), lat: 38.7 }, { ...idea("b", -9.12), lat: 38.72 }]
    handle.setIdeaPins(hearts)
    fold(container)!.click()
    const eased = camera.eased as { center: { lng: number; lat: number }; zoom: number }
    const at = hearts.map((h) => drawn([h.lng, h.lat], 820, 820, { ...eased.center, zoom: eased.zoom }))
    for (const { x, y } of at) {
      expect(x).toBeGreaterThanOrEqual(64 - 1)
      expect(x).toBeLessThanOrEqual(820 - 64 + 1)
      expect(y).toBeGreaterThanOrEqual(64 - 1)
      expect(y).toBeLessThanOrEqual(820 - 64 + 1)
    }
    // Still close: the room is used, not given away.
    expect(Math.max(...at.map((p) => p.y)) - Math.min(...at.map((p) => p.y))).toBeGreaterThan(500)
  })

  it("folds hearts that would sit on each other into one counted heart, which zooms in to them", () => {
    const { container, handle, onSelectIdea } = setup()
    camera.zoom = 11
    // 10 px apart on this map, and one well clear.
    handle.setIdeaPins([idea("a", -9.12, "Ramen Jiro"), idea("b", -9.11, "Café Bica"), idea("c", -9.0, "Belém")])
    const heart = fold(container)!
    expect(heart.getAttribute("aria-label")).toBe("2 wishlist places here: zoom in")
    expect(heart.textContent).toBe("2")
    expect(described(container, heart)).toBe("Ramen Jiro, Café Bica")
    expect(folded(container)).toEqual(["a", "b"])

    heart.click()
    expect(onSelectIdea).not.toHaveBeenCalled()
    expect(camera.fitted).toEqual([
      [-9.12, 38.71],
      [-9.11, 38.71],
    ])
    expect(camera.eased).toMatchObject({ zoom: 16, duration: 0 })

    camera.zoom = 15.995
    moveEnd()
    expect(fold(container)).toBeNull()
    expect(folded(container)).toEqual([])
    expect(heart.isConnected).toBe(false)
  })

  it("names a fold's places when it is hovered, and folds no more past its zoom", () => {
    const { container, handle, onIdeaHover } = setup()
    camera.zoom = 11
    // On one spot: they fold at any zoom below the last one, and spread at it.
    handle.setIdeaPins([idea("a", -9.12, "Ramen Jiro"), idea("b", -9.12, "Café Bica")])
    const heart = fold(container)!
    heart.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }))
    expect(onIdeaHover).toHaveBeenLastCalledWith({ id: "a", anchor: heart, via: "pointer", names: ["Ramen Jiro", "Café Bica"] })

    camera.zoom = 16
    moveEnd()
    expect(fold(container)).toBeNull()
    const offsets = markers.filter((m) => !m.removed && m.el.dataset.ideaId).map((m) => m.dx)
    expect(new Set(offsets).size).toBe(2)
  })

  it("keeps keyboard focus on the place it was on as hearts fold and unfold", () => {
    const { container, handle } = setup()
    handle.setIdeaPins([idea("a", -9.12), idea("b", -9.11)])
    const a = container.querySelector<HTMLButtonElement>('[data-idea-id="a"]')!
    a.focus()
    camera.zoom = 11
    moveEnd()
    expect(document.activeElement).toBe(fold(container))

    camera.zoom = 16
    moveEnd()
    expect(document.activeElement).toBe(a)
  })
})

describe("the map engine's hotel pins", () => {
  const hotel: AtlasPin = { id: "h1", lat: 38.71, lng: -9.13, title: "Hotel Avenida, where you’re staying", variant: "hotel" }

  it("draws a hotel as a stop-set button with the hotel glyph and no number, and picks it by its id", () => {
    const { container, handle, onSelect } = setup()
    handle.setPins([stop("s1", "1", -9.1), hotel])
    const pin = container.querySelector<HTMLButtonElement>('[data-pin-id="h1"]')!
    expect(pin.className).toBe("atlas-pin atlas-pin--hotel")
    expect(pin.getAttribute("aria-label")).toBe("Hotel Avenida, where you’re staying")
    expect(pin.textContent).toBe("")
    expect(pin.querySelectorAll("svg path").length).toBeGreaterThan(0)
    pin.click()
    expect(onSelect).toHaveBeenCalledWith("h1")
    handle.setActive("h1")
    expect(pin.classList.contains("atlas-pin--active")).toBe(true)
  })

  it("puts the hotel mark on a lodging stop beside its number, and takes it off again", () => {
    const { container, handle } = setup()
    handle.setPins([{ ...stop("h1", "2", -9.1), lodging: true }])
    const pin = container.querySelector<HTMLButtonElement>('[data-pin-id="h1"]')!
    expect(pin.querySelector(".atlas-pin__body")!.firstChild!.textContent).toBe("2")
    expect(pin.querySelector(".atlas-pin__mark svg")).not.toBeNull()
    handle.setPins([stop("h1", "2", -9.1)])
    expect(container.querySelector('[data-pin-id="h1"]')).toBe(pin)
    expect(pin.querySelector(".atlas-pin__mark")).toBeNull()
    expect(pin.textContent).toBe("2")
  })

  it("gives a pin a new marker when its kind changes (the check-in stop becomes the next day's hotel)", () => {
    const { container, handle } = setup()
    handle.setPins([{ ...stop("h1", "2", -9.1), lodging: true }])
    const asStop = container.querySelector('[data-pin-id="h1"]')
    handle.setPins([hotel])
    const asHotel = container.querySelector('[data-pin-id="h1"]')
    expect(asHotel).not.toBe(asStop)
    expect(asStop!.isConnected).toBe(false)
    expect(asHotel!.className).toBe("atlas-pin atlas-pin--hotel")
    expect(container.querySelectorAll('[data-pin-id="h1"]')).toHaveLength(1)
  })
})

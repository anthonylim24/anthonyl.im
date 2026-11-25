import { describe, expect, it, vi } from "vitest"
import type { AtlasPin } from "../map/geo"

// The engine against a stand-in MapLibre: enough of a map to place DOM
// markers and record camera moves, so the wishlist's marker set can be
// checked against the stops' without WebGL.

const { markers, camera, mapEvents } = vi.hoisted(() => ({
  markers: [] as Array<{ el: HTMLElement; removed: boolean; dx: number; dy: number }>,
  camera: { moves: 0, zoom: 16, fitted: null as unknown, eased: null as unknown },
  mapEvents: new Map<string, Array<() => void>>(),
}))

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
    project([lng, lat]: [number, number]) {
      return { x: lng * 1000, y: -lat * 1000 }
    }
    getCenter() {
      return { lat: 0, lng: 0 }
    }
    getZoom() {
      return camera.zoom
    }
    getBearing() {
      return 0
    }
    getPitch() {
      return 0
    }
    cameraForBounds(bounds: unknown, options: { maxZoom: number }) {
      camera.fitted = bounds
      return { center: [0, 0], zoom: options.maxZoom }
    }
    jumpTo() {
      camera.moves++
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

function setup() {
  markers.length = 0
  camera.moves = 0
  camera.zoom = 16
  camera.fitted = null
  camera.eased = null
  mapEvents.clear()
  const container = document.createElement("div")
  document.body.appendChild(container)
  const onSelect = vi.fn()
  const onSelectIdea = vi.fn()
  const onHover = vi.fn()
  const onIdeaHover = vi.fn()
  const handle = createAtlasMap(container, { dark: false, reducedMotion: true, onSelect, onSelectIdea, onHover, onIdeaHover })
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
    // Named for screen readers; hovering shows the map's preview card, not a second, native tooltip.
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

  it("reports a mouse or keyboard focus resting on an idea for its preview, and never a tap", () => {
    const { container, handle, onIdeaHover, onHover } = setup()
    handle.setIdeaPins([idea("ramen", -9.12, "Ramen Jiro")])
    const pin = container.querySelector<HTMLButtonElement>('[data-idea-id="ramen"]')!

    pin.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "touch" }))
    expect(onIdeaHover).not.toHaveBeenCalled()

    pin.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }))
    expect(onIdeaHover).toHaveBeenLastCalledWith({ id: "ramen", anchor: pin, via: "pointer" })
    pin.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }))
    // A leave, not a press: the card waits a moment for the mouse to reach it.
    expect(onIdeaHover).toHaveBeenLastCalledWith(null, "leave")
    expect(pin.getAttribute("aria-describedby")).toBe("idea-preview-ramen")

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
    // The stop goes, and the heart stands on its own place again.
    handle.setPins([])
    expect(offsetOf("on").dy).toBe(0)
  })

  it("folds hearts that would sit on each other into one counted heart, which zooms in to them", () => {
    const { container, handle, onSelectIdea } = setup()
    camera.zoom = 11
    // 10 px apart on this map, and one well clear.
    handle.setIdeaPins([idea("a", -9.12, "Ramen Jiro"), idea("b", -9.11, "Café Bica"), idea("c", -9.0, "Belém")])
    const heart = fold(container)!
    expect(heart.getAttribute("aria-label")).toBe("2 wishlist places here: zoom in")
    expect(heart.textContent).toBe("2")
    expect(heart.getAttribute("aria-describedby")).toBe("idea-preview-a")
    expect(folded(container)).toEqual(["a", "b"])

    heart.click()
    expect(onSelectIdea).not.toHaveBeenCalled()
    expect(camera.fitted).toEqual([
      [-9.12, 38.71],
      [-9.11, 38.71],
    ])
    expect(camera.eased).toMatchObject({ zoom: 16, duration: 0 })

    // Zoomed in, the hearts stand on their own again, spread apart where they still meet.
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

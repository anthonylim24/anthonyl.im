import { describe, expect, it, vi } from "vitest"
import type { AtlasPin } from "../map/geo"

// The engine against a stand-in MapLibre: enough of a map to place DOM
// markers and record camera moves, so the wishlist's marker set can be
// checked against the stops' without WebGL.

const { markers, camera } = vi.hoisted(() => ({
  markers: [] as Array<{ el: HTMLElement; removed: boolean }>,
  camera: { moves: 0 },
}))

vi.mock("maplibre-gl", () => {
  class FakeMap {
    container: HTMLElement
    constructor(options: { container: HTMLElement }) {
      this.container = options.container
    }
    addControl() {}
    on() {}
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
    jumpTo() {
      camera.moves++
    }
    easeTo() {
      camera.moves++
    }
    flyTo() {
      camera.moves++
    }
    remove() {}
  }
  class FakeMarker {
    entry: { el: HTMLElement; removed: boolean }
    offset = { x: 0, y: 0 }
    constructor(options: { element: HTMLElement }) {
      this.entry = { el: options.element, removed: false }
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
  const container = document.createElement("div")
  document.body.appendChild(container)
  const onSelect = vi.fn()
  const onSelectIdea = vi.fn()
  const onHover = vi.fn()
  const handle = createAtlasMap(container, { dark: false, reducedMotion: true, onSelect, onSelectIdea, onHover })
  return { container, handle, onSelect, onSelectIdea, onHover }
}

describe("the map engine's wishlist pins", () => {
  it("draws ideas as their own buttons and names the idea when one is picked", () => {
    const { container, handle, onSelect, onSelectIdea, onHover } = setup()
    handle.setPins([stop("s1", "1", -9.1)])
    handle.setIdeaPins([idea("ramen", -9.12, "Ramen Jiro")])

    const pin = container.querySelector<HTMLButtonElement>('[data-idea-id="ramen"]')!
    expect(pin.className).toBe("atlas-pin atlas-pin--idea")
    expect(pin.getAttribute("aria-label")).toBe("Ramen Jiro, on the wishlist")
    expect(pin.title).toBe("Ramen Jiro")
    expect(pin.querySelector("svg")).not.toBeNull()

    pin.click()
    expect(onSelectIdea).toHaveBeenCalledWith("ramen")
    expect(onSelect).not.toHaveBeenCalled()
    // Hovering an idea never lights up a stop.
    pin.dispatchEvent(new MouseEvent("mouseenter"))
    pin.focus()
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

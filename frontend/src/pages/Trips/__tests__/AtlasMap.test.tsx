import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { AtlasMap } from "../map/AtlasMap"
import type { AtlasPin } from "../map/geo"
import { stubMatchMedia } from "./tripFixtures"

// happy-dom has no WebGL 2, so every map here is the static chart: the
// fallback a browser without WebGL keeps for good.

const stops: AtlasPin[] = [
  { id: "s1", lat: 38.7, lng: -9.14, title: "Time Out Market", label: "1", variant: "stop" },
  { id: "s2", lat: 38.72, lng: -9.1, title: "Fado", label: "2", variant: "stop" },
]
const ideas: AtlasPin[] = [
  { id: "ramen", lat: 38.71, lng: -9.12, title: "Ramen Jiro", variant: "idea" },
  { id: "tiles", lat: 38.705, lng: -9.13, title: "Tile museum", variant: "idea" },
]

function renderMap(props: { ideaPins?: readonly AtlasPin[]; onSelectIdea?: (id: string) => void } = {}) {
  return render(<AtlasMap pins={stops} frameKey="k" label="Map of day 1 with 2 pinned stops" {...props} />)
}

const legend = () => screen.queryByRole("button", { name: /^Wishlist places on the map/ })

describe("AtlasMap wishlist pins", () => {
  beforeEach(() => {
    stubMatchMedia(false)
    localStorage.clear()
  })
  afterEach(() => localStorage.clear())

  it("draws each wishlist place on the fallback chart as a button that opens it", () => {
    const onSelectIdea = vi.fn()
    renderMap({ ideaPins: ideas, onSelectIdea })
    fireEvent.click(screen.getByRole("button", { name: "Ramen Jiro, on the wishlist" }))
    expect(onSelectIdea).toHaveBeenLastCalledWith("ramen")
    fireEvent.keyDown(screen.getByRole("button", { name: "Tile museum, on the wishlist" }), { key: "Enter" })
    expect(onSelectIdea).toHaveBeenLastCalledWith("tiles")
    fireEvent.keyDown(screen.getByRole("button", { name: "Tile museum, on the wishlist" }), { key: "Tab" })
    expect(onSelectIdea).toHaveBeenCalledTimes(2)
  })

  it("keeps the stops' chart as it was: ideas never join the route or its frame", () => {
    const { container: without } = renderMap()
    const before = without.querySelector("svg[aria-hidden] polyline")?.getAttribute("points")
    without.remove()
    // A far-off idea would shrink the day if it were framed with it.
    const { container } = renderMap({ ideaPins: [...ideas, { id: "far", lat: 35.6, lng: 139.7, title: "Tokyo", variant: "idea" }] })
    expect(container.querySelector("svg[aria-hidden] polyline")?.getAttribute("points")).toBe(before)
    // Off the chart, so not drawn; the two nearby ideas are.
    expect(screen.queryByRole("button", { name: "Tokyo, on the wishlist" })).toBeNull()
    expect(screen.getAllByRole("button", { name: /on the wishlist$/ })).toHaveLength(2)
  })

  it("has no key and no idea pins when no wishlist place has a point", () => {
    renderMap()
    expect(legend()).toBeNull()
    expect(screen.queryAllByRole("button", { name: /on the wishlist$/ })).toHaveLength(0)
  })

  it("hides and shows the ideas from the key, and remembers the choice on this device", () => {
    const { unmount } = renderMap({ ideaPins: ideas })
    expect(legend()).toHaveAttribute("aria-pressed", "true")
    expect(legend()).toHaveTextContent("Wishlist · 2")

    fireEvent.click(legend()!)
    expect(legend()).toHaveAttribute("aria-pressed", "false")
    expect(screen.queryAllByRole("button", { name: /on the wishlist$/ })).toHaveLength(0)
    unmount()

    renderMap({ ideaPins: ideas })
    expect(legend()).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(legend()!)
    expect(screen.getAllByRole("button", { name: /on the wishlist$/ })).toHaveLength(2)
  })

  it("still works when storage is off (private mode)", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    try {
      renderMap({ ideaPins: ideas })
      expect(legend()).toHaveAttribute("aria-pressed", "true")
      fireEvent.click(legend()!)
      expect(legend()).toHaveAttribute("aria-pressed", "false")
    } finally {
      getItem.mockRestore()
      setItem.mockRestore()
    }
  })
})

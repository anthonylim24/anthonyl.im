import { describe, expect, it } from "vitest"
import { placeMenu, type Box } from "../components/menuPlacement"

const viewport = { width: 1280, height: 860 }
const size = { width: 220, height: 380 }
const button = (left: number, top: number, w = 44, h = 44): Box => ({ left, top, right: left + w, bottom: top + h })

describe("placeMenu", () => {
  it("drops below its button, lined up with the side asked for", () => {
    const end = placeMenu({ trigger: button(500, 200), size, viewport, align: "end", side: "down" })
    expect(end).toMatchObject({ top: 250, left: 544 - 220, up: false, maxHeight: null, transformOrigin: "top right" })
    const start = placeMenu({ trigger: button(500, 200), size, viewport, align: "start", side: "down" })
    expect(start).toMatchObject({ left: 500, transformOrigin: "top left" })
  })

  it("opens upward when there is no room below and more above", () => {
    const at = placeMenu({ trigger: button(500, 700), size, viewport, align: "end", side: "down" })
    expect(at).toMatchObject({ up: true, top: 700 - 6 - 380, maxHeight: null, transformOrigin: "bottom right" })
  })

  it("keeps a menu asked to open upward up while it fits, and turns it down when it cannot", () => {
    expect(placeMenu({ trigger: button(500, 500), size, viewport, align: "end", side: "up" }).up).toBe(true)
    expect(placeMenu({ trigger: button(500, 60), size, viewport, align: "end", side: "up" })).toMatchObject({ up: false, top: 110 })
  })

  it("shifts back inside the viewport at either edge", () => {
    expect(placeMenu({ trigger: button(4, 100), size, viewport: { width: 390, height: 844 }, align: "end", side: "down" }).left).toBe(8)
    expect(placeMenu({ trigger: button(340, 100), size, viewport: { width: 390, height: 844 }, align: "start", side: "down" }).left).toBe(390 - 8 - 220)
  })

  it("scrolls when it is taller than the room on its roomier side", () => {
    const at = placeMenu({ trigger: button(500, 300), size: { width: 220, height: 900 }, viewport, align: "end", side: "down" })
    expect(at.up).toBe(false)
    expect(at.maxHeight).toBe(860 - 344 - 6 - 8)
    expect(at.top).toBe(350)
  })
})

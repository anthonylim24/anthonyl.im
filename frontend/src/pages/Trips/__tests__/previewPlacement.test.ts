import { describe, expect, it } from "vitest"
import { placePreview } from "../map/previewPlacement"

const bounds = { width: 800, height: 600 }
const size = { width: 256, height: 140 }
/** A 28 px pin whose box is centred on (x, y). */
const pin = (x: number, y: number) => ({ top: y - 14, bottom: y + 14, left: x - 14, right: x + 14 })

describe("placePreview", () => {
  it("sits above the pin, centred on it", () => {
    expect(placePreview({ anchor: pin(400, 300), size, bounds })).toEqual({ top: 300 - 14 - 10 - 140, left: 400 - 128, side: "above" })
  })

  it("drops below a pin near the top of the map", () => {
    expect(placePreview({ anchor: pin(400, 60), size, bounds })).toEqual({ top: 60 + 14 + 10, left: 272, side: "below" })
  })

  it("slides along the edge rather than past it near a side", () => {
    expect(placePreview({ anchor: pin(20, 300), size, bounds }).left).toBe(8)
    expect(placePreview({ anchor: pin(790, 300), size, bounds }).left).toBe(800 - 8 - 256)
  })

  it("sits beside the pin when the map is too short for above or below", () => {
    const short = { width: 800, height: 200 }
    expect(placePreview({ anchor: pin(200, 100), size, bounds: short })).toEqual({ top: 30, left: 224, side: "right" })
    expect(placePreview({ anchor: pin(700, 100), size, bounds: short })).toMatchObject({ side: "left", left: 700 - 14 - 10 - 256 })
  })

  it("stays inside a map too small to hold it beside the pin either", () => {
    const tiny = { width: 300, height: 160 }
    const at = placePreview({ anchor: pin(150, 120), size, bounds: tiny })
    expect(at.side).toBe("above")
    expect(at.top).toBeGreaterThanOrEqual(8)
    expect(at.left).toBeGreaterThanOrEqual(8)
    expect(at.left + size.width).toBeLessThanOrEqual(300 - 8)
  })
})

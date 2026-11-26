import { describe, expect, it } from "vitest"
import { placePreview } from "../map/previewPlacement"

const bounds = { width: 800, height: 600 }
const size = { width: 256, height: 140 }
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

  it("takes the first side with room that covers no other pin, else the one covering fewest", () => {
    // Day pins just above the heart: the card goes below it.
    const crowd = [pin(400, 250), pin(380, 200)]
    expect(placePreview({ anchor: pin(400, 300), size, bounds, avoid: crowd })).toMatchObject({ side: "below" })
    // Pins on both sides of it above and below: beside it, on the right.
    const ring = [...crowd, pin(400, 360)]
    expect(placePreview({ anchor: pin(400, 300), size, bounds, avoid: ring })).toMatchObject({ side: "right" })
    // Covered wherever it goes: the side covering fewest, above on a tie.
    const everywhere = [pin(400, 250), pin(400, 360), pin(550, 300), pin(250, 300)]
    expect(placePreview({ anchor: pin(400, 300), size, bounds, avoid: everywhere })).toMatchObject({ side: "above" })
  })

  it("keeps the side it is on while it still fits there, as it changes size", () => {
    // No room above a tall card, so it went below; shorter now, it would fit above.
    const tall = { width: 256, height: 280 }
    expect(placePreview({ anchor: pin(400, 250), size: tall, bounds })).toMatchObject({ side: "below" })
    expect(placePreview({ anchor: pin(400, 250), size, bounds })).toMatchObject({ side: "above" })
    expect(placePreview({ anchor: pin(400, 250), size, bounds, keep: "below" })).toEqual({ top: 250 + 14 + 10, left: 272, side: "below" })
    expect(placePreview({ anchor: pin(400, 560), size, bounds, keep: "below" })).toMatchObject({ side: "above" })
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

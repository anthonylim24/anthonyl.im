import { describe, expect, it } from "vitest"
import { placeBeside } from "../popoverPlacement"

const viewport = { width: 1440, height: 900 }
const size = { width: 376, height: 600 }
/** A wishlist row in the left pane. */
const row = { top: 300, bottom: 360, left: 24, right: 560 }

describe("placeBeside", () => {
  it("sits to the right of the row, level with it", () => {
    expect(placeBeside({ anchor: row, size, viewport })).toEqual({
      top: 292,
      left: 572,
      maxHeight: null,
      side: "right",
      transformOrigin: "top left",
    })
  })

  it("rises to stay on screen when the row is low", () => {
    const at = placeBeside({ anchor: { ...row, top: 800, bottom: 860 }, size, viewport })
    expect(at.top).toBe(900 - 8 - 600)
  })

  it("flips to the left when the right has no room", () => {
    const at = placeBeside({ anchor: { top: 300, bottom: 360, left: 900, right: 1400 }, size, viewport })
    expect(at).toMatchObject({ side: "left", left: 900 - 12 - 376, transformOrigin: "top right" })
  })

  it("drops below the row when neither side has room", () => {
    const at = placeBeside({ anchor: { top: 100, bottom: 160, left: 16, right: 700 }, size: { width: 376, height: 300 }, viewport: { width: 720, height: 900 } })
    expect(at.side).toBe("below")
    expect(at.top).toBe(166)
  })

  it("scrolls when taller than the viewport", () => {
    const at = placeBeside({ anchor: row, size: { width: 376, height: 1200 }, viewport })
    expect(at).toMatchObject({ top: 8, maxHeight: 884 })
  })
})

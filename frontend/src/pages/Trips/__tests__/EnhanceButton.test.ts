import { describe, expect, it } from "vitest"
import { clampEnhancePanel } from "../editor/EnhanceButton"

describe("clampEnhancePanel", () => {
  it("places the panel below when there is room", () => {
    const pos = clampEnhancePanel(
      { top: 40, bottom: 80, right: 200 },
      180,
      { width: 1280, height: 800 },
    )
    expect(pos.placement).toBe("below")
    expect(pos.top).toBe(88)
    expect(pos.width).toBe(320)
  })

  it("flips above when the trigger sits near the bottom", () => {
    const pos = clampEnhancePanel(
      { top: 700, bottom: 740, right: 400 },
      180,
      { width: 1280, height: 800 },
    )
    expect(pos.placement).toBe("above")
    expect(pos.top).toBe(700 - 8 - 180)
    expect(pos.top).toBeGreaterThanOrEqual(8)
  })

  it("keeps the panel inside a narrow viewport", () => {
    const pos = clampEnhancePanel(
      { top: 20, bottom: 60, right: 360 },
      180,
      { width: 390, height: 844 },
    )
    expect(pos.left).toBeGreaterThanOrEqual(8)
    expect(pos.left + pos.width).toBeLessThanOrEqual(390 - 8)
    expect(pos.width).toBe(390 - 16)
  })
})

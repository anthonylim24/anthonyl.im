import { describe, expect, it } from "vitest"
import { REST_ANGLE, lightAngle } from "../light"
import { refractsBackdrop } from "../refraction"

describe("lightAngle", () => {
  const w = 1000
  const h = 800

  it("points the light toward the pointer, as a conic-gradient angle", () => {
    expect(lightAngle(500, 0, w, h)).toBe(0)
    expect(lightAngle(1000, 400, w, h)).toBe(90)
    expect(lightAngle(500, 800, w, h)).toBe(180)
    expect(lightAngle(0, 400, w, h)).toBe(270)
    expect(lightAngle(0, 0, w, h)).toBe(310)
  })

  it("rests near the middle, where the direction is noise", () => {
    expect(lightAngle(505, 395, w, h)).toBe(REST_ANGLE)
  })

  it("moves in steps, so small moves do not restyle the page", () => {
    const a = lightAngle(900, 100, w, h)
    expect(lightAngle(902, 101, w, h)).toBe(a)
    expect(a % 10).toBe(0)
  })

  it("stays in 0..359", () => {
    for (let x = 0; x <= w; x += 50) {
      for (let y = 0; y <= h; y += 50) {
        const a = lightAngle(x, y, w, h)
        expect(a).toBeGreaterThanOrEqual(0)
        expect(a).toBeLessThan(360)
      }
    }
  })
})

describe("refractsBackdrop", () => {
  it("is on for Chromium browsers by brand", () => {
    expect(refractsBackdrop({ userAgentData: { brands: [{ brand: "Chromium" }, { brand: "Not/A)Brand" }] } })).toBe(true)
    expect(refractsBackdrop({ userAgentData: { brands: [{ brand: "Google Chrome" }] } })).toBe(true)
    expect(refractsBackdrop({ userAgentData: { brands: [{ brand: "Microsoft Edge" }] } })).toBe(true)
  })

  it("is off where there are no brands (Safari, Firefox, iOS browsers)", () => {
    expect(refractsBackdrop({})).toBe(false)
    expect(refractsBackdrop({ userAgentData: { brands: [] } })).toBe(false)
    expect(refractsBackdrop({ userAgentData: { brands: [{ brand: "HeadlessSomething" }] } })).toBe(false)
  })
})

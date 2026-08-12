import { describe, it, expect } from "vitest"
import { godRayContribution, godRayPitchAttenuation } from "../godRaysPass"

describe("godRaysPass helpers", () => {
  it("peaks shaft strength near 45° and kills birds-eye + horizon", () => {
    const zenith = godRayPitchAttenuation(0)
    const mid = godRayPitchAttenuation(Math.PI / 4)
    const horizon = godRayPitchAttenuation(Math.PI / 2)
    expect(zenith).toBeCloseTo(0, 5)
    expect(horizon).toBeCloseTo(0, 5)
    expect(mid).toBeGreaterThan(0.8)
    expect(mid).toBeGreaterThan(godRayPitchAttenuation(Math.PI / 8))
  })

  it("returns zero contribution when the sun is behind the camera", () => {
    expect(godRayContribution(1, 1, 1, true)).toBe(0)
    expect(godRayContribution(0.65, 1, 1, false)).toBeCloseTo(0.65, 5)
    expect(godRayContribution(1, 0, 1, false)).toBe(0)
  })
})

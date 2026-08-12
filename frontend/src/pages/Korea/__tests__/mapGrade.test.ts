import { describe, it, expect } from "vitest"
import {
  GRADE_APPLY_GLSL,
  GRADE_UNIFORMS_GLSL,
  gradeParamsAt,
  writeGradeUniforms,
  type GradeUniformBag,
} from "../mapGrade"

function makeBag(): GradeUniformBag {
  const vec = () => {
    const v = { x: 0, y: 0, z: 0 }
    return {
      value: {
        set(x: number, y: number, z: number) {
          v.x = x
          v.y = y
          v.z = z
        },
        v,
      },
    }
  }
  return {
    uExposure: { value: 0 },
    uContrast: { value: 0 },
    uSaturation: { value: 0 },
    uLift: vec(),
    uGamma: vec(),
    uGain: vec(),
    uShadowTint: vec(),
    uHighlightTint: vec(),
    uVignette: { value: 0 },
    uGrain: { value: 0 },
    uShoulder: { value: 0 },
    uGradeTime: { value: 0 },
  }
}

describe("mapGrade", () => {
  it("keeps midday at identity so daytime Seoul reads honestly", () => {
    const g = gradeParamsAt(12)
    expect(g.exposure).toBeCloseTo(1, 5)
    expect(g.contrast).toBeCloseTo(1, 5)
    expect(g.saturation).toBeCloseTo(1, 5)
    expect(g.shadowTint).toEqual([1, 1, 1])
    expect(g.highlightTint).toEqual([1, 1, 1])
    expect(g.vignette).toBeLessThanOrEqual(0.04)
    expect(g.grain).toBeLessThanOrEqual(0.005)
  })

  it("cools night shadows and warms dusk highlights", () => {
    const night = gradeParamsAt(2)
    const dusk = gradeParamsAt(18.5)
    expect(night.shadowTint[2]).toBeGreaterThan(night.shadowTint[0])
    expect(dusk.highlightTint[0]).toBeGreaterThan(dusk.highlightTint[2])
    expect(dusk.saturation).toBeGreaterThan(night.saturation)
    expect(dusk.saturation).toBeLessThan(1.1)
    expect(night.vignette).toBeLessThanOrEqual(0.12)
    expect(night.grain).toBeLessThanOrEqual(0.018)
  })

  it("ships a complete applyGrade helper", () => {
    expect(GRADE_UNIFORMS_GLSL).toContain("uVignette")
    expect(GRADE_UNIFORMS_GLSL).toContain("uGrain")
    expect(GRADE_APPLY_GLSL).toContain("applyGrade")
    expect(GRADE_APPLY_GLSL).toContain("uShadowTint")
  })

  it("writeGradeUniforms copies params and can disable grain", () => {
    const bag = makeBag()
    const dusk = gradeParamsAt(18.5)
    writeGradeUniforms(bag, dusk, 12.5, false)
    expect(bag.uExposure.value).toBe(dusk.exposure)
    expect(bag.uGrain.value).toBe(0)
    expect(bag.uGradeTime.value).toBe(12.5)
    writeGradeUniforms(bag, dusk, 1, true)
    expect(bag.uGrain.value).toBe(dusk.grain)
  })

  it("returns finite params at every half-hour", () => {
    for (let h = 0; h < 24; h += 0.5) {
      const g = gradeParamsAt(h)
      expect(Number.isFinite(g.exposure)).toBe(true)
      expect(g.exposure).toBeGreaterThan(0.5)
      expect(g.vignette).toBeGreaterThanOrEqual(0)
      expect(g.vignette).toBeLessThan(0.4)
    }
  })
})

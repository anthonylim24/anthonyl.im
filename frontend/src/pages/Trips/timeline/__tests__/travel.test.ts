import { describe, expect, it } from "vitest"
import { formatMinutes, travelEstimate } from "../travel"

describe("formatMinutes", () => {
  it.each([
    [0, "0 min"],
    [45, "45 min"],
    [59.6, "1 h"],
    [60, "1 h"],
    [65, "1 h 05"],
    [80, "1 h 20"],
    [180, "3 h"],
    [-5, "0 min"],
    [Number.NaN, "0 min"],
  ])("%s → %s", (minutes, label) => {
    expect(formatMinutes(minutes)).toBe(label)
  })
})

describe("travelEstimate", () => {
  it("walks short hops at 1.35 m/s, without the ≈", () => {
    expect(travelEstimate(486)).toEqual({ mode: "walk", minutes: 6, label: "6 min walk" })
    expect(travelEstimate(1_600)).toEqual({ mode: "walk", minutes: 20, label: "20 min walk" })
  })

  it("never says zero minutes, and treats nonsense as standing still", () => {
    for (const meters of [0, -200, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(travelEstimate(meters)).toEqual({ mode: "walk", minutes: 1, label: "1 min walk" })
    }
  })

  it("switches to transit just past 1.6 km, with the wait included", () => {
    expect(travelEstimate(1_601)).toMatchObject({ mode: "transit", minutes: 10, label: "≈ 10 min by transit" })
    expect(travelEstimate(10_000)).toMatchObject({ mode: "transit", minutes: 35, label: "≈ 35 min by transit" })
    expect(travelEstimate(40_000)).toMatchObject({ mode: "transit", minutes: 115, label: "≈ 1 h 55 by transit" })
  })

  it("goes by road or rail past 40 km, and never names which", () => {
    expect(travelEstimate(40_001)).toMatchObject({ mode: "road", minutes: 45, label: "≈ 45 min by road or rail" })
    expect(travelEstimate(144_000)).toMatchObject({ mode: "road", minutes: 130, label: "≈ 2 h 10 by road or rail" })
    expect(travelEstimate(500_000)).toMatchObject({ mode: "road", minutes: 415, label: "≈ 6 h 55 by road or rail" })
  })

  it("flies past 500 km, airport time included", () => {
    expect(travelEstimate(500_001)).toMatchObject({ mode: "flight", minutes: 190, label: "Flight · ≈ 3 h 10" })
    expect(travelEstimate(875_000)).toMatchObject({ mode: "flight", minutes: 220, label: "Flight · ≈ 3 h 40" })
  })

  it("rounds every guess past a walk to five minutes", () => {
    for (const meters of [2_345, 17_890, 99_999, 1_234_567]) {
      expect(travelEstimate(meters).minutes % 5).toBe(0)
    }
  })
})

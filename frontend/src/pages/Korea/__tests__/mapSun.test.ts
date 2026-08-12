import { describe, it, expect } from "vitest"
import {
  lightingForHour,
  solarAzimuthRad,
  solarElevationRad,
  sunDirectionFromAzEl,
} from "../mapSun"

describe("mapSun", () => {
  it("places noon higher than dawn, and midnight below the horizon", () => {
    const noon = solarElevationRad(12)
    const dawn = solarElevationRad(6)
    const night = solarElevationRad(0)
    expect(noon).toBeGreaterThan(dawn)
    expect(dawn).toBeGreaterThan(0)
    expect(night).toBeLessThan(0)
  })

  it("puts the noon sun in the southern sky (azimuth near π)", () => {
    const az = solarAzimuthRad(12)
    expect(az).toBeGreaterThan(Math.PI * 0.7)
    expect(az).toBeLessThan(Math.PI * 1.3)
  })

  it("maps azimuth/elevation into the ReorientationPlugin frame (+Z north, +X west)", () => {
    // North, on the horizon → +Z
    const north = sunDirectionFromAzEl(0, 0)
    expect(north.z).toBeCloseTo(1, 5)
    expect(north.x).toBeCloseTo(0, 5)
    expect(north.y).toBeCloseTo(0, 5)
    // East, on the horizon → -X
    const east = sunDirectionFromAzEl(Math.PI / 2, 0)
    expect(east.x).toBeCloseTo(-1, 5)
    expect(east.z).toBeCloseTo(0, 5)
  })

  it("marks night as below-horizon moonlight and dusk as a warm key", () => {
    const night = lightingForHour(2)
    const dusk = lightingForHour(18.5)
    const midday = lightingForHour(12)
    expect(night.belowHorizon).toBe(true)
    expect(midday.belowHorizon).toBe(false)
    expect(dusk.godRayIntensity).toBeGreaterThan(night.godRayIntensity)
    expect(dusk.sunIntensity).toBeGreaterThan(night.sunIntensity)
    expect(midday.godRayIntensity).toBe(0)
    expect(lightingForHour(8).godRayIntensity).toBe(0)
    const duskR = parseInt(dusk.sunColor.slice(1, 3), 16)
    const duskB = parseInt(dusk.sunColor.slice(5, 7), 16)
    expect(duskR).toBeGreaterThan(duskB)
  })

  it("keeps the sun position a usable god-ray origin (far from the camera)", () => {
    const L = lightingForHour(12)
    const len = Math.hypot(L.sunPosition.x, L.sunPosition.y, L.sunPosition.z)
    expect(len).toBeGreaterThan(1000)
    const dirLen = Math.hypot(L.sunDir.x, L.sunDir.y, L.sunDir.z)
    expect(dirLen).toBeCloseTo(1, 5)
  })
})

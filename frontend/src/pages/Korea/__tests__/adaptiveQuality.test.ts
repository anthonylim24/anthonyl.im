import { describe, it, expect } from "vitest"
import {
  AdaptiveQuality,
  initialDprForTier,
  maxDprForTier,
  tileErrorTarget,
} from "../adaptiveQuality"

describe("adaptiveQuality", () => {
  it("caps DPR by tier — high retina never renders at full 3×", () => {
    expect(maxDprForTier("low", 3)).toBe(1)
    expect(maxDprForTier("medium", 3)).toBe(1.25)
    expect(maxDprForTier("high", 3)).toBe(2)
    expect(maxDprForTier("high", 1)).toBe(1)
    expect(initialDprForTier("high", 3)).toBe(1.5)
  })

  it("drops DPR after a sustained miss of ~50 FPS", () => {
    const q = new AdaptiveQuality({ maxDpr: 2, minDpr: 1, initialDpr: 1.5 })
    let changed = false
    for (let i = 0; i < 80; i++) {
      if (q.sample(22)) changed = true
    }
    expect(changed).toBe(true)
    expect(q.dpr).toBeLessThan(1.5)
    expect(q.lod).not.toBe("full")
  })

  it("raises DPR after a sustained 120 FPS budget", () => {
    const q = new AdaptiveQuality({ maxDpr: 2, minDpr: 1, initialDpr: 1.5 })
    let changed = false
    for (let i = 0; i < 80; i++) {
      if (q.sample(6.5)) changed = true
    }
    expect(changed).toBe(true)
    expect(q.dpr).toBeGreaterThan(1.5)
  })

  it("ignores tab-resume spikes so one hitch does not collapse quality", () => {
    const q = new AdaptiveQuality({ maxDpr: 2, minDpr: 1, initialDpr: 1.5 })
    expect(q.sample(240)).toBe(false)
    expect(q.dpr).toBe(1.5)
  })

  it("does not drop DPR at a locked 60 Hz cadence", () => {
    const q = new AdaptiveQuality({ maxDpr: 2, minDpr: 1, initialDpr: 1.5 })
    let changed = false
    for (let i = 0; i < 80; i++) {
      if (q.sample(16.7)) changed = true
    }
    expect(changed).toBe(false)
    expect(q.dpr).toBe(1.5)
  })

  it("raises tile error as LOD and camera distance increase", () => {
    expect(tileErrorTarget("full", true, 0)).toBe(12)
    expect(tileErrorTarget("full", false, 0)).toBe(16)
    expect(tileErrorTarget("balanced", false, 0)).toBe(18)
    expect(tileErrorTarget("lite", false, 0)).toBe(28)
    expect(tileErrorTarget("full", false, 5000)).toBe(20)
    expect(tileErrorTarget("full", false, 20000)).toBe(26)
  })
})

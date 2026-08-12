// Adaptive pixel-ratio + LOD controller for Map Mode.
//
// Target: hold 60 FPS as a floor and climb toward 120 FPS on
// ProMotion / high-refresh panels when the GPU has headroom.
// DPR moves in 0.25 steps with ~0.75 s hysteresis so we never
// resize render targets every frame.
//
// Frame times >100 ms (tab resume, tile decode hitch) are ignored
// so a single stall doesn't collapse quality.

import type { DeviceTier } from "./deviceTier"

export type QualityLod = "full" | "balanced" | "lite"

export interface AdaptiveQualityOptions {
  maxDpr: number
  minDpr?: number
  initialDpr?: number
}

export function maxDprForTier(tier: DeviceTier, deviceDpr: number): number {
  const dpr = Number.isFinite(deviceDpr) && deviceDpr > 0 ? deviceDpr : 1
  if (tier === "low") return 1
  if (tier === "medium") return Math.min(dpr, 1.25)
  // High: cap at 2. Full 3× retina on a Pro phone is ~4× the fill
  // of 1.5× and will miss 120 Hz once photogrammetry is on screen.
  return Math.min(dpr, 2)
}

export function initialDprForTier(tier: DeviceTier, deviceDpr: number): number {
  const max = maxDprForTier(tier, deviceDpr)
  if (tier === "high") return Math.min(max, 1.5)
  return max
}

export class AdaptiveQuality {
  dpr: number
  private maxDpr: number
  private minDpr: number
  private emaMs: number
  private hold = 0
  private readonly upMs: number
  private readonly downMs: number

  constructor(opts: AdaptiveQualityOptions) {
    this.maxDpr = Math.max(0.75, opts.maxDpr)
    this.minDpr = Math.max(0.75, opts.minDpr ?? 1)
    if (this.minDpr > this.maxDpr) this.minDpr = this.maxDpr
    this.dpr = opts.initialDpr ?? this.maxDpr
    this.dpr = Math.min(this.maxDpr, Math.max(this.minDpr, this.dpr))
    this.emaMs = 16.7
    // Raise quality when we are comfortably inside a 120 Hz budget.
    this.upMs = 9.0
    // Drop only when we are missing ~50 FPS. A 60 Hz panel sits at
    // ~16.7 ms — treating that as "too slow" would thrash DPR forever.
    this.downMs = 19.5
  }

  get frameEmaMs(): number {
    return this.emaMs
  }

  get lod(): QualityLod {
    if (this.emaMs > 20) return "lite"
    if (this.emaMs > 12) return "balanced"
    return "full"
  }

  /** Returns true when `dpr` changed and the renderer should resize. */
  sample(frameMs: number): boolean {
    if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 100) return false
    this.emaMs = this.emaMs * 0.9 + frameMs * 0.1
    let next = this.dpr
    if (this.emaMs > this.downMs) next = Math.max(this.minDpr, this.dpr - 0.25)
    else if (this.emaMs < this.upMs) next = Math.min(this.maxDpr, this.dpr + 0.25)
    next = Math.round(next * 4) / 4
    if (next === this.dpr) {
      this.hold = 0
      return false
    }
    this.hold += 1
    if (this.hold < 45) return false
    this.dpr = next
    this.hold = 0
    this.emaMs = 16.7
    return true
  }
}

/** Tile geometric error. Higher = fewer / coarser tiles. */
export function tileErrorTarget(
  lod: QualityLod,
  maxQuality: boolean,
  camRadius: number,
): number {
  const base = lod === "lite" ? 28 : lod === "balanced" ? 18 : maxQuality ? 12 : 16
  if (camRadius > 12000) return base + 10
  if (camRadius > 4000) return base + 4
  return base
}

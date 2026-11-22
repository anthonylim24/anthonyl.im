// The lens of a Liquid Glass surface, as numbers: how far each point of the
// backdrop is pulled sideways by a slab of glass with a rounded (convex
// squircle) bezel. Pure, so it is tested to the edge; `refraction.ts` turns
// the result into an SVG displacement map.
//
// The model: a vertical ray passes through glass whose height rises from 0
// at the rim to full thickness `bezel` px inside it, following a squircle
// (1 - (1 - u)^4)^(1/4). The surface tilts the ray (Snell, index `ior`), so
// it lands beside where it entered. Near the rim the tilt is steep and the
// shift large; on the flat top it is zero, so the centre stays clear.

/** Corner radii in px, clockwise from the top left. */
export interface Corners {
  tl: number
  tr: number
  br: number
  bl: number
}

export interface LensSpec {
  /** Element size in CSS px. */
  width: number
  height: number
  corners: Corners
  /** Width of the bent band at the rim, px. */
  bezel: number
}

/** Index of refraction: crown glass. */
export const IOR = 1.5
/** The ray reaches the backdrop this far below the glass, as a share of the bezel. */
const STANDOFF = 0.35
/** The steepest tilt the rim may take; a vertical wall would bend light without limit. */
const MAX_TILT = (78 * Math.PI) / 180

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Glass height across the bezel: 0 at the rim (u = 0), 1 where the flat top starts (u = 1). */
export function squircleHeight(u: number): number {
  const c = clamp01(u)
  return Math.pow(1 - Math.pow(1 - c, 4), 0.25)
}

/** Slope of `squircleHeight`, unbounded at the rim. */
function squircleSlope(u: number): number {
  const c = clamp01(u)
  if (c >= 1) return 0
  const k = 1 - Math.pow(1 - c, 4)
  if (k <= 0) return Number.POSITIVE_INFINITY
  return Math.pow(1 - c, 3) * Math.pow(k, -0.75)
}

/** Unnormalised sideways shift of a ray entering the bezel at `u`. */
function rawShift(u: number): number {
  if (u >= 1) return 0
  const tilt = Math.min(Math.atan(squircleSlope(u)), MAX_TILT)
  const bent = Math.asin(Math.sin(tilt) / IOR)
  return (squircleHeight(u) + STANDOFF) * Math.tan(tilt - bent)
}

const PROFILE_STEPS = 256
let profileTable: Float32Array | null = null

/** Shift across the bezel, sampled from rim to flat top and scaled so the largest is 1. */
export function refractionProfile(): Float32Array {
  if (profileTable) return profileTable
  const table = new Float32Array(PROFILE_STEPS + 1)
  let max = 0
  for (let i = 0; i <= PROFILE_STEPS; i++) {
    const v = rawShift(i / PROFILE_STEPS)
    table[i] = v
    if (v > max) max = v
  }
  for (let i = 0; i <= PROFILE_STEPS; i++) table[i] = max > 0 ? table[i]! / max : 0
  profileTable = table
  return table
}

/** The profile at `u` (0 rim, 1 flat), linearly interpolated. */
export function shiftAt(u: number): number {
  const table = refractionProfile()
  const x = clamp01(u) * PROFILE_STEPS
  const i = Math.floor(x)
  if (i >= PROFILE_STEPS) return table[PROFILE_STEPS]!
  const f = x - i
  return table[i]! * (1 - f) + table[i + 1]! * f
}

/** Radii as the browser draws them: each at most half the shorter side, never negative. */
export function clampCorners(width: number, height: number, corners: Corners): Corners {
  const cap = Math.max(0, Math.min(width, height) / 2)
  const fit = (r: number) => Math.min(Math.max(0, r), cap)
  return { tl: fit(corners.tl), tr: fit(corners.tr), br: fit(corners.br), bl: fit(corners.bl) }
}

/**
 * Distance in from the edge of a rounded rectangle at (x, y), and the unit
 * normal pointing out of it there. Points outside report a negative distance.
 */
export function edgeAt(x: number, y: number, width: number, height: number, corners: Corners): { depth: number; nx: number; ny: number } {
  const left = x < width / 2
  const top = y < height / 2
  const r = top ? (left ? corners.tl : corners.tr) : left ? corners.bl : corners.br
  const cx = left ? r : width - r
  const cy = top ? r : height - r
  const inCornerX = left ? x < cx : x > cx
  const inCornerY = top ? y < cy : y > cy
  if (r > 0 && inCornerX && inCornerY) {
    const dx = x - cx
    const dy = y - cy
    const len = Math.hypot(dx, dy)
    if (len === 0) return { depth: r, nx: left ? -1 : 1, ny: 0 }
    return { depth: r - len, nx: dx / len, ny: dy / len }
  }
  const dl = x
  const dr = width - x
  const dt = y
  const db = height - y
  const min = Math.min(dl, dr, dt, db)
  if (min === dl) return { depth: dl, nx: -1, ny: 0 }
  if (min === dr) return { depth: dr, nx: 1, ny: 0 }
  if (min === dt) return { depth: dt, nx: 0, ny: -1 }
  return { depth: db, nx: 0, ny: 1 }
}

/** Where the bent rim shows (0 rim, 1 flat top): full at the edge, easing out
 * through the inner part of the bezel, so the lensed band has no hard line. */
export function rimMask(u: number): number {
  const t = clamp01((clamp01(u) - 0.4) / 0.6)
  return 1 - t * t * (3 - 2 * t)
}

/**
 * The displacement map for `spec`, `columns` × `rows` pixels (the element at
 * any scale; the filter stretches it back). Red carries the x shift and green
 * the y shift, 128 meaning none; every shift points inward, so the rim shows
 * backdrop from inside the glass, never the empty space beyond it. Blue is
 * the rim mask (`rimMask`, 255 at the edge, 0 on the flat top): the filter
 * shows the bent, nearly sharp backdrop there and the frosted one elsewhere.
 */
export function fillDisplacement(spec: LensSpec, columns: number, rows: number): Uint8ClampedArray {
  const { width, height, bezel } = spec
  const corners = clampCorners(width, height, spec.corners)
  const out = new Uint8ClampedArray(columns * rows * 4)
  const sx = width / columns
  const sy = height / rows
  for (let row = 0; row < rows; row++) {
    const y = (row + 0.5) * sy
    for (let col = 0; col < columns; col++) {
      const x = (col + 0.5) * sx
      const at = (row * columns + col) * 4
      let r = 128
      let g = 128
      let b = 0
      if (bezel > 0) {
        const { depth, nx, ny } = edgeAt(x, y, width, height, corners)
        if (depth < bezel) {
          const u = Math.max(0, depth) / bezel
          const shift = shiftAt(u)
          r = 128 - Math.round(127 * shift * nx)
          g = 128 - Math.round(127 * shift * ny)
          b = Math.round(255 * rimMask(u))
        }
      }
      out[at] = r
      out[at + 1] = g
      out[at + 2] = b
      out[at + 3] = 255
    }
  }
  return out
}

/** `feDisplacementMap` scale that turns a full-strength map pixel into `maxShift` px. */
export function displacementScale(maxShift: number): number {
  return (2 * maxShift * 255) / 254
}

/** Map resolution for an element: half its size, at most `cap` on the long side, at least 1. */
export function mapSize(width: number, height: number, cap = 512): { columns: number; rows: number } {
  const scale = Math.min(0.5, cap / Math.max(width, height, 1))
  return { columns: Math.max(1, Math.round(width * scale)), rows: Math.max(1, Math.round(height * scale)) }
}

/**
 * Cache key for a lens: sizes snap to 8 px so a sheet that grows by a pixel
 * reuses its map (the filter stretches it the rest of the way).
 */
export function lensKey(spec: LensSpec): string {
  const { width, height, corners: c, bezel } = snappedSpec(spec)
  const r = (v: number) => Math.round(v)
  return `${width}x${height}:${r(c.tl)},${r(c.tr)},${r(c.br)},${r(c.bl)}:${r(bezel)}`
}

/** The snapped spec a key stands for, so the map drawn for it matches every element sharing the key. */
export function snappedSpec(spec: LensSpec): LensSpec {
  const snap = (v: number) => Math.max(8, Math.round(v / 8) * 8)
  const width = snap(spec.width)
  const height = snap(spec.height)
  return { width, height, corners: clampCorners(width, height, spec.corners), bezel: spec.bezel }
}

export type Material = "bar" | "pill" | "sheet"

export interface Candidate<T> {
  key: T
  material: Material
  visible: boolean
  /** On-screen area in px², a tiebreak: smaller glass bends more visibly. */
  area: number
}

const RANK: Record<Material, number> = { pill: 0, bar: 1, sheet: 2 }

/**
 * Which surfaces get real refraction: visible ones only, pills first, then
 * bars, then sheets, the smaller first within each, at most `budget`. The
 * rest keep the plain frosted filter.
 */
export function pickRefracting<T>(candidates: readonly Candidate<T>[], budget: number): Set<T> {
  const chosen = candidates
    .filter((c) => c.visible && c.area > 0)
    .sort((a, b) => RANK[a.material] - RANK[b.material] || a.area - b.area)
    .slice(0, Math.max(0, budget))
  return new Set(chosen.map((c) => c.key))
}

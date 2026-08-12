// Terrain snap for the Map Mode YOU pin.
//
// ReorientationPlugin parks the traveler at world origin with ellipsoid
// height 0. Google Photorealistic 3D Tiles then stream the real mesh —
// Seoul streets sit ~40–80 m above that ellipsoid, Busan hills more —
// so a pin at y = 8 is often *inside* the ground. We raycast the tile
// group from above, keep upward-facing hits, and take a 5-tap median
// so a lamp post or tree at exact origin can't lift the pin.

export const YOU_RAY_HEIGHT = 8000
export const YOU_RAY_FAR = 16000
export const YOU_PROBE_RADIUS = 3.2
export const FLOOR_NORMAL_Y = 0.32
/** If the center tap is within this many meters of the median, trust it. */
const CENTER_OUTLIER_M = 3
/** Skip the 4 satellite taps when the center floor is this close to the live pin. */
const STABLE_DELTA_M = 1.5
const STABLE_NORMAL_Y = 0.7

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface TerrainHit {
  distance: number
  point: Vec3
  normal: Vec3
}

/** Center first, then N / S / W / E in the ReorientationPlugin frame
 *  (+Z north, +X west). */
export const YOU_PROBE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0, YOU_PROBE_RADIUS],
  [0, -YOU_PROBE_RADIUS],
  [YOU_PROBE_RADIUS, 0],
  [-YOU_PROBE_RADIUS, 0],
]

export function damp(current: number, target: number, lambda: number, dtSec: number): number {
  if (dtSec <= 0) return current
  return current + (target - current) * (1 - Math.exp(-lambda * dtSec))
}

/** Closest upward-facing hit (the visible floor from the sky). Falls
 *  back to the closest hit of any orientation so we still snap when
 *  the only geometry is a wall. */
export function pickFloorHit(hits: TerrainHit[]): TerrainHit | null {
  if (hits.length === 0) return null
  let closest: TerrainHit | null = null
  let closestFloor: TerrainHit | null = null
  for (const hit of hits) {
    if (!closest || hit.distance < closest.distance) closest = hit
    if (hit.normal.y >= FLOOR_NORMAL_Y) {
      if (!closestFloor || hit.distance < closestFloor.distance) closestFloor = hit
    }
  }
  return closestFloor ?? closest
}

export function probeYouAnchor(
  cast: (x: number, z: number) => TerrainHit | null,
  offsets: ReadonlyArray<readonly [number, number]> = YOU_PROBE_OFFSETS,
): TerrainHit | null {
  const samples = offsets.map(([x, z]) => cast(x, z))
  return resolveYouAnchor(samples)
}

/**
 * Cheap path when the pin is already sitting on a stable floor: one
 * center tap. Full 5-tap probe on first snap, steep hits, or when the
 * streamed LOD jumps the surface by more than a meter.
 */
export function refreshYouAnchor(
  cast: (x: number, z: number) => TerrainHit | null,
  currentY: number | null,
): TerrainHit | null {
  const center = cast(0, 0)
  if (
    center &&
    currentY != null &&
    center.normal.y >= STABLE_NORMAL_Y &&
    Math.abs(center.point.y - currentY) < STABLE_DELTA_M
  ) {
    return {
      distance: center.distance,
      point: { x: 0, y: center.point.y, z: 0 },
      normal: center.normal,
    }
  }
  return probeYouAnchor(cast)
}

export function resolveYouAnchor(samples: Array<TerrainHit | null>): TerrainHit | null {
  const valid = samples.filter((s): s is TerrainHit => s != null)
  if (valid.length === 0) return null
  const floors = valid.filter((s) => s.normal.y >= FLOOR_NORMAL_Y)
  const pool = floors.length > 0 ? floors : valid
  const y = median(pool.map((s) => s.point.y))
  const center = samples[0]
  const centerUsable =
    center != null &&
    (floors.length === 0 || center.normal.y >= FLOOR_NORMAL_Y) &&
    Math.abs(center.point.y - y) <= CENTER_OUTLIER_M
  if (centerUsable && center) {
    return {
      distance: center.distance,
      point: { x: 0, y: center.point.y, z: 0 },
      normal: center.normal,
    }
  }
  return {
    distance: 0,
    point: { x: 0, y, z: 0 },
    normal: averageNormal(pool),
  }
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2
  return sorted[mid]
}

function averageNormal(hits: TerrainHit[]): Vec3 {
  let x = 0
  let y = 0
  let z = 0
  for (const hit of hits) {
    x += hit.normal.x
    y += hit.normal.y
    z += hit.normal.z
  }
  const len = Math.hypot(x, y, z)
  if (len < 1e-5) return { x: 0, y: 1, z: 0 }
  return { x: x / len, y: y / len, z: z / len }
}

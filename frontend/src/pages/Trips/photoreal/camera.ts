import type { LngLat } from "../map/geo"

// Camera maths for the photoreal view. No three.js imports, so it is cheap
// to test and to reason about.
//
// Scene frame (set by the tiles' ReorientationPlugin): the anchor sits at
// the origin, +Y is up, +Z is north and +X is WEST.
//
// A pose is an orbit around a ground target:
//   bearing  compass heading the camera looks toward (0 = north, clockwise)
//   tilt     angle from straight down (0 = top-down, like a map pitch)
//   distance metres from the camera to the target

export interface Vec2 {
  x: number
  z: number
}

export interface Pose {
  x: number
  y: number
  z: number
  distance: number
  bearing: number
  tilt: number
}

export const DEG = Math.PI / 180
export const TILT_OVERVIEW = 46 * DEG
export const TILT_STOP = 54 * DEG
export const TILT_FLAT = 2 * DEG
export const TILT_MAX = 76 * DEG
export const FOV_DEG = 40
export const MIN_DISTANCE = 90
export const MAX_DISTANCE = 60_000

/** Metres per degree at a latitude (WGS84 series), good to centimetres over a city. */
export function metersPerDegree(latDeg: number): { lat: number; lng: number } {
  const p = latDeg * DEG
  return {
    lat: 111_132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p),
    lng: 111_412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p),
  }
}

/** Lat / lng → scene metres around the anchor (+X west, +Z north). */
export function toLocal(anchor: LngLat, point: LngLat): Vec2 {
  const m = metersPerDegree(anchor.lat)
  return { x: -(point.lng - anchor.lng) * m.lng, z: (point.lat - anchor.lat) * m.lat }
}

/** Compass heading of travel from `a` to `b`, in radians. */
export function headingBetween(a: Vec2, b: Vec2): number {
  return Math.atan2(-(b.x - a.x), b.z - a.z)
}

/** Signed smallest rotation from `from` to `to`, in (-π, π]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (2 * Math.PI)
  if (d > Math.PI) d -= 2 * Math.PI
  if (d <= -Math.PI) d += 2 * Math.PI
  return d
}

/** Where the camera sits for a pose. */
export function cameraPosition(pose: Pose): { x: number; y: number; z: number } {
  const ground = pose.distance * Math.sin(pose.tilt)
  return {
    x: pose.x + Math.sin(pose.bearing) * ground,
    y: pose.y + pose.distance * Math.cos(pose.tilt),
    z: pose.z - Math.cos(pose.bearing) * ground,
  }
}

/** Part of the viewport the chrome leaves free, as fractions of the half-extents. */
export interface Frame {
  /** tan(vertical fov / 2). */
  tanV: number
  aspect: number
  /** Usable half-width / half-height around the optical centre, 0–1. */
  marginX: number
  marginTop: number
  marginBottom: number
}

/**
 * Smallest distance at which every point (on the ground plane, relative to
 * the target) lands inside the frame. Perspective makes the near edge the
 * binding one, so each constraint is solved exactly rather than by a
 * bounding-sphere guess.
 */
export function fitDistance(
  points: readonly Vec2[],
  target: Vec2,
  bearing: number,
  tilt: number,
  frame: Frame,
  min = MIN_DISTANCE,
): number {
  const sinT = Math.sin(tilt)
  const cosT = Math.cos(tilt)
  const tanH = frame.tanV * frame.aspect
  let distance = min
  for (const p of points) {
    const dx = p.x - target.x
    const dz = p.z - target.z
    // Along the view direction on the ground, and to its right.
    const forward = -Math.sin(bearing) * dx + Math.cos(bearing) * dz
    const right = -Math.cos(bearing) * dx - Math.sin(bearing) * dz
    // Camera space: depth = d + forward·sinT, up = forward·cosT, side = right.
    const side = Math.abs(right) / (frame.marginX * tanH) - forward * sinT
    const vertical =
      forward >= 0
        ? (forward * cosT) / (frame.marginTop * frame.tanV) - forward * sinT
        : (-forward * cosT) / (frame.marginBottom * frame.tanV) - forward * sinT
    distance = Math.max(distance, side, vertical)
  }
  return Math.min(MAX_DISTANCE, distance)
}

/** Middle of the points' bounding box. */
export function boundsCenter(points: readonly Vec2[]): Vec2 {
  if (points.length === 0) return { x: 0, z: 0 }
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z)
    maxZ = Math.max(maxZ, p.z)
  }
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }
}

/**
 * A bearing that lays the day out across the screen's long side: look
 * across the stops' main axis on a wide screen, along it on a tall one.
 * Of the two opposite answers, take the one nearer north-up so the map
 * stays readable. A compact or single-stop day just looks north.
 */
export function overviewBearing(points: readonly Vec2[], portrait: boolean): number {
  if (points.length < 2) return 0
  const mid = boundsCenter(points)
  let sxx = 0
  let szz = 0
  let sxz = 0
  for (const p of points) {
    // East / north components.
    const e = -(p.x - mid.x)
    const n = p.z - mid.z
    sxx += e * e
    szz += n * n
    sxz += e * n
  }
  const spread = Math.sqrt((sxx - szz) ** 2 + 4 * sxz * sxz)
  // Nearly round: no axis worth turning the map for.
  if (spread < 0.25 * (sxx + szz)) return 0
  // Heading of the principal axis (clockwise from north).
  const axis = Math.atan2(2 * sxz, szz - sxx) / 2
  let bearing = portrait ? axis : axis + Math.PI / 2
  bearing = angleDelta(0, bearing)
  if (bearing > Math.PI / 2) bearing -= Math.PI
  if (bearing < -Math.PI / 2) bearing += Math.PI
  return bearing
}

/** How far back to sit from a selected stop: close enough to read the block, wide enough to see the next one over. */
export function stopDistance(nearestNeighbourM: number | null): number {
  if (nearestNeighbourM === null) return 340
  return Math.min(450, Math.max(250, nearestNeighbourM * 1.1))
}

/**
 * Keep looking the way we were unless the way onward would then be behind
 * us; in that case turn to face the direction of travel.
 */
export function chooseBearing(current: number, travel: number | null): number {
  if (travel === null) return current
  return Math.abs(angleDelta(current, travel)) > 100 * DEG ? current + angleDelta(current, travel) : current
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
export const easeOutQuart = (t: number) => 1 - (1 - t) ** 4

/** Seconds for a flight, by how far the ground target travels. */
export function flightSeconds(travelM: number): number {
  return Math.min(3.4, 1.5 + Math.sqrt(Math.max(0, travelM)) / 22)
}

/**
 * A pose part-way through a flight. `k` is eased progress; `t` is raw
 * progress, used to lift the camera mid-flight on a long hop so the city
 * passes underneath instead of smearing past.
 */
export function mixPose(from: Pose, to: Pose, k: number, t: number): Pose {
  const travel = Math.hypot(to.x - from.x, to.z - from.z)
  const cruise = Math.max(from.distance, to.distance)
  const lift = Math.max(0, Math.min(travel * 0.6, 2200) - (cruise - Math.min(from.distance, to.distance)) * 0.5)
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
    z: from.z + (to.z - from.z) * k,
    distance: from.distance + (to.distance - from.distance) * k + lift * Math.sin(Math.PI * t) ** 2,
    bearing: from.bearing + angleDelta(from.bearing, to.bearing) * k,
    tilt: from.tilt + (to.tilt - from.tilt) * k,
  }
}

/** How high a leg's arc rises above its ends: enough to clear rooftops, never a rainbow. */
export function arcLift(lengthM: number): number {
  return Math.min(260, Math.max(22, lengthM * 0.085))
}

/** Points along one leg: a shallow parabola from `a` to `b` (y up). */
export function arcPoints(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  segments = 32,
): number[] {
  const lift = arcLift(Math.hypot(b.x - a.x, b.z - a.z))
  const out: number[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    out.push(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + lift * 4 * t * (1 - t), a.z + (b.z - a.z) * t)
  }
  return out
}

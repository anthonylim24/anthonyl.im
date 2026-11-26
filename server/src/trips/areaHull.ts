// The shape a neighborhood is drawn as when OpenStreetMap has no outline: the
// convex hull of its stops, widened by 250 to 600 m. The trip map draws it
// (`approximateArea` in `frontend/src/pages/Trips/map/geo.ts`) and the grouping
// files a moved stop by it (`areaHolding` in `neighborhoods.ts`). It imports
// nothing, so the client's build and type check can read it from here: the
// preview API ships only `server/src`.

type Point = { lat: number; lng: number }
type Xy = [number, number]

const M_PER_DEG = 111_320
const CIRCLE_STEPS = 16

/** How far the shape reaches past the outermost stops, for stops whose bounding box has a diagonal of `spanM` metres: a stop sits inside its street, not on the edge of the area. */
export const hullBuffer = (spanM: number): number => Math.min(600, Math.max(250, 0.15 * spanM))

/** Metres east and north of `about` on a flat projection, which is exact enough across a neighborhood. */
function flatAbout(about: Point) {
  const xScale = M_PER_DEG * Math.cos((about.lat * Math.PI) / 180)
  return {
    toXy: (p: Point): Xy => [(p.lng - about.lng) * xScale, (p.lat - about.lat) * M_PER_DEG],
    toLngLat: ([x, y]: Xy): [number, number] => [about.lng + x / xScale, about.lat + y / M_PER_DEG],
  }
}

const cross = (o: Xy, a: Xy, b: Xy) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

/** Anticlockwise, without collinear points (Andrew's monotone chain). Fewer than three points come back sorted: one point, or two (a capsule's spine). */
function convexHull(points: readonly Xy[]): Xy[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (sorted.length < 3) return sorted
  const half = (list: readonly Xy[]) => {
    const out: Xy[] = []
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...half(sorted), ...half([...sorted].reverse())]
}

function distanceToSegment([px, py]: Xy, [ax, ay]: Xy, [bx, by]: Xy): number {
  const dx = bx - ax
  const dy = by - ay
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * The convex hull of `points` widened by `bufferM`, as a closed GeoJSON ring
 * ([lng, lat], anticlockwise), projected about `about`. One point is a circle
 * (16 corners), two a capsule. Empty for no points.
 */
export function bufferedHull(points: readonly Point[], about: Point, bufferM: number): [number, number][] {
  if (points.length === 0) return []
  const flat = flatAbout(about)
  const around: Xy[] = []
  for (const p of points) {
    const [x, y] = flat.toXy(p)
    for (let i = 0; i < CIRCLE_STEPS; i++) {
      const angle = (2 * Math.PI * i) / CIRCLE_STEPS
      around.push([x + bufferM * Math.cos(angle), y + bufferM * Math.sin(angle)])
    }
  }
  const ring = convexHull(around).map(flat.toLngLat)
  ring.push(ring[0]!)
  return ring
}

/** Metres from `point` to the convex hull of `members` (0 inside), projected about `about`. Infinity for no members. */
export function hullDistance(point: Point, members: readonly Point[], about: Point): number {
  if (members.length === 0) return Infinity
  const flat = flatAbout(about)
  const hull = convexHull(members.map(flat.toXy))
  const at = flat.toXy(point)
  if (hull.length === 1) return Math.hypot(at[0] - hull[0]![0], at[1] - hull[0]![1])
  const edges = hull.map((a, i): [Xy, Xy] => [a, hull[(i + 1) % hull.length]!])
  if (hull.length >= 3 && edges.every(([a, b]) => cross(a, b, at) >= 0)) return 0
  return Math.min(...edges.map(([a, b]) => distanceToSegment(at, a, b)))
}

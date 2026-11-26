import { describe, expect, test } from "bun:test"
import { haversineMeters } from "../data/koreaPlaces"
import { bufferedHull, hullBuffer, hullDistance } from "./areaHull"

type Point = { lat: number; lng: number }

const middle = (points: readonly Point[]): Point => ({
  lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
  lng: points.reduce((sum, p) => sum + p.lng, 0) / points.length,
})

function inside(p: Point, ring: [number, number][]): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** Twice the signed area: positive when the ring runs anticlockwise. */
const signedArea = (ring: [number, number][]) => ring.slice(1).reduce((sum, [x, y], i) => sum + (ring[i]![0] * y - x * ring[i]![1]), 0)

// Alfama, Lisbon: the castle, the cathedral and a viewpoint.
const ALFAMA: Point[] = [
  { lat: 38.7139, lng: -9.1335 },
  { lat: 38.7098, lng: -9.1361 },
  { lat: 38.7118, lng: -9.1302 },
]

describe("bufferedHull", () => {
  test("is empty for no stops", () => {
    expect(bufferedHull([], ALFAMA[0]!, 300)).toEqual([])
  })

  test("draws one stop as a closed circle of the buffer's radius", () => {
    const stop = ALFAMA[0]!
    const ring = bufferedHull([stop], stop, 300)
    expect(ring.length).toBe(17)
    expect(ring[0]).toEqual(ring[ring.length - 1]!)
    for (const [lng, lat] of ring) expect(haversineMeters(stop, { lat, lng })).toBeCloseTo(300, -1)
  })

  test("holds every stop well inside, runs anticlockwise and closes", () => {
    const ring = bufferedHull(ALFAMA, middle(ALFAMA), 250)
    expect(ring[0]).toEqual(ring[ring.length - 1]!)
    expect(signedArea(ring)).toBeGreaterThan(0)
    for (const stop of ALFAMA) {
      expect(inside(stop, ring)).toBe(true)
      // No corner of the shape comes close to a stop: each sits inside, not on the edge.
      const nearest = Math.min(...ring.map(([lng, lat]) => haversineMeters(stop, { lat, lng })))
      expect(nearest).toBeGreaterThan(200)
    }
  })

  test("is convex: no stop in the middle pulls the edge in", () => {
    const centre = middle(ALFAMA)
    const withMiddle = bufferedHull([...ALFAMA, { lat: 38.7118, lng: -9.1333 }], centre, 250)
    const without = bufferedHull(ALFAMA, centre, 250)
    expect(withMiddle).toHaveLength(without.length)
    withMiddle.forEach(([lng, lat], i) => {
      expect(lng).toBeCloseTo(without[i]![0], 8)
      expect(lat).toBeCloseTo(without[i]![1], 8)
    })
  })
})

describe("hullBuffer", () => {
  test("keeps the margin between 250 and 600 metres", () => {
    expect(hullBuffer(0)).toBe(250)
    expect(hullBuffer(2_000)).toBe(300)
    expect(hullBuffer(10_000)).toBe(600)
  })
})

describe("hullDistance", () => {
  const cafe = { lat: 37.5447, lng: 127.0581 }
  const haus = { lat: 37.5451, lng: 127.0559 }
  const forest = { lat: 37.5444, lng: 127.0374 }

  test("measures a point's distance to the members' hull, zero inside", () => {
    expect(hullDistance(cafe, [], cafe)).toBe(Infinity)
    expect(hullDistance(cafe, [cafe], cafe)).toBe(0)
    expect(hullDistance(haus, [cafe], cafe)).toBeGreaterThan(190)
    expect(hullDistance(haus, [cafe], cafe)).toBeLessThan(220)
    const triangle = [cafe, forest, { lat: 37.553, lng: 127.047 }]
    expect(hullDistance({ lat: 37.548, lng: 127.047 }, triangle, middle(triangle))).toBe(0)
    expect(hullDistance({ lat: 37.53, lng: 127.047 }, triangle, middle(triangle))).toBeGreaterThan(1_000)
  })

  test("measures to the spine of two members, a capsule", () => {
    const pair = [cafe, haus]
    const between = middle(pair)
    expect(hullDistance(between, pair, between)).toBeLessThan(1)
    expect(hullDistance(forest, pair, between)).toBeCloseTo(haversineMeters(forest, haus), -1)
  })
})

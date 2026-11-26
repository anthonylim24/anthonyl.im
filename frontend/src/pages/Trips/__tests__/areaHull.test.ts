import { describe, expect, it } from "vitest"
import { approximateArea, areaHull, distanceMeters, hullBuffer, shapeCorners, type LngLat } from "../map/geo"

function inside(p: LngLat, ring: [number, number][]): boolean {
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
const ALFAMA: LngLat[] = [
  { lat: 38.7139, lng: -9.1335 },
  { lat: 38.7098, lng: -9.1361 },
  { lat: 38.7118, lng: -9.1302 },
]

describe("areaHull", () => {
  it("is empty for no stops", () => {
    expect(areaHull([])).toEqual([])
    expect(approximateArea([])).toBeNull()
  })

  it("draws one stop as a closed circle of the buffer's radius", () => {
    const stop = ALFAMA[0]!
    const ring = areaHull([stop], 300)
    expect(ring.length).toBe(17)
    expect(ring[0]).toEqual(ring[ring.length - 1])
    for (const [lng, lat] of ring) expect(distanceMeters(stop, { lat, lng })).toBeCloseTo(300, -1)
  })

  it("holds every stop well inside, runs anticlockwise and closes", () => {
    const ring = areaHull(ALFAMA)
    expect(ring[0]).toEqual(ring[ring.length - 1])
    expect(signedArea(ring)).toBeGreaterThan(0)
    for (const stop of ALFAMA) {
      expect(inside(stop, ring)).toBe(true)
      // No corner of the shape comes close to a stop: each sits inside, not on the edge.
      const nearest = Math.min(...ring.map(([lng, lat]) => distanceMeters(stop, { lat, lng })))
      expect(nearest).toBeGreaterThan(200)
    }
  })

  it("is convex: no stop in the middle pulls the edge in", () => {
    const middle = { lat: 38.7118, lng: -9.1333 }
    const withMiddle = areaHull([...ALFAMA, middle])
    const without = areaHull(ALFAMA, hullBuffer([...ALFAMA, middle]))
    expect(withMiddle).toHaveLength(without.length)
    withMiddle.forEach(([lng, lat], i) => {
      expect(lng).toBeCloseTo(without[i]![0], 8)
      expect(lat).toBeCloseTo(without[i]![1], 8)
    })
  })

  it("keeps its buffer between 250 and 600 metres", () => {
    expect(hullBuffer([ALFAMA[0]!])).toBe(250)
    expect(hullBuffer([{ lat: 38.7, lng: -9.2 }, { lat: 38.75, lng: -9.1 }])).toBe(600)
  })
})

describe("shapeCorners", () => {
  it("frames the outer rings of every part", () => {
    const corners = shapeCorners({
      type: "MultiPolygon",
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        [[[2, 2], [3, 2], [3, 3], [2, 2]]],
      ],
    })
    expect(corners).toEqual([
      { lat: 0, lng: 0 },
      { lat: 3, lng: 3 },
    ])
  })

  it("marks a drawn shape as approximate", () => {
    expect(approximateArea(ALFAMA)?.approximate).toBe(true)
  })
})

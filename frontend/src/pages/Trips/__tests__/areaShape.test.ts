import { describe, expect, it } from "vitest"
import { approximateArea, distanceMeters, shapeCorners, type LngLat } from "../map/geo"

// The hull itself is tested beside it (server/src/trips/areaHull.test.ts).

// Alfama, Lisbon: the castle, the cathedral and a viewpoint.
const ALFAMA: LngLat[] = [
  { lat: 38.7139, lng: -9.1335 },
  { lat: 38.7098, lng: -9.1361 },
  { lat: 38.7118, lng: -9.1302 },
]

describe("approximateArea", () => {
  it("is nothing for no stops", () => {
    expect(approximateArea([])).toBeNull()
  })

  it("marks a drawn shape as approximate, a closed ring around the stops", () => {
    const shape = approximateArea(ALFAMA)
    expect(shape?.approximate).toBe(true)
    const ring = shape?.geometry.type === "Polygon" ? shape.geometry.coordinates[0]! : []
    expect(ring.length).toBeGreaterThan(16)
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })
})

describe("approximateArea's margin", () => {
  const ringOf = (points: LngLat[]) => {
    const shape = approximateArea(points)
    return shape?.geometry.type === "Polygon" ? shape.geometry.coordinates[0]! : []
  }
  const margin = (points: LngLat[]) =>
    Math.min(...ringOf(points).map(([lng, lat]) => Math.min(...points.map((p) => distanceMeters(p, { lat: lat!, lng: lng! })))))

  it("is 250 m around one stop and 600 m around stops far apart", () => {
    expect(margin([ALFAMA[0]!])).toBeCloseTo(250, -1)
    expect(margin([{ lat: 38.7, lng: -9.2 }, { lat: 38.75, lng: -9.1 }])).toBeCloseTo(600, -1)
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
})

import { describe, expect, it } from "vitest"
import {
  damp,
  pickFloorHit,
  probeYouAnchor,
  refreshYouAnchor,
  resolveYouAnchor,
  type TerrainHit,
} from "../terrainAnchor"

function hit(partial: Partial<TerrainHit> & Pick<TerrainHit, "distance" | "point">): TerrainHit {
  return {
    normal: { x: 0, y: 1, z: 0 },
    ...partial,
  }
}

describe("pickFloorHit", () => {
  it("returns null for an empty list", () => {
    expect(pickFloorHit([])).toBeNull()
  })

  it("prefers the closest upward-facing surface", () => {
    const roof = hit({ distance: 100, point: { x: 0, y: 80, z: 0 } })
    const street = hit({ distance: 140, point: { x: 0, y: 40, z: 0 } })
    expect(pickFloorHit([street, roof])).toBe(roof)
  })

  it("skips undersides and walls so the pin is not glued under an overhang", () => {
    const underside = hit({
      distance: 90,
      point: { x: 0, y: 55, z: 0 },
      normal: { x: 0, y: -1, z: 0 },
    })
    const wall = hit({
      distance: 95,
      point: { x: 0, y: 50, z: 0 },
      normal: { x: 1, y: 0.1, z: 0 },
    })
    const street = hit({ distance: 140, point: { x: 0, y: 40, z: 0 } })
    expect(pickFloorHit([underside, wall, street])).toBe(street)
  })

  it("falls back to the closest hit when nothing faces up", () => {
    const wall = hit({
      distance: 20,
      point: { x: 0, y: 10, z: 0 },
      normal: { x: 1, y: 0, z: 0 },
    })
    expect(pickFloorHit([wall])).toBe(wall)
  })
})

describe("resolveYouAnchor", () => {
  it("returns null when every tap misses", () => {
    expect(resolveYouAnchor([null, null, null])).toBeNull()
  })

  it("keeps the pin at xz origin and trusts a center floor near the median", () => {
    const center = hit({ distance: 10, point: { x: 1.2, y: 42, z: -0.4 } })
    const n = hit({ distance: 11, point: { x: 0, y: 41.5, z: 3.2 } })
    const s = hit({ distance: 12, point: { x: 0, y: 42.4, z: -3.2 } })
    const resolved = resolveYouAnchor([center, n, s])
    expect(resolved?.point).toEqual({ x: 0, y: 42, z: 0 })
    expect(resolved?.normal).toEqual(center.normal)
  })

  it("rejects a center lamp-post outlier in favor of the median floor", () => {
    const lamp = hit({ distance: 8, point: { x: 0, y: 51, z: 0 } })
    const floors = [41, 42, 41.5, 42.2].map((y, i) =>
      hit({ distance: 20 + i, point: { x: 0, y, z: 0 } }),
    )
    const resolved = resolveYouAnchor([lamp, ...floors])
    expect(resolved).not.toBeNull()
    expect(resolved!.point.x).toBe(0)
    expect(resolved!.point.z).toBe(0)
    expect(resolved!.point.y).toBeGreaterThan(40)
    expect(resolved!.point.y).toBeLessThan(44)
  })
})

describe("probeYouAnchor / refreshYouAnchor", () => {
  it("casts every offset of a full probe", () => {
    const seen: string[] = []
    const cast = (x: number, z: number): TerrainHit | null => {
      seen.push(`${x},${z}`)
      return hit({ distance: 10, point: { x, y: 40, z } })
    }
    const resolved = probeYouAnchor(cast)
    expect(seen.length).toBe(5)
    expect(resolved?.point.y).toBe(40)
  })

  it("uses a single center tap when the live pin is already stable", () => {
    let calls = 0
    const cast = (x: number, z: number): TerrainHit | null => {
      calls++
      if (x !== 0 || z !== 0) throw new Error("satellite tap on stable path")
      return hit({ distance: 10, point: { x: 0, y: 40.4, z: 0 } })
    }
    const resolved = refreshYouAnchor(cast, 40)
    expect(calls).toBe(1)
    expect(resolved?.point).toEqual({ x: 0, y: 40.4, z: 0 })
  })

  it("falls back to a full probe when the center is a wall or the LOD jumped", () => {
    const ys = new Map<string, number>([
      ["0,0", 80],
      ["0,3.2", 42],
      ["0,-3.2", 41],
      ["3.2,0", 42.5],
      ["-3.2,0", 41.8],
    ])
    const cast = (x: number, z: number): TerrainHit | null => {
      const y = ys.get(`${x},${z}`) ?? 40
      const wall = x === 0 && z === 0
      return hit({
        distance: 10,
        point: { x, y, z },
        normal: wall ? { x: 1, y: 0.1, z: 0 } : { x: 0, y: 1, z: 0 },
      })
    }
    const resolved = refreshYouAnchor(cast, 42)
    expect(resolved).not.toBeNull()
    expect(resolved!.point.y).toBeGreaterThan(40)
    expect(resolved!.point.y).toBeLessThan(45)
    expect(resolved!.normal.y).toBeGreaterThan(0.9)
  })
})

describe("damp", () => {
  it("returns the current value when dt is 0", () => {
    expect(damp(10, 40, 6, 0)).toBe(10)
  })

  it("moves toward the target without overshooting", () => {
    let y = 10
    for (let i = 0; i < 40; i++) y = damp(y, 40, 6, 1 / 60)
    expect(y).toBeGreaterThan(10)
    expect(y).toBeLessThanOrEqual(40)
    expect(y).toBeGreaterThan(35)
  })
})

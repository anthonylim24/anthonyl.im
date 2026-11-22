import { describe, expect, it } from "vitest"
import {
  clampCorners,
  displacementScale,
  edgeAt,
  fillDisplacement,
  lensKey,
  mapSize,
  pickRefracting,
  refractionProfile,
  shiftAt,
  snappedSpec,
  squircleHeight,
  type Candidate,
  type LensSpec,
} from "../bezel"

const round = (r: number) => ({ tl: r, tr: r, br: r, bl: r })

describe("squircleHeight", () => {
  it("rises from the rim to the flat top and stays there", () => {
    expect(squircleHeight(0)).toBe(0)
    expect(squircleHeight(1)).toBe(1)
    expect(squircleHeight(2)).toBe(1)
    expect(squircleHeight(-1)).toBe(0)
    let prev = 0
    for (let u = 0.05; u <= 1; u += 0.05) {
      const h = squircleHeight(u)
      expect(h).toBeGreaterThanOrEqual(prev)
      prev = h
    }
  })

  it("is convex: most of the height is gained near the rim", () => {
    expect(squircleHeight(0.25)).toBeGreaterThan(0.75)
  })
})

describe("refractionProfile", () => {
  const profile = refractionProfile()

  it("is scaled so the strongest shift is 1", () => {
    expect(Math.max(...profile)).toBeCloseTo(1, 6)
    expect(Math.min(...profile)).toBeGreaterThanOrEqual(0)
  })

  it("bends hardest near the rim and not at all on the flat top", () => {
    const peak = profile.indexOf(Math.max(...profile)) / (profile.length - 1)
    expect(peak).toBeLessThan(0.2)
    expect(shiftAt(1)).toBe(0)
    expect(shiftAt(0.9)).toBeLessThan(0.05)
  })

  it("falls steadily from its peak to the flat top, so the lens has no rings", () => {
    const peak = profile.indexOf(Math.max(...profile))
    for (let i = peak + 1; i < profile.length; i++) expect(profile[i]).toBeLessThanOrEqual(profile[i - 1]! + 1e-9)
  })

  it("interpolates and clamps", () => {
    expect(shiftAt(-1)).toBe(shiftAt(0))
    expect(shiftAt(5)).toBe(0)
    const a = shiftAt(0.3)
    const b = shiftAt(0.31)
    expect(Math.abs(a - b)).toBeLessThan(0.05)
  })
})

describe("clampCorners", () => {
  it("caps radii at half the shorter side, as browsers draw a capsule", () => {
    expect(clampCorners(200, 40, round(999))).toEqual(round(20))
    expect(clampCorners(200, 40, { tl: -4, tr: 8, br: 30, bl: 0 })).toEqual({ tl: 0, tr: 8, br: 20, bl: 0 })
  })
})

describe("edgeAt", () => {
  const corners = round(10)

  it("measures depth to the nearest straight edge with its outward normal", () => {
    expect(edgeAt(50, 3, 100, 40, corners)).toEqual({ depth: 3, nx: 0, ny: -1 })
    expect(edgeAt(50, 38, 100, 40, corners)).toEqual({ depth: 2, nx: 0, ny: 1 })
    expect(edgeAt(96, 20, 100, 40, corners)).toEqual({ depth: 4, nx: 1, ny: 0 })
    expect(edgeAt(1, 20, 100, 40, corners)).toEqual({ depth: 1, nx: -1, ny: 0 })
  })

  it("follows the arc in a rounded corner", () => {
    const { depth, nx, ny } = edgeAt(10 - 7.07, 10 - 7.07, 100, 40, corners)
    expect(depth).toBeCloseTo(0, 1)
    expect(nx).toBeCloseTo(-Math.SQRT1_2, 2)
    expect(ny).toBeCloseTo(-Math.SQRT1_2, 2)
  })

  it("reports points outside a corner's arc as negative depth", () => {
    expect(edgeAt(0.5, 0.5, 100, 40, corners).depth).toBeLessThan(0)
  })

  it("uses each corner's own radius (a sheet with square bottom corners)", () => {
    const sheet = { tl: 20, tr: 20, br: 0, bl: 0 }
    expect(edgeAt(1, 39, 100, 40, sheet)).toEqual({ depth: 1, nx: -1, ny: 0 })
    expect(edgeAt(1, 1, 100, 40, sheet).depth).toBeLessThan(0)
  })
})

describe("fillDisplacement", () => {
  const spec: LensSpec = { width: 120, height: 40, corners: round(20), bezel: 12 }
  const columns = 60
  const rows = 20
  const map = fillDisplacement(spec, columns, rows)
  const px = (col: number, row: number) => {
    const at = (row * columns + col) * 4
    return { r: map[at]!, g: map[at + 1]!, b: map[at + 2]!, a: map[at + 3]! }
  }

  it("is opaque, with blue neutral everywhere", () => {
    for (let i = 0; i < map.length; i += 4) {
      expect(map[i + 2]).toBe(128)
      expect(map[i + 3]).toBe(255)
    }
  })

  it("leaves the centre clear", () => {
    expect(px(30, 10)).toMatchObject({ r: 128, g: 128 })
  })

  it("points inward at every rim, so the edge never samples the empty space outside", () => {
    // Top edge: sample from below (green above 128 means +y).
    expect(px(30, 0).g).toBeGreaterThan(128)
    expect(px(30, rows - 1).g).toBeLessThan(128)
    // Capsule ends: the left end pulls from the right, the right end from the left.
    expect(px(0, 10).r).toBeGreaterThan(128)
    expect(px(columns - 1, 10).r).toBeLessThan(128)
  })

  it("is symmetric across the middle", () => {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const a = px(col, row)
        const b = px(columns - 1 - col, row)
        expect(a.r - 128 + (b.r - 128)).toBe(0)
        expect(a.g).toBe(b.g)
      }
    }
  })

  it("is flat when there is no bezel", () => {
    const flat = fillDisplacement({ ...spec, bezel: 0 }, 8, 4)
    for (let i = 0; i < flat.length; i += 4) expect([flat[i], flat[i + 1]]).toEqual([128, 128])
  })
})

describe("map sizing and keys", () => {
  it("draws the map at half size, capped on the long side", () => {
    expect(mapSize(200, 60)).toEqual({ columns: 100, rows: 30 })
    expect(mapSize(2400, 60, 512)).toEqual({ columns: 512, rows: 13 })
    expect(mapSize(0, 0)).toEqual({ columns: 1, rows: 1 })
  })

  it("turns a full-strength pixel into the requested shift", () => {
    // feDisplacementMap: shift = scale × (C − 0.5), C = (128 ± 127) / 255.
    const scale = displacementScale(12)
    expect(scale * (255 / 255 - 0.5) - scale * (128 / 255 - 0.5)).toBeCloseTo(12, 0)
  })

  it("shares a key across sizes within the same 8px step", () => {
    const a: LensSpec = { width: 301, height: 44, corners: round(22), bezel: 14 }
    const b: LensSpec = { width: 303, height: 45, corners: round(22.4), bezel: 14 }
    expect(lensKey(a)).toBe(lensKey(b))
    expect(lensKey(a)).not.toBe(lensKey({ ...a, width: 330 }))
    expect(lensKey(a)).not.toBe(lensKey({ ...a, bezel: 20 }))
  })

  it("draws the map for the snapped size every element with the key shares", () => {
    const spec: LensSpec = { width: 301, height: 45, corners: round(999), bezel: 14 }
    const snapped = snappedSpec(spec)
    expect(snapped).toMatchObject({ width: 304, height: 48 })
    expect(snapped.corners).toEqual(round(24))
    expect(lensKey(snapped)).toBe(lensKey(spec))
  })
})

describe("pickRefracting", () => {
  const c = (key: string, material: Candidate<string>["material"], visible = true, area = 1000): Candidate<string> => ({ key, material, visible, area })

  it("refracts only what is on screen, within the budget", () => {
    const chosen = pickRefracting([c("a", "pill"), c("b", "bar", false), c("c", "sheet")], 12)
    expect([...chosen].sort()).toEqual(["a", "c"])
  })

  it("spends the budget on pills, then bars, then sheets, smaller first", () => {
    const list = [c("sheet", "sheet", true, 10), c("bigBar", "bar", true, 5000), c("bar", "bar", true, 100), c("pill", "pill", true, 9000)]
    expect([...pickRefracting(list, 3)]).toEqual(["pill", "bar", "bigBar"])
    expect(pickRefracting(list, 0).size).toBe(0)
  })

  it("skips surfaces with no size (display: none)", () => {
    expect(pickRefracting([c("a", "pill", true, 0)], 12).size).toBe(0)
  })
})

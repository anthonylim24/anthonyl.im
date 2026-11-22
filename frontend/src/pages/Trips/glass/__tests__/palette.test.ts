import { describe, expect, it } from "vitest"
import { ACCENT_FILL, TRIP_ACCENTS } from "../../meta"
import {
  WALL_DARK_MAX,
  WALL_LIGHT_MIN,
  contrast,
  hexToLinear,
  inBand,
  isCoolHue,
  linearToHex,
  luminance,
  tintFloor,
  wallPalette,
} from "../palette"

const L = (hex: string) => luminance(hexToLinear(hex))
const BRAND_FILL = "#f0582b"

describe("colour arithmetic", () => {
  it("matches WCAG for black and white", () => {
    expect(L("#ffffff")).toBeCloseTo(1, 5)
    expect(L("#000")).toBe(0)
    expect(contrast(1, 0)).toBeCloseTo(21, 5)
    expect(contrast(0.2, 0.2)).toBe(1)
  })

  it("round-trips hex through linear light", () => {
    for (const hex of ["#eef1f6", "#9a3409", "#0b0f18", "#f2a71b"]) expect(linearToHex(hexToLinear(hex))).toBe(hex)
  })

  it("reads unreadable colours as a mid grey rather than throwing", () => {
    expect(hexToLinear("tomato")).toEqual([0.2, 0.2, 0.2])
  })
})

describe("the wallpaper band", () => {
  const accents = [...TRIP_ACCENTS.map((a) => ACCENT_FILL[a]), BRAND_FILL]

  it.each(accents)("keeps every colour for %s inside the band, in both themes", (accent) => {
    const light = wallPalette(accent, false)
    for (const c of [light.base, ...light.fields]) expect(luminance(c)).toBeGreaterThanOrEqual(WALL_LIGHT_MIN - 1e-9)
    const dark = wallPalette(accent, true)
    for (const c of [dark.base, ...dark.fields]) expect(luminance(c)).toBeLessThanOrEqual(WALL_DARK_MAX + 1e-9)
  })

  it("keeps the colour: a field is still visibly the accent's hue, not grey", () => {
    const [field] = wallPalette(ACCENT_FILL.rose, false).fields
    const [r, g, b] = field!
    expect(r).toBeGreaterThan(g + 0.05)
    expect(r).toBeGreaterThan(b + 0.05)
  })

  it("pairs warm accents with cool companions and cool accents with warm ones", () => {
    expect(isCoolHue(20)).toBe(false)
    expect(isCoolHue(216)).toBe(true)
    expect(isCoolHue(255)).toBe(true)
    const sky = wallPalette(ACCENT_FILL.sky, false).fields
    const [r, , b] = sky[2]!
    expect(r).toBeGreaterThan(b)
  })

  it("leaves in-band colours alone", () => {
    const c = hexToLinear("#f4f6fb")
    expect(inBand(c, false)).toEqual(c)
    const d = hexToLinear("#101420")
    expect(inBand(d, true)).toEqual(d)
  })

  // The inks glass.css sets, checked against the worst wallpaper the band allows.
  it.each([
    ["ink", "#14171a"],
    ["secondary ink", "#4d5259"],
    ["glass tertiary ink", "#4f545b"],
    ["glass brand text", "#9a3409"],
    ["glass ok", "#086048"],
    ["danger", "#b3261e"],
    ["rose --ta-strong", "#9b2530"],
    ["amber --ta-strong", "#704600"],
    ["emerald --ta-strong", "#086048"],
    ["sky --ta-strong", "#164b9c"],
    ["violet --ta-strong", "#4730a8"],
  ])("light: %s clears 4.5:1 on the palest wallpaper", (_, hex) => {
    expect(contrast(L(hex), WALL_LIGHT_MIN)).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ["ink", "#eceae4"],
    ["secondary ink", "#b0b4ba"],
    ["glass tertiary ink", "#9a9fa6"],
    ["brand text", "#ff9166"],
  ])("dark: %s clears 4.5:1 on the brightest wallpaper", (_, hex) => {
    expect(contrast(L(hex), WALL_DARK_MAX)).toBeGreaterThanOrEqual(4.5)
  })

  it("is needed: the atlas text tones fail on the wallpaper, which is why glass deepens them", () => {
    expect(contrast(L("#b8400f"), WALL_LIGHT_MIN)).toBeLessThan(4.5)
    expect(contrast(L("#8f5a00"), WALL_LIGHT_MIN)).toBeLessThan(4.5)
  })
})

describe("tintFloor", () => {
  const white = hexToLinear("#ffffff")
  const ink2 = hexToLinear("#4d5259")

  it("is 0 when the backdrop alone already passes", () => {
    expect(tintFloor(ink2, white, hexToLinear("#ffffff"))).toBe(0)
  })

  it("is 1 when even a solid tint cannot pass", () => {
    expect(tintFloor(hexToLinear("#777777"), hexToLinear("#888888"), hexToLinear("#7f7f7f"))).toBe(1)
  })

  it("finds the least opacity that passes, and that opacity does pass", () => {
    const backdrop = hexToLinear("#6a6a6a")
    const alpha = tintFloor(ink2, white, backdrop)
    expect(alpha).toBeGreaterThan(0)
    expect(alpha).toBeLessThan(1)
    const mixed = luminance(white) * alpha + luminance(backdrop) * (1 - alpha)
    expect(contrast(luminance(ink2), mixed)).toBeGreaterThanOrEqual(4.5)
    const less = luminance(white) * (alpha - 0.02) + luminance(backdrop) * (1 - alpha + 0.02)
    expect(contrast(luminance(ink2), less)).toBeLessThan(4.5)
  })

  // The tints in glass.css, over a busy blurred backdrop (L 0.15: a dark map or dense text).
  it("light bar and pill tints keep secondary ink at 4.5:1 over a dark backdrop", () => {
    const backdrop: [number, number, number] = [0.15, 0.15, 0.15]
    expect(tintFloor(ink2, white, backdrop)).toBeLessThanOrEqual(0.56)
  })

  it("dark bar tint keeps tertiary ink at 4.5:1 over a lit backdrop", () => {
    const backdrop: [number, number, number] = [0.06, 0.06, 0.06]
    expect(tintFloor(hexToLinear("#9a9fa6"), hexToLinear("#1e212a"), backdrop)).toBeLessThanOrEqual(0.72)
  })
})

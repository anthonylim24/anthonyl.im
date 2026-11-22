// Colour for the Liquid Glass look, as numbers: the wallpaper's palette from
// the trip's accent, and the contrast arithmetic that keeps text readable on
// it. Pure; the wallpaper shader only blends what this returns.
//
// Text sits straight on the wallpaper (titles, eyebrows, legs between cards),
// so the wallpaper lives in a luminance band: never darker than WALL_LIGHT_MIN
// in light, never brighter than WALL_DARK_MAX in dark. Relative luminance is
// linear in linear-light RGB, so every blend of in-band colours (the shader
// mixes in linear light) stays in the band; clamping the palette is enough.

export type Linear = readonly [number, number, number]

/** Light wallpaper floor: the glass tertiary ink (#4f545b) and `--ta` amber clear 4.5:1 on it. */
export const WALL_LIGHT_MIN = 0.72
/** Dark wallpaper ceiling: the glass dark tertiary ink (#9a9fa6) clears 4.5:1 on it. */
export const WALL_DARK_MAX = 0.028

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

/** `#rrggbb` (or `#rgb`) to linear-light RGB in 0..1. Anything unreadable is mid grey. */
export function hexToLinear(hex: string): Linear {
  let h = hex.trim().replace(/^#/, "")
  if (h.length === 3) h = h.replace(/./g, (d) => d + d)
  if (!/^[0-9a-f]{6}$/i.test(h)) return [0.2, 0.2, 0.2]
  const n = parseInt(h, 16)
  return [toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255)]
}

export function linearToHex([r, g, b]: Linear): string {
  const byte = (c: number) =>
    Math.round(Math.min(1, Math.max(0, toSrgb(c))) * 255)
      .toString(16)
      .padStart(2, "0")
  return `#${byte(r)}${byte(g)}${byte(b)}`
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: Linear): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two luminances. */
export function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/** Lifts a colour toward white until its luminance reaches `min`. */
function lift(c: Linear, min: number): Linear {
  const l = luminance(c)
  if (l >= min) return c
  const t = (min - l) / (1 - l)
  return [c[0] + (1 - c[0]) * t, c[1] + (1 - c[1]) * t, c[2] + (1 - c[2]) * t]
}

/** Darkens a colour, keeping its hue and chroma ratio, until its luminance is at most `max`. */
function dim(c: Linear, max: number): Linear {
  const l = luminance(c)
  if (l <= max || l === 0) return c
  const k = max / l
  return [c[0] * k, c[1] * k, c[2] * k]
}

/** Keeps a colour inside the wallpaper's band for the theme. */
export function inBand(c: Linear, dark: boolean): Linear {
  return dark ? dim(c, WALL_DARK_MAX) : lift(c, WALL_LIGHT_MIN)
}

function hsl(h: number, s: number, l: number): Linear {
  const hue = (((h % 360) + 360) % 360) / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return [toLinear(channel(hue + 1 / 3)), toLinear(channel(hue)), toLinear(channel(hue - 1 / 3))]
}

function hueOf([r, g, b]: Linear): number {
  const [R, G, B] = [toSrgb(r), toSrgb(g), toSrgb(b)]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const d = max - min
  if (d === 0) return 220
  let h: number
  if (max === R) h = ((G - B) / d) % 6
  else if (max === G) h = (B - R) / d + 2
  else h = (R - G) / d + 4
  return (h * 60 + 360) % 360
}

export interface WallPalette {
  base: Linear
  /** Soft fields, painted in order over the base. */
  fields: readonly Linear[]
}

/** Hues that sit well beside any accent: sky and lilac for a warm accent, peach and rose for a cool one. */
const COOL = [212, 268] as const
const WARM = [24, 336] as const

/** True for the blues and violets, which take warm companions. */
export function isCoolHue(h: number): boolean {
  return h >= 180 && h < 300
}

/**
 * The wallpaper for a trip: the accent itself, its warmer neighbour, and two
 * companions from the other side of the wheel (sky and lilac beside a warm
 * accent, peach and rose beside a cool one), over a base leaning to the
 * first companion. All of it inside the theme's luminance band.
 */
export function wallPalette(accentHex: string, dark: boolean): WallPalette {
  const h = hueOf(hexToLinear(accentHex))
  const [c1, c2] = isCoolHue(h) ? WARM : COOL
  const raw = dark
    ? {
        base: hsl(c1, 0.45, 0.05),
        fields: [hsl(h, 0.85, 0.38), hsl(h - 28, 0.8, 0.32), hsl(c1, 0.8, 0.34), hsl(c2, 0.7, 0.34)],
      }
    : {
        base: hsl(c1, 0.4, 0.95),
        fields: [hsl(h, 0.95, 0.8), hsl(h - 28, 0.9, 0.84), hsl(c1, 0.9, 0.84), hsl(c2, 0.85, 0.86)],
      }
  return { base: inBand(raw.base, dark), fields: raw.fields.map((c) => inBand(c, dark)) }
}

/**
 * The least opacity a tint needs over `backdrop` for `text` to reach
 * `target`, blending in linear light (what the compositor does to a blurred
 * backdrop, near enough). 1 when even a solid tint falls short.
 */
export function tintFloor(text: Linear, tint: Linear, backdrop: Linear, target = 4.5): number {
  const lt = luminance(text)
  const lTint = luminance(tint)
  const lb = luminance(backdrop)
  const passes = (alpha: number) => contrast(lt, lTint * alpha + lb * (1 - alpha)) >= target
  if (passes(0)) return 0
  if (!passes(1)) return 1
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (passes(mid)) hi = mid
    else lo = mid
  }
  return hi
}

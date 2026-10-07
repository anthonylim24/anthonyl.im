/**
 * Procedural "hand-painted" field: bristle brush strokes of ultramarine
 * pigment on bone paper. Every stroke is drawn twice — once into the colour
 * canvas, once as a height ridge — and the height field is Sobel-filtered into
 * a tangent-space normal map. The hero uses the colour as the backdrop the
 * glass refracts, and the normals for impasto relief + the glass surface.
 * The colour canvas doubles as the static fallback when WebGL is unavailable.
 */

export const BONE = '#EDE8DF'
const PIGMENTS = ['#2433E0', '#1B27B8', '#3446F2', '#151E8F', '#4A5BFF']
const INK = '#0E1024'

/** Backdrop plane overscan past the frustum (room for parallax). */
export const BACKDROP_OVERSCAN = 1.14

/** 0 = portrait (droplet low and centred), 1 = landscape (droplet right of the headline). */
export function layoutBlend(aspect: number) {
  const t = Math.min(1, Math.max(0, (aspect - 0.75) / (1.3 - 0.75)))
  return t * t * (3 - 2 * t)
}

/** Where the droplet sits on the backdrop (0..1, y from top), so pigment gathers behind it. */
export function dropletFocus(aspect: number) {
  const t = layoutBlend(aspect)
  const sx = 0.5 + 0.24 * t
  const sy = 0.5 + 0.275 * (1 - t) - 0.01 * t
  return { x: 0.5 + (sx - 0.5) / BACKDROP_OVERSCAN, y: 0.5 + (sy - 0.5) / BACKDROP_OVERSCAN }
}

export type PaintedField = {
  color: HTMLCanvasElement
  normal: HTMLCanvasElement
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Pt = { x: number; y: number }

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  }
}

type Stroke = {
  pts: [Pt, Pt, Pt, Pt]
  width: number
  color: string
  alpha: number
  height: number
  dry: number
}

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a))})`
}

function polyline(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  if (pts.length < 2) return
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.stroke()
}

/**
 * One loaded brush pass: each bristle is a single continuous polyline whose
 * paint fades along the stroke, then breaks into dry-brush skips at the tail.
 */
function drawStroke(color: CanvasRenderingContext2D, height: CanvasRenderingContext2D, s: Stroke, rand: () => number) {
  const steps = 64
  const path: Pt[] = []
  for (let i = 0; i <= steps; i++) path.push(cubic(...s.pts, i / steps))
  const normals = path.map((_, i) => {
    const a = path[Math.max(0, i - 1)]
    const b = path[Math.min(steps, i + 1)]
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
  })
  const bristles = Math.max(8, Math.round(s.width / 3.2))
  for (const ctx of [color, height]) {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  for (let b = 0; b < bristles; b++) {
    const across = (b / (bristles - 1) - 0.5) * s.width
    const edge = 1 - Math.abs(across) / (s.width * 0.5)
    const jitter = (rand() - 0.5) * 1.6
    const load = (0.5 + rand() * 0.5) * (0.4 + 0.6 * edge)
    const lw = 1 + rand() * 2.6
    const pts = path.map((p, i) => {
      const t = i / steps
      const taper = Math.sin(Math.min(1, t * 1.25 + 0.1) * Math.PI) ** 0.4
      const off = across * taper + jitter
      return { x: p.x + normals[i].x * off, y: p.y + normals[i].y * off }
    })
    const cut = Math.floor((1 - s.dry * (0.25 + rand() * 0.6)) * steps)
    const first = pts[0]
    const last = pts[steps]

    const passes: [CanvasRenderingContext2D, string, number, number][] = [
      [color, s.color, s.alpha * load, lw],
      [height, '#FFFFFF', s.height * load, lw * 1.35],
    ]
    for (const [ctx, hex, a, w] of passes) {
      const g = ctx.createLinearGradient(first.x, first.y, last.x, last.y)
      g.addColorStop(0, rgba(hex, a))
      g.addColorStop(0.65, rgba(hex, a * 0.8))
      g.addColorStop(1, rgba(hex, a * 0.2))
      ctx.strokeStyle = g
      ctx.lineWidth = w
      polyline(ctx, pts.slice(0, cut + 1))
    }
    // Dry-brush: broken skips past the point the bristle ran out of paint.
    for (let i = cut; i < steps - 1; i += 2 + Math.floor(rand() * 4)) {
      if (rand() > 0.5) continue
      const seg = pts.slice(i, i + 2 + Math.floor(rand() * 3))
      for (const [ctx, hex, a, w] of passes) {
        ctx.strokeStyle = rgba(hex, a * 0.45)
        ctx.lineWidth = w * 0.8
        polyline(ctx, seg)
      }
    }
  }
}

/**
 * Paint a field at `width`×`height`. `focus` (0..1 canvas fractions) is where
 * the droplet sits: strokes orbit it like pigment swept around a glass, and
 * the headline column and nav band stay quiet.
 */
export function paintField(
  width: number,
  height: number,
  focus: { x: number; y: number } = { x: 0.68, y: 0.52 },
  seed = 11,
): PaintedField {
  const rand = mulberry32(seed)
  const colorCanvas = document.createElement('canvas')
  colorCanvas.width = width
  colorCanvas.height = height
  const heightCanvas = document.createElement('canvas')
  heightCanvas.width = width
  heightCanvas.height = height
  const c = colorCanvas.getContext('2d')!
  const h = heightCanvas.getContext('2d', { willReadFrequently: true })!

  c.fillStyle = BONE
  c.fillRect(0, 0, width, height)
  h.fillStyle = '#000'
  h.fillRect(0, 0, width, height)

  const unit = Math.min(width, height)
  const cx = focus.x * width
  const cy = focus.y * height
  const landscape = width > height * 1.1

  // Paper tooth — faint fibres in both canvases.
  for (let i = 0; i < (width * height) / 700; i++) {
    const x = rand() * width
    const y = rand() * height
    const l = 2 + rand() * 8
    const ang = rand() * Math.PI
    c.strokeStyle = rand() > 0.5 ? 'rgba(170, 160, 142, 0.05)' : 'rgba(255, 255, 255, 0.07)'
    c.lineWidth = 0.7
    c.beginPath()
    c.moveTo(x, y)
    c.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l)
    c.stroke()
    h.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    h.beginPath()
    h.moveTo(x, y)
    h.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l)
    h.stroke()
  }

  /** An arc around the droplet: radius r, from angle a0 sweeping by span. */
  const orbit = (r: number, a0: number, span: number, squash: number): Stroke['pts'] => {
    const at = (a: number, rr: number) => ({ x: cx + Math.cos(a) * rr * 1.18, y: cy + Math.sin(a) * rr * squash })
    const wob = () => 1 + (rand() - 0.5) * 0.16
    return [at(a0, r), at(a0 + span / 3, r * wob()), at(a0 + (2 * span) / 3, r * wob()), at(a0 + span, r * (0.9 + rand() * 0.2))]
  }

  const strokes: Stroke[] = []
  // Glazes: wide, quiet sweeps that set the colour field around the glass.
  for (let i = 0; i < 4; i++) {
    strokes.push({
      pts: orbit(unit * (0.3 + rand() * 0.16), -2.6 + i * 1.4 + rand() * 0.4, 1.5 + rand() * 0.6, 0.86),
      width: unit * (0.12 + rand() * 0.06),
      color: PIGMENTS[i % PIGMENTS.length],
      alpha: 0.13 + rand() * 0.06,
      height: 0.16,
      dry: 0.35,
    })
  }
  // Gestures: confident orbiting strokes, all turning the same way.
  for (let i = 0; i < 9; i++) {
    strokes.push({
      pts: orbit(unit * (0.27 + rand() * 0.24), rand() * Math.PI * 2, 0.7 + rand() * 0.9, 0.82 + rand() * 0.14),
      width: unit * (0.022 + rand() * 0.036),
      color: PIGMENTS[Math.floor(rand() * PIGMENTS.length)],
      alpha: 0.6 + rand() * 0.35,
      height: 0.6 + rand() * 0.3,
      dry: 0.25 + rand() * 0.5,
    })
  }
  // Two sweeps cut straight behind the glass so the droplet has something
  // to bend; an empty field behind transmission reads as frosted plastic.
  for (let i = 0; i < 2; i++) {
    const dir = i === 0 ? 1 : -1
    const span = unit * (0.62 + rand() * 0.12)
    const tilt = -0.35 + i * 0.75 + (rand() - 0.5) * 0.2
    const dx = Math.cos(tilt) * span * 0.5
    const dy = Math.sin(tilt) * span * 0.5
    const bow = unit * (0.07 + rand() * 0.05) * dir
    strokes.push({
      pts: [
        { x: cx - dx, y: cy - dy + unit * 0.04 * dir },
        { x: cx - dx * 0.35 - dy * 0.3, y: cy - dy * 0.35 + bow },
        { x: cx + dx * 0.35 - dy * 0.3, y: cy + dy * 0.35 - bow },
        { x: cx + dx, y: cy + dy - unit * 0.03 * dir },
      ],
      width: unit * (0.05 + rand() * 0.03),
      color: PIGMENTS[i === 0 ? 0 : 3],
      alpha: 0.85,
      height: 0.8,
      dry: 0.3,
    })
  }
  // Ink: three thin calligraphic arcs for depth.
  for (let i = 0; i < 3; i++) {
    strokes.push({
      pts: orbit(unit * (0.34 + rand() * 0.2), rand() * Math.PI * 2, 0.5 + rand() * 0.5, 0.9),
      width: unit * (0.006 + rand() * 0.006),
      color: INK,
      alpha: 0.75,
      height: 0.9,
      dry: 0.4,
    })
  }

  for (const s of strokes) drawStroke(c, h, s, rand)

  // Quiet zones: the nav band, and the headline column on landscape screens.
  const top = c.createLinearGradient(0, 0, 0, height * 0.24)
  top.addColorStop(0, rgba(BONE, 0.96))
  top.addColorStop(0.45, rgba(BONE, 0.8))
  top.addColorStop(1, rgba(BONE, 0))
  c.fillStyle = top
  c.fillRect(0, 0, width, height * 0.24)
  if (landscape) {
    const left = c.createLinearGradient(0, 0, cx - unit * 0.24, 0)
    left.addColorStop(0, rgba(BONE, 0.95))
    left.addColorStop(0.7, rgba(BONE, 0.86))
    left.addColorStop(1, rgba(BONE, 0))
    c.fillStyle = left
    c.fillRect(0, 0, cx, height)
  }

  return { color: colorCanvas, normal: heightToNormal(heightCanvas, 2.4) }
}

/** Sobel the height canvas into an RGB tangent-space normal map. */
function heightToNormal(source: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const { width, height } = source
  // Soften bristle aliasing so normals read as paint, not pixels.
  const blurred = document.createElement('canvas')
  blurred.width = width
  blurred.height = height
  const b = blurred.getContext('2d', { willReadFrequently: true })!
  b.filter = 'blur(1.2px)'
  b.drawImage(source, 0, 0)
  const src = b.getImageData(0, 0, width, height).data

  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const o = out.getContext('2d')!
  const img = o.createImageData(width, height)
  const dst = img.data
  const hAt = (x: number, y: number) => {
    const xi = x < 0 ? 0 : x >= width ? width - 1 : x
    const yi = y < 0 ? 0 : y >= height ? height - 1 : y
    return src[(yi * width + xi) * 4] / 255
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tl = hAt(x - 1, y - 1)
      const t = hAt(x, y - 1)
      const tr = hAt(x + 1, y - 1)
      const l = hAt(x - 1, y)
      const r = hAt(x + 1, y)
      const bl = hAt(x - 1, y + 1)
      const bm = hAt(x, y + 1)
      const br = hAt(x + 1, y + 1)
      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength
      const dy = (bl + 2 * bm + br - (tl + 2 * t + tr)) * strength
      const inv = 1 / Math.hypot(dx, dy, 1)
      const i = (y * width + x) * 4
      dst[i] = (-dx * inv * 0.5 + 0.5) * 255
      dst[i + 1] = (dy * inv * 0.5 + 0.5) * 255
      dst[i + 2] = (inv * 0.5 + 0.5) * 255
      dst[i + 3] = 255
    }
  }
  o.putImageData(img, 0, 0)
  return out
}

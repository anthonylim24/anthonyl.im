/**
 * The nine sky engravings as two masks each, from one ink-on-white concept:
 *
 * - `ink`: the lines (light theme). Framed the same way for every sky (the drawing's bounds,
 *   squared, with an even margin) and levelled so thin strokes still read at 6rem.
 * - `print`: the same engraving as a positive for dark paper. The drawing's bodies (the cloud,
 *   the sun's disc) are filled and their lines cut out of the fill, so the cloud reads as a
 *   pale print with dark lines rather than a negative. Strokes outside a body (rain, rays,
 *   snowflakes) stay as lines.
 *
 * Pure pixel work on single-channel buffers; `render.ts` decodes and encodes with ffmpeg.
 */

export const WORK = 512

/** Ink coverage from a grey pixel: paper (and the faint paper grain) is clear. */
const coverage = (grey: number) => Math.max(0, Math.min(255, (255 - grey) * 1.12 - 18))

/** Bounds of the drawing: rows and columns with a few inked pixels, so specks don't count. */
function bounds(alpha: Uint8Array, size: number) {
  const rows = new Uint32Array(size)
  const cols = new Uint32Array(size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (alpha[y * size + x]! > 40) {
        rows[y]!++
        cols[x]!++
      }
  const first = (counts: Uint32Array) => counts.findIndex((n) => n >= 3)
  const last = (counts: Uint32Array) => counts.length - 1 - [...counts].reverse().findIndex((n) => n >= 3)
  return { x0: first(cols), x1: last(cols), y0: first(rows), y1: last(rows) }
}

/** The drawing squared with `margin` on its long side, box-filtered down to WORK px. */
export function frame(grey: Uint8Array, size: number, margin = 0.04): Float32Array {
  const alpha = Uint8Array.from(grey, coverage)
  const { x0, x1, y0, y1 } = bounds(alpha, size)
  const side = Math.max(x1 - x0, y1 - y0) / (1 - 2 * margin)
  const left = (x0 + x1) / 2 - side / 2
  const top = (y0 + y1) / 2 - side / 2
  const step = side / WORK
  const out = new Float32Array(WORK * WORK)
  for (let oy = 0; oy < WORK; oy++) {
    const sy0 = Math.floor(top + oy * step)
    const sy1 = Math.max(sy0 + 1, Math.floor(top + (oy + 1) * step))
    for (let ox = 0; ox < WORK; ox++) {
      const sx0 = Math.floor(left + ox * step)
      const sx1 = Math.max(sx0 + 1, Math.floor(left + (ox + 1) * step))
      let sum = 0
      let n = 0
      for (let sy = sy0; sy < sy1; sy++)
        for (let sx = sx0; sx < sx1; sx++) {
          n++
          if (sx >= 0 && sy >= 0 && sx < size && sy < size) sum += alpha[sy * size + sx]!
        }
      out[oy * WORK + ox] = sum / n / 255
    }
  }
  return out
}

/** Mean ink over the drawn pixels: how dark the strokes read, whatever the drawing's size. */
function strokeTone(ink: Float32Array): number {
  let sum = 0
  let n = 0
  for (const a of ink)
    if (a > 0.04) {
      sum += a
      n++
    }
  return n === 0 ? 0 : sum / n
}

/**
 * Levels: the gamma that brings the strokes to `tone`, so a pale fog and a dense
 * thunderhead read at the same weight side by side. `weight` thickens strokes first.
 */
export function level(ink: Float32Array, tone = 0.5, weight = 0): Float32Array {
  const heavy = weight > 0 ? spread(ink, 1) : ink
  const base = ink.map((a, i) => Math.max(a, heavy[i]! * weight))
  let [lo, hi] = [0.3, 1.4]
  for (let step = 0; step < 24; step++) {
    const gamma = (lo + hi) / 2
    if (strokeTone(base.map((a) => Math.pow(a, gamma))) > tone) lo = gamma
    else hi = gamma
  }
  const gamma = (lo + hi) / 2
  return base.map((a) => Math.pow(a, gamma))
}

/** Grey dilation (max over a square of radius r), separable. */
function spread(src: Float32Array, r: number): Float32Array {
  const pass = (from: Float32Array, dx: number, dy: number) => {
    const to = new Float32Array(from.length)
    for (let y = 0; y < WORK; y++)
      for (let x = 0; x < WORK; x++) {
        let m = 0
        for (let k = -r; k <= r; k++) {
          const sx = x + k * dx
          const sy = y + k * dy
          if (sx >= 0 && sy >= 0 && sx < WORK && sy < WORK) m = Math.max(m, from[sy * WORK + sx]!)
        }
        to[y * WORK + x] = m
      }
    return to
  }
  return pass(pass(src, 1, 0), 0, 1)
}

/** Binary min or max over a square of radius r, separable. */
function morph(src: Uint8Array, r: number, grow: boolean): Uint8Array {
  const pass = (from: Uint8Array, dx: number, dy: number) => {
    const to = new Uint8Array(from.length)
    for (let y = 0; y < WORK; y++)
      for (let x = 0; x < WORK; x++) {
        let hit = grow ? 0 : 1
        for (let k = -r; k <= r; k++) {
          const sx = x + k * dx
          const sy = y + k * dy
          const v = sx >= 0 && sy >= 0 && sx < WORK && sy < WORK ? from[sy * WORK + sx]! : 0
          hit = grow ? hit | v : hit & v
        }
        to[y * WORK + x] = hit
      }
    return to
  }
  return pass(pass(src, 1, 0), 0, 1)
}

/** Pixels reachable from the edge without crossing `wall`, 4-connected. */
function outside(wall: Uint8Array): Uint8Array {
  const seen = new Uint8Array(wall.length)
  const queue: number[] = []
  const push = (i: number) => {
    if (!seen[i] && !wall[i]) {
      seen[i] = 1
      queue.push(i)
    }
  }
  for (let i = 0; i < WORK; i++) {
    push(i)
    push((WORK - 1) * WORK + i)
    push(i * WORK)
    push(i * WORK + WORK - 1)
  }
  while (queue.length > 0) {
    const i = queue.pop()!
    const x = i % WORK
    if (x > 0) push(i - 1)
    if (x < WORK - 1) push(i + 1)
    if (i >= WORK) push(i - WORK)
    if (i < WORK * (WORK - 1)) push(i + WORK)
  }
  return seen
}

/** Keeps the connected regions of at least `min` pixels. */
function largeRegions(mask: Uint8Array, min: number): Uint8Array {
  const label = new Int32Array(mask.length).fill(-1)
  const keep = new Uint8Array(mask.length)
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] !== -1) continue
    const region: number[] = [start]
    label[start] = start
    for (let k = 0; k < region.length; k++) {
      const i = region[k]!
      const x = i % WORK
      for (const j of [x > 0 ? i - 1 : -1, x < WORK - 1 ? i + 1 : -1, i - WORK, i + WORK])
        if (j >= 0 && j < mask.length && mask[j] && label[j] === -1) {
          label[j] = start
          region.push(j)
        }
    }
    if (region.length >= min) for (const i of region) keep[i] = 1
  }
  return keep
}

/**
 * The drawing's bodies: close the outline (dilate), fill everything the edge can't reach,
 * open it back (erode), drop the small pieces (flakes, drops), soften the edge by a pixel.
 */
export function body(ink: Float32Array, close = 7): Float32Array {
  const lines = Uint8Array.from(ink, (a) => (a > 0.2 ? 1 : 0))
  const shut = morph(lines, close, true)
  const out = outside(shut)
  const filled = morph(
    Uint8Array.from(out, (o) => 1 - o),
    close,
    false,
  )
  const kept = largeRegions(filled, Math.round(WORK * WORK * 0.012))
  const soft = new Float32Array(kept.length)
  for (let y = 0; y < WORK; y++)
    for (let x = 0; x < WORK; x++) {
      let sum = 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const sx = Math.min(WORK - 1, Math.max(0, x + dx))
          const sy = Math.min(WORK - 1, Math.max(0, y + dy))
          sum += kept[sy * WORK + sx]!
        }
      soft[y * WORK + x] = sum / 9
    }
  return soft
}

/** Inside a body the paper is the fill and the lines are cut out; outside, the lines are the fill. */
export function print(ink: Float32Array, bodies: Float32Array): Float32Array {
  return ink.map((a, i) => bodies[i]! * (1 - a) + (1 - bodies[i]!) * a)
}

/** A [0, 1] mask as black RGBA with that alpha, for ffmpeg's rawvideo reader. */
export function rgba(mask: Float32Array): Uint8Array {
  const out = new Uint8Array(mask.length * 4)
  for (let i = 0; i < mask.length; i++) out[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, mask[i]!)) * 255)
  return out
}

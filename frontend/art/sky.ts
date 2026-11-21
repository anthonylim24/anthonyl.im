/**
 * The nine sky engravings as one alpha mask each, from one ink-on-white concept:
 * framed the same way for every sky (the drawing's bounds, squared, with an even
 * margin) and levelled so thin strokes still read at 6rem. The page fills the mask
 * with its secondary ink, so the same lines serve light and dark paper.
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
  // Stretch first so the darkest strokes reach full ink (the concepts' black is a soft grey).
  const drawn = [...ink].filter((a) => a > 0.04).sort((x, y) => x - y)
  const top = drawn[Math.floor(drawn.length * 0.995)] ?? 1
  const base = ink.map((a, i) => Math.min(1, Math.max(a, heavy[i]! * weight) / top))
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

/** A [0, 1] mask as black RGBA with that alpha, for ffmpeg's rawvideo reader. */
export function rgba(mask: Float32Array): Uint8Array {
  const out = new Uint8Array(mask.length * 4)
  for (let i = 0; i < mask.length; i++) out[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, mask[i]!)) * 255)
  return out
}

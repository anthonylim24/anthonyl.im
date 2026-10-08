/**
 * Paint fields baked once on the CPU, so the bloom shaders sample textures
 * instead of evaluating octaves of 3D noise per pixel (the old cost that kept
 * the bloom from running at full resolution).
 *
 *  - noise: tileable RGBA fbm. R/G are cauliflower-scale fields at two
 *    frequencies, B is fine paper tooth / granulation, A a very low wash field.
 *  - splatter: flicked droplets, streaks and tadpoles around the bloom, painted
 *    with tide-line rims. R is the mass pigment, G the glaze.
 */
import * as THREE from 'three/webgpu'

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hash = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Tileable value noise on a `period`-cell lattice, sampled at u,v in [0,1). */
function valueNoise(u: number, v: number, period: number, seed: number) {
  const x = u * period
  const y = v * period
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const x0 = ix % period
  const y0 = iy % period
  const x1 = (ix + 1) % period
  const y1 = (iy + 1) % period
  const a = hash(x0, y0, seed)
  const b = hash(x1, y0, seed)
  const c = hash(x0, y1, seed)
  const d = hash(x1, y1, seed)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

function fbm(u: number, v: number, period: number, octaves: number, seed: number) {
  let sum = 0
  let amp = 0.5
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(u, v, period << o, seed + o * 17) * amp
    norm += amp
    amp *= 0.5
  }
  return sum / norm
}

export function noiseTexture(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4)
  // fbm of value noise bunches around 0.5; stretch it back to the full range.
  const stretch = (n: number) => Math.max(0, Math.min(255, Math.round(((n - 0.5) * 1.9 + 0.5) * 255)))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const i = (y * size + x) * 4
      data[i] = stretch(fbm(u, v, 4, 5, 11))
      data[i + 1] = stretch(fbm(u, v, 8, 4, 29))
      data[i + 2] = Math.round(fbm(u, v, 64, 2, 47) * 255)
      data[i + 3] = stretch(fbm(u, v, 2, 4, 83))
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  return tex
}

/**
 * The splatter sheet covers ±EXTENT bloom radii around the bloom centre.
 * Nothing is painted inside the body (r < 1).
 */
export const SPLATTER_EXTENT = 2.6

export function splatterTexture(size = 1024, seed = 7): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)
  ctx.globalCompositeOperation = 'lighter'
  const rand = rng(seed)
  const half = size / 2
  const unit = half / SPLATTER_EXTENT // pixels per bloom radius
  const paint = (glaze: boolean, a: number) => (glaze ? `rgba(0,255,0,${a})` : `rgba(255,0,0,${a})`)
  const at = (angle: number, d: number): [number, number] => [half + Math.cos(angle) * d * unit, half + Math.sin(angle) * d * unit]

  /** A droplet: an even wash with a slightly darker drying rim. */
  const drop = (x: number, y: number, r: number, strength: number, glaze: boolean) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, paint(glaze, 0.62 * strength))
    g.addColorStop(0.8, paint(glaze, 0.66 * strength))
    g.addColorStop(0.94, paint(glaze, 0.85 * strength))
    g.addColorStop(1, paint(glaze, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Flicked droplets: a few near the body, then fine mist further out.
  for (let k = 0; k < 70; k++) {
    const a = rand() * Math.PI * 2
    const d = 1.1 + Math.pow(rand(), 1.5) * (SPLATTER_EXTENT - 1.25)
    const near = 1 - (d - 1.1) / (SPLATTER_EXTENT - 1.25)
    const r = unit * (0.008 + Math.pow(rand(), 3) * 0.075 * (0.3 + near))
    drop(...at(a, d), r, 0.6 + rand() * 0.4, rand() < 0.4)
  }

  // Flicks: one tapered stroke thrown outward, pooling into a bead at the tip.
  for (let k = 0; k < 9; k++) {
    const a = rand() * Math.PI * 2
    const bend = (rand() - 0.5) * 0.12
    const d0 = 1.04 + rand() * 0.16
    const len = 0.18 + rand() * 0.38
    const w = unit * (0.03 + rand() * 0.03)
    const glaze = rand() < 0.35
    const steps = 24
    const left: [number, number][] = []
    const right: [number, number][] = []
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const ang = a + bend * t * t
      const [x, y] = at(ang, d0 + len * t)
      const half = w * (1 - Math.pow(t, 0.7) * 0.82)
      left.push([x - Math.sin(ang) * half, y + Math.cos(ang) * half])
      right.push([x + Math.sin(ang) * half, y - Math.cos(ang) * half])
    }
    ctx.fillStyle = paint(glaze, 0.5)
    ctx.beginPath()
    ctx.moveTo(...left[0])
    for (const pt of left) ctx.lineTo(...pt)
    for (const pt of right.reverse()) ctx.lineTo(...pt)
    ctx.closePath()
    ctx.fill()
    drop(...at(a + bend, d0 + len + 0.02), w * (1.4 + rand() * 0.8), 0.9, glaze)
  }

  // A couple of satellite splats hugging the body, each with a few beads.
  for (let k = 0; k < 3; k++) {
    const a = rand() * Math.PI * 2
    const [x, y] = at(a, 1.15 + rand() * 0.25)
    const glaze = rand() < 0.5
    drop(x, y, unit * (0.06 + rand() * 0.05), 0.85, glaze)
    for (let b = 0; b < 4; b++) {
      const ba = a + (rand() - 0.5) * 1.2
      const bd = unit * (0.12 + rand() * 0.18)
      drop(x + Math.cos(ba) * bd, y + Math.sin(ba) * bd, unit * (0.01 + rand() * 0.018), 0.9, glaze)
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.NoColorSpace
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  return tex
}

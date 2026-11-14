/**
 * The landscape behind Lim's stage. A place lists a few kinds of scenery
 * (trees, a volcano, coral, …) and a horizon; this builds them as small
 * procedural models in the house style (soft toon ramp, ink line, candy
 * colours) and stands them on the ground beyond the stage.
 *
 * The world is a little diorama: past the horizon line the ground drops away,
 * so far things sink behind it and only their tops show. That drop, and where
 * everything stands, is worked out on the CPU whenever the camera framing
 * changes (`layout`). Everything that moves (the pop-up when a place arrives,
 * wind, drifting clouds, swimming fish, rising smoke, lava, blinking windows)
 * moves in the shaders, so a frame costs two uniform writes.
 *
 * One InstancedMesh per kind (plus an ink hull for the near props). At most two
 * landscapes are alive at once: the one arriving and the one sinking away.
 */
import * as THREE from 'three/webgpu'
import {
  abs, attribute, cos, dot, float, floor, fract, length, max, mix, normalLocal, normalView, normalize, positionLocal, positionView,
  positionViewDirection, positionWorld, pow, saturate, sin, smoothstep, step, uniform, uv, vec2, vec3,
} from 'three/tsl'
import type { PlaceSpec, Scenery, Shape } from '../world/spec'
import type { PlaceUniforms } from './env'
import { shapeMesh } from './items'
import { LIGHT, col, inkOf, type F, type LimUniforms, type V2, type V3 } from './limLook'

export type SceneryView = {
  /** z where the floor meets the horizon line (negative). */
  groundZ: number
  /** How fast the horizon line falls with distance beyond it (tan of its angle). */
  slope: number
  /** Visible half-width at z = 0. */
  halfW: number
  /** Camera distance from the stage. */
  dist: number
  wide: boolean
}

type P3 = [number, number, number]

/* ── Colour ──────────────────────────────────────────────────────── */

const cA = new THREE.Color()
const cB = new THREE.Color()
const blend = (a: string, b: string, k: number) => `#${cA.set(a).lerp(cB.set(b), k).getHexString()}`
/** The shadow side of a colour: darker, a touch cooler and richer. */
const shadeHex = (hex: string) => {
  const hsl = { h: 0, s: 0, l: 0 }
  cA.set(hex).getHSL(hsl)
  return `#${cA.setHSL((hsl.h + 0.97) % 1, Math.min(1, hsl.s * 1.1 + 0.05), hsl.l * 0.66).getHexString()}`
}
const CANDY = ['#FF9FC5', '#FFD978', '#C7B6FF', '#9FD3FF', '#FF8B6E', '#9EE6C8']

/* ── Models ──────────────────────────────────────────────────────── */

type PartOpts = {
  /** Euler turn (x, y, z), radians. */
  rot?: P3
  /** How much of the part is lit from inside. */
  glow?: number | ((x: number, y: number, z: number) => number)
  /** 1 = flowing lava, 2 = a grid of windows. */
  fx?: 0 | 1 | 2
  /** Wind sway, growing with height; `flat` sways the whole part alike. */
  sway?: number
  flat?: boolean
  /** Takes the instance's own colour. */
  tint?: boolean
  detail?: number
  /** Colour by vertex instead of the part's one colour. */
  paint?: (x: number, y: number, z: number) => string | null
}

const euler = new THREE.Euler()
const quat = new THREE.Quaternion()
const v3 = new THREE.Vector3()

/** Primitive shapes merged into one mesh, each vertex carrying its colours and effects. */
class Model {
  private readonly pos: number[] = []
  private readonly base: number[] = []
  private readonly tone: number[] = []
  private readonly fx: number[] = []
  private readonly idx: number[] = []

  add(shape: Shape, hex: string, scale: P3, at: P3 = [0, 0, 0], o: PartOpts = {}): this {
    const m = shapeMesh(shape, o.detail ?? 1)
    const first = this.pos.length / 3
    quat.setFromEuler(euler.set(...(o.rot ?? [0, 0, 0])))
    const shade = shadeHex(hex)
    for (let i = 0; i < m.positions.length; i += 3) {
      v3.set(m.positions[i] * scale[0], m.positions[i + 1] * scale[1], m.positions[i + 2] * scale[2]).applyQuaternion(quat)
      const x = v3.x + at[0]
      const y = v3.y + at[1]
      const z = v3.z + at[2]
      this.pos.push(x, y, z)
      const own = o.paint?.(x, y, z)
      cA.set(own ?? hex)
      this.base.push(cA.r, cA.g, cA.b)
      cA.set(own ? shadeHex(own) : shade)
      this.tone.push(cA.r, cA.g, cA.b)
      const glow = typeof o.glow === 'function' ? o.glow(x, y, z) : (o.glow ?? 0)
      const sway = (o.sway ?? 0) * (o.flat ? 1 : Math.max(0, y) ** 2)
      this.fx.push(glow, sway, o.fx ?? 0, o.tint ? 1 : 0)
    }
    for (let i = 0; i < m.index.length; i++) this.idx.push(first + m.index[i])
    return this
  }

  /** A custom grid surface: `at(u, v)` gives a point and its colour (and glow). */
  sheet(nu: number, nv: number, at: (u: number, v: number) => { p: P3; hex: string; glow?: number; fx?: 0 | 1 | 2 }): this {
    const first = this.pos.length / 3
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const s = at(i / nu, j / nv)
        this.pos.push(...s.p)
        cA.set(s.hex)
        this.base.push(cA.r, cA.g, cA.b)
        cA.set(shadeHex(s.hex))
        this.tone.push(cA.r, cA.g, cA.b)
        this.fx.push(s.glow ?? 0, 0, s.fx ?? 0, 0)
      }
    }
    const row = nu + 1
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = first + j * row + i
        this.idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1)
      }
    }
    return this
  }

  get triangles() {
    return this.idx.length / 3
  }

  geometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    paintAttributes(geo, this.base, this.tone, this.fx)
    geo.setIndex(this.idx)
    geo.computeVertexNormals()
    return geo
  }
}

/**
 * Colour, shade and effects per vertex, in one buffer. WebGPU allows eight
 * vertex buffers a draw and position, normal and the instance matrix take
 * three, so these share one (and the per-instance values another).
 */
function paintAttributes(geo: THREE.BufferGeometry, base: ArrayLike<number>, tone: ArrayLike<number>, fx: ArrayLike<number>) {
  const n = base.length / 3
  const data = new Float32Array(n * 10)
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      data[i * 10 + k] = base[i * 3 + k]
      data[i * 10 + 3 + k] = tone[i * 3 + k]
    }
    for (let k = 0; k < 4; k++) data[i * 10 + 6 + k] = fx[i * 4 + k]
  }
  const buffer = new THREE.InterleavedBuffer(data, 10)
  geo.setAttribute('aCol', new THREE.InterleavedBufferAttribute(buffer, 3, 0))
  geo.setAttribute('aTone', new THREE.InterleavedBufferAttribute(buffer, 3, 3))
  geo.setAttribute('aFx', new THREE.InterleavedBufferAttribute(buffer, 4, 6))
}

/** Floats per instance: foot + delay, motion, phase, tint. */
const INST = 12

/** A flat card for the see-through pieces (mist, beams, glows): same attributes, no shading. */
function card(taper = 1): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  // Base on the origin, one unit tall; `taper` narrows the bottom edge.
  const w = 0.5
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-w * taper, 0, 0, w * taper, 0, 0, -w, 1, 0, w, 1, 0], 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3))
  paintAttributes(geo, new Array<number>(12).fill(1), new Array<number>(12).fill(1), new Array<number>(16).fill(0))
  geo.setIndex([0, 1, 2, 2, 1, 3])
  return geo
}

type Palette = {
  leaf: string
  pine: string
  trunk: string
  rock: string
  snow: string
  cloud: string
  ground: string
  cold: boolean
  hot: boolean
  dark: boolean
  spec: PlaceSpec
}

function paletteOf(spec: PlaceSpec): Palette {
  const dark = spec.dark
  return {
    leaf: blend(spec.horizonColor, dark ? '#3E7A66' : '#6CCB8E', 0.55),
    pine: blend(dark ? '#2F6B5E' : '#3F9D7C', spec.horizonColor, 0.25),
    trunk: dark ? '#4A3348' : '#9A6B4E',
    rock: blend(spec.floor, dark ? '#4B4468' : '#8E86A8', 0.6),
    snow: '#F7FAFF',
    cloud: spec.mood === 'hot' && dark ? '#6B5560' : blend('#FFFFFF', spec.sky[0], dark ? 0.5 : 0.06),
    ground: spec.floor,
    cold: spec.mood === 'cold',
    hot: spec.mood === 'hot',
    dark,
    spec,
  }
}

const MODELS: Record<Exclude<Scenery, 'mist' | 'spotlights'>, (pal: Palette) => Model> = {
  clouds: (pal) =>
    new Model()
      .add('ball', pal.cloud, [0.5, 0.3, 0.3], [0, 0.3, 0], { detail: 2 })
      .add('ball', pal.cloud, [0.34, 0.24, 0.26], [-0.46, 0.25, 0], { detail: 2 })
      .add('ball', pal.cloud, [0.4, 0.27, 0.27], [0.46, 0.27, 0], { detail: 2 })
      .add('ball', pal.cloud, [0.3, 0.24, 0.24], [0.16, 0.5, 0], { detail: 2 })
      .add('ball', pal.cloud, [0.25, 0.2, 0.2], [-0.2, 0.47, 0], { detail: 2 }),
  trees: (pal) =>
    new Model()
      .add('cylinder', pal.trunk, [0.065, 0.26, 0.065], [0, 0.26, 0])
      .add('ball', pal.leaf, [0.33, 0.31, 0.31], [0, 0.69, 0], { detail: 2, sway: 0.1 })
      .add('ball', pal.leaf, [0.22, 0.2, 0.22], [-0.22, 0.52, 0.06], { detail: 2, sway: 0.1 })
      .add('ball', blend(pal.leaf, '#FFFFFF', 0.12), [0.2, 0.19, 0.2], [0.21, 0.56, -0.02], { detail: 2, sway: 0.1 }),
  pines: (pal) => {
    const m = new Model().add('cylinder', pal.trunk, [0.05, 0.14, 0.05], [0, 0.14, 0])
    const tiers: [number, number, number][] = [[0.33, 0.25, 0.42], [0.26, 0.23, 0.63], [0.18, 0.2, 0.82]]
    for (const [r, hgt, y] of tiers) {
      m.add('cone', pal.pine, [r, hgt, r], [0, y, 0], { sway: 0.05 })
      // Snow sits on every tier where it is cold.
      if (pal.cold) m.add('cone', pal.snow, [r * 0.7, hgt * 0.62, r * 0.7], [0, y + hgt * 0.42, 0], { sway: 0.05 })
    }
    return m
  },
  palms: (pal) => {
    const m = new Model()
    for (let i = 0; i < 5; i++) {
      m.add('cylinder', blend(pal.trunk, '#E2B98A', 0.35), [0.05 - i * 0.004, 0.1, 0.05 - i * 0.004], [0.012 * i * i, 0.09 + i * 0.165, 0], {
        rot: [0, 0, -0.07 * i], sway: 0.05,
      })
    }
    const top: P3 = [0.21, 0.86, 0]
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2
      m.add('bean', k % 2 ? pal.leaf : blend(pal.leaf, '#FFFFFF', 0.14), [0.3, 0.1, 0.09], [top[0] + Math.cos(a) * 0.23, top[1] + 0.02, top[2] + Math.sin(a) * 0.23], {
        rot: [0, -a, -0.45], sway: 0.11,
      })
    }
    return m
      .add('ball', '#8A5A3C', [0.055, 0.055, 0.055], [top[0] - 0.05, top[1] - 0.06, 0.06])
      .add('ball', '#8A5A3C', [0.055, 0.055, 0.055], [top[0] + 0.06, top[1] - 0.07, 0.03])
  },
  rocks: (pal) =>
    new Model()
      .add('box', pal.rock, [0.58, 0.4, 0.46], [0, 0.34, 0], { rot: [0, 0.4, 0.08], detail: 2 })
      .add('box', blend(pal.rock, '#FFFFFF', 0.1), [0.33, 0.26, 0.3], [0.52, 0.2, 0.12], { rot: [0, -0.5, -0.1] })
      .add('box', pal.rock, [0.22, 0.17, 0.2], [-0.5, 0.13, 0.2], { rot: [0, 0.9, 0.1] }),
  flowers: () => {
    const m = new Model().add('cylinder', '#6CC08B', [0.022, 0.3, 0.022], [0, 0.3, 0], { sway: 0.5 })
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3
      m.add('ball', '#FFFFFF', [0.13, 0.13, 0.05], [Math.cos(a) * 0.15, 0.68 + Math.sin(a) * 0.15, 0], { tint: true, sway: 0.5 })
    }
    return m.add('ball', '#FFD25E', [0.1, 0.1, 0.07], [0, 0.68, 0.03], { sway: 0.5 })
  },
  mushrooms: () =>
    new Model()
      .add('cylinder', '#FFF3DC', [0.15, 0.3, 0.15], [0, 0.3, 0])
      .add('ball', '#FFFFFF', [0.5, 0.3, 0.5], [0, 0.66, 0], { detail: 2, tint: true })
      .add('ball', '#FFF8F2', [0.1, 0.06, 0.1], [0.05, 0.94, 0.12])
      .add('ball', '#FFF8F2', [0.08, 0.06, 0.06], [-0.26, 0.76, 0.3])
      .add('ball', '#FFF8F2', [0.08, 0.06, 0.06], [0.3, 0.74, 0.28])
      .add('ball', '#FFF8F2', [0.07, 0.05, 0.05], [0.02, 0.7, 0.44]),
  cacti: () =>
    new Model()
      .add('cylinder', '#6CC08B', [0.15, 0.48, 0.15], [0, 0.48, 0], { detail: 2 })
      .add('cylinder', '#6CC08B', [0.075, 0.07, 0.075], [-0.22, 0.44, 0], { rot: [0, 0, Math.PI / 2] })
      .add('cylinder', '#6CC08B', [0.075, 0.15, 0.075], [-0.31, 0.56, 0])
      .add('cylinder', '#6CC08B', [0.075, 0.07, 0.075], [0.22, 0.6, 0], { rot: [0, 0, Math.PI / 2] })
      .add('cylinder', '#6CC08B', [0.075, 0.13, 0.075], [0.31, 0.7, 0])
      .add('ball', '#FF9FC5', [0.07, 0.06, 0.07], [0, 0.98, 0]),
  volcano: (pal) => {
    const stone = blend(pal.spec.horizonColor, '#5A3A40', 0.45)
    // Lava runs down the near slopes in a few streams that widen toward the rim.
    const lava = (x: number, y: number, z: number) => {
      if (y < 0.3 || z < -0.05) return 0
      const a = Math.atan2(z, x)
      const stream = Math.cos(a * 5 + 0.6 + Math.sin(y * 9) * 0.5)
      return stream > 0.86 - (y - 0.3) * 0.5 ? 1 : 0
    }
    return new Model()
      .add('cone', stone, [0.78, 0.5, 0.78], [0, 0.5, 0], { detail: 3, glow: lava, fx: 1 })
      .add('cylinder', blend(stone, '#000000', 0.2), [0.2, 0.045, 0.2], [0, 0.93, 0], { detail: 2 })
      .add('cylinder', '#FF9A3D', [0.165, 0.03, 0.165], [0, 0.965, 0], { glow: 1, fx: 1, detail: 2 })
  },
  coral: () =>
    new Model()
      .add('cylinder', '#FFFFFF', [0.09, 0.3, 0.09], [0, 0.3, 0], { tint: true })
      .add('cylinder', '#FFFFFF', [0.07, 0.24, 0.07], [-0.2, 0.6, 0], { rot: [0, 0, 0.6], tint: true })
      .add('cylinder', '#FFFFFF', [0.07, 0.26, 0.07], [0.2, 0.66, 0.02], { rot: [0, 0, -0.55], tint: true })
      .add('cylinder', '#FFFFFF', [0.055, 0.16, 0.055], [0.05, 0.82, -0.04], { rot: [0.3, 0, -0.1], tint: true })
      .add('ball', '#FFFFFF', [0.1, 0.1, 0.1], [-0.35, 0.82, 0], { tint: true })
      .add('ball', '#FFFFFF', [0.1, 0.1, 0.1], [0.35, 0.9, 0.02], { tint: true })
      .add('ball', '#FFFFFF', [0.08, 0.08, 0.08], [0.07, 0.98, -0.08], { tint: true }),
  seaweed: () =>
    new Model()
      .add('drop', '#5DBF9A', [0.085, 0.5, 0.04], [0, 0.5, 0], { sway: 0.3 })
      .add('drop', '#4FB08E', [0.07, 0.36, 0.04], [-0.14, 0.36, 0.03], { rot: [0, 0, 0.16], sway: 0.36 })
      .add('drop', '#79D2AE', [0.07, 0.42, 0.04], [0.14, 0.42, -0.03], { rot: [0, 0, -0.14], sway: 0.33 }),
  // Nose toward +x; the tail is the part the wind moves.
  fish: () =>
    new Model()
      .add('ball', '#FFFFFF', [0.5, 0.3, 0.17], [0, 0, 0], { detail: 2, tint: true })
      .add('cone', '#FFFFFF', [0.24, 0.2, 0.07], [-0.62, 0, 0], { rot: [0, 0, -Math.PI / 2], tint: true, sway: 0.18, flat: true })
      .add('cone', '#FFFFFF', [0.12, 0.1, 0.05], [-0.05, 0.3, 0], { tint: true })
      .add('ball', '#2B2140', [0.05, 0.05, 0.03], [0.28, 0.06, 0.15])
      .add('ball', '#2B2140', [0.05, 0.05, 0.03], [0.28, 0.06, -0.15]),
  craters: (pal) =>
    new Model()
      .add('ring', blend(pal.ground, '#FFFFFF', 0.12), [0.5, 0.5, 0.2], [0, 0.04, 0], { rot: [Math.PI / 2, 0, 0], detail: 2 })
      .add('cylinder', blend(pal.ground, '#000000', 0.22), [0.36, 0.012, 0.36], [0, 0.012, 0], { detail: 2 }),
  buildings: ({ spec }) =>
    new Model()
      .add('box', blend(spec.horizonColor, spec.sky[1], 0.3), [0.3, 0.5, 0.3], [0, 0.5, 0], { glow: 1, fx: 2 })
      .add('cylinder', blend(spec.horizonColor, spec.sky[1], 0.3), [0.02, 0.09, 0.02], [0.12, 1.07, 0])
      .add('ball', '#FF6F7D', [0.035, 0.035, 0.035], [0.12, 1.17, 0], { glow: 1 }),
  graves: (pal) =>
    new Model()
      .add('box', pal.rock, [0.3, 0.05, 0.15], [0, 0.05, 0])
      .add('box', blend(pal.rock, '#FFFFFF', 0.14), [0.22, 0.3, 0.085], [0, 0.38, 0], { detail: 2 })
      .add('cylinder', blend(pal.rock, '#FFFFFF', 0.14), [0.22, 0.085, 0.22], [0, 0.66, 0], { rot: [Math.PI / 2, 0, 0], detail: 2 }),
  deadtrees: (pal) => {
    const bark = blend(pal.trunk, '#1A1226', pal.dark ? 0.45 : 0.15)
    return new Model()
      .add('cone', bark, [0.1, 0.5, 0.1], [0, 0.5, 0], { sway: 0.03 })
      .add('cone', bark, [0.045, 0.26, 0.045], [-0.2, 0.62, 0], { rot: [0, 0, 0.85], sway: 0.05 })
      .add('cone', bark, [0.04, 0.22, 0.04], [0.19, 0.74, 0.02], { rot: [0, 0, -0.9], sway: 0.05 })
      .add('cone', bark, [0.03, 0.14, 0.03], [-0.34, 0.82, 0], { rot: [0, 0, 0.2], sway: 0.06 })
      .add('cone', bark, [0.03, 0.13, 0.03], [0.33, 0.9, 0.02], { rot: [0, 0, -0.25], sway: 0.06 })
  },
  snowmen: (pal) =>
    new Model()
      .add('ball', pal.snow, [0.34, 0.3, 0.34], [0, 0.28, 0], { detail: 2 })
      .add('ball', pal.snow, [0.25, 0.23, 0.25], [0, 0.7, 0], { detail: 2 })
      .add('ball', pal.snow, [0.18, 0.17, 0.18], [0, 1.02, 0], { detail: 2 })
      .add('ring', '#F0524F', [0.2, 0.2, 0.09], [0, 0.87, 0], { rot: [Math.PI / 2, 0, 0] })
      .add('cone', '#FF9A3D', [0.04, 0.1, 0.04], [0, 1.02, 0.24], { rot: [Math.PI / 2, 0, 0] })
      .add('ball', '#2B2140', [0.028, 0.028, 0.02], [-0.07, 1.08, 0.16])
      .add('ball', '#2B2140', [0.028, 0.028, 0.02], [0.07, 1.08, 0.16])
      .add('cylinder', '#4A2F5C', [0.14, 0.09, 0.14], [0, 1.25, 0])
      .add('cylinder', '#4A2F5C', [0.2, 0.015, 0.2], [0, 1.17, 0]),
}

/** A range of hills, dunes or mountains: a long strip whose near face rises to a crest. One unit tall. */
function ridgeModel(kind: 'hills' | 'dunes' | 'mountains', seed: number, hex: string, cap: string | null, lava: boolean): Model {
  const tri = (x: number) => Math.abs((((x % 1) + 1) % 1) - 0.5) * 2
  const a = seed * 1.7
  const b = seed * 3.1 + 1
  const height = (x: number) =>
    kind === 'hills' ? 0.55 + 0.27 * Math.sin(x * 0.21 + a) + 0.18 * Math.sin(x * 0.47 + b)
      : kind === 'dunes' ? 0.52 + 0.3 * Math.sin(x * 0.13 + a) + 0.18 * Math.sin(x * 0.31 + b)
        : 0.12 + 0.62 * tri(x * 0.047 + a) ** 1.25 + 0.26 * tri(x * 0.113 + b)
  return new Model().sheet(110, 5, (u, v) => {
    const x = (u - 0.5) * 90
    const top = Math.max(0.04, height(x))
    // Crest at the back, rolling forward and down to the ground.
    const y = top * Math.cos((v * Math.PI) / 2) ** 0.8
    const capped = cap && y > 0.6 + 0.07 * Math.sin(x * 1.9)
    const hot = lava && y > 0.74 + 0.05 * Math.sin(x * 2.3)
    return { p: [x, y, v * 3], hex: capped ? cap : hex, glow: hot ? 0.75 : 0, fx: hot ? 1 : 0 }
  })
}

/* ── Where things stand ──────────────────────────────────────────── */

type Inst = {
  /** Across, as a fraction of the visible half-width at its depth. */
  x: number
  z: number
  /** Height in world units, or as a fraction of the sky's height at its depth. */
  h?: number
  hSky?: number
  /** Width against height (default 1), or fixed scales for strips and sheets. */
  w?: number
  sx?: number
  sz?: number
  /** Raised off the ground: world units, and a fraction of the sky's height. */
  lift?: number
  liftSky?: number
  ry?: number
  /** Drifts across at this speed, wrapping round the view. */
  vx?: number
  /** Rises and fades, over this fraction of the sky's height, this many times a second. */
  rise?: number
  riseHz?: number
  tint?: string
  delay: number
  phase: number
}

type Look = 'fill' | 'ridge' | 'mist' | 'beam' | 'glow'
type Kind = { mesh: THREE.InstancedMesh; hull: THREE.InstancedMesh | null; insts: Inst[]; data: THREE.InstancedInterleavedBuffer }

/** A small seeded generator, so a place looks the same every visit. */
function rng(name: string) {
  let s = 2166136261
  for (let i = 0; i < name.length; i++) s = Math.imul(s ^ name.charCodeAt(i), 16777619)
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ── Shaders ─────────────────────────────────────────────────────── */

const h21 = (p: V2): F => fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453))
const vnoise = (p: V2): F => {
  const i = floor(p)
  const f = fract(p)
  const w = f.mul(f).mul(float(3).sub(f.mul(2)))
  return mix(mix(h21(i), h21(i.add(vec2(1, 0))), w.x), mix(h21(i.add(vec2(0, 1))), h21(i.add(vec2(1, 1))), w.x), w.y)
}

const num = () => uniform(0)
type Num = ReturnType<typeof num>
type Slot = { k: Num; out: Num; mats: Partial<Record<Look | 'hull', THREE.Material>> }

const iBase = attribute('iBase', 'vec4')
const iMove = attribute('iMove', 'vec4')
const iPhase = attribute('iPhase', 'float') as unknown as F
const iTint = attribute('iTint', 'vec3') as unknown as V3
const aCol = attribute('aCol', 'vec3') as unknown as V3
const aTone = attribute('aTone', 'vec3') as unknown as V3
const aFx = attribute('aFx', 'vec4')

/**
 * Where a vertex ends up: popped up from its instance's foot (after a delay),
 * swayed, drifted, risen, and sunk again when the place is left. The instance
 * matrix has already been applied to `positionLocal` by the time this runs.
 */
function placed(slot: Slot, time: F, mode: 'all' | 'up' | 'swing' = 'all'): { p: V3; s: F } {
  const foot = iBase.xyz as unknown as V3
  const a1 = saturate(slot.k.sub(iBase.w).div(0.5)).sub(1)
  // Ease out with a little overshoot: the pop of a pop-up book.
  const pop = float(1).add(a1.mul(a1).mul(a1).mul(2.4)).add(a1.mul(a1).mul(1.4))
  const rising = step(0.0001, iMove.w)
  const age = fract(time.mul(iMove.z).add(iPhase))
  const puff = mix(float(1), age.mul(0.75).add(0.35).mul(smoothstep(1, 0.72, age)).mul(smoothstep(0, 0.08, age)), rising)
  const s = pop.mul(float(1).sub(slot.out)).mul(puff) as F
  const span = max(iMove.y, 0.001)
  const drift = fract(foot.x.add(span.mul(0.5)).add(time.mul(iMove.x)).div(span)).mul(span).sub(span.mul(0.5)).sub(foot.x).mul(step(0.001, iMove.y))
  const rel = positionLocal.sub(foot) as unknown as V3
  let body: V3
  if (mode === 'up') body = vec3(rel.x, rel.y.mul(s), rel.z)
  else if (mode === 'swing') {
    // A beam sweeps about its foot.
    const ang = sin(time.mul(0.55).add(iPhase.mul(6.2832))).mul(0.42)
    body = vec3(rel.x.mul(cos(ang)).sub(rel.y.mul(sin(ang))), rel.x.mul(sin(ang)).add(rel.y.mul(cos(ang))), rel.z).mul(s)
  } else body = rel.mul(s)
  const sway = aFx.y.mul(sin(time.mul(1.7).add(iPhase.mul(6.2832)).add(rel.y.mul(0.9)))).mul(s)
  const lift = age.mul(iMove.w).mul(rising)
  const p = foot.add(body).add(vec3(drift.add(sway).add(lift.mul(0.3)), lift.sub(slot.out.mul(1.4)), 0)) as V3
  return { p, s }
}

/** Distance haze: far things take the colour of the air at the horizon. */
const haze = (pu: PlaceUniforms): { fog: V3; amount: F } => ({
  fog: mix(pu.skyBottom as unknown as V3, pu.horizonColor as unknown as V3, 0.3),
  amount: smoothstep(11, 50, positionView.z.negate()).mul(0.72) as F,
})

function fillMaterial(u: LimUniforms, pu: PlaceUniforms, slot: Slot, ridge: boolean) {
  const mat = new THREE.MeshBasicNodeMaterial()
  const time = pu.time as unknown as F
  mat.positionNode = placed(slot, time, ridge ? 'up' : 'all').p
  const base = mix(aCol, iTint, aFx.w)
  const tone = mix(aTone, iTint.mul(0.6), aFx.w)
  const n = normalize(normalView)
  const wrap = saturate(dot(n, LIGHT).add(0.45).div(1.45))
  let c: V3 = mix(tone, base, smoothstep(0.12, 0.54, wrap))
  c = mix(c, vec3(1, 1, 1), smoothstep(0.8, 0.96, wrap).mul(0.16))
  // A rim from the side the sun, moon or planet hangs on.
  const ndv = saturate(dot(n, positionViewDirection))
  c = c.add((pu.orbColor as unknown as V3).mul(pow(float(1).sub(ndv), 2.6)).mul(saturate(n.x.mul(0.6).add(0.55))).mul(0.26))
  c = c.mul(mix(float(1), float(0.6), u.night))

  // Lit from inside: lava that flows, windows that blink, lamps that just glow.
  const wp = positionWorld
  const isLava = step(0.5, aFx.z).mul(step(aFx.z, 1.5))
  const isWin = step(1.5, aFx.z)
  const flow = sin(wp.y.mul(2.4).add(time.mul(1.5)).add(sin(wp.x.mul(1.7).add(wp.z)).mul(1.4))).mul(0.5).add(0.5)
  const lava = mix(col('#C2311F'), col('#FFC653'), smoothstep(0.2, 0.8, flow))
  const grid = vec2(wp.x.add(wp.z), wp.y).mul(vec2(2.3, 1.9))
  const cell = floor(grid)
  const g = fract(grid)
  const id = h21(cell)
  const pane = step(0.22, g.x).mul(step(g.x, 0.78)).mul(step(0.26, g.y)).mul(step(g.y, 0.8)).mul(step(abs(n.y), 0.6))
  const on = step(0.48, fract(id.mul(7.3).add(floor(time.mul(0.7).add(id.mul(5))).mul(0.37))))
  const lamp = mix(col('#FFE9A8'), cos(vec3(0, 0.33, 0.67).add(id).mul(6.2832)).mul(0.3).add(0.7) as unknown as V3, 0.55)
  const lit = aFx.x.mul(mix(float(1), pane.mul(on), isWin))
  c = mix(c, mix(mix(base, lava, isLava), lamp, isWin), lit)

  const { fog, amount } = haze(pu)
  mat.colorNode = mix(c, fog, amount.mul(float(1).sub(lit.mul(0.6))))
  return mat
}

function hullMat(u: LimUniforms, pu: PlaceUniforms, slot: Slot) {
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide })
  const { p, s } = placed(slot, pu.time as unknown as F)
  mat.positionNode = p.add(normalize(normalLocal).mul(s.mul(4).min(1).mul(0.024)))
  const { fog, amount } = haze(pu)
  mat.colorNode = mix(inkOf(u), fog, amount)
  return mat
}

/** Ground mist: a wide soft sheet of slow noise. */
function mistMaterial(u: LimUniforms, pu: PlaceUniforms, slot: Slot) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
  const time = pu.time as unknown as F
  const { p, s } = placed(slot, time, 'up')
  mat.positionNode = p
  const q = uv()
  const flow = vec2(q.x.mul(9).add(time.mul(0.05)).add(iPhase.mul(17)), q.y.mul(1.6).add(iPhase.mul(5)))
  const wisps = vnoise(flow).mul(0.65).add(vnoise(flow.mul(2.3).add(3)).mul(0.35))
  const bell = smoothstep(0, 0.35, q.y).mul(float(1).sub(smoothstep(0.45, 1, q.y)))
  const ends = smoothstep(0, 0.08, q.x).mul(float(1).sub(smoothstep(0.92, 1, q.x)))
  mat.colorNode = mix(vec3(1, 1, 1), pu.skyBottom as unknown as V3, 0.35).mul(mix(float(1), float(0.72), u.night))
  mat.opacityNode = smoothstep(0.25, 0.8, wisps).mul(bell).mul(ends).mul(s.min(1)).mul(0.62)
  return mat
}

/** A spotlight's beam, or the glow over a crater: light added to whatever is behind. */
function lightMaterial(pu: PlaceUniforms, slot: Slot, beam: boolean) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  const time = pu.time as unknown as F
  const { p, s } = placed(slot, time, beam ? 'swing' : 'all')
  mat.positionNode = p
  const q = uv()
  mat.colorNode = iTint
  const across = float(1).sub(abs(q.x.sub(0.5)).mul(2))
  mat.opacityNode = beam
    ? pow(across, 1.6).mul(pow(float(1).sub(q.y), 1.3)).mul(s.min(1)).mul(0.5)
    : pow(saturate(float(1).sub(length(q.sub(0.5)).mul(2))), 1.8).mul(sin(time.mul(1.3)).mul(0.18).add(0.62)).mul(s.min(1))
  return mat
}

/* ── The stage ───────────────────────────────────────────────────── */

type Land = { group: THREE.Group; kinds: Kind[]; slot: Slot }

const mtx = new THREE.Matrix4()
const pos = new THREE.Vector3()
const scl = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
const NO_HULL = new Set<string>(['clouds', 'flowers', 'fish', 'smoke'])

export class SceneryStage {
  readonly group = new THREE.Group()
  private readonly slots: Slot[] = [0, 1].map(() => ({ k: num(), out: num(), mats: {} }))
  private now: Land | null = null
  private old: Land | null = null
  private next = 0
  private density = 1
  private view: SceneryView = { groundZ: -6.4, slope: 0.19, halfW: 3, dist: 8.6, wide: true }

  constructor(
    private readonly u: LimUniforms,
    private readonly pu: PlaceUniforms,
    private readonly opts: { reducedMotion: boolean },
  ) {}

  /** Swap landscapes: the old one sinks away while the new one pops up. null is the studio (nothing). */
  set(spec: PlaceSpec | null) {
    if (this.old) this.drop(this.old)
    this.old = this.now
    this.now = null
    if (this.old && this.opts.reducedMotion) {
      this.drop(this.old)
      this.old = null
    }
    if (!spec || (spec.scenery.length === 0 && !RIDGES.has(spec.horizon))) return
    // The slot the leaving landscape is not using.
    const slot = this.slots[this.old && this.old.slot === this.slots[this.next] ? 1 - this.next : this.next]
    this.next = 1 - this.slots.indexOf(slot)
    slot.k.value = this.opts.reducedMotion ? 99 : 0
    slot.out.value = 0
    this.now = this.build(spec, slot)
    this.group.add(this.now.group)
    this.place(this.now)
  }

  layout(view: SceneryView) {
    this.view = view
    if (this.now) this.place(this.now)
    if (this.old) this.place(this.old)
  }

  /** `dt` 0 draws a still frame. Time comes from the place's own clock and nothing here faces the camera, so `t` and `camera` go unused. */
  step(dt: number, t?: number, camera?: THREE.Camera) {
    void t
    void camera
    if (!this.now && !this.old) return
    if (this.now) this.now.slot.k.value += dt
    if (this.old) {
      this.old.slot.out.value = Math.min(1, this.old.slot.out.value + dt / 0.45)
      if (this.old.slot.out.value >= 1) {
        this.drop(this.old)
        this.old = null
      }
    }
  }

  /** A slow GPU: half as many of everything. */
  thin() {
    this.density *= 0.5
    if (this.now) this.place(this.now)
    if (this.old) this.place(this.old)
  }

  dispose() {
    if (this.now) this.drop(this.now)
    if (this.old) this.drop(this.old)
    this.now = this.old = null
    for (const slot of this.slots) {
      for (const mat of Object.values(slot.mats)) mat.dispose()
      slot.mats = {}
    }
  }

  private drop(land: Land) {
    this.group.remove(land.group)
    for (const kind of land.kinds) kind.mesh.geometry.dispose()
  }

  private material(slot: Slot, look: Look | 'hull'): THREE.Material {
    const made = slot.mats[look]
    if (made) return made
    const { u, pu } = this
    const mat =
      look === 'fill' ? fillMaterial(u, pu, slot, false)
        : look === 'ridge' ? fillMaterial(u, pu, slot, true)
          : look === 'hull' ? hullMat(u, pu, slot)
            : look === 'mist' ? mistMaterial(u, pu, slot)
              : lightMaterial(pu, slot, look === 'beam')
    slot.mats[look] = mat
    return mat
  }

  private build(spec: PlaceSpec, slot: Slot): Land {
    const land: Land = { group: new THREE.Group(), kinds: [], slot }
    const rand = rng(spec.name)
    const pal = paletteOf(spec)
    const between = (lo: number, hi: number) => lo + (hi - lo) * rand()
    const add = (geo: THREE.BufferGeometry, insts: Inst[], look: Look, hull: boolean, order = 0) => {
      const n = insts.length
      const each = new Float32Array(n * INST)
      insts.forEach((it, i) => {
        cA.set(it.tint ?? '#FFFFFF')
        each.set([it.phase, cA.r, cA.g, cA.b], i * INST + 8)
      })
      const data = new THREE.InstancedInterleavedBuffer(each, INST)
      const kind: Kind = { mesh: null as unknown as THREE.InstancedMesh, hull: null, insts, data }
      geo.setAttribute('iBase', new THREE.InterleavedBufferAttribute(data, 4, 0))
      geo.setAttribute('iMove', new THREE.InterleavedBufferAttribute(data, 4, 4))
      geo.setAttribute('iPhase', new THREE.InterleavedBufferAttribute(data, 1, 8))
      geo.setAttribute('iTint', new THREE.InterleavedBufferAttribute(data, 3, 9))
      kind.mesh = new THREE.InstancedMesh(geo, this.material(slot, look), n)
      kind.mesh.frustumCulled = false
      kind.mesh.renderOrder = order
      land.group.add(kind.mesh)
      if (hull) {
        kind.hull = new THREE.InstancedMesh(geo, this.material(slot, 'hull'), n)
        kind.hull.frustumCulled = false
        land.group.add(kind.hull)
      }
      land.kinds.push(kind)
    }
    /** `n` spots between two depths, nearer ones more likely, kept `gap` clear of the middle. */
    const scatter = (n: number, zNear: number, zFar: number, gap: number, each: (i: number) => Partial<Inst>): Inst[] =>
      Array.from({ length: n }, (_, i) => {
        const side = rand() < 0.5 ? -1 : 1
        const z = zNear + (zFar - zNear) * rand() ** 1.3
        return {
          x: side * (gap + (1.12 - gap) * rand()),
          z,
          ry: between(-0.5, 0.5),
          delay: 0.08 + rand() * 0.35 + ((-z - 3) / 26) * 0.5,
          phase: rand(),
          ...each(i),
        }
      })

    // The far ranges come first: two layers, the further one paler and taller.
    if (RIDGES.has(spec.horizon)) {
      const kind = spec.horizon as 'hills' | 'dunes' | 'mountains'
      const tall = kind === 'mountains' ? [0.34, 0.5] : kind === 'hills' ? [0.2, 0.29] : [0.1, 0.15]
      const cap = kind === 'mountains' && pal.cold ? pal.snow : null
      ;[-13, -20].forEach((z, i) => {
        const hex = blend(spec.horizonColor, spec.sky[1], i * 0.32)
        add(ridgeModel(kind, i * 2.3 + rand() * 6, hex, cap, kind === 'mountains' && pal.hot).geometry(), [
          { x: 0, z, hSky: tall[i], sx: 1, sz: 1, lift: -0.25, delay: 0.05 + i * 0.12, phase: rand() },
        ], 'ridge', false)
      })
    }

    const has = (kind: Scenery) => spec.scenery.includes(kind)
    const model = (kind: Exclude<Scenery, 'mist' | 'spotlights'>) => MODELS[kind](pal).geometry()
    const prop = (kind: Exclude<Scenery, 'mist' | 'spotlights'>, insts: Inst[]) => add(model(kind), insts, 'fill', !NO_HULL.has(kind))
    const candy = () => CANDY[Math.floor(rand() * CANDY.length)]

    if (has('volcano')) {
      const x = rand() < 0.5 ? -0.46 : 0.46
      const z = -27
      const tall = 0.6
      prop('volcano', [{ x, z, hSky: tall, w: 1.25, delay: 0.1, phase: rand() }])
      add(card(), [{ x, z: z + 0.6, hSky: 0.42, w: 1.5, liftSky: tall * 0.72, delay: 0.7, phase: rand(), tint: '#FF8A3D' }], 'glow', false, -6)
      // Smoke: a column of puffs that swell as they climb and thin away.
      add(
        new Model().add('ball', pal.dark ? '#7A6470' : '#B8AEC4', [0.5, 0.5, 0.5], [0, 0, 0], { detail: 2 }).geometry(),
        Array.from({ length: 7 }, (_, i) => ({
          x, z: z + 0.3, hSky: 0.085, liftSky: tall * 0.97, rise: 0.26, riseHz: 0.085, delay: 0.8, phase: i / 7 + rand() * 0.05,
        })),
        'fill', false,
      )
    }
    if (has('buildings')) {
      prop('buildings', scatter(16, -9, -19, 0.1, () => ({ hSky: between(0.28, 0.72), w: between(0.6, 1.15), ry: between(-0.25, 0.25) })))
    }
    if (has('clouds')) {
      const speed = between(0.12, 0.22) * (rand() < 0.5 ? -1 : 1)
      prop('clouds', scatter(7, -16, -30, 0, () => ({ hSky: between(0.13, 0.22), liftSky: between(0.46, 0.86), ry: 0, vx: speed * between(0.7, 1.3) })))
    }
    if (has('trees')) prop('trees', scatter(12, -3.7, -11, 0.2, () => ({ h: between(2.2, 3.4) })))
    if (has('pines')) prop('pines', scatter(14, -3.8, -12, 0.2, () => ({ h: between(2.4, 3.8) })))
    if (has('palms')) prop('palms', scatter(6, -3.7, -8, 0.3, () => ({ h: between(3, 4.2), ry: between(-3.1, 3.1) })))
    if (has('deadtrees')) prop('deadtrees', scatter(7, -3.8, -11, 0.25, () => ({ h: between(2.2, 3.5), ry: between(-3.1, 3.1) })))
    if (has('cacti')) prop('cacti', scatter(8, -3.6, -10, 0.2, () => ({ h: between(1.3, 2.4), ry: between(-3.1, 3.1) })))
    if (has('rocks')) prop('rocks', scatter(9, -3.4, -10, 0.16, () => ({ h: between(0.5, 1.1), w: between(1, 1.5), ry: between(-3.1, 3.1) })))
    if (has('mushrooms')) prop('mushrooms', scatter(8, -3.5, -8, 0.18, () => ({ h: between(0.6, 1.5), tint: ['#F0524F', '#FF9FC5', '#C7B6FF', '#FFB05A'][Math.floor(rand() * 4)] })))
    if (has('flowers')) prop('flowers', scatter(30, -3.4, -6.5, 0.05, () => ({ h: between(0.32, 0.5), ry: between(-0.3, 0.3), tint: candy() })))
    if (has('graves')) prop('graves', scatter(7, -3.5, -8, 0.2, () => ({ h: between(0.65, 0.95), ry: between(-0.35, 0.35) })))
    if (has('snowmen')) prop('snowmen', scatter(3, -3.6, -6.5, 0.36, () => ({ h: between(0.85, 1.15), ry: between(-0.4, 0.4) })))
    if (has('craters')) prop('craters', scatter(7, -3.6, -9, 0.14, () => ({ h: between(0.9, 2.2), ry: 0 })))
    if (has('coral')) prop('coral', scatter(9, -3.5, -9, 0.18, () => ({ h: between(0.7, 1.6), ry: between(-3.1, 3.1), tint: ['#FF8FA8', '#FFB05A', '#C7B6FF', '#FF7E6B'][Math.floor(rand() * 4)] })))
    if (has('seaweed')) prop('seaweed', scatter(12, -3.5, -10, 0.14, () => ({ h: between(1.4, 2.8) })))
    if (has('fish')) {
      const way = rand() < 0.5 ? -1 : 1
      prop('fish', scatter(9, -4.5, -11, 0, () => {
        // Most of the school swims one way; a straggler or two the other.
        const dir = rand() < 0.8 ? way : -way
        return { h: between(0.3, 0.55), liftSky: between(0.1, 0.55), ry: dir > 0 ? 0 : Math.PI, vx: dir * between(0.5, 1.1), tint: candy() }
      }))
    }
    if (has('spotlights')) {
      add(card(0.08), Array.from({ length: 5 }, (_, i) => ({
        x: -0.84 + i * 0.42 + between(-0.06, 0.06), z: between(-8, -13), hSky: 1.05, w: 0.22, delay: 0.2 + i * 0.08, phase: rand(), tint: CANDY[i % CANDY.length],
      })), 'beam', false, -6)
    }
    if (has('mist')) {
      add(card(), [-4.3, -7.6, -12].map((z, i) => ({ x: 0, z, sx: 70, h: 2.3 + i * 0.5, sz: 1, lift: -0.1, delay: 0.3 + i * 0.15, phase: rand() })), 'mist', false, -5)
    }
    return land
  }

  /** Stand every instance where the current framing puts it. */
  private place(land: Land) {
    const { groundZ, slope, halfW, dist, wide } = this.view
    const share = this.density * (wide ? 1 : 0.6)
    for (const kind of land.kinds) {
      const n = kind.insts.length
      kind.insts.forEach((it, i) => {
        const half = (halfW * (dist - it.z)) / dist
        const line = -slope * Math.max(0, groundZ - it.z)
        const sky = (slope + 0.0875) * (dist - it.z)
        const h = it.hSky !== undefined ? it.hSky * sky : (it.h ?? 1)
        const w = h * (it.w ?? 1)
        pos.set(it.x * half, line * 1.06 + (it.lift ?? 0) + (it.liftSky ?? 0) * sky, it.z)
        mtx.compose(pos, quat.setFromAxisAngle(UP, it.ry ?? 0), scl.set(it.sx ?? w, h, it.sz ?? w))
        kind.mesh.setMatrixAt(i, mtx)
        kind.hull?.setMatrixAt(i, mtx)
        const each = kind.data.array as Float32Array
        each.set([pos.x, pos.y, pos.z, it.delay], i * INST)
        // Drifters wrap round a span a little wider than the view at their depth.
        each.set([it.vx ?? 0, it.vx ? half * 2.6 : 0, it.riseHz ?? 0, (it.rise ?? 0) * sky], i * INST + 4)
      })
      const count = n <= 3 ? n : Math.max(2, Math.ceil(n * share))
      for (const mesh of [kind.mesh, kind.hull]) {
        if (!mesh) continue
        mesh.count = count
        mesh.instanceMatrix.needsUpdate = true
      }
      kind.data.needsUpdate = true
    }
  }
}

const RIDGES = new Set<string>(['hills', 'dunes', 'mountains'])

/**
 * Places for Lim's world. A place is drawn by three things that all read the
 * same small set of uniforms, so moving between places is a crossfade:
 * a backdrop behind everything (sky gradient, a horizon silhouette, a sun,
 * moon or planet, stars, a sea, light shafts under water), the stage floor (see `floorMaterial`), and a pool
 * of weather particles. In Lim's own studio the backdrop is transparent and
 * the page shows through.
 */
import * as THREE from 'three/webgpu'
import {
  abs, atan, dot, exp, float, floor, fract, length, max, mix, sin, smoothstep, uniform, uv, vec2, vec3,
} from 'three/tsl'
import { HORIZONS, PATTERNS, type PlaceSpec } from '../world/spec'
import { aaStep, type F, type V2, type V3 } from './limLook'

export function createPlaceUniforms() {
  return {
    /** 0 in the studio, 1 anywhere else. */
    amount: uniform(0),
    skyTop: uniform(new THREE.Color('#FFF6EC')),
    skyBottom: uniform(new THREE.Color('#FFF6EC')),
    floor: uniform(new THREE.Color('#FCE5D8')),
    dots: uniform(new THREE.Color('#F7CDBF')),
    rug: uniform(new THREE.Color('#C8F0E0')),
    horizonColor: uniform(new THREE.Color('#FCE5D8')),
    orbColor: uniform(new THREE.Color('#FFE9A8')),
    /** One weight per pattern / horizon / orb kind; the active one eases to 1. */
    pattern: PATTERNS.map(() => uniform(0)),
    horizon: HORIZONS.map(() => uniform(0)),
    sun: uniform(0),
    moon: uniform(0),
    planet: uniform(0),
    stars: uniform(0),
    /** Under water: light falls in shafts from above. */
    deep: uniform(0),
    aspect: uniform(1),
    time: uniform(0),
  }
}
export type PlaceUniforms = ReturnType<typeof createPlaceUniforms>

const COLORS = ['skyTop', 'skyBottom', 'floor', 'dots', 'rug', 'horizonColor', 'orbColor'] as const
const scratch = new THREE.Color()

/** Ease every uniform toward a place (or the studio). `k` is the blend for this frame, 1 to snap. */
export function easePlace(u: PlaceUniforms, spec: PlaceSpec | null, k: number) {
  const to = (node: { value: number }, target: number) => {
    node.value += (target - node.value) * k
  }
  to(u.amount, spec ? 1 : 0)
  if (!spec) {
    to(u.stars, 0)
    to(u.deep, 0)
    return
  }
  // Arriving from the studio there is nothing to blend from: take the colours at once.
  const snap = u.amount.value < 0.02 ? 1 : k
  const targets: Record<(typeof COLORS)[number], string> = {
    skyTop: spec.sky[0], skyBottom: spec.sky[1], floor: spec.floor, dots: spec.dots, rug: spec.rug,
    horizonColor: spec.horizonColor, orbColor: spec.orbColor,
  }
  for (const name of COLORS) u[name].value.lerp(scratch.set(targets[name]), snap)
  PATTERNS.forEach((name, i) => to(u.pattern[i], spec.pattern === name ? 1 : 0))
  HORIZONS.forEach((name, i) => to(u.horizon[i], spec.horizon === name ? 1 : 0))
  to(u.sun, spec.orb === 'sun' ? 1 : 0)
  to(u.moon, spec.orb === 'moon' ? 1 : 0)
  to(u.planet, spec.orb === 'planet' ? 1 : 0)
  to(u.stars, spec.stars ? 1 : 0)
  to(u.deep, spec.scenery?.some((kind) => kind === 'coral' || kind === 'seaweed' || kind === 'fish') ? 1 : 0)
}

const hash = (p: V2): F => fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453))
const tri = (x: F): F => abs(fract(x).sub(0.5)).mul(2)

/** Where the ground meets the sky, as a fraction of the canvas height from the bottom. */
const GROUND = 0.47

/** Smooth value noise, 0..1. */
const vnoise = (p: V2): F => {
  const i = floor(p)
  const f = fract(p)
  const w = f.mul(f).mul(float(3).sub(f.mul(2)))
  return mix(
    mix(hash(i), hash(i.add(vec2(1, 0))), w.x),
    mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), w.x),
    w.y,
  )
}

/**
 * The horizon's height above the ground line at `x`: each kind is a profile and
 * the active one has weight 1. `far` is the paler range behind (no wall, no sea).
 */
function skyline(u: PlaceUniforms, x: F, far: boolean): F {
  const [, hills, dunes, waves, mountains, city, trees, wall] = u.horizon
  const seed = far ? 11 : 3
  let h: F = hills.mul(sin(x.mul(2.1).add(1)).mul(0.045).add(sin(x.mul(5.3)).mul(0.022)).add(0.075))
    .add(dunes.mul(sin(x.mul(1.3).add(2)).mul(0.03).add(sin(x.mul(3.7)).mul(0.012)).add(0.045)))
    .add(mountains.mul(tri(x.mul(0.9).add(0.3)).mul(0.13).add(tri(x.mul(2.3).add(0.4)).mul(0.05)).add(0.03)))
    .add(city.mul(hash(vec2(floor(x.mul(7)), seed)).mul(0.11).add(0.045).mul(smoothstep(0.02, 0.06, abs(fract(x.mul(7)).sub(0.5)).mul(-1).add(0.5)))))
    .add(trees.mul(abs(sin(x.mul(9))).mul(0.06).add(abs(sin(x.mul(23).add(1))).mul(0.035)).add(0.07)))
  if (!far) {
    h = h
      .add(waves.mul(sin(x.mul(16).add(u.time.mul(1.4))).mul(0.006).add(0.04)))
      // Indoors: a flat wall with a skirting rail.
      .add(wall.mul(0.2))
  }
  return h
}

/** The sky: a camera-facing sheet far behind the stage. */
export function backdropMaterial(u: PlaceUniforms) {
  // Depth-tested (it sits far behind the stage), so it never paints over Lim.
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
  const p = uv()
  const x = p.x.sub(0.5).mul(u.aspect)
  const y = p.y
  const waves = u.horizon[3]
  const sky = smoothstep(GROUND + 0.08, GROUND + 0.3, y)
  const white = vec3(1, 1, 1)

  let c: V3 = mix(u.skyBottom as unknown as V3, u.skyTop as unknown as V3, smoothstep(GROUND, 1, y))

  // A faint nebula behind the stars: two scales of noise, tinted by the orb.
  const cloud = vnoise(vec2(x, y).mul(2.6).add(u.time.mul(0.012))).mul(vnoise(vec2(x, y).mul(6.1).add(vec2(5.2, 1.3))))
  const nebula = mix(u.orbColor as unknown as V3, u.skyBottom as unknown as V3, vnoise(vec2(x, y).mul(1.7).add(9)))
  c = c.add(nebula.mul(smoothstep(0.12, 0.5, cloud)).mul(u.stars).mul(sky).mul(0.22))

  // Stars: a sparse sprinkle that twinkles, and a finer dust behind it.
  const starfield = (scale: number, rarity: number, size: number): F => {
    const cell = floor(vec2(x, y).mul(scale))
    return smoothstep(rarity, 1, hash(cell))
      .mul(float(1).sub(smoothstep(size * 0.25, size, length(fract(vec2(x, y).mul(scale)).sub(0.5)))))
      .mul(sin(u.time.mul(1.7).add(hash(cell.add(7)).mul(40))).mul(0.35).add(0.65))
  }
  const star = starfield(46, 0.965, 0.4).add(starfield(113, 0.95, 0.3).mul(0.45))
  c = mix(c, white, star.min(1).mul(u.stars).mul(sky))

  // Under water the light comes down in slow shafts.
  const shafts = smoothstep(0.5, 0.95, sin(x.mul(6.5).add(y.mul(2.8)).add(u.time.mul(0.22))).mul(0.5).add(0.5))
    .add(smoothstep(0.6, 0.95, sin(x.mul(11).add(y.mul(4.6)).sub(u.time.mul(0.31))).mul(0.5).add(0.5)).mul(0.5))
  c = mix(c, white, shafts.mul(smoothstep(GROUND, 1, y)).mul(u.deep).mul(0.13))

  // Sun, moon or planet, upper right.
  const sunX = u.aspect.mul(0.24)
  const o = vec2(x.sub(sunX), y.sub(0.84))
  const d = length(o)
  const disc = aaStep(d.sub(0.07), 0.004)
  const orb = u.orbColor as unknown as V3
  // Soft rays that turn slowly round the sun.
  const rays = sin(atan(o.y, o.x).mul(14).add(u.time.mul(0.12))).mul(0.5).add(0.5)
  c = c.add(orb.mul(rays.mul(rays).mul(exp(d.mul(-4.2))).mul(0.16)).mul(u.sun))
  c = c.add(orb.mul(exp(d.mul(-9)).mul(0.3)).mul(u.sun))
  c = mix(c, orb, disc.mul(u.sun))
  const bite = aaStep(length(o.sub(vec2(0.032, 0.022))).sub(0.062), 0.004)
  const lit = disc.mul(float(1).sub(bite))
  const pit = (px: number, py: number, r: number): F => aaStep(length(o.sub(vec2(px, py))).sub(r), 0.003)
  const craters = pit(-0.03, 0.012, 0.014).add(pit(-0.012, -0.028, 0.01)).add(pit(-0.045, -0.02, 0.007)).min(1)
  c = c.add(orb.mul(exp(d.mul(-11)).mul(0.14)).mul(u.moon))
  c = mix(c, mix(orb, orb.mul(0.82), craters), lit.mul(u.moon))
  const band = aaStep(abs(o.y.add(o.x.mul(0.35))).sub(0.012), 0.004).mul(aaStep(abs(o.x).sub(0.13), 0.004))
  c = mix(c, orb.mul(0.82), disc.mul(u.planet))
  c = mix(c, mix(orb, white, 0.45), band.mul(float(1).sub(disc.mul(smoothstep(0, 0.02, o.y.add(o.x.mul(0.35)))))).mul(u.planet))

  // Two ranges of horizon: a pale far one, then the near silhouette.
  const horizon = u.horizonColor as unknown as V3
  const far = skyline(u, x.mul(0.62).add(3.1), true).mul(1.65)
  c = mix(c, mix(horizon, u.skyBottom as unknown as V3, 0.58), aaStep(y.sub(float(GROUND).add(far)), 0.003).mul(smoothstep(0.004, 0.02, far)))
  const h = skyline(u, x, false)
  c = mix(c, horizon, aaStep(y.sub(float(GROUND).add(h)), 0.003).mul(smoothstep(0.004, 0.02, h)))

  // The sea: paler toward the shore, glitter on the water under the sun, a line of foam.
  const sea = waves.mul(aaStep(y.sub(float(GROUND).add(h)), 0.003))
  const out = smoothstep(GROUND, GROUND + 0.04, y)
  c = mix(c, mix(horizon, white, 0.3), sea.mul(float(1).sub(out)).mul(0.6))
  const glint = smoothstep(0.82, 0.9, hash(floor(vec2(x.mul(64), y.mul(700))).add(floor(u.time.mul(3)).mul(0.37))))
  c = mix(c, white, glint.mul(exp(abs(x.sub(sunX)).mul(-6))).mul(sea).mul(u.sun).mul(0.75))
  const foam = aaStep(abs(y.sub(float(GROUND + 0.0045).add(sin(x.mul(24).add(u.time.mul(1.2))).mul(0.0022)))).sub(0.0022), 0.0015)
  c = mix(c, white, foam.mul(waves).mul(0.85))

  // Below the horizon the ground runs out to meet it.
  c = mix(c, u.floor as unknown as V3, aaStep(y.sub(GROUND), 0.004))
  mat.colorNode = c
  mat.opacityNode = u.amount
  return mat
}

/* ── Weather ─────────────────────────────────────────────────────── */

type Kind = PlaceSpec['weather']
const STYLE: Record<Exclude<Kind, 'none'>, { count: number; size: [number, number]; fall: number; drift: number; sway: number; spin: number; ring?: boolean; pulse?: boolean; alpha: number }> = {
  snow: { count: 70, size: [0.05, 0.05], fall: -0.75, drift: 0.15, sway: 0.5, spin: 0, alpha: 0.95 },
  rain: { count: 90, size: [0.014, 0.2], fall: -9, drift: -0.8, sway: 0, spin: 0, alpha: 0.5 },
  bubbles: { count: 36, size: [0.09, 0.09], fall: 0.6, drift: 0, sway: 0.35, spin: 0, ring: true, alpha: 0.85 },
  leaves: { count: 30, size: [0.1, 0.055], fall: -0.9, drift: 0.7, sway: 1, spin: 3, alpha: 0.95 },
  petals: { count: 34, size: [0.075, 0.05], fall: -0.55, drift: 0.4, sway: 0.8, spin: 2.2, alpha: 0.95 },
  fireflies: { count: 26, size: [0.05, 0.05], fall: 0, drift: 0, sway: 0.5, spin: 0, pulse: true, alpha: 0.9 },
  embers: { count: 40, size: [0.035, 0.035], fall: 1.1, drift: 0.2, sway: 0.6, spin: 0, pulse: true, alpha: 0.9 },
}
const MAX = 90
const dummy = new THREE.Object3D()

/** Snow, rain, bubbles and the rest: one instanced pool that wraps around the stage. */
export class Weather {
  readonly mesh: THREE.InstancedMesh
  private readonly ring = uniform(0)
  private readonly alpha = uniform(0)
  private readonly tint = uniform(new THREE.Color('#ffffff'))
  private readonly p = new Float32Array(MAX * 3)
  private readonly seed = new Float32Array(MAX)
  private kind: Kind = 'none'
  private next: Kind = 'none'
  private nextColor = '#ffffff'
  private shown = 0

  constructor() {
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
    const d = length(uv().sub(0.5)).mul(2)
    const soft = float(1).sub(smoothstep(0.55, 1, d))
    const hollow = smoothstep(0.62, 0.8, d).mul(float(1).sub(smoothstep(0.86, 1, d))).add(float(1).sub(smoothstep(0, 0.5, length(uv().sub(vec2(0.34, 0.68))).mul(4))).mul(0.8))
    mat.colorNode = this.tint as unknown as V3
    mat.opacityNode = mix(soft, max(hollow, soft.mul(0.12)), this.ring).mul(this.alpha)
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, MAX)
    this.mesh.frustumCulled = false
    this.mesh.visible = false
    this.mesh.renderOrder = 4
    for (let i = 0; i < MAX; i++) this.seed[i] = Math.random()
  }

  set(kind: Kind, color: string) {
    this.next = kind
    this.nextColor = color
  }

  /** `box` is the stage volume: half-width and height. `dt` 0 draws a still frame. */
  step(dt: number, t: number, box: { w: number; h: number }, camera: THREE.Camera, wind: number) {
    // Fade the old weather out before the new kind comes in.
    const changing = this.next !== this.kind
    this.shown += ((changing ? 0 : 1) - this.shown) * (dt > 0 ? Math.min(1, dt * 4) : 1)
    if (changing && this.shown < 0.04) {
      this.kind = this.next
      this.tint.value.set(this.nextColor)
      for (let i = 0; i < MAX; i++) {
        this.p[i * 3] = (Math.random() * 2 - 1) * (box.w + 1)
        this.p[i * 3 + 1] = Math.random() * (box.h + 0.6)
        this.p[i * 3 + 2] = -2.6 + Math.random() * 4
      }
    }
    if (this.kind === 'none') {
      this.mesh.visible = false
      return
    }
    const s = STYLE[this.kind]
    this.mesh.visible = true
    this.mesh.count = s.count
    this.ring.value = s.ring ? 1 : 0
    this.alpha.value = s.alpha * this.shown
    for (let i = 0; i < s.count; i++) {
      const j = i * 3
      const k = this.seed[i]
      const speed = 0.6 + k * 0.8
      this.p[j] += (s.drift + wind + Math.sin(t * (0.8 + k) + k * 40) * s.sway) * speed * dt
      this.p[j + 1] += (s.fall + (s.fall === 0 ? Math.cos(t * (0.6 + k) + k * 17) * 0.3 : 0)) * speed * dt
      if (this.p[j + 1] < 0.02) this.p[j + 1] += box.h + 0.6
      if (this.p[j + 1] > box.h + 0.6) this.p[j + 1] -= box.h + 0.6
      if (this.p[j] > box.w + 1) this.p[j] -= 2 * (box.w + 1)
      if (this.p[j] < -box.w - 1) this.p[j] += 2 * (box.w + 1)
      dummy.position.set(this.p[j], this.p[j + 1], this.p[j + 2])
      dummy.quaternion.copy(camera.quaternion)
      if (s.spin) dummy.rotateZ(t * s.spin * (k - 0.5) * 2 + k * 6)
      else if (this.kind === 'rain') dummy.rotateZ(-0.09)
      const size = (0.6 + k * 0.8) * (s.pulse ? 0.55 + 0.45 * Math.sin(t * (2 + k * 3) + k * 30) : 1)
      dummy.scale.set(s.size[0] * size, s.size[1] * size, 1)
      dummy.updateMatrix()
      this.mesh.setMatrixAt(i, dummy.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

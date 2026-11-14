/**
 * Lim's effects: pooled, instanced particles (confetti, dust puffs, impact
 * stars, hearts) and the springy tuft on Lim's head. Everything here is
 * CPU-light: one draw call per pool, no allocation after start-up.
 */
import * as THREE from 'three/webgpu'
import type { Vec3 } from '../../three/jelly'

type Particle = {
  p: THREE.Vector3
  v: THREE.Vector3
  axis: THREE.Vector3
  angle: number
  spin: number
  life: number
  span: number
  size: number
}

type PoolConfig = {
  gravity: number
  /** Velocity decay per second. */
  drag: number
  /** Face the camera (stars, hearts) instead of tumbling (confetti). */
  billboard?: boolean
  /** Side-to-side flutter as it falls. */
  flutter?: number
  /** Come to rest on the floor instead of passing through it. */
  settle?: boolean
  /** Size over normalised age 0..1. */
  shape: (k: number) => number
}

const dummy = new THREE.Object3D()
const quat = new THREE.Quaternion()
const tint = new THREE.Color()

export class Pool {
  readonly mesh: THREE.InstancedMesh
  private readonly items: Particle[]
  private next = 0

  constructor(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    count: number,
    private readonly cfg: PoolConfig,
  ) {
    this.mesh = new THREE.InstancedMesh(geo, mat, count)
    this.mesh.frustumCulled = false
    this.mesh.visible = false
    this.items = Array.from({ length: count }, () => ({
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      axis: new THREE.Vector3(0, 0, 1),
      angle: 0,
      spin: 0,
      life: 0,
      span: 1,
      size: 1,
    }))
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, tint.set('#ffffff'))
  }

  spawn(hex: string, life: number, size = 1): Particle {
    const i = this.next++ % this.items.length
    const it = this.items[i]
    it.life = it.span = life
    it.size = size
    it.angle = 0
    it.spin = 0
    it.axis.set(0, 0, 1)
    this.mesh.setColorAt(i, tint.set(hex))
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    return it
  }

  step(dt: number, t: number, camera: THREE.Camera) {
    const { gravity, drag, billboard, flutter, settle, shape } = this.cfg
    let any = false
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]
      if (it.life <= 0) {
        dummy.scale.setScalar(0)
      } else {
        any = true
        it.life -= dt
        if (!settle || it.p.y > 0.02) {
          it.v.y -= gravity * dt
          it.v.multiplyScalar(Math.exp(-drag * dt))
          if (flutter) it.v.x += Math.sin(t * 7 + i) * flutter * dt
          it.p.addScaledVector(it.v, dt)
          it.angle += it.spin * dt
        } else {
          it.p.y = 0.012
          it.axis.set(1, 0, 0)
          it.angle = -Math.PI / 2
        }
        dummy.position.copy(it.p)
        if (billboard) {
          dummy.quaternion.copy(camera.quaternion)
          dummy.rotateZ(it.angle)
        } else {
          dummy.quaternion.copy(quat.setFromAxisAngle(it.axis, it.angle))
        }
        dummy.scale.setScalar(Math.max(0, it.size * shape(1 - Math.max(0, it.life) / it.span)))
      }
      dummy.updateMatrix()
      this.mesh.setMatrixAt(i, dummy.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.visible = any
  }
}

export function starGeometry(points = 4, inner = 0.36): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : 1
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  shape.closePath()
  return new THREE.ShapeGeometry(shape)
}

export function heartGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(0, -0.9)
  s.bezierCurveTo(-1.5, 0.1, -0.95, 1.15, 0, 0.42)
  s.bezierCurveTo(0.95, 1.15, 1.5, 0.1, 0, -0.9)
  return new THREE.ShapeGeometry(s, 10)
}

/* ── Tuft ────────────────────────────────────────────────────────── */

const RINGS = 14
const SIDES = 8

/**
 * The curl on Lim's head: a chain of points, each sprung to where it would
 * sit on the body, softer toward the tip, so it lags, whips and settles after
 * every move (overlapping action). Skinned on the CPU as a tapered tube.
 */
export class Tuft {
  readonly geo = new THREE.BufferGeometry()
  private readonly n: number
  private readonly x: Float32Array
  private readonly v: Float32Array
  private readonly target: Vec3 = [0, 0, 0]
  /** Last substep's targets, for the targets' own velocity. */
  private readonly last: Float32Array
  private readonly pos: Float32Array
  private readonly nrm: Float32Array
  private started = false

  constructor(
    /** Rest-space points, root first (inside the head), and their radii. */
    private readonly rest: Vec3[],
    private readonly radii: number[],
  ) {
    this.n = rest.length
    this.x = new Float32Array(this.n * 3)
    this.v = new Float32Array(this.n * 3)
    this.last = new Float32Array(this.n * 3)
    const verts = RINGS * SIDES + 1
    this.pos = new Float32Array(verts * 3)
    this.nrm = new Float32Array(verts * 3)
    const index: number[] = []
    for (let r = 0; r < RINGS - 1; r++) {
      for (let s = 0; s < SIDES; s++) {
        const a = r * SIDES + s
        const b = r * SIDES + ((s + 1) % SIDES)
        const c = a + SIDES
        const d = b + SIDES
        index.push(a, b, c, b, d, c)
      }
    }
    const tip = RINGS * SIDES
    for (let s = 0; s < SIDES; s++) index.push((RINGS - 1) * SIDES + s, (RINGS - 1) * SIDES + ((s + 1) % SIDES), tip)
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage))
    this.geo.setIndex(index)
  }

  /** Flick the tip (world velocity). */
  flick(vx: number, vy: number, vz: number) {
    for (let i = 1; i < this.n; i++) {
      const w = i / (this.n - 1)
      this.v[i * 3] += vx * w
      this.v[i * 3 + 1] += vy * w
      this.v[i * 3 + 2] += vz * w
    }
  }

  /**
   * How the tuft carries itself, eased by the caller: + droops (sad, asleep),
   * − stands to attention (startled).
   */
  bend = 0

  /** `attach` maps a rest-space point to where the body has it now. */
  step(dt: number, attach: (rest: Vec3, out: Vec3) => Vec3) {
    const { x, v, n, target } = this
    const snap = dt <= 0 || !this.started
    this.started = true
    const steps = snap ? 1 : 3
    const h = dt / steps
    for (let i = 0; i < n; i++) {
      attach(this.rest[i], target)
      const j = i * 3
      if (i > 0 && this.bend !== 0) {
        const w = i / (n - 1)
        const side = this.rest[i][0] - this.rest[0][0]
        if (this.bend > 0) {
          // Wilt: the tip sags down and out.
          target[1] -= this.bend * 0.3 * w * w
          target[0] += this.bend * 0.12 * w
        } else {
          // Perk: uncurl straight up.
          target[0] += this.bend * side * 0.85
          target[1] -= this.bend * (0.1 * w + Math.abs(side) * 0.55)
        }
      }
      // The body only moves once per frame, so spread its motion over the substeps.
      const tvx = snap ? 0 : (target[0] - this.last[j]) / dt
      const tvy = snap ? 0 : (target[1] - this.last[j + 1]) / dt
      const tvz = snap ? 0 : (target[2] - this.last[j + 2]) / dt
      if (i === 0 || snap) {
        x[j] = target[0]
        x[j + 1] = target[1]
        x[j + 2] = target[2]
        v[j] = v[j + 1] = v[j + 2] = 0
      } else {
        // Softer and less damped toward the tip; damping is against the body's
        // own motion so the tuft trails a move and then whips past it.
        const w = i / (n - 1)
        const k = 950 - 560 * w
        const c = 17 - 8 * w
        const reach = 0.1 + 0.36 * w
        for (let s = 1; s <= steps; s++) {
          const f = s / steps
          const gx = this.last[j] + (target[0] - this.last[j]) * f
          const gy = this.last[j + 1] + (target[1] - this.last[j + 1]) * f
          const gz = this.last[j + 2] + (target[2] - this.last[j + 2]) * f
          v[j] += (k * (gx - x[j]) - c * (v[j] - tvx)) * h
          v[j + 1] += (k * (gy - x[j + 1]) - c * (v[j + 1] - tvy)) * h
          v[j + 2] += (k * (gz - x[j + 2]) - c * (v[j + 2] - tvz)) * h
          x[j] += v[j] * h
          x[j + 1] += v[j + 1] * h
          x[j + 2] += v[j + 2] * h
        }
        // Never let it stray further than a curl can bend.
        const dx = x[j] - target[0]
        const dy = x[j + 1] - target[1]
        const dz = x[j + 2] - target[2]
        const d = Math.hypot(dx, dy, dz)
        if (d > reach) {
          const q = reach / d
          x[j] = target[0] + dx * q
          x[j + 1] = target[1] + dy * q
          x[j + 2] = target[2] + dz * q
        }
      }
      this.last[j] = target[0]
      this.last[j + 1] = target[1]
      this.last[j + 2] = target[2]
    }
    this.skin()
  }

  private skin() {
    const { x, n, pos, nrm, radii } = this
    const at = (i: number, a: number) => x[Math.min(n - 1, Math.max(0, i)) * 3 + a]
    let px = 0
    let py = 0
    let pz = 1
    for (let r = 0; r < RINGS; r++) {
      const u = (r / (RINGS - 1)) * (n - 1)
      const i = Math.min(n - 2, Math.floor(u))
      const f = u - i
      const f2 = f * f
      const f3 = f2 * f
      const c: Vec3 = [0, 0, 0]
      const tan: Vec3 = [0, 0, 0]
      // Catmull-Rom through the chain.
      for (let a = 0; a < 3; a++) {
        const p0 = at(i - 1, a)
        const p1 = at(i, a)
        const p2 = at(i + 1, a)
        const p3 = at(i + 2, a)
        c[a] = 0.5 * (2 * p1 + (p2 - p0) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (3 * p1 - p0 - 3 * p2 + p3) * f3)
        tan[a] = 0.5 * (p2 - p0 + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * f + 3 * (3 * p1 - p0 - 3 * p2 + p3) * f2)
      }
      const tl = Math.hypot(tan[0], tan[1], tan[2]) || 1
      const tx = tan[0] / tl
      const ty = tan[1] / tl
      const tz = tan[2] / tl
      // Carry the previous ring's frame along the curve so it never twists.
      let nx = py * tz - pz * ty
      let ny = pz * tx - px * tz
      let nz = px * ty - py * tx
      const nl = Math.hypot(nx, ny, nz) || 1
      nx /= nl
      ny /= nl
      nz /= nl
      const bx = ty * nz - tz * ny
      const by = tz * nx - tx * nz
      const bz = tx * ny - ty * nx
      px = bx
      py = by
      pz = bz
      // The last two rings close in, so the tip is a rounded nub however straight it stands.
      const rad = (radii[i] + (radii[i + 1] - radii[i]) * f) * (r === RINGS - 1 ? 0.62 : r === RINGS - 2 ? 0.9 : 1)
      for (let s = 0; s < SIDES; s++) {
        const a = (s / SIDES) * Math.PI * 2
        const cs = Math.cos(a)
        const sn = Math.sin(a)
        const ox = nx * cs + bx * sn
        const oy = ny * cs + by * sn
        const oz = nz * cs + bz * sn
        const j = (r * SIDES + s) * 3
        pos[j] = c[0] + ox * rad
        pos[j + 1] = c[1] + oy * rad
        pos[j + 2] = c[2] + oz * rad
        nrm[j] = ox
        nrm[j + 1] = oy
        nrm[j + 2] = oz
      }
      if (r === RINGS - 1) {
        const j = RINGS * SIDES * 3
        pos[j] = c[0] + tx * rad * 0.9
        pos[j + 1] = c[1] + ty * rad * 0.9
        pos[j + 2] = c[2] + tz * rad * 0.9
        nrm[j] = tx
        nrm[j + 1] = ty
        nrm[j + 2] = tz
      }
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.normal.needsUpdate = true
  }
}

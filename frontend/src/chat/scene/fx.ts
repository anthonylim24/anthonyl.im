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
    this.lengths = rest.map((_, i) => {
      let l = 0
      for (let k = 1; k <= i; k++) l += Math.hypot(rest[k][0] - rest[k - 1][0], rest[k][1] - rest[k - 1][1], rest[k][2] - rest[k - 1][2])
      return l
    })
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
  floor = 0.07
  /** Length scale (a short stage wears a shorter tuft). */
  scale = 1
  /** Distance of each point from the root along the rest curve. */
  private readonly lengths: number[]

  /** `attach` maps a rest-space point to where the body has it now. */
  step(dt: number, attach: (rest: Vec3, out: Vec3) => Vec3) {
    const { x, v, n, target } = this
    const posed: Vec3 = [0, 0, 0]
    const snap = dt <= 0 || !this.started
    this.started = true
    const steps = snap ? 1 : 3
    const h = dt / steps
    const root = this.rest[0]
    const amount = Math.min(1, Math.abs(this.bend))
    for (let i = 0; i < n; i++) {
      // Pose the tuft in rest space, then let the body carry it: its own curl,
      // blended toward a limp arc laid over to one side (wilting) or a straight
      // stalk (startled). Neither pose brings the tip back toward the head.
      const w = i / (n - 1)
      const lean = this.bend > 0 ? 0.4 + 0.75 * w : 0
      const len = this.lengths[i]
      const ox = this.rest[i][0] - root[0]
      const oy = this.rest[i][1] - root[1]
      posed[0] = root[0] + (ox + (Math.sin(lean) * len - ox) * amount) * this.scale
      posed[1] = root[1] + (oy + (Math.cos(lean) * len - oy) * amount) * this.scale
      posed[2] = this.rest[i][2]
      attach(posed, target)
      const j = i * 3
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
        const reach = 0.08 + 0.24 * w
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
        // It lies on the floor; it never goes through it.
        if (x[j + 1] < this.floor) x[j + 1] = this.floor
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
    // The last CAP rings and the tip vertex form a hemisphere on the end of the tube.
    const CAP = 2
    const BODY = RINGS - CAP
    let px = 0
    let py = 0
    let pz = 1
    const c: Vec3 = [0, 0, 0]
    const tan: Vec3 = [0, 0, 0]
    let nx = 1
    let ny = 0
    let nz = 0
    let bx = 0
    let by = 0
    let bz = 1
    let tx = 0
    let ty = 1
    let tz = 0
    let rad = radii[0]
    for (let r = 0; r < RINGS; r++) {
      let ringRad: number
      let fwd = 0
      let lean = 0
      if (r < BODY) {
        const u = (r / (BODY - 1)) * (n - 1)
        const i = Math.min(n - 2, Math.floor(u))
        const f = u - i
        const f2 = f * f
        const f3 = f2 * f
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
        tx = tan[0] / tl
        ty = tan[1] / tl
        tz = tan[2] / tl
        // Carry the previous ring's frame along the curve so it never twists.
        nx = py * tz - pz * ty
        ny = pz * tx - px * tz
        nz = px * ty - py * tx
        const nl = Math.hypot(nx, ny, nz) || 1
        nx /= nl
        ny /= nl
        nz /= nl
        bx = ty * nz - tz * ny
        by = tz * nx - tx * nz
        bz = tx * ny - ty * nx
        px = bx
        py = by
        pz = bz
        rad = radii[i] + (radii[i + 1] - radii[i]) * f
        ringRad = rad
      } else {
        // Cap ring: a smaller circle further along the tangent, normals tipping forward.
        const th = ((r - BODY + 1) / (CAP + 1)) * (Math.PI / 2)
        ringRad = rad * Math.cos(th)
        fwd = rad * Math.sin(th)
        lean = Math.sin(th)
      }
      const side = Math.sqrt(1 - lean * lean)
      for (let s = 0; s < SIDES; s++) {
        const a = (s / SIDES) * Math.PI * 2
        const cs = Math.cos(a)
        const sn = Math.sin(a)
        const ox = nx * cs + bx * sn
        const oy = ny * cs + by * sn
        const oz = nz * cs + bz * sn
        const j = (r * SIDES + s) * 3
        pos[j] = c[0] + tx * fwd + ox * ringRad
        pos[j + 1] = c[1] + ty * fwd + oy * ringRad
        pos[j + 2] = c[2] + tz * fwd + oz * ringRad
        nrm[j] = ox * side + tx * lean
        nrm[j + 1] = oy * side + ty * lean
        nrm[j + 2] = oz * side + tz * lean
      }
    }
    const j = RINGS * SIDES * 3
    pos[j] = c[0] + tx * rad
    pos[j + 1] = c[1] + ty * rad
    pos[j + 2] = c[2] + tz * rad
    nrm[j] = tx
    nrm[j + 1] = ty
    nrm[j + 2] = tz
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.normal.needsUpdate = true
  }
}

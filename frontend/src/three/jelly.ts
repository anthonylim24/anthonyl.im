/**
 * Shape-matching soft body — Müller et al. 2005, "Meshless Deformations Based
 * on Shape Matching", with the linear-deformation blend (β) for cartoon
 * squash, and the rotation extraction from Müller et al. 2016, "A Robust
 * Method to Extract the Rotational Part of Deformations".
 *
 * Every particle is pulled toward where the rest shape would sit under the
 * body's best-fit rotation + (volume-normalised) stretch, so the blob jiggles,
 * squashes on the floor, stretches when grabbed, and always springs back.
 *
 * Contacts are solved the position-based way, in small steps: every step
 * projects particles out of the floor and out of any static colliders
 * (physics.ts), takes velocities from the corrected positions, then rubs the
 * touching particles (friction, which is also what makes a ball roll and
 * spin) and gives the body back a share of its approach speed (restitution).
 * A fast body takes more, smaller steps, and an inner core sphere is kept out
 * of every collider, so nothing tunnels through a thin rim or post.
 *
 * Pure math on typed arrays: no GPU, no three.js, unit-testable. `x` can be
 * handed to a BufferAttribute directly (see jellyMesh.ts).
 */
import { sdf, type Collider } from './physics'

export type Vec3 = [number, number, number]

export type JellyOptions = {
  /** Pull toward the goal shape, as a fraction per 1/60 s (0..1). */
  stiffness?: number
  /** 0 = rotation only (firm), 1 = full linear deformation (gooey). */
  beta?: number
  /** Velocity decay rate per second. */
  damping?: number
  gravity?: Vec3
  /** Horizontal floor at this y, or null for none. */
  floor?: number | null
  /** Tangential velocity kept per 1/60 s while touching the floor. */
  friction?: number
  /**
   * Furthest a particle may stray from its goal position, in world units.
   * Keeps a hard shake or throw from folding the surface over itself.
   */
  maxStray?: number
  substeps?: number
  /** Share of the approach speed given back by a bounce (0 = none; the floor and each collider scale it). */
  restitution?: number
}

const EPS = 1e-9
const NO_COLLIDERS: readonly Collider[] = []
const MAX_STEPS = 8

export class Jelly {
  readonly count: number
  /** Live particle positions (x, y, z interleaved). */
  readonly x: Float32Array
  readonly v: Float32Array
  /**
   * Where shape matching wants each particle: the rest shape under the body's
   * best-fit turn and stretch. Always a smooth surface, however rough `x` is
   * (see `skinJelly` in jellyMesh.ts).
   */
  readonly goal: Float32Array
  /** Current centroid. */
  readonly center: Vec3 = [0, 0, 0]
  /** Uniform goal scale. Animate it to inflate / breathe. */
  scale = 1
  /** World-axis goal scale, applied after rotation (squash & stretch). */
  squash: Vec3 = [1, 1, 1]
  /** Optional spring that holds the centroid near a target (floating bodies). */
  anchor: { target: Vec3; k: number; c: number } | null = null
  /** Particles touching the floor in the last step. */
  contacts = 0
  /**
   * Pull the goal rotation toward `uprightTarget`, as a fraction per 1/60 s
   * (0 = free tumbling). Characters with a face use it to right themselves.
   */
  upright = 0
  uprightTarget: [number, number, number, number] = [0, 0, 0, 1]

  stiffness: number
  beta: number
  damping: number
  gravity: Vec3
  floor: number | null
  friction: number
  maxStray: number
  substeps: number
  restitution: number
  /** Slower approaches than this do not bounce (the body just settles). */
  bounceMin = 1.5
  /** Static shapes to stay out of. Shared, not copied: the owner may move them. */
  colliders: readonly Collider[] = NO_COLLIDERS
  /** Radius of an inner sphere that is never allowed inside a collider (0 = off). */
  core = 0
  /** Furthest the body may travel in one small step; a fast body takes more steps. */
  maxTravel = Infinity
  /** Particles touching a collider in the last step. */
  touching = 0
  /** Hardest approach speed into a floor or collider since the owner last cleared it. */
  impact = 0

  private readonly q: Float32Array
  /** Furthest rest particle from the centroid: with `scale`, a bounding sphere. */
  private readonly span: number
  /** Per particle: the contact normal, and how much tangential velocity the contact keeps (0 = not touching). */
  private readonly cn: Float32Array
  private readonly cf: Float32Array
  private readonly sN: Vec3 = [0, 0, 0]
  private readonly rest0: Vec3
  private readonly aqq: number[]
  private readonly p: Float32Array
  /** Best-fit rotation as a quaternion (x, y, z, w), warm-started every step. */
  readonly rotation: [number, number, number, number] = [0, 0, 0, 1]
  /** Blended goal matrix from the last substep (row-major 3×3). */
  private readonly m = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  private readonly pins = new Map<number, { target: Vec3; k: number }>()
  // Scratch for step(): it runs every frame for every body, so it allocates nothing.
  private readonly sVbar: Vec3 = [0, 0, 0]
  private readonly sC: Vec3 = [0, 0, 0]
  private readonly sApq = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  private readonly sA = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  private readonly sR = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  private readonly sGoal: [number, number, number, number] = [0, 0, 0, 1]

  constructor(rest: ArrayLike<number>, opts: JellyOptions = {}) {
    this.count = Math.floor(rest.length / 3)
    this.x = Float32Array.from(rest)
    this.v = new Float32Array(this.count * 3)
    this.goal = Float32Array.from(rest)
    this.p = new Float32Array(this.count * 3)
    this.q = new Float32Array(this.count * 3)
    this.stiffness = opts.stiffness ?? 0.07
    this.beta = opts.beta ?? 0.5
    this.damping = opts.damping ?? 1.5
    this.gravity = opts.gravity ?? [0, 0, 0]
    this.floor = opts.floor ?? null
    this.friction = opts.friction ?? 0.6
    this.maxStray = opts.maxStray ?? Infinity
    this.substeps = opts.substeps ?? 3
    this.restitution = opts.restitution ?? 0
    this.cn = new Float32Array(this.count * 3)
    this.cf = new Float32Array(this.count)

    const c = centroid(this.x, this.count)
    this.rest0 = c
    this.center[0] = c[0]
    this.center[1] = c[1]
    this.center[2] = c[2]
    const s = [0, 0, 0, 0, 0, 0, 0, 0, 0]
    for (let i = 0; i < this.count; i++) {
      const qx = this.x[i * 3] - c[0]
      const qy = this.x[i * 3 + 1] - c[1]
      const qz = this.x[i * 3 + 2] - c[2]
      this.q[i * 3] = qx
      this.q[i * 3 + 1] = qy
      this.q[i * 3 + 2] = qz
      s[0] += qx * qx; s[1] += qx * qy; s[2] += qx * qz
      s[3] += qy * qx; s[4] += qy * qy; s[5] += qy * qz
      s[6] += qz * qx; s[7] += qz * qy; s[8] += qz * qz
    }
    this.aqq = invert3(s)
    let span = 0
    for (let i = 0; i < this.count * 3; i += 3) span = Math.max(span, Math.hypot(this.q[i], this.q[i + 1], this.q[i + 2]))
    this.span = span
  }

  /** Turning rate about the centroid (rad/s, world axes), as if the body were a rigid shell. */
  angularVelocity(out: Vec3 = [0, 0, 0]): Vec3 {
    const { x, v, count } = this
    const [cx, cy, cz] = this.center
    let mx = 0
    let my = 0
    let mz = 0
    for (let i = 0; i < count * 3; i += 3) {
      mx += v[i]
      my += v[i + 1]
      mz += v[i + 2]
    }
    mx /= count
    my /= count
    mz /= count
    let lx = 0
    let ly = 0
    let lz = 0
    let r2 = 0
    for (let i = 0; i < count * 3; i += 3) {
      const rx = x[i] - cx
      const ry = x[i + 1] - cy
      const rz = x[i + 2] - cz
      const vx = v[i] - mx
      const vy = v[i + 1] - my
      const vz = v[i + 2] - mz
      lx += ry * vz - rz * vy
      ly += rz * vx - rx * vz
      lz += rx * vy - ry * vx
      r2 += rx * rx + ry * ry + rz * rz
    }
    // Σ r × (ω × r) over a shell is ⅔ ω Σ|r|².
    const k = r2 > EPS ? 1.5 / r2 : 0
    out[0] = lx * k
    out[1] = ly * k
    out[2] = lz * k
    return out
  }

  /** Mean distance of particles from the centroid. */
  get radius() {
    let r = 0
    for (let i = 0; i < this.count; i++) {
      r += Math.hypot(this.x[i * 3] - this.center[0], this.x[i * 3 + 1] - this.center[1], this.x[i * 3 + 2] - this.center[2])
    }
    return r / Math.max(1, this.count)
  }

  /** Mean particle velocity. */
  velocity(out: Vec3 = [0, 0, 0]): Vec3 {
    out[0] = out[1] = out[2] = 0
    for (let i = 0; i < this.count; i++) {
      out[0] += this.v[i * 3]
      out[1] += this.v[i * 3 + 1]
      out[2] += this.v[i * 3 + 2]
    }
    out[0] /= this.count
    out[1] /= this.count
    out[2] /= this.count
    return out
  }

  /** Move the whole body (positions only; velocities untouched). */
  translate(dx: number, dy: number, dz: number) {
    for (let i = 0; i < this.count; i++) {
      this.x[i * 3] += dx
      this.x[i * 3 + 1] += dy
      this.x[i * 3 + 2] += dz
    }
    this.center[0] += dx
    this.center[1] += dy
    this.center[2] += dz
    for (let i = 0; i < this.count * 3; i += 3) {
      this.goal[i] += dx
      this.goal[i + 1] += dy
      this.goal[i + 2] += dz
    }
  }

  /** Add velocity to particles near `point`, with a smooth falloff over `radius`. */
  impulse(point: Vec3, velocity: Vec3, radius: number) {
    const r2 = radius * radius
    for (let i = 0; i < this.count; i++) {
      const dx = this.x[i * 3] - point[0]
      const dy = this.x[i * 3 + 1] - point[1]
      const dz = this.x[i * 3 + 2] - point[2]
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 >= r2) continue
      const w = (1 - d2 / r2) ** 2
      this.v[i * 3] += velocity[0] * w
      this.v[i * 3 + 1] += velocity[1] * w
      this.v[i * 3 + 2] += velocity[2] * w
    }
  }

  /** Add the same velocity to every particle (hops, shoves). */
  kick(vx: number, vy: number, vz: number) {
    for (let i = 0; i < this.count; i++) {
      this.v[i * 3] += vx
      this.v[i * 3 + 1] += vy
      this.v[i * 3 + 2] += vz
    }
  }

  /** Add angular velocity (rad/s, world axes) about the centroid: flips, spins. */
  spin(wx: number, wy: number, wz: number) {
    const [cx, cy, cz] = this.center
    for (let i = 0; i < this.count * 3; i += 3) {
      const rx = this.x[i] - cx
      const ry = this.x[i + 1] - cy
      const rz = this.x[i + 2] - cz
      this.v[i] += wy * rz - wz * ry
      this.v[i + 1] += wz * rx - wx * rz
      this.v[i + 2] += wx * ry - wy * rx
    }
  }

  /**
   * Turn the whole body (positions and velocities) about its centroid by
   * `angle` radians around a unit axis. A rigid turn: nothing deforms, so a
   * choreographed flip or pirouette keeps its shape.
   */
  rotate(ax: number, ay: number, az: number, angle: number) {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const k = 1 - c
    const [cx, cy, cz] = this.center
    const turn = (arr: Float32Array, i: number, ox: number, oy: number, oz: number) => {
      const x = arr[i] - ox
      const y = arr[i + 1] - oy
      const z = arr[i + 2] - oz
      const d = (ax * x + ay * y + az * z) * k
      arr[i] = ox + x * c + (ay * z - az * y) * s + ax * d
      arr[i + 1] = oy + y * c + (az * x - ax * z) * s + ay * d
      arr[i + 2] = oz + z * c + (ax * y - ay * x) * s + az * d
    }
    for (let i = 0; i < this.count * 3; i += 3) {
      turn(this.x, i, cx, cy, cz)
      turn(this.v, i, 0, 0, 0)
    }
  }

  nearest(point: Vec3): number {
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < this.count; i++) {
      const d = (this.x[i * 3] - point[0]) ** 2 + (this.x[i * 3 + 1] - point[1]) ** 2 + (this.x[i * 3 + 2] - point[2]) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }

  /** Indices of particles within `radius` of `point`. */
  within(point: Vec3, radius: number): number[] {
    const r2 = radius * radius
    const out: number[] = []
    for (let i = 0; i < this.count; i++) {
      const d = (this.x[i * 3] - point[0]) ** 2 + (this.x[i * 3 + 1] - point[1]) ** 2 + (this.x[i * 3 + 2] - point[2]) ** 2
      if (d < r2) out.push(i)
    }
    return out
  }

  /** Pull particle `i` toward `target` (k = fraction per substep). */
  pin(i: number, target: Vec3, k = 0.35) {
    this.pins.set(i, { target, k })
  }

  unpinAll() {
    this.pins.clear()
  }

  /**
   * Where a point glued to the rest shape sits now (eyes, flags, labels).
   * Uses the last goal transform, so features ride the jiggle smoothly.
   */
  attach(restPoint: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
    const m = this.m
    const qx = restPoint[0] - this.rest0[0]
    const qy = restPoint[1] - this.rest0[1]
    const qz = restPoint[2] - this.rest0[2]
    const s = this.scale
    out[0] = this.center[0] + this.squash[0] * s * (m[0] * qx + m[1] * qy + m[2] * qz)
    out[1] = this.center[1] + this.squash[1] * s * (m[3] * qx + m[4] * qy + m[5] * qz)
    out[2] = this.center[2] + this.squash[2] * s * (m[6] * qx + m[7] * qy + m[8] * qz)
    return out
  }

  step(dt: number) {
    if (dt <= 0) return
    let n = Math.max(1, this.substeps)
    if (this.maxTravel < Infinity) {
      // Small steps: never further than `maxTravel` at a time, so thin things are not stepped over.
      this.velocity(this.sVbar)
      const far = Math.hypot(this.sVbar[0], this.sVbar[1], this.sVbar[2]) * dt
      n = Math.min(MAX_STEPS, Math.max(n, Math.ceil(far / this.maxTravel)))
    }
    const h = dt / n
    const pull = 1 - Math.pow(1 - Math.min(0.999, this.stiffness), h * 60)
    const rightBy = this.upright > 0 ? 1 - Math.pow(1 - Math.min(0.999, this.upright), h * 60) : 0
    const goalRot = this.sGoal
    const keep = Math.exp(-this.damping * h)
    const slide = Math.pow(this.friction, h * 60)
    const { x, v, p, q, count, cn, cf } = this
    const colliders = this.colliders
    const reach = this.span * this.scale * Math.max(this.squash[0], this.squash[1], this.squash[2]) * 1.3 + 0.05
    const N = this.sN
    const [gx, gy, gz] = this.gravity
    const vbar = this.sVbar
    const apq = this.sApq
    const a = this.sA
    const r = this.sR

    for (let s = 0; s < n; s++) {
      // External forces + anchor spring on the centroid.
      let ax = gx
      let ay = gy
      let az = gz
      if (this.anchor) {
        this.velocity(vbar)
        const { target, k, c } = this.anchor
        ax += k * (target[0] - this.center[0]) - c * vbar[0]
        ay += k * (target[1] - this.center[1]) - c * vbar[1]
        az += k * (target[2] - this.center[2]) - c * vbar[2]
      }
      // Mean velocity going into the step: what a bounce is measured against.
      let ux = 0
      let uy = 0
      let uz = 0
      for (let i = 0; i < count * 3; i += 3) {
        v[i] += ax * h
        v[i + 1] += ay * h
        v[i + 2] += az * h
        ux += v[i]
        uy += v[i + 1]
        uz += v[i + 2]
        p[i] = x[i] + v[i] * h
        p[i + 1] = x[i + 1] + v[i + 1] * h
        p[i + 2] = x[i + 2] + v[i + 2] * h
      }

      // Shape matching: centroid, A_pq, rotation, blended goal.
      const c = centroid(p, count, this.sC)
      apq.fill(0)
      for (let i = 0; i < count * 3; i += 3) {
        const px = p[i] - c[0]
        const py = p[i + 1] - c[1]
        const pz = p[i + 2] - c[2]
        const qx = q[i]
        const qy = q[i + 1]
        const qz = q[i + 2]
        apq[0] += px * qx; apq[1] += px * qy; apq[2] += px * qz
        apq[3] += py * qx; apq[4] += py * qy; apq[5] += py * qz
        apq[6] += pz * qx; apq[7] += pz * qy; apq[8] += pz * qz
      }
      extractRotation(apq, this.rotation)
      // The true rotation stays the warm start; only the goal leans upright.
      if (rightBy > 0) nlerpQuat(this.rotation, this.uprightTarget, rightBy, goalRot)
      quatToMat3(rightBy > 0 ? goalRot : this.rotation, r)
      mul3(apq, this.aqq, a)
      const det = det3(a)
      const m = this.m
      if (det > EPS) {
        const inv = 1 / Math.cbrt(det)
        for (let k = 0; k < 9; k++) m[k] = this.beta * a[k] * inv + (1 - this.beta) * r[k]
      } else {
        for (let k = 0; k < 9; k++) m[k] = r[k]
      }
      this.center[0] = c[0]
      this.center[1] = c[1]
      this.center[2] = c[2]

      const stray2 = this.maxStray * this.maxStray
      const sx = this.squash[0] * this.scale
      const sy = this.squash[1] * this.scale
      const sz = this.squash[2] * this.scale
      for (let i = 0; i < count * 3; i += 3) {
        const qx = q[i]
        const qy = q[i + 1]
        const qz = q[i + 2]
        const gx2 = c[0] + sx * (m[0] * qx + m[1] * qy + m[2] * qz)
        const gy2 = c[1] + sy * (m[3] * qx + m[4] * qy + m[5] * qz)
        const gz2 = c[2] + sz * (m[6] * qx + m[7] * qy + m[8] * qz)
        this.goal[i] = gx2
        this.goal[i + 1] = gy2
        this.goal[i + 2] = gz2
        p[i] += (gx2 - p[i]) * pull
        p[i + 1] += (gy2 - p[i + 1]) * pull
        p[i + 2] += (gz2 - p[i + 2]) * pull
        if (stray2 < Infinity) {
          const ex = p[i] - gx2
          const ey = p[i + 1] - gy2
          const ez = p[i + 2] - gz2
          const e2 = ex * ex + ey * ey + ez * ez
          if (e2 > stray2) {
            const k = Math.sqrt(stray2 / e2)
            p[i] = gx2 + ex * k
            p[i + 1] = gy2 + ey * k
            p[i + 2] = gz2 + ez * k
          }
        }
      }

      for (const [i, pin] of this.pins) {
        const j = i * 3
        p[j] += (pin.target[0] - p[j]) * pin.k
        p[j + 1] += (pin.target[1] - p[j + 1]) * pin.k
        p[j + 2] += (pin.target[2] - p[j + 2]) * pin.k
      }

      // Contacts: out of every collider, then the floor (which always wins).
      let nx = 0
      let ny = 0
      let nz = 0
      let depth = 0
      let spring = 0
      let touching = 0
      cf.fill(0)
      for (let k = 0; k < colliders.length; k++) {
        const col = colliders[k]
        col.touch = false
        if (!col.on) continue
        const far = reach + col.reach
        const bx = c[0] - col.centre[0]
        const by = c[1] - col.centre[1]
        const bz = c[2] - col.centre[2]
        if (bx * bx + by * by + bz * bz > far * far) continue
        const keepT = Math.pow(col.friction, h * 60)
        for (let i = 0, j = 0; i < count * 3; i += 3, j++) {
          const d = sdf(col, p[i], p[i + 1], p[i + 2], N)
          if (d >= 0) continue
          p[i] -= N[0] * d
          p[i + 1] -= N[1] * d
          p[i + 2] -= N[2] * d
          cn[i] = N[0]
          cn[i + 1] = N[1]
          cn[i + 2] = N[2]
          cf[j] = keepT
          nx -= N[0] * d
          ny -= N[1] * d
          nz -= N[2] * d
          depth -= d
          spring -= d * col.bounce
          touching++
          col.touch = true
        }
        // The core: the whole body backs out before its middle can pass through.
        if (this.core > 0) {
          const d = sdf(col, c[0], c[1], c[2], N) - this.core * this.scale
          if (d < 0) {
            for (let i = 0; i < count * 3; i += 3) {
              p[i] -= N[0] * d
              p[i + 1] -= N[1] * d
              p[i + 2] -= N[2] * d
            }
            const w = -d * count
            nx += N[0] * w
            ny += N[1] * w
            nz += N[2] * w
            depth += w
            spring += w * col.bounce
            col.touch = true
          }
        }
      }
      let contacts = 0
      const floor = this.floor
      if (floor !== null) {
        for (let i = 0, j = 0; i < count * 3; i += 3, j++) {
          if (p[i + 1] >= floor) continue
          const d = floor - p[i + 1]
          p[i + 1] = floor
          cn[i] = 0
          cn[i + 1] = 1
          cn[i + 2] = 0
          cf[j] = slide
          ny += d
          depth += d
          spring += d
          contacts++
        }
      }

      // Velocities from the corrected positions; touching particles lose their
      // approach and some of their slide (friction, and so rolling).
      for (let i = 0, j = 0; i < count * 3; i += 3, j++) {
        let vx = ((p[i] - x[i]) / h) * keep
        let vy = ((p[i + 1] - x[i + 1]) / h) * keep
        let vz = ((p[i + 2] - x[i + 2]) / h) * keep
        const kt = cf[j]
        if (kt > 0) {
          const vn = vx * cn[i] + vy * cn[i + 1] + vz * cn[i + 2]
          const out = vn > 0 ? vn : 0
          vx = (vx - vn * cn[i]) * kt + out * cn[i]
          vy = (vy - vn * cn[i + 1]) * kt + out * cn[i + 1]
          vz = (vz - vn * cn[i + 2]) * kt + out * cn[i + 2]
        }
        v[i] = vx
        v[i + 1] = vy
        v[i + 2] = vz
        x[i] = p[i]
        x[i + 1] = p[i + 1]
        x[i + 2] = p[i + 2]
      }
      this.contacts = contacts
      this.touching = touching

      // Restitution, for the body as a whole: shape matching would swallow a
      // per-particle bounce, so the body gets back a share of the speed it
      // arrived with, along the mean contact normal.
      const nl = Math.hypot(nx, ny, nz)
      if (depth > 0 && nl > EPS) {
        nx /= nl
        ny /= nl
        nz /= nl
        const approach = -(ux * nx + uy * ny + uz * nz) / count
        if (approach > this.bounceMin) {
          if (approach > this.impact) this.impact = approach
          for (let k = 0; k < colliders.length; k++) if (colliders[k].touch && approach > colliders[k].hit) colliders[k].hit = approach
          const e = this.restitution * (spring / depth)
          if (e > 0 && this.pins.size === 0) {
            this.velocity(vbar)
            const dv = e * approach - (vbar[0] * nx + vbar[1] * ny + vbar[2] * nz)
            if (dv > 0) this.kick(nx * dv, ny * dv, nz * dv)
          }
        }
      }
    }
    centroid(x, count, this.center)
  }
}

function centroid(x: Float32Array, n: number, out: Vec3 = [0, 0, 0]): Vec3 {
  let cx = 0
  let cy = 0
  let cz = 0
  for (let i = 0; i < n * 3; i += 3) {
    cx += x[i]
    cy += x[i + 1]
    cz += x[i + 2]
  }
  out[0] = cx / n
  out[1] = cy / n
  out[2] = cz / n
  return out
}

function det3(m: number[]) {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  )
}

function invert3(m: number[]): number[] {
  const d = det3(m)
  if (Math.abs(d) < EPS) return [1, 0, 0, 0, 1, 0, 0, 0, 1]
  const i = 1 / d
  return [
    (m[4] * m[8] - m[5] * m[7]) * i,
    (m[2] * m[7] - m[1] * m[8]) * i,
    (m[1] * m[5] - m[2] * m[4]) * i,
    (m[5] * m[6] - m[3] * m[8]) * i,
    (m[0] * m[8] - m[2] * m[6]) * i,
    (m[2] * m[3] - m[0] * m[5]) * i,
    (m[3] * m[7] - m[4] * m[6]) * i,
    (m[1] * m[6] - m[0] * m[7]) * i,
    (m[0] * m[4] - m[1] * m[3]) * i,
  ]
}

function mul3(a: number[], b: number[], out: number[]) {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]
    }
  }
}

function quatToMat3(q: [number, number, number, number], out: number[]) {
  const [x, y, z, w] = q
  out[0] = 1 - 2 * (y * y + z * z)
  out[1] = 2 * (x * y - z * w)
  out[2] = 2 * (x * z + y * w)
  out[3] = 2 * (x * y + z * w)
  out[4] = 1 - 2 * (x * x + z * z)
  out[5] = 2 * (y * z - x * w)
  out[6] = 2 * (x * z - y * w)
  out[7] = 2 * (y * z + x * w)
  out[8] = 1 - 2 * (x * x + y * y)
}

function nlerpQuat(
  a: [number, number, number, number],
  b: [number, number, number, number],
  t: number,
  out: [number, number, number, number],
) {
  const sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1
  for (let k = 0; k < 4; k++) out[k] = a[k] + (sign * b[k] - a[k]) * t
  const len = Math.hypot(out[0], out[1], out[2], out[3]) || 1
  for (let k = 0; k < 4; k++) out[k] /= len
}

/** Müller 2016: iterate q toward the rotational part of A (warm-started). */
export function extractRotation(a: number[], q: [number, number, number, number], iterations = 8) {
  const r = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (let it = 0; it < iterations; it++) {
    quatToMat3(q, r)
    // ω = Σ r_i × a_i / |Σ r_i · a_i|, over columns i.
    let ox = 0
    let oy = 0
    let oz = 0
    let dot = 0
    for (let c = 0; c < 3; c++) {
      const rx = r[c]
      const ry = r[3 + c]
      const rz = r[6 + c]
      const ax = a[c]
      const ay = a[3 + c]
      const az = a[6 + c]
      ox += ry * az - rz * ay
      oy += rz * ax - rx * az
      oz += rx * ay - ry * ax
      dot += rx * ax + ry * ay + rz * az
    }
    const inv = 1 / (Math.abs(dot) + EPS)
    ox *= inv
    oy *= inv
    oz *= inv
    const w = Math.hypot(ox, oy, oz)
    if (w < 1e-9) break
    const s = Math.sin(w / 2) / w
    const dx = ox * s
    const dy = oy * s
    const dz = oz * s
    const dw = Math.cos(w / 2)
    // q = dq · q
    const [x, y, z, qw] = q
    q[0] = dw * x + dx * qw + dy * z - dz * y
    q[1] = dw * y - dx * z + dy * qw + dz * x
    q[2] = dw * z + dx * y - dy * x + dz * qw
    q[3] = dw * qw - dx * x - dy * y - dz * z
    const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1
    q[0] /= len
    q[1] /= len
    q[2] /= len
    q[3] /= len
  }
  return q
}

/**
 * Indexed icosphere (shared vertices, so the soft body has no seams).
 * Returns rest positions and triangle indices.
 */
export function icosphere(radius: number, detail: number): { positions: Float32Array; index: Uint32Array } {
  const t = (1 + Math.sqrt(5)) / 2
  const verts: Vec3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((p) => normalise(p as Vec3))
  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ]
  for (let d = 0; d < detail; d++) {
    const mid = new Map<string, number>()
    const next: [number, number, number][] = []
    const midpoint = (a: number, b: number) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`
      let i = mid.get(key)
      if (i === undefined) {
        const pa = verts[a]
        const pb = verts[b]
        i = verts.length
        verts.push(normalise([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2]))
        mid.set(key, i)
      }
      return i
    }
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b)
      const bc = midpoint(b, c)
      const ca = midpoint(c, a)
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca])
    }
    faces = next
  }
  const positions = new Float32Array(verts.length * 3)
  verts.forEach((p, i) => {
    positions[i * 3] = p[0] * radius
    positions[i * 3 + 1] = p[1] * radius
    positions[i * 3 + 2] = p[2] * radius
  })
  return { positions, index: Uint32Array.from(faces.flat()) }
}

function normalise(p: Vec3): Vec3 {
  const l = Math.hypot(p[0], p[1], p[2]) || 1
  return [p[0] / l, p[1] / l, p[2] / l]
}

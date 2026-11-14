/**
 * Static colliders and body-to-body contact for Jelly soft bodies.
 *
 * A collider is a signed distance field with a gradient: sphere, capsule
 * (posts, bars), rounded box turned about +y (a backboard, a net panel) or a
 * torus lying flat (a rim). `Jelly.step` projects particles out of them every
 * small step, with Coulomb-style friction and restitution, and keeps an inner
 * core sphere out as well so a fast body cannot tunnel through a thin one.
 *
 * `bodyImpulse` is the velocity half of a contact between two bodies treated
 * as spheres: restitution along the normal, friction across it, and the spin
 * that friction puts on each body.
 *
 * Pure math, no allocation per call.
 */
import type { Jelly, Vec3 } from './jelly'

export type Collider = {
  kind: 'sphere' | 'capsule' | 'box' | 'torus'
  /** Centre (sphere, box, torus) or one end (capsule). */
  a: Vec3
  /** The other end (capsule) or the half extents before rounding (box). */
  b: Vec3
  /** Radius: of the sphere, the capsule, the box's rounded edge, the torus tube. */
  r: number
  /** Torus ring radius. */
  R: number
  /** Box turn about +y. */
  cos: number
  sin: number
  /** Scales the body's own restitution (1 = as bouncy as the floor, 0 = dead, like a net). */
  bounce: number
  /** Tangential velocity kept per 1/60 s of contact. */
  friction: number
  on: boolean
  /** Hardest approach speed of a body that bounced off it; the owner reads and clears it. */
  hit: number
  /** Bounding sphere, for the broad phase. */
  centre: Vec3
  reach: number
  /** Scratch: touched in the current small step. */
  touch: boolean
}

type Surface = { bounce?: number; friction?: number }

const make = (kind: Collider['kind'], a: Vec3, b: Vec3, r: number, R: number, yaw: number, s: Surface): Collider =>
  bound({
    kind, a: [...a], b: [...b], r, R, cos: Math.cos(yaw), sin: Math.sin(yaw),
    bounce: s.bounce ?? 1, friction: s.friction ?? 0.6, on: true, hit: 0, centre: [0, 0, 0], reach: 0, touch: false,
  })

export const sphereCollider = (c: Vec3, r: number, s: Surface = {}) => make('sphere', c, c, r, 0, 0, s)
export const capsuleCollider = (a: Vec3, b: Vec3, r: number, s: Surface = {}) => make('capsule', a, b, r, 0, 0, s)
export const boxCollider = (c: Vec3, half: Vec3, yaw = 0, round = 0.02, s: Surface = {}) => make('box', c, half, round, 0, yaw, s)
/** A ring lying flat (its axis is +y). */
export const torusCollider = (c: Vec3, R: number, r: number, s: Surface = {}) => make('torus', c, c, r, R, 0, s)

/** Recompute the bounding sphere after moving or resizing a collider. */
export function bound(c: Collider): Collider {
  if (c.kind === 'capsule') {
    c.centre[0] = (c.a[0] + c.b[0]) / 2
    c.centre[1] = (c.a[1] + c.b[1]) / 2
    c.centre[2] = (c.a[2] + c.b[2]) / 2
    c.reach = Math.hypot(c.a[0] - c.b[0], c.a[1] - c.b[1], c.a[2] - c.b[2]) / 2 + c.r
  } else {
    c.centre[0] = c.a[0]
    c.centre[1] = c.a[1]
    c.centre[2] = c.a[2]
    c.reach = c.kind === 'sphere' ? c.r : c.kind === 'torus' ? c.R + c.r : Math.hypot(c.b[0], c.b[1], c.b[2]) + c.r
  }
  return c
}

/** Signed distance from a point to a collider's surface; `n` receives the outward unit normal there. */
export function sdf(c: Collider, x: number, y: number, z: number, n: Vec3): number {
  if (c.kind === 'sphere') {
    const dx = x - c.a[0]
    const dy = y - c.a[1]
    const dz = z - c.a[2]
    const l = Math.hypot(dx, dy, dz)
    if (l < 1e-9) {
      n[0] = 0; n[1] = 1; n[2] = 0
    } else {
      n[0] = dx / l; n[1] = dy / l; n[2] = dz / l
    }
    return l - c.r
  }
  if (c.kind === 'capsule') {
    const ex = c.b[0] - c.a[0]
    const ey = c.b[1] - c.a[1]
    const ez = c.b[2] - c.a[2]
    const px = x - c.a[0]
    const py = y - c.a[1]
    const pz = z - c.a[2]
    const t = Math.min(1, Math.max(0, (px * ex + py * ey + pz * ez) / (ex * ex + ey * ey + ez * ez || 1)))
    const dx = px - ex * t
    const dy = py - ey * t
    const dz = pz - ez * t
    const l = Math.hypot(dx, dy, dz)
    if (l < 1e-9) {
      n[0] = 0; n[1] = 1; n[2] = 0
    } else {
      n[0] = dx / l; n[1] = dy / l; n[2] = dz / l
    }
    return l - c.r
  }
  if (c.kind === 'torus') {
    const dx = x - c.a[0]
    const dz = z - c.a[2]
    const dy = y - c.a[1]
    const ring = Math.hypot(dx, dz)
    const q = ring - c.R
    const l = Math.hypot(q, dy)
    if (l < 1e-9 || ring < 1e-9) {
      n[0] = 0; n[1] = dy < 0 ? -1 : 1; n[2] = 0
    } else {
      n[0] = (dx / ring) * (q / l); n[1] = dy / l; n[2] = (dz / ring) * (q / l)
    }
    return l - c.r
  }
  // Rounded box, turned about +y: into its own frame, measure, and turn the normal back.
  const wx = x - c.a[0]
  const wz = z - c.a[2]
  const lx = wx * c.cos - wz * c.sin
  const ly = y - c.a[1]
  const lz = wx * c.sin + wz * c.cos
  const qx = Math.abs(lx) - c.b[0]
  const qy = Math.abs(ly) - c.b[1]
  const qz = Math.abs(lz) - c.b[2]
  let nx = 0
  let ny = 0
  let nz = 0
  let d: number
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  const oz = Math.max(qz, 0)
  const out = Math.hypot(ox, oy, oz)
  if (out > 1e-9) {
    nx = (Math.sign(lx) * ox) / out
    ny = (Math.sign(ly) * oy) / out
    nz = (Math.sign(lz) * oz) / out
    d = out - c.r
  } else {
    // Inside: out through the nearest face.
    d = Math.max(qx, qy, qz) - c.r
    if (qx >= qy && qx >= qz) nx = lx < 0 ? -1 : 1
    else if (qy >= qz) ny = ly < 0 ? -1 : 1
    else nz = lz < 0 ? -1 : 1
  }
  n[0] = nx * c.cos + nz * c.sin
  n[1] = ny
  n[2] = -nx * c.sin + nz * c.cos
  return d
}

const va: Vec3 = [0, 0, 0]
const vb: Vec3 = [0, 0, 0]
const oa: Vec3 = [0, 0, 0]
const ob: Vec3 = [0, 0, 0]

export type ContactOptions = {
  /** Share of the correction each body takes (inverse-mass fractions; they sum to 1). */
  wa: number
  wb: number
  /** Distance from each centre to the contact point. */
  ra: number
  rb: number
  restitution: number
  /** Coulomb coefficient: the most friction a contact can give, as a share of its normal impulse. */
  friction: number
  /** Let friction turn each body (off for a character that rights itself). */
  spinA?: boolean
  spinB?: boolean
}

/**
 * Two bodies touching along the unit normal (nx, ny, nz), pointing from A to
 * B: bounce them apart, rub them against each other, and let the rub spin
 * them. Returns the normal impulse (as a closing speed), 0 if they were
 * already separating.
 */
export function bodyImpulse(A: Jelly, B: Jelly, nx: number, ny: number, nz: number, o: ContactOptions): number {
  A.velocity(va)
  B.velocity(vb)
  A.angularVelocity(oa)
  B.angularVelocity(ob)
  // Surface velocities at the contact: v + ω × r, with r = +n·ra on A and −n·rb on B.
  const ax = va[0] + (oa[1] * nz - oa[2] * ny) * o.ra
  const ay = va[1] + (oa[2] * nx - oa[0] * nz) * o.ra
  const az = va[2] + (oa[0] * ny - oa[1] * nx) * o.ra
  const bx = vb[0] - (ob[1] * nz - ob[2] * ny) * o.rb
  const by = vb[1] - (ob[2] * nx - ob[0] * nz) * o.rb
  const bz = vb[2] - (ob[0] * ny - ob[1] * nx) * o.rb
  const closing = (vb[0] - va[0]) * nx + (vb[1] - va[1]) * ny + (vb[2] - va[2]) * nz
  if (closing >= 0) return 0
  const j = -(1 + o.restitution) * closing
  A.kick(-nx * j * o.wa, -ny * j * o.wa, -nz * j * o.wa)
  B.kick(nx * j * o.wb, ny * j * o.wb, nz * j * o.wb)

  // Friction opposes the slip between the two surfaces, up to μ times the normal impulse.
  const rx = bx - ax
  const ry = by - ay
  const rz = bz - az
  const rn = rx * nx + ry * ny + rz * nz
  const tx = rx - rn * nx
  const ty = ry - rn * ny
  const tz = rz - rn * nz
  const slip = Math.hypot(tx, ty, tz)
  if (slip < 1e-4 || o.friction <= 0) return j
  // A hollow ball takes up 2/5 of the slip before it is rolling rather than sliding.
  const jt = Math.min(o.friction * j, slip * 0.4)
  const dx = tx / slip
  const dy = ty / slip
  const dz = tz / slip
  A.kick(dx * jt * o.wa, dy * jt * o.wa, dz * jt * o.wa)
  B.kick(-dx * jt * o.wb, -dy * jt * o.wb, -dz * jt * o.wb)
  // Δω = r × J / I, with I = ⅔ r² for a shell: both bodies turn about n × slip.
  const cx = ny * dz - nz * dy
  const cy = nz * dx - nx * dz
  const cz = nx * dy - ny * dx
  if (o.spinA !== false) {
    const k = (jt * o.wa * 1.5) / Math.max(0.05, o.ra)
    A.spin(cx * k, cy * k, cz * k)
  }
  if (o.spinB !== false) {
    const k = (jt * o.wb * 1.5) / Math.max(0.05, o.rb)
    B.spin(cx * k, cy * k, cz * k)
  }
  return j
}

import { describe, expect, it } from 'vitest'
import { Jelly, type Vec3 } from './jelly'
import { bodyImpulse, boxCollider, capsuleCollider, sdf, sphereCollider, torusCollider } from './physics'

/** A small ball of particles: an octahedron, subdivided once. */
function ball(r: number, at: Vec3): number[] {
  const dirs: Vec3[] = []
  for (const a of [-1, 1]) dirs.push([a, 0, 0], [0, a, 0], [0, 0, a])
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) dirs.push([x, y, z])
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]] as const)
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const d: Vec3 = [0, 0, 0]
      d[i] = a
      d[j] = b
      dirs.push(d)
    }
  return dirs.flatMap((d) => {
    const l = Math.hypot(...d)
    return [at[0] + (d[0] / l) * r, at[1] + (d[1] / l) * r, at[2] + (d[2] / l) * r]
  })
}
const run = (j: Jelly, seconds: number, each?: () => void) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    j.step(1 / 60)
    each?.()
  }
}
const n: Vec3 = [0, 0, 0]
const v: Vec3 = [0, 0, 0]

describe('sdf', () => {
  it('measures a sphere and a capsule', () => {
    expect(sdf(sphereCollider([1, 2, 3], 0.5), 1, 4, 3, n)).toBeCloseTo(1.5)
    expect(n).toEqual([0, 1, 0])
    const post = capsuleCollider([0, 0, 0], [0, 2, 0], 0.1)
    expect(sdf(post, 1, 1, 0, n)).toBeCloseTo(0.9)
    expect(n[0]).toBeCloseTo(1)
    expect(sdf(post, 0, 3, 0, n)).toBeCloseTo(0.9)
  })

  it('measures a torus through its hole and on its tube', () => {
    const rim = torusCollider([0, 1, 0], 0.5, 0.05)
    // The middle of the hole is a ring radius away from the tube.
    expect(sdf(rim, 0, 1, 0, n)).toBeCloseTo(0.45)
    expect(sdf(rim, 0.5, 1.2, 0, n)).toBeCloseTo(0.15)
    expect(n[1]).toBeCloseTo(1)
    expect(sdf(rim, 0.5, 1, 0, n)).toBeCloseTo(-0.05)
  })

  it('turns a box about y, and pushes out through the nearest face from inside', () => {
    const wall = boxCollider([0, 0, 0], [1, 1, 0.1], Math.PI / 2, 0)
    // Turned a quarter, its thin side lies along x.
    expect(sdf(wall, 0.5, 0, 0, n)).toBeCloseTo(0.4)
    expect(Math.abs(n[0])).toBeCloseTo(1)
    expect(sdf(wall, 0, 0, 0.5, n)).toBeLessThan(0)
    const slab = boxCollider([0, 0, 0], [1, 0.2, 1], 0, 0)
    expect(sdf(slab, 0.1, 0.15, 0, n)).toBeCloseTo(-0.05)
    expect(n).toEqual([0, 1, 0])
  })
})

describe('Jelly against colliders', () => {
  const make = (at: Vec3, opts = {}) => {
    const j = new Jelly(ball(0.3, at), { gravity: [0, -16, 0], floor: 0, damping: 0.2, stiffness: 0.5, friction: 0.86, substeps: 2, ...opts })
    j.core = 0.16
    j.maxTravel = 0.15
    return j
  }

  it('a bouncy body gives back most of a fall; a dead one does not', () => {
    const peak = (restitution: number) => {
      const j = make([0, 2, 0], { restitution })
      let landed = false
      let top = 0
      run(j, 2.2, () => {
        if (j.contacts > 0) landed = true
        else if (landed) top = Math.max(top, j.center[1])
      })
      return top
    }
    expect(peak(0.72)).toBeGreaterThan(0.9)
    expect(peak(0)).toBeLessThan(0.55)
  })

  it('bounces off a wall and reports the hit', () => {
    const board = boxCollider([2, 1, 0], [0.05, 1, 1], 0, 0.02)
    const j = make([0, 1, 0], { restitution: 0.7, gravity: [0, 0, 0], floor: null })
    j.colliders = [board]
    j.kick(8, 0, 0)
    let hit = 0
    run(j, 0.6, () => (hit = Math.max(hit, board.hit)))
    j.velocity(v)
    expect(v[0]).toBeLessThan(-2)
    expect(j.center[0]).toBeLessThan(1.7)
    expect(hit).toBeGreaterThan(4)
  })

  it('never tunnels through a thin bar, however fast', () => {
    for (const speed of [15, 40, 90]) {
      const bar = capsuleCollider([2, -2, 0], [2, 4, 0], 0.04)
      const j = make([0, 1, 0], { gravity: [0, 0, 0], floor: null, restitution: 0.5 })
      j.colliders = [bar]
      j.kick(speed, 0, 0)
      run(j, 0.5)
      expect(j.center[0], `at ${speed}`).toBeLessThan(2)
    }
  })

  it('drops through a rim wider than itself and rests on one too small for its core', () => {
    const through = make([0, 2.2, 0])
    through.colliders = [torusCollider([0, 1.2, 0], 0.56, 0.04)]
    run(through, 1.5)
    expect(through.center[1]).toBeLessThan(0.5)
    const stuck = make([0, 2.2, 0])
    // Soft bodies squeeze; the core does not.
    stuck.colliders = [torusCollider([0, 1.2, 0], 0.12, 0.04)]
    run(stuck, 1.5)
    expect(stuck.center[1]).toBeGreaterThan(1.2)
  })

  it('an off collider is not there', () => {
    const wall = boxCollider([1, 1, 0], [0.05, 1, 1])
    wall.on = false
    const j = make([0, 1, 0], { gravity: [0, 0, 0], floor: null })
    j.colliders = [wall]
    j.kick(6, 0, 0)
    run(j, 0.5)
    expect(j.center[0]).toBeGreaterThan(1.5)
  })
})

describe('bodyImpulse', () => {
  const free = (at: Vec3) => new Jelly(ball(0.3, at), { damping: 0 })

  it('swaps the closing speed of two equal bodies, less what the bounce loses', () => {
    const a = free([0, 0, 0])
    const b = free([0.6, 0, 0])
    a.kick(4, 0, 0)
    const j = bodyImpulse(a, b, 1, 0, 0, { wa: 0.5, wb: 0.5, ra: 0.3, rb: 0.3, restitution: 1, friction: 0 })
    expect(j).toBeCloseTo(8)
    a.velocity(v)
    expect(v[0]).toBeCloseTo(0)
    b.velocity(v)
    expect(v[0]).toBeCloseTo(4)
    // Already parting: nothing to do.
    expect(bodyImpulse(a, b, 1, 0, 0, { wa: 0.5, wb: 0.5, ra: 0.3, rb: 0.3, restitution: 1, friction: 0 })).toBe(0)
  })

  it('a glancing blow sets the struck body turning', () => {
    const a = free([0, 0, 0])
    const b = free([0.6, 0, 0])
    a.kick(4, 3, 0)
    bodyImpulse(a, b, 1, 0, 0, { wa: 0.5, wb: 0.5, ra: 0.3, rb: 0.3, restitution: 0.5, friction: 0.5 })
    b.angularVelocity(v)
    expect(Math.abs(v[2])).toBeGreaterThan(0.5)
    b.velocity(v)
    expect(v[1]).toBeGreaterThan(0)
  })
})

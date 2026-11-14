/**
 * Things that stand on Lim's stage and are played at rather than with: a
 * basketball hoop and a goal. Each is a purpose-built model in the house gel
 * shader and ink line, a set of static colliders (physics.ts) that balls
 * bounce off, and a sensor that knows when a ball has gone through.
 *
 * A fixture is built in its own frame (+x points at the middle of the stage,
 * the origin is on the floor) and `place` stands it at an edge of the stage,
 * turned a little toward the camera so its opening can be seen.
 */
import * as THREE from 'three/webgpu'
import { bound, boxCollider, capsuleCollider, torusCollider, type Collider } from '../../three/physics'
import type { Vec3 } from '../../three/jelly'
import type { ItemSpec } from '../world/spec'
import { shadeOf, solidGeometry } from './items'
import { hullMaterial, netMaterial, toyMaterial, type LimUniforms, type V3 } from './limLook'

export type FixtureKind = 'hoop' | 'goal'
export const fixtureKind = (spec: ItemSpec): FixtureKind | null =>
  spec.traits.includes('hoop') ? 'hoop' : spec.traits.includes('goal') ? 'goal' : null

/** Rim: ring radius and tube. A ball is about 0.35 across its radius, so it drops through with a little to spare. */
const RIM = 0.56
const TUBE = 0.04
const RIM_X = 0.14 + RIM
/** Goal: height of the bar, half the width of the mouth, how far back the net goes. */
const BAR = 1.3
const MOUTH = 0.95
const DEEP = 0.8
const TOP = 0.45
/** How far each is turned toward the camera. */
const TURN = THREE.MathUtils.degToRad(20)

type Local = { col: Collider; a: Vec3; b: Vec3 }

const UP = new THREE.Vector3(0, 1, 0)
const dir = new THREE.Vector3()

export class Fixture {
  readonly kind: FixtureKind
  readonly group = new THREE.Group()
  readonly colliders: Collider[] = []
  /** Which edge of the stage it stands at: the hoop on the right, the goal on the left. */
  readonly side: 1 | -1
  /** Where a ball goes through, in world space: the middle of the rim, or of the goal line. */
  readonly target: Vec3 = [0, 0, 0]
  /** World x of the front (the rim's near edge, the goal line) and of the back. */
  front = 0
  back = 0
  private readonly inner = new THREE.Group()
  private readonly locals: Local[] = []
  private readonly owned: { dispose(): void }[] = []
  private readonly net: THREE.Object3D
  private cos = 1
  private sin = 0
  /** Springs: a knock rocks the whole thing, a score swishes the net, and it pops up when it arrives. */
  private rock = 0
  private rockV = 0
  private swishX = 0
  private swishV = 0
  private grow = 1
  private growV = 0

  constructor(readonly spec: ItemSpec, u: LimUniforms, ink: V3) {
    const kind = fixtureKind(spec) ?? 'hoop'
    this.kind = kind
    this.side = kind === 'hoop' ? 1 : -1
    const frame = spec.parts[0].color
    const accent = spec.parts[1]?.color ?? '#F0524F'
    const fill = (hex: string) => this.own(toyMaterial(u, hex, shadeOf(hex)))
    const line = this.own(hullMaterial(ink, 0.016))
    const solid = (geo: THREE.BufferGeometry, mat: THREE.Material, at: Vec3) => {
      this.own(geo)
      const holder = new THREE.Group()
      holder.add(new THREE.Mesh(geo, mat), new THREE.Mesh(geo, line))
      holder.position.set(at[0], at[1], at[2])
      this.inner.add(holder)
      return holder
    }
    /** A round bar between two points. */
    const bar = (a: Vec3, b: Vec3, r: number, mat: THREE.Material) => {
      dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      const len = dir.length()
      const holder = solid(new THREE.CapsuleGeometry(r, len, 4, 10), mat, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])
      holder.quaternion.setFromUnitVectors(UP, dir.divideScalar(len || 1))
      return holder
    }
    const solidCollider = (col: Collider, a: Vec3, b: Vec3 = a) => {
      this.locals.push({ col, a: [...a], b: [...b] })
      this.colliders.push(col)
    }

    if (kind === 'hoop') {
      const pole = fill(spec.parts[2]?.color ?? '#B9A6FF')
      const board = fill(frame)
      const rim = fill(accent)
      // The heights are set by `place` (the rim sits lower on a short stage): build at y = 0 and lift the head.
      this.poleMesh = bar([-0.34, 0, 0], [-0.34, 1, 0], 0.07, pole)
      this.head.add(
        ...[
          solid(solidGeometry('box', 0.05, 0.5, 0.78), board, [0, 0.42, 0]),
          // The shooter's square: a coral panel with a white one set into it.
          solid(solidGeometry('box', 0.02, 0.24, 0.34), rim, [0.05, 0.3, 0]),
          solid(solidGeometry('box', 0.02, 0.17, 0.27), board, [0.066, 0.3, 0]),
          solid(solidGeometry('box', 0.09, 0.035, 0.07), rim, [0.09, 0, 0]),
          bar([-0.34, 0.12, 0], [-0.04, 0.2, 0], 0.05, pole),
        ],
      )
      const ring = new THREE.TorusGeometry(RIM, TUBE, 10, 40)
      ring.rotateX(Math.PI / 2)
      this.head.add(solid(ring, rim, [RIM_X, 0, 0]))
      const mesh = new THREE.CylinderGeometry(RIM - 0.02, RIM * 0.6, 0.56, 16, 1, true)
      this.own(mesh)
      const net = new THREE.Mesh(mesh, this.own(netMaterial(u, '#FFFFFF', [16, 3])))
      net.position.set(RIM_X, -0.28 - TUBE, 0)
      this.net = net
      this.head.add(net)
      this.inner.add(this.head)
      solidCollider(boxCollider([0, 0, 0], [0.035, 0.48, 0.76], 0, 0.03, { bounce: 0.85, friction: 0.7 }), [0, 0.42, 0])
      solidCollider(torusCollider([0, 0, 0], RIM, TUBE, { bounce: 0.55, friction: 0.75 }), [RIM_X, 0, 0])
      solidCollider(capsuleCollider([0, 0, 0], [0, 1, 0], 0.07, { bounce: 0.6 }), [-0.34, 0, 0], [-0.34, 0.2, 0])
    } else {
      const post = fill(frame)
      const stay = fill(spec.parts[1]?.color ?? frame)
      const cord = this.own(netMaterial(u, '#FFFFFF', [1, 1]))
      for (const z of [-MOUTH, MOUTH]) {
        bar([0, 0, z], [0, BAR, z], 0.055, post)
        bar([0, BAR, z], [-TOP, BAR, z], 0.03, stay)
        bar([-TOP, BAR, z], [-DEEP, 0.03, z], 0.03, stay)
        solidCollider(capsuleCollider([0, 0, 0], [0, 1, 0], 0.055, { bounce: 0.75 }), [0, 0, z], [0, BAR, z])
      }
      bar([0, BAR, -MOUTH], [0, BAR, MOUTH], 0.055, post)
      bar([-TOP, BAR, -MOUTH], [-TOP, BAR, MOUTH], 0.03, stay)
      bar([-DEEP, 0.03, -MOUTH], [-DEEP, 0.03, MOUTH], 0.03, stay)
      solidCollider(capsuleCollider([0, 0, 0], [0, 1, 0], 0.055, { bounce: 0.75 }), [0, BAR, -MOUTH], [0, BAR, MOUTH])
      // The net: a roof, a sloping back and two sides, with the mesh sized in world units.
      const panel = (points: Vec3[]) => {
        const geo = new THREE.BufferGeometry()
        const pos: number[] = []
        const uvs: number[] = []
        // A fan from the first corner; uv runs along the panel so the diamonds are the same size everywhere.
        const e1 = new THREE.Vector3(points[1][0] - points[0][0], points[1][1] - points[0][1], points[1][2] - points[0][2]).normalize()
        const nrm = new THREE.Vector3(points[2][0] - points[0][0], points[2][1] - points[0][1], points[2][2] - points[0][2]).cross(e1).normalize()
        const e2 = new THREE.Vector3().crossVectors(e1, nrm)
        const put = (p: Vec3) => {
          pos.push(p[0], p[1], p[2])
          dir.set(p[0] - points[0][0], p[1] - points[0][1], p[2] - points[0][2])
          uvs.push(dir.dot(e1) * 5, dir.dot(e2) * 5)
        }
        for (let i = 1; i < points.length - 1; i++) {
          put(points[0])
          put(points[i])
          put(points[i + 1])
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
        geo.computeVertexNormals()
        this.own(geo)
        return new THREE.Mesh(geo, cord)
      }
      const net = new THREE.Group()
      net.add(
        panel([[0, BAR, -MOUTH], [0, BAR, MOUTH], [-TOP, BAR, MOUTH], [-TOP, BAR, -MOUTH]]),
        panel([[-TOP, BAR, -MOUTH], [-TOP, BAR, MOUTH], [-DEEP, 0.03, MOUTH], [-DEEP, 0.03, -MOUTH]]),
        ...[-MOUTH, MOUTH].map((z) => panel([[0, 0, z], [0, BAR, z], [-TOP, BAR, z], [-DEEP, 0.03, z]])),
      )
      this.net = net
      this.inner.add(net)
      // What the net does to a ball: a dead roof and a dead back wall.
      solidCollider(boxCollider([0, 0, 0], [TOP / 2, 0.015, MOUTH], 0, 0.02, { bounce: 0.08, friction: 0.35 }), [-TOP / 2, BAR, 0])
      solidCollider(boxCollider([0, 0, 0], [0.02, BAR / 2, MOUTH], 0, 0.03, { bounce: 0.05, friction: 0.3 }), [-(TOP + DEEP) / 2 - 0.06, BAR / 2, 0])
    }
    this.group.add(this.inner)
    this.group.traverse((o) => (o.frustumCulled = false))
  }

  private readonly head = new THREE.Group()
  private poleMesh: THREE.Object3D | null = null

  private own<T extends { dispose(): void }>(thing: T): T {
    this.owned.push(thing)
    return thing
  }

  /** Stand it at world x (the hoop's backboard, the goal's line), with the rim at `rimY`. */
  place(x: number, rimY: number) {
    // +x of the model points at the middle of the stage and a little toward the camera.
    const yaw = this.side > 0 ? Math.PI + TURN : -TURN
    this.cos = Math.cos(yaw)
    this.sin = Math.sin(yaw)
    this.group.position.set(x, 0, this.kind === 'hoop' ? -0.12 : 0)
    this.group.rotation.y = yaw
    const lift = this.kind === 'hoop' ? rimY : 0
    this.head.position.y = lift
    if (this.poleMesh) {
      // The pole runs from the floor to just under the backboard's arm.
      this.poleMesh.scale.y = (lift + 0.2) / 1.14
      this.poleMesh.position.y = (lift + 0.2) / 2
    }
    for (const { col, a, b } of this.locals) {
      const pole = col.kind === 'capsule' && this.kind === 'hoop'
      this.world(a, pole ? 0 : lift, col.a)
      if (col.kind === 'capsule') this.world(b, lift, col.b)
      else if (col.kind === 'box') {
        col.cos = this.cos
        col.sin = this.sin
      }
      bound(col)
    }
    if (this.kind === 'hoop') {
      this.world([RIM_X, 0, 0], lift, this.target)
      this.front = this.target[0] - RIM
      this.back = x
    } else {
      this.world([0, BAR * 0.45, 0], 0, this.target)
      this.front = x
      this.back = this.world([-DEEP, 0, 0], 0, [0, 0, 0])[0] - 0.15
    }
  }

  private world(p: Vec3, lift: number, out: Vec3): Vec3 {
    out[0] = this.group.position.x + p[0] * this.cos + p[2] * this.sin
    out[1] = p[1] + lift
    out[2] = this.group.position.z - p[0] * this.sin + p[2] * this.cos
    return out
  }

  /** Did a ball's centre, going from `prev` to `now`, pass through the rim (downward) or over the goal line (under the bar)? */
  scored(prev: Vec3, now: Vec3): boolean {
    if (this.kind === 'hoop') {
      const [cx, cy, cz] = this.target
      return prev[1] > cy && now[1] <= cy && Math.hypot(now[0] - cx, now[2] - cz) < RIM - 0.1
    }
    // Into the goal's frame: x is how far in front of the line the ball is.
    const local = (p: Vec3) => (p[0] - this.group.position.x) * this.cos - (p[2] - this.group.position.z) * this.sin
    const across = (now[0] - this.group.position.x) * this.sin + (now[2] - this.group.position.z) * this.cos
    return local(prev) > -0.14 && local(now) <= -0.14 && now[1] < BAR - 0.05 && Math.abs(across) < MOUTH
  }

  /** Which way is out of the goal mouth (or away from the backboard), along x. */
  get out() {
    return -this.side
  }

  get rimRadius() {
    return RIM
  }

  /** Something hit it. */
  bump(power: number) {
    this.rockV += Math.min(1.6, power * 0.11) * (Math.random() < 0.5 ? -1 : 1)
  }

  swish() {
    this.swishV += 9
  }

  /** Arrive with a pop. */
  popIn() {
    this.grow = 0.55
    this.growV = 3
  }

  step(dt: number) {
    if (dt <= 0) {
      this.grow = 1
      this.inner.scale.setScalar(1)
      return
    }
    this.rockV += (-190 * this.rock - 9 * this.rockV) * dt
    this.rock += this.rockV * dt
    this.swishV += (-150 * this.swishX - 8 * this.swishV) * dt
    this.swishX += this.swishV * dt
    this.growV += (-140 * (this.grow - 1) - 12 * this.growV) * dt
    this.grow += this.growV * dt
    this.inner.scale.setScalar(this.grow)
    // It rocks about its foot; the net stretches down and pinches in as the ball drops through (or bellies out behind the keeper).
    this.inner.rotation.z = this.rock * 0.035
    const s = this.swishX
    if (this.kind === 'hoop') this.net.scale.set(1 - s * 0.16, 1 + s * 0.3, 1 - s * 0.16)
    else this.net.scale.set(1 + s * 0.12, 1, 1)
  }

  dispose() {
    this.group.removeFromParent()
    for (const thing of this.owned) thing.dispose()
  }
}

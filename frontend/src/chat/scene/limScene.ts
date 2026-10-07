/**
 * Lim, the jelly companion. A gumdrop-shaped shape-matching soft body (the
 * shared Jelly toolkit) with toon ramp shading, wrap light, fresnel rim and an
 * ink hull. The mouth, blush and brows are painted in rest space so they ride
 * every wobble; the glossy eyes are real spheres glued on with `attach`.
 * Lim stands on a polka-dot stage floor next to a few bumpable jelly beans,
 * and throws confetti when something delightful happens.
 *
 * The page drives Lim through moods (typing, thinking, talking, …) plus
 * one-shot beats (hop on send, mouth flap per streamed chunk, cheer when done).
 */
import * as THREE from 'three/webgpu'
import {
  abs,
  atan,
  attribute,
  cameraViewMatrix,
  color,
  cos,
  dot,
  float,
  fract,
  fwidth,
  length,
  max,
  mix,
  normalLocal,
  normalView,
  normalize,
  positionLocal,
  positionViewDirection,
  positionWorld,
  pow,
  saturate,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import type { Node } from 'three/webgpu'
import { createStage } from '../../three/stage'
import { Jelly, icosphere, type Vec3 } from '../../three/jelly'
import { jellyGeometry, syncJellyGeometry } from '../../three/jellyMesh'
import { bindJellyPointer } from '../../three/jellyPointer'

type F = Node<'float'>
type V2 = Node<'vec2'>
type V3 = Node<'vec3'>

export type LimMood = 'idle' | 'typing' | 'thinking' | 'talking' | 'happy' | 'sad'

export type LimSceneOptions = {
  canvas: HTMLCanvasElement
  host: HTMLElement
  reducedMotion: boolean
  night: boolean
  mood: LimMood
  onPoke?: () => void
  /** Top of Lim's head in host px, plus px per world unit; every frame. */
  onAnchor?: (x: number, y: number, unit: number) => void
  onFirstFrame?: () => void
}

export type LimScene = {
  setMood(mood: LimMood): void
  setNight(night: boolean): void
  /** Look toward a point in viewport px (pointer, caret, a hovered chip). */
  lookAt(clientX: number, clientY: number): void
  hop(): void
  talk(): void
  cheer(confetti: boolean): void
  dispose(): void
}

const FOV = 30
const PITCH = THREE.MathUtils.degToRad(10)
const LIM_H = 1.75
const FLOOR_LINE = 0.8

const PAL = {
  top: '#FF8B6E',
  bottom: '#FF6F7D',
  belly: '#FFC9B2',
  shade: '#D9476C',
  light: '#FFC7AE',
  rim: '#FFE6F2',
  nightRim: '#B7A4FF',
  ink: '#4A2F5C',
  nightInk: '#140E28',
  mouth: '#3A1838',
  tongue: '#FF8FA8',
  blush: '#FF4F86',
  brow: '#3A2350',
  pupil: '#2B2140',
  eyeShade: '#DCD4EE',
  shadow: '#5B2D55',
}
const BEANS: [string, string][] = [
  ['#9EE6C8', '#4FB894'],
  ['#C7B6FF', '#8B6FEA'],
  ['#FFD978', '#EDA436'],
]
const CONFETTI = ['#FF7E6B', '#9EE6C8', '#C7B6FF', '#FFD978', '#9FD3FF', '#FF9FC5']

type Face = {
  w: number
  curve: number
  open: number
  blush: number
  lid: number
  brow: number
  browL: [number, number]
  browR: [number, number]
  sad: number
  droop: number
  pupil: number
}
const face = (f: Partial<Face>): Face => ({
  w: 0.16, curve: 2.4, open: 0, blush: 0.5, lid: 1, brow: 0,
  browL: [0, 0], browR: [0, 0], sad: 0, droop: 0, pupil: 1, ...f,
})
const FACES = {
  idle: face({}),
  typing: face({ w: 0.11, curve: 1.6, open: 0.03, blush: 0.55, lid: 1.06, brow: 0.9, browL: [-0.14, 0.03], browR: [0.14, 0.03] }),
  thinking: face({ w: 0.07, curve: 0, open: 0.07, blush: 0.4, lid: 0.94, brow: 1, browL: [-0.22, 0.07], browR: [0.1, -0.01] }),
  talking: face({ w: 0.15, curve: 1.8, open: 0.02, blush: 0.6 }),
  happy: face({ w: 0.19, curve: 2.6, open: 0.1, blush: 0.95, lid: 0.5 }),
  sad: face({ w: 0.12, curve: -2.4, blush: 0.2, lid: 0.86, brow: 1, browL: [0.4, 0.01], browR: [-0.4, 0.01], sad: 1, droop: 0.09, pupil: 0.9 }),
  grabbed: face({ w: 0.075, curve: 0, open: 0.12, blush: 0.6, lid: 1.16, brow: 1, browL: [-0.16, 0.09], browR: [0.16, 0.09], pupil: 0.72 }),
  poked: face({ w: 0.18, curve: 2.4, open: 0.09, blush: 1, lid: 0.12 }),
} satisfies Record<string, Face>

/** Gumdrop: a squat sphere, wider and flat at the base. */
function gumdropRest(): { positions: Float32Array; index: Uint32Array } {
  const { positions, index } = icosphere(1, 4)
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1]
    const widen = 1 + 0.16 * ((1 - y) / 2) ** 1.6
    let ny = y * 0.95
    if (ny < -0.74) ny = -0.74 + (ny + 0.74) * 0.3
    positions[i] *= widen
    positions[i + 1] = ny
    positions[i + 2] *= widen * 0.92
  }
  return { positions, index }
}

function beanRest(): { positions: Float32Array; index: Uint32Array } {
  const { positions, index } = icosphere(1, 2)
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]
    positions[i] = x * 0.34
    positions[i + 1] = positions[i + 1] * 0.21 + 0.05 * (1 - x * x)
    positions[i + 2] *= 0.22
  }
  return { positions, index }
}

/** Rest-space surface point (and its outward direction) nearest a direction. */
function surfacePoint(rest: Float32Array, dir: Vec3): { p: Vec3; n: Vec3 } {
  const l = Math.hypot(...dir)
  let best = 0
  let bestDot = -Infinity
  for (let i = 0; i < rest.length; i += 3) {
    const r = Math.hypot(rest[i], rest[i + 1], rest[i + 2]) || 1
    const d = (rest[i] * dir[0] + rest[i + 1] * dir[1] + rest[i + 2] * dir[2]) / (r * l)
    if (d > bestDot) {
      bestDot = d
      best = i
    }
  }
  const p: Vec3 = [rest[best], rest[best + 1], rest[best + 2]]
  const r = Math.hypot(...p)
  return { p, n: [p[0] / r, p[1] / r, p[2] / r] }
}

// View-space key light, upper left and in front: camera-relative so the toon
// bands stay put however the stage is framed.
const LIGHT = normalize(vec3(-0.45, 0.72, 0.53))

type Mat3U = Node<'mat3'>

/**
 * Soft-body normals carry every ripple of the particle sim; blending in the
 * rest normal (turned by the body's rotation) keeps the toon bands and the
 * highlight smooth while the silhouette still squashes.
 */
function smoothNormal(rot: Mat3U, amount: number): { local: V3; view: V3 } {
  const restN = attribute('restNormal', 'vec3') as unknown as V3
  const turned = rot.mul(restN) as unknown as V3
  const local = normalize(mix(normalLocal, turned, amount))
  const view = normalize(mix(normalize(normalView), normalize(cameraViewMatrix.mul(vec4(turned, 0)).xyz), amount))
  return { local, view }
}

/** Freeze the rest-pose normals as an attribute (see smoothNormal). */
function addRestNormals(geo: THREE.BufferGeometry) {
  geo.setAttribute('restNormal', geo.attributes.normal.clone())
}

function toon(n: V3, base: V3, shade: V3, light: V3, rim: V3, rimAmt: F): V3 {
  const v = positionViewDirection
  const wrap = saturate(dot(n, LIGHT).add(0.4).div(1.4))
  let c: V3 = mix(shade, base, smoothstep(0.16, 0.5, wrap))
  c = mix(c, light, smoothstep(0.78, 0.92, wrap).mul(0.45))
  const fres = pow(float(1).sub(saturate(dot(n, v))), 2.6)
  c = c.add(rim.mul(fres.mul(rimAmt)))
  const nh = saturate(dot(n, normalize(LIGHT.add(v))))
  c = mix(c, vec3(1, 1, 1), smoothstep(0.94, 0.985, nh).mul(0.8))
  return c.add(pow(nh, 60).mul(0.1))
}

function hullMaterial(ink: V3, width: number, normal: V3 = normalLocal) {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide })
  m.positionNode = positionLocal.add(normal.mul(width))
  m.colorNode = ink
  return m
}

const aaStep = (d: F, aa = 0.006) => float(1).sub(smoothstep(-aa, aa, d))

export async function createLimScene(opts: LimSceneOptions): Promise<LimScene> {
  const { canvas, host, reducedMotion } = opts
  const stage = await createStage({ canvas, host, reducedMotion, alpha: true })
  const { renderer } = stage
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80)

  const uNight = uniform(opts.night ? 1 : 0)
  const uSad = uniform(0)
  const uMouthW = uniform(0.16)
  const uMouthCurve = uniform(2.4)
  const uMouthOpen = uniform(0)
  const uBlush = uniform(0.5)
  const uBrow = uniform(0)
  const uBrowL = uniform(new THREE.Vector2())
  const uBrowR = uniform(new THREE.Vector2())
  const ink = mix(color(PAL.ink), color(PAL.nightInk), uNight)

  // ── Lim ──────────────────────────────────────────────────────────
  const limRest = gumdropRest()
  // Firm-ish goal (low beta) so impacts squash and spring back instead of
  // the linear fit "accepting" a pancake.
  const lim = new Jelly(limRest.positions, {
    stiffness: 0.13,
    beta: 0.25,
    damping: 1.6,
    gravity: [0, -14, 0],
    floor: 0,
    friction: 0.45,
  })
  lim.upright = 0.08
  const limGeo = jellyGeometry(lim, limRest.index)
  addRestNormals(limGeo)
  const uLimRot = uniform(new THREE.Matrix3())
  const limN = smoothNormal(uLimRot, 0.6)
  const restC: Vec3 = [...lim.center]
  const eyeL = surfacePoint(limRest.positions, [-0.36, 0.2, 0.91])
  const eyeR = surfacePoint(limRest.positions, [0.36, 0.2, 0.91])
  const EYE_R = 0.205
  const eyeRest = (s: { p: Vec3; n: Vec3 }): Vec3 => [
    s.p[0] - s.n[0] * EYE_R * 0.3,
    s.p[1] - s.n[1] * EYE_R * 0.3,
    s.p[2] - s.n[2] * EYE_R * 0.3,
  ]
  const eyeLRest = eyeRest(eyeL)
  const eyeRRest = eyeRest(eyeR)
  const eyeY = eyeL.p[1]
  const eyeX = Math.abs(eyeL.p[0])
  const headTopRest: Vec3 = [0, 0.95, 0]
  const baseRest: Vec3 = [0, -0.8, 0]
  const restEyeGap = Math.hypot(eyeLRest[0] - eyeRRest[0], eyeLRest[1] - eyeRRest[1], eyeLRest[2] - eyeRRest[2])
  const restHeight = headTopRest[1] - baseRest[1]

  const bodyMat = new THREE.MeshBasicNodeMaterial()
  {
    const rest = attribute('rest', 'vec3') as unknown as V3
    const rn = normalize(rest.sub(vec3(...restC)))
    const front = smoothstep(0.3, 0.55, rn.z)
    const p = rest.xy as V2

    let base: V3 = mix(color(PAL.bottom), color(PAL.top), smoothstep(-0.8, 0.9, rest.y))
    const belly = float(1).sub(smoothstep(0.22, 0.62, length(vec2(p.x.mul(0.85), p.y.add(0.42))))).mul(front)
    base = mix(base, color(PAL.belly), belly.mul(0.55))
    base = mix(base, color('#D9939B'), uSad.mul(0.4))
    base = base.mul(mix(float(1), float(0.84), uNight))
    const shade = mix(color(PAL.shade), color('#9A3A7C'), uNight)
    const rim = mix(color(PAL.rim), color(PAL.nightRim), uNight)
    let c = toon(limN.view, base, shade, color(PAL.light).mul(mix(float(1), float(0.86), uNight)), rim, mix(float(0.5), float(0.95), uNight))

    // Blush.
    const cheekY = eyeY - 0.29
    const cheekX = eyeX + 0.24
    const cheek = (x: number) =>
      float(1).sub(smoothstep(0.05, 0.15, length(vec2(p.x.sub(x), p.y.sub(cheekY).mul(1.4)))))
    c = mix(c, color(PAL.blush), cheek(-cheekX).add(cheek(cheekX)).mul(uBlush).mul(front).mul(0.78))

    // Brows: rounded segments, tilt (radians) + raise per side.
    const brow = (x: number, b: typeof uBrowL) => {
      const qx = p.x.sub(x)
      const qy = p.y.sub(b.y.add(eyeY + 0.29))
      const cs = cos(b.x)
      const sn = sin(b.x)
      const rx = qx.mul(cs).add(qy.mul(sn))
      const ry = qy.mul(cs).sub(qx.mul(sn))
      return aaStep(length(vec2(max(abs(rx).sub(0.085), 0), ry)).sub(0.024))
    }
    c = mix(c, color(PAL.brow), brow(-eyeX, uBrowL).add(brow(eyeX, uBrowR)).min(1).mul(uBrow).mul(front))

    // Mouth: the lens between two parabolas, with a tongue when open.
    const mx = p.x
    const my = p.y.sub(eyeY - 0.33)
    const q = mx.div(uMouthW)
    const ex = max(float(1).sub(q.mul(q)), 0)
    const mid = uMouthCurve.mul(mx.mul(mx))
    const top = mid.add(0.022).add(uMouthOpen.mul(ex).mul(0.28))
    const bot = mid.sub(0.022).sub(uMouthOpen.mul(ex))
    const d = max(abs(mx).sub(uMouthW), max(my.sub(top), bot.sub(my)))
    const mouth = aaStep(d).mul(front)
    const tongue = aaStep(my.sub(bot.add(uMouthOpen.mul(0.5)))).mul(smoothstep(0.035, 0.075, uMouthOpen))
    c = mix(c, mix(color(PAL.mouth), color(PAL.tongue), tongue), mouth)
    bodyMat.colorNode = c
  }
  const limMesh = new THREE.Mesh(limGeo, bodyMat)
  const limHull = new THREE.Mesh(limGeo, hullMaterial(ink, 0.03, limN.local))
  limMesh.frustumCulled = limHull.frustumCulled = false
  scene.add(limMesh, limHull)

  // Eyes: white + ink rim + pupil + two catch-lights.
  const sphere = new THREE.SphereGeometry(1, 32, 20)
  const whiteMat = new THREE.MeshBasicNodeMaterial()
  whiteMat.colorNode = mix(color(PAL.eyeShade), color('#FFFFFF'), smoothstep(-0.3, 0.6, dot(normalize(normalView), LIGHT)))
  const pupilMat = new THREE.MeshBasicNodeMaterial()
  pupilMat.colorNode = mix(color(PAL.pupil), color('#55427A'), smoothstep(0.3, 1, dot(normalize(normalView), LIGHT)).mul(0.5))
  const glintMat = new THREE.MeshBasicNodeMaterial({ color: '#FFFFFF' })
  const eyeHullMat = hullMaterial(ink, 0)
  const makeEye = () => {
    const group = new THREE.Group()
    const white = new THREE.Mesh(sphere, whiteMat)
    const rim = new THREE.Mesh(sphere, eyeHullMat)
    rim.scale.setScalar(1.13)
    const pupil = new THREE.Mesh(sphere, pupilMat)
    const glint = new THREE.Mesh(sphere, glintMat)
    glint.scale.setScalar(0.2)
    glint.position.set(-0.36, 0.42, 0.9).normalize().multiplyScalar(1.02)
    const glint2 = new THREE.Mesh(sphere, glintMat)
    glint2.scale.setScalar(0.09)
    glint2.position.set(0.34, -0.3, 0.92).normalize().multiplyScalar(1.02)
    group.add(white, rim, pupil, glint, glint2)
    scene.add(group)
    return { group, pupil }
  }
  const eyes = [makeEye(), makeEye()]

  // ── Floor, rug, shadows ──────────────────────────────────────────
  const floorMat = new THREE.MeshBasicNodeMaterial({ transparent: true })
  {
    const wp = positionWorld.xz as V2
    const cell = fract(wp.mul(1.5)).sub(0.5)
    const dd = length(cell)
    const aa = fwidth(dd).mul(1.2)
    // Dots fade out toward the horizon before they can shimmer.
    const dots = float(1).sub(smoothstep(float(0.085).sub(aa), float(0.085).add(aa), dd)).mul(smoothstep(-6, -1.5, wp.y))
    const r = length(wp)
    const edge = float(1.6).add(cos(atan(wp.y, wp.x).mul(18)).mul(0.035))
    const ea = fwidth(r).mul(1.5)
    const rug = float(1).sub(smoothstep(edge.sub(ea), edge.add(ea), r))
    const ring = smoothstep(1.16, 1.18, r).mul(float(1).sub(smoothstep(1.24, 1.26, r)))
    let c: V3 = mix(color('#FCE5D8'), color('#2A2250'), uNight)
    c = mix(c, mix(color('#F7CDBF'), color('#3B3170'), uNight), dots.mul(0.8))
    c = mix(c, mix(color('#C8F0E0'), color('#3D3474'), uNight), rug)
    c = mix(c, mix(color('#A6E3CA'), color('#4F4592'), uNight), ring.mul(rug))
    floorMat.colorNode = c
    floorMat.opacityNode = smoothstep(-7.5, -2.5, wp.y).mul(float(1).sub(smoothstep(9, 12, abs(wp.x))))
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.z = 3
  scene.add(floor)

  const shadowGeo = new THREE.PlaneGeometry(1, 1)
  const makeShadow = () => {
    const strength = uniform(0.3)
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
    mat.colorNode = mix(color(PAL.shadow), color('#07040F'), uNight)
    mat.opacityNode = pow(saturate(float(1).sub(length(uv().sub(0.5)).mul(2))), 1.5).mul(strength)
    const mesh = new THREE.Mesh(shadowGeo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = 0.004
    mesh.renderOrder = 1
    scene.add(mesh)
    return { mesh, mat, strength }
  }
  const limShadow = makeShadow()

  // ── Jelly beans ──────────────────────────────────────────────────
  const beanShape = beanRest()
  const beans = BEANS.map(([hex, shadeHex], i) => {
    const jelly = new Jelly(beanShape.positions, {
      stiffness: 0.13,
      beta: 0.35,
      damping: 1.1,
      gravity: [0, -16, 0],
      floor: 0,
      friction: 0.35,
      substeps: 2,
    })
    const geo = jellyGeometry(jelly, beanShape.index)
    const mat = new THREE.MeshBasicNodeMaterial()
    mat.colorNode = toon(
      normalize(normalView),
      color(hex).mul(mix(float(1), float(0.8), uNight)),
      color(shadeHex).mul(mix(float(1), float(0.7), uNight)),
      color('#FFFFFF').mul(0.92),
      mix(color('#FFFFFF'), color(PAL.nightRim), uNight),
      float(0.45),
    )
    const mesh = new THREE.Mesh(geo, mat)
    const hull = new THREE.Mesh(geo, hullMaterial(ink, 0.016))
    mesh.frustumCulled = hull.frustumCulled = false
    scene.add(mesh, hull)
    return { jelly, geo, mat, hull, shadow: makeShadow(), slot: [-0.78, 0.66, 0.9][i], spin: i % 2 ? 0.6 : -0.5 }
  })

  // ── Confetti ─────────────────────────────────────────────────────
  const CONF_N = 96
  const confMat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide })
  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.07), confMat, CONF_N)
  confetti.frustumCulled = false
  const conf = Array.from({ length: CONF_N }, () => ({
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    axis: new THREE.Vector3(1, 0, 0),
    angle: 0,
    spin: 0,
    life: 0,
  }))
  {
    const c = new THREE.Color()
    for (let i = 0; i < CONF_N; i++) confetti.setColorAt(i, c.set(CONFETTI[i % CONFETTI.length]))
  }
  scene.add(confetti)
  let nextConf = 0

  // ── Layout ───────────────────────────────────────────────────────
  let halfW = 2.5
  let topY = 4
  let unit = 100
  let w = 1
  let h = 1
  let wide = true
  const layout = (sw: number, sh: number) => {
    w = sw
    h = sh
    wide = sw >= 820
    const aspect = sw / sh
    let vh = LIM_H / (sh < 220 ? 0.52 : wide ? 0.38 : 0.55)
    const minW = wide ? 5.6 : 4.6
    if (vh * aspect < minW) vh = minW / aspect
    const dist = vh / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    const ty = (FLOOR_LINE - 0.5) * vh
    camera.aspect = aspect
    camera.position.set(0, ty + dist * Math.sin(PITCH), dist * Math.cos(PITCH))
    camera.lookAt(0, ty, 0)
    camera.updateProjectionMatrix()
    halfW = (vh * aspect) / 2
    topY = ty + vh / 2 - 0.05
    unit = sh / vh
  }
  stage.onResize(layout)

  // ── Start pose: Lim pops to life where the static mascot stood ───
  lim.translate(0, 0.81, 0)
  for (const b of beans) {
    b.jelly.translate(b.slot * (halfW - 0.5), reducedMotion ? 0.2 : 2.6 + Math.abs(b.slot) * 1.6, 0.25)
  }

  const bodies = [lim, ...beans.map((b) => b.jelly)]
  const radius = new Map<Jelly, number>([[lim, 1], ...beans.map((b) => [b.jelly, 0.26] as [Jelly, number])])
  const mass = new Map<Jelly, number>([[lim, 6], ...beans.map((b) => [b.jelly, 1] as [Jelly, number])])

  // ── State ────────────────────────────────────────────────────────
  let t = 0
  let mood: LimMood = opts.mood
  let grabbed = false
  let pokedUntil = 0
  let pokes: number[] = []
  let happyUntil = 0
  let talkOpen = 0
  let lastTalk = 0
  let talkCount = 0
  let nextBlink = 1.5
  let blinkUntil = 0
  let nextFidget = 4
  let nextWobble = 0
  let wobbleSide = 1
  let nextHomeHop = 0
  let entryScale = reducedMotion ? 1 : 0.72
  let entryVel = 0
  const squash = { x: 0, v: 0 }
  const kicks: { at: number; v: Vec3 }[] = []
  const look = { x: 0, y: 0, at: -10, clientX: 0, clientY: 0 }
  const wander = { x: 0, y: 0, until: 0 }
  const lean = { yaw: 0, pitch: 0, roll: 0 }
  const f = { ...FACES[mood], browL: [...FACES[mood].browL], browR: [...FACES[mood].browR], lidNow: 1 }
  let wasAirborne = false
  let lastVy = 0
  const vbar: Vec3 = [0, 0, 0]
  const tmp: Vec3 = [0, 0, 0]
  const tmp2: Vec3 = [0, 0, 0]
  const quat = new THREE.Quaternion()
  const rotM4 = new THREE.Matrix4()
  const euler = new THREE.Euler(0, 0, 0, 'YXZ')
  const proj = new THREE.Vector3()
  let hostRect = host.getBoundingClientRect()
  stage.onResize(() => {
    hostRect = host.getBoundingClientRect()
  })

  const ease = (cur: number, target: number, rate: number, dt: number) =>
    reducedMotion ? target : cur + (target - cur) * (1 - Math.exp(-rate * dt))

  const toHost = (p: Vec3): [number, number] => {
    proj.set(p[0], p[1], p[2]).project(camera)
    return [((proj.x + 1) / 2) * w, ((1 - proj.y) / 2) * h]
  }

  const burst = (count: number, power: number) => {
    if (reducedMotion) return
    lim.attach(headTopRest, tmp)
    for (let k = 0; k < count; k++) {
      const c = conf[nextConf++ % CONF_N]
      c.p.set(tmp[0] + (Math.random() - 0.5) * 0.6, tmp[1] + 0.1, tmp[2] + (Math.random() - 0.5) * 0.4)
      const a = Math.random() * Math.PI * 2
      const s = (1.2 + Math.random() * 2.6) * power
      c.v.set(Math.cos(a) * s, (4.2 + Math.random() * 3.4) * power, Math.sin(a) * s * 0.4)
      c.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      c.angle = Math.random() * Math.PI
      c.spin = (Math.random() - 0.5) * 16
      c.life = 2.4 + Math.random() * 1.4
    }
  }

  // ── Pointer: grab, fling, poke ───────────────────────────────────
  const pointer = bindJellyPointer({
    host,
    camera,
    bodies,
    reducedMotion,
    touchDrag: true,
    pokeStrength: 3.2,
    onPoke(body) {
      if (body !== lim) return
      pokedUntil = t + 0.55
      const now = t
      pokes = pokes.filter((p) => now - p < 4)
      pokes.push(now)
      // Giggle: a couple of quick side-to-side shivers.
      for (let k = 0; k < 3; k++) kicks.push({ at: t + 0.06 + k * 0.09, v: [k % 2 ? -1.1 : 1.1, k === 0 ? 1.6 : 0, 0] })
      squash.v += 3
      if (pokes.length >= 5) {
        pokes = []
        happyUntil = t + 2
        burst(48, 1)
      }
      opts.onPoke?.()
    },
    onGrab(body) {
      if (body === lim) grabbed = true
    },
    onRelease(body) {
      if (body === lim) grabbed = false
    },
  })

  // ── Frame ────────────────────────────────────────────────────────
  const dummy = new THREE.Object3D()
  const confQuat = new THREE.Quaternion()

  const brain = (dt: number) => {
    lim.velocity(vbar)
    const resting = lim.contacts > 0 && Math.abs(vbar[1]) < 0.4
    const busy = grabbed || mood === 'thinking' || mood === 'talking'

    // Home: centre stage, or a step toward the chat while you type (desktop).
    const homeX = wide && (mood === 'typing' || mood === 'talking') ? Math.max(0, halfW - 1.5) * 0.4 : 0
    const off = homeX - lim.center[0]
    if (resting && !grabbed && t > nextHomeHop && (Math.abs(off) > 0.28 || Math.abs(lim.center[2]) > 0.5)) {
      const dir = Math.sign(off) * Math.min(1, Math.abs(off))
      kicks.push({ at: t + 0.07, v: [dir * 2.3, 4.6, -lim.center[2] * 1.6] })
      squash.v += 3.5
      nextHomeHop = t + 0.75
    }

    for (let i = kicks.length - 1; i >= 0; i--) {
      if (kicks[i].at <= t) {
        lim.kick(...kicks[i].v)
        kicks.splice(i, 1)
      }
    }

    if (mood === 'thinking' && t > nextWobble) {
      wobbleSide = -wobbleSide
      lim.attach(headTopRest, tmp)
      lim.impulse([tmp[0], tmp[1] - 0.2, tmp[2]], [wobbleSide * 0.9, 0, 0], 1.1)
      nextWobble = t + 0.42
    }

    if (!busy && mood !== 'typing' && t > nextFidget) {
      const roll = Math.random()
      if (roll < 0.3) kicks.push({ at: t, v: [0, 3.4, 0] })
      else if (roll < 0.6) {
        lim.attach(headTopRest, tmp)
        lim.impulse(tmp, [(Math.random() < 0.5 ? -1 : 1) * 2.2, 0, 0], 1.1)
      } else if (roll < 0.8) squash.v += 4
      else {
        wander.x = (Math.random() - 0.5) * 1.6
        wander.y = (Math.random() - 0.3) * 1.2
        wander.until = t + 1.4
      }
      nextFidget = t + 4.5 + Math.random() * 4.5
    }

    if (t > nextBlink) {
      blinkUntil = t + 0.13
      nextBlink = t + (Math.random() < 0.2 ? 0.28 : 2.4 + Math.random() * 3.2)
    }

    // Landing: extra cartoon squash proportional to impact.
    const airborne = lim.contacts === 0
    if (wasAirborne && !airborne && lastVy < -2.5) squash.v += Math.min(5, -lastVy * 0.6)
    wasAirborne = airborne
    lastVy = vbar[1]

    const droop = (mood === 'sad' ? FACES.sad.droop : 0)
    squash.v += (-150 * (squash.x - droop) - 10 * squash.v) * dt
    squash.x = THREE.MathUtils.clamp(squash.x + squash.v * dt, -0.32, 0.38)
    entryVel += (-120 * (entryScale - 1) - 7 * entryVel) * dt
    entryScale += entryVel * dt
    const breathe = Math.sin(t * 1.8) * 0.014
    lim.scale = entryScale * (1 + breathe) * (mood === 'sad' ? 0.975 : 1)
    lim.squash[0] = lim.squash[2] = 1 + squash.x * 0.55
    lim.squash[1] = 1 - squash.x
  }

  const collide = () => {
    for (let a = 0; a < bodies.length; a++) {
      for (let b = a + 1; b < bodies.length; b++) {
        const A = bodies[a]
        const B = bodies[b]
        const dx = B.center[0] - A.center[0]
        const dy = B.center[1] - A.center[1]
        const dz = B.center[2] - A.center[2]
        const dist = Math.hypot(dx, dy, dz)
        const min = radius.get(A)! + radius.get(B)!
        if (dist >= min || dist < 1e-4) continue
        const nx = dx / dist
        const ny = dy / dist
        const nz = dz / dist
        const ma = mass.get(A)!
        const mb = mass.get(B)!
        const wa = mb / (ma + mb)
        const wb = ma / (ma + mb)
        const pen = min - dist
        A.translate(-nx * pen * wa, -ny * pen * wa, -nz * pen * wa)
        B.translate(nx * pen * wb, ny * pen * wb, nz * pen * wb)
        A.velocity(tmp)
        B.velocity(tmp2)
        const rel = (tmp2[0] - tmp[0]) * nx + (tmp2[1] - tmp[1]) * ny + (tmp2[2] - tmp[2]) * nz
        if (rel >= 0) continue
        const j = -1.5 * rel
        A.kick(-nx * j * wa, -ny * j * wa, -nz * j * wa)
        B.kick(nx * j * wb, ny * j * wb, nz * j * wb)
      }
    }
  }

  const walls = (body: Jelly) => {
    const X = halfW - 0.06
    const { x, v } = body
    for (let i = 0; i < x.length; i += 3) {
      if (x[i] < -X) {
        x[i] = -X
        if (v[i] < 0) v[i] *= -0.45
      } else if (x[i] > X) {
        x[i] = X
        if (v[i] > 0) v[i] *= -0.45
      }
      if (x[i + 1] > topY) {
        x[i + 1] = topY
        if (v[i + 1] > 0) v[i + 1] *= -0.3
      }
      if (x[i + 2] < -1.2) {
        x[i + 2] = -1.2
        if (v[i + 2] < 0) v[i + 2] *= -0.45
      } else if (x[i + 2] > 1.2) {
        x[i + 2] = 1.2
        if (v[i + 2] > 0) v[i + 2] *= -0.45
      }
    }
  }

  const updateFace = (dt: number) => {
    const target = grabbed ? FACES.grabbed : t < pokedUntil ? FACES.poked : t < happyUntil ? FACES.happy : FACES[mood]
    const r = 12
    f.w = ease(f.w, target.w, r, dt)
    f.curve = ease(f.curve, target.curve, r, dt)
    f.open = ease(f.open, target.open, r, dt)
    f.blush = ease(f.blush, target.blush, 6, dt)
    f.brow = ease(f.brow, target.brow, 9, dt)
    f.browL[0] = ease(f.browL[0], target.browL[0], 9, dt)
    f.browL[1] = ease(f.browL[1], target.browL[1], 9, dt)
    f.browR[0] = ease(f.browR[0], target.browR[0], 9, dt)
    f.browR[1] = ease(f.browR[1], target.browR[1], 9, dt)
    f.sad = ease(f.sad, target.sad, 4, dt)
    f.pupil = ease(f.pupil, target.pupil, 10, dt)
    talkOpen = ease(talkOpen, 0, 16, dt)
    const blinking = !reducedMotion && t < blinkUntil
    f.lidNow = ease(f.lidNow, blinking ? 0.08 : target.lid, blinking ? 60 : 18, dt)

    uMouthW.value = f.w
    uMouthCurve.value = f.curve
    uMouthOpen.value = f.open + (mood === 'talking' ? talkOpen : 0)
    uBlush.value = f.blush
    uBrow.value = f.brow
    uBrowL.value.set(f.browL[0], f.browL[1])
    uBrowR.value.set(f.browR[0], f.browR[1])
    uSad.value = f.sad

    // Gaze: pointer/caret when fresh, otherwise idle wander; thinking looks
    // up and away, sadness looks at the floor, talking looks at you.
    lim.attach(eyeLRest, tmp)
    lim.attach(eyeRRest, tmp2)
    const [ex, ey] = toHost([(tmp[0] + tmp2[0]) / 2, (tmp[1] + tmp2[1]) / 2, (tmp[2] + tmp2[2]) / 2])
    let gx = 0
    let gy = 0
    if (mood === 'thinking') {
      gx = -0.55 + Math.sin(t * 0.9) * 0.15
      gy = 0.6
    } else if (mood === 'sad') {
      gy = -0.75
    } else if (mood === 'talking' && t - look.at > 0.6) {
      gx = Math.sin(t * 1.3) * 0.08
    } else if (t - look.at < (mood === 'typing' ? 6 : 2.5)) {
      const dx = (look.clientX - hostRect.left - ex) / (unit * 3)
      const dy = -(look.clientY - hostRect.top - ey) / (unit * 3)
      const l = Math.max(1, Math.hypot(dx, dy))
      gx = dx / l
      gy = dy / l
    } else if (t < wander.until) {
      gx = wander.x
      gy = wander.y
    }
    look.x = ease(look.x, gx, 14, dt)
    look.y = ease(look.y, gy, 14, dt)

    // Head turn + lean follow the gaze; typing leans right in.
    const leanAmt = mood === 'typing' ? 1 : 0.4
    lean.yaw = ease(lean.yaw, THREE.MathUtils.clamp(look.x, -1, 1) * 0.28 * leanAmt, 5, dt)
    lean.pitch = ease(lean.pitch, -THREE.MathUtils.clamp(look.y, -1, 1) * 0.1 * leanAmt, 5, dt)
    lean.roll = ease(lean.roll, -lean.yaw * 0.3, 5, dt)
    euler.set(lean.pitch, lean.yaw, lean.roll)
    quat.setFromEuler(euler)
    lim.uprightTarget[0] = quat.x
    lim.uprightTarget[1] = quat.y
    lim.uprightTarget[2] = quat.z
    lim.uprightTarget[3] = quat.w

    // Eyes ride the goal shape; their scale follows the local stretch.
    const sxEye = Math.hypot(tmp[0] - tmp2[0], tmp[1] - tmp2[1], tmp[2] - tmp2[2]) / restEyeGap
    lim.attach(headTopRest, tmp)
    lim.attach(baseRest, tmp2)
    const syEye = Math.hypot(tmp[0] - tmp2[0], tmp[1] - tmp2[1], tmp[2] - tmp2[2]) / restHeight
    quat.set(...lim.rotation)
    const wideEye = grabbed ? 1.1 : 1
    eyes.forEach((eye, i) => {
      lim.attach(i === 0 ? eyeLRest : eyeRRest, tmp)
      eye.group.position.set(tmp[0], tmp[1], tmp[2])
      eye.group.quaternion.copy(quat)
      const s = EYE_R * wideEye
      eye.group.scale.set(s * sxEye, s * syEye * f.lidNow, s * 0.72)
      const px = look.x * 0.44
      const py = look.y * 0.4 + (mood === 'sad' ? -0.05 : 0)
      eye.pupil.position.set(px, py, Math.sqrt(Math.max(0, 1 - px * px - py * py)) * 0.82)
      eye.pupil.scale.set(0.56 * f.pupil, 0.56 * f.pupil, 0.32)
    })
  }

  const updateShadow = (s: ReturnType<typeof makeShadow>, body: Jelly, size: number, base: number) => {
    let minY = Infinity
    for (let i = 1; i < body.x.length; i += 3) minY = Math.min(minY, body.x[i])
    const lift = Math.max(0, minY)
    s.mesh.position.x = body.center[0]
    s.mesh.position.z = body.center[2]
    const k = 1 + lift * 0.35
    s.mesh.scale.set(size * k, size * 0.62 * k, 1)
    s.strength.value = base / (1 + lift * 1.6)
  }

  const stepConfetti = (dt: number) => {
    let any = false
    for (let i = 0; i < CONF_N; i++) {
      const c = conf[i]
      if (c.life <= 0) {
        dummy.scale.setScalar(0)
      } else {
        any = true
        c.life -= dt
        if (c.p.y > 0.02) {
          c.v.y -= 6.5 * dt
          c.v.multiplyScalar(Math.exp(-1.6 * dt))
          c.v.x += Math.sin(t * 7 + i) * 1.4 * dt
          c.p.addScaledVector(c.v, dt)
          c.angle += c.spin * dt
        } else {
          c.p.y = 0.012
          c.axis.set(1, 0, 0)
          c.angle = -Math.PI / 2
        }
        dummy.position.copy(c.p)
        confQuat.setFromAxisAngle(c.axis, c.angle)
        dummy.quaternion.copy(confQuat)
        dummy.scale.setScalar(Math.min(1, c.life * 2.5))
      }
      dummy.updateMatrix()
      confetti.setMatrixAt(i, dummy.matrix)
    }
    confetti.instanceMatrix.needsUpdate = true
    confetti.visible = any
  }

  let first = true
  const frame = (dt: number) => {
    if (dt > 0) {
      t += dt
      brain(dt)
      lim.step(dt)
      for (const b of beans) b.jelly.step(dt)
      collide()
      for (const body of bodies) walls(body)
    }
    updateFace(dt)
    stepConfetti(dt)
    syncJellyGeometry(limGeo)
    uLimRot.value.setFromMatrix4(rotM4.makeRotationFromQuaternion(quat.set(...lim.rotation)))
    for (const b of beans) syncJellyGeometry(b.geo)
    updateShadow(limShadow, lim, 3.1, 0.42)
    for (const b of beans) updateShadow(b.shadow, b.jelly, 0.9, 0.24)
    renderer.render(scene, camera)
    if (opts.onAnchor) {
      lim.attach(headTopRest, tmp)
      const [ax, ay] = toHost(tmp)
      opts.onAnchor(ax, ay, unit)
    }
    if (first) {
      first = false
      opts.onFirstFrame?.()
    }
  }

  // Start each bean's geometry at its slot (the shared rest got translated).
  for (const b of beans) syncJellyGeometry(b.geo)
  await renderer.compileAsync(scene, camera)
  stage.start(frame)
  if (!reducedMotion) kicks.push({ at: 0.18, v: [0, 4.2, 0] })

  return {
    setMood(next) {
      if (next === mood) return
      if (next === 'talking') talkCount = 0
      mood = next
      stage.requestRender()
    },
    setNight(night) {
      uNight.value = night ? 1 : 0
      stage.requestRender()
    },
    lookAt(clientX, clientY) {
      look.clientX = clientX
      look.clientY = clientY
      look.at = t
    },
    hop() {
      if (reducedMotion || grabbed) return
      squash.v += 5
      kicks.push({ at: t + 0.09, v: [0, wide ? 6.6 : 5.2, 0] })
    },
    talk() {
      if (reducedMotion || t - lastTalk < 0.065) return
      lastTalk = t
      talkOpen = 0.08 + Math.random() * 0.08
      if (++talkCount % 5 === 0) {
        squash.v -= 2.4
        lim.kick(0, 1.4, 0)
      }
    },
    cheer(withConfetti) {
      happyUntil = t + 2.2
      stage.requestRender()
      if (reducedMotion) return
      squash.v += 6
      kicks.push({ at: t + 0.1, v: [0, wide ? 5.2 : 4.2, 0] })
      for (const b of beans) b.jelly.kick((Math.random() - 0.5) * 2, 4 + Math.random() * 2, 0)
      if (withConfetti) burst(64, 1)
    },
    dispose() {
      pointer.dispose()
      stage.dispose()
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose()
          const m = o.material as THREE.Material | THREE.Material[]
          for (const mat of Array.isArray(m) ? m : [m]) mat.dispose()
        }
      })
    },
  }
}

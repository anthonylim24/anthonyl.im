/**
 * How Lim looks: palette, expressions, and the TSL materials. The body is a
 * gelatin shader (soft toon ramp, light bleeding through the thin edges, a
 * studio-window highlight that shimmers with the wobble) with the mouth,
 * blush and brows painted in rest space. The eyes are painted spheres with
 * real lids, so a blink is a lid closing and a smile is a cheek pushing up.
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
  floor,
  fract,
  fwidth,
  length,
  max,
  min,
  mix,
  normalLocal,
  normalView,
  normalize,
  positionLocal,
  positionViewDirection,
  positionWorld,
  pow,
  reflect,
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
import type { Vec3 } from '../../three/jelly'

export type F = Node<'float'>
export type V2 = Node<'vec2'>
export type V3 = Node<'vec3'>

export const PAL = {
  top: '#FF8B6E',
  bottom: '#FF6F7D',
  belly: '#FFC9B2',
  shade: '#D9476C',
  light: '#FFC7AE',
  glow: '#FFB07A',
  rim: '#FFE6F2',
  nightRim: '#B7A4FF',
  ink: '#4A2F5C',
  nightInk: '#140E28',
  mouth: '#3A1838',
  tongue: '#FF8FA8',
  blush: '#FF4F86',
  brow: '#3A2350',
  pupil: '#2B2140',
  iris: '#6B3F86',
  irisLight: '#F79A6B',
  eyeShade: '#DCD4EE',
  shadow: '#5B2D55',
  heart: '#FF4F86',
}
export const TOYS: { kind: 'bean' | 'ball'; hex: string; shade: string }[] = [
  { kind: 'bean', hex: '#9EE6C8', shade: '#4FB894' },
  { kind: 'bean', hex: '#C7B6FF', shade: '#8B6FEA' },
  { kind: 'bean', hex: '#FFD978', shade: '#EDA436' },
  { kind: 'ball', hex: '#9FD3FF', shade: '#4E9BE0' },
]
export const CONFETTI = ['#FF7E6B', '#9EE6C8', '#C7B6FF', '#FFD978', '#9FD3FF', '#FF9FC5']

/* ── Expressions ─────────────────────────────────────────────────── */

export type Face = {
  /** Mouth half-width, curvature (+ smile), opening, and roundness (0 lens → 1 "o"). */
  w: number
  curve: number
  open: number
  o: number
  blush: number
  /** Lids: how far the top and bottom lids are open (0 shut → 1 wide). */
  lidTop: number
  lidBot: number
  /** Where the lids meet, and the seam's bend (+ is a happy arch). */
  seam: number
  smile: number
  /** Outer corners of the top lid: + droops (sad), − frowns (focused). */
  tilt: number
  brow: number
  browL: [number, number]
  browR: [number, number]
  sad: number
  droop: number
  pupil: number
  heart: number
  dizzy: number
}
const face = (f: Partial<Face>): Face => ({
  w: 0.16, curve: 2.4, open: 0, o: 0, blush: 0.5, lidTop: 0.92, lidBot: 1, seam: -0.3, smile: -0.35, tilt: 0,
  brow: 0, browL: [0, 0], browR: [0, 0], sad: 0, droop: 0, pupil: 1, heart: 0, dizzy: 0, ...f,
})
const HAPPY_EYES = { lidTop: 0, lidBot: 0, seam: 0.05, smile: 1 }
export const FACES = {
  idle: face({}),
  typing: face({ w: 0.11, curve: 1.6, open: 0.03, blush: 0.55, lidTop: 1, tilt: -0.06, brow: 0.9, browL: [-0.14, 0.03], browR: [0.14, 0.03], pupil: 1.08 }),
  thinking: face({ w: 0.07, curve: 0, open: 0.07, o: 0.6, blush: 0.4, lidTop: 0.78, brow: 1, browL: [-0.22, 0.07], browR: [0.1, -0.01] }),
  talking: face({ w: 0.15, curve: 1.8, open: 0.02, blush: 0.6 }),
  happy: face({ w: 0.19, curve: 2.6, open: 0.1, blush: 0.95, ...HAPPY_EYES }),
  sad: face({ w: 0.12, curve: -2.4, blush: 0.2, lidTop: 0.7, tilt: 0.3, brow: 1, browL: [0.4, 0.01], browR: [-0.4, 0.01], sad: 1, droop: 0.09, pupil: 0.9 }),
  grabbed: face({ w: 0.075, curve: 0, open: 0.12, o: 1, blush: 0.6, lidTop: 1.05, brow: 1, browL: [-0.16, 0.09], browR: [0.16, 0.09], pupil: 0.72 }),
  whee: face({ w: 0.17, curve: 2.2, open: 0.17, blush: 0.8, lidTop: 1.05, brow: 1, browL: [-0.1, 0.1], browR: [0.1, 0.1], pupil: 0.85 }),
  poked: face({ w: 0.18, curve: 2.4, open: 0.09, blush: 1, ...HAPPY_EYES }),
  worried: face({ w: 0.09, curve: -1.2, open: 0.02, blush: 0.75, lidTop: 1.05, brow: 1, browL: [0.34, 0.06], browR: [-0.34, 0.06], pupil: 0.7 }),
  sleepy: face({ w: 0.1, curve: 1, blush: 0.45, lidTop: 0.42, lidBot: 0.9 }),
  yawn: face({ w: 0.1, curve: 0, open: 0.2, o: 1, blush: 0.5, lidTop: 0.04, lidBot: 0.2, seam: -0.1, brow: 1, browL: [0.12, 0.08], browR: [-0.12, 0.08] }),
  asleep: face({ w: 0.07, curve: 1.4, open: 0.015, blush: 0.6, lidTop: 0, lidBot: 0, seam: -0.25, smile: -0.8 }),
  aah: face({ w: 0.27, curve: 0.6, open: 0.36, o: 1, blush: 0.7, lidTop: 1.05, brow: 1, browL: [-0.12, 0.1], browR: [0.12, 0.1], pupil: 1.15 }),
  chew: face({ w: 0.1, curve: 1.6, open: 0, blush: 0.95, ...HAPPY_EYES }),
  hit: face({ w: 0.11, curve: -1.6, open: 0.02, blush: 0.6, lidTop: 0, lidBot: 0, seam: -0.1, smile: -1, brow: 1, browL: [-0.45, -0.02], browR: [0.45, -0.02] }),
  dizzy: face({ w: 0.15, curve: 0, open: 0.03, blush: 0.7, lidTop: 1, dizzy: 1, brow: 1, browL: [0.2, 0.08], browR: [0.2, 0.02] }),
  love: face({ w: 0.17, curve: 2.6, open: 0.12, blush: 1, lidTop: 1.05, heart: 1 }),
  shock: face({ w: 0.06, curve: 0, open: 0.1, o: 1, blush: 0.3, lidTop: 1.1, brow: 1, browL: [0.1, 0.12], browR: [-0.1, 0.12], pupil: 0.55 }),
  squint: face({ w: 0.13, curve: -0.8, blush: 0.5, lidTop: 0.22, lidBot: 0.3, seam: 0, brow: 1, browL: [-0.3, -0.02], browR: [0.3, -0.02] }),
  ooh: face({ w: 0.06, curve: 0, open: 0.08, o: 1, blush: 0.6, lidTop: 1.08, brow: 1, browL: [-0.1, 0.1], browR: [0.1, 0.1], pupil: 1.2 }),
  smug: face({ w: 0.17, curve: 2.7, blush: 0.85, lidTop: 0.62, brow: 1, browL: [0.04, -0.01], browR: [-0.2, 0.09] }),
} satisfies Record<string, Face>
export type FaceName = keyof typeof FACES

/* ── Shared uniforms ─────────────────────────────────────────────── */

export function createLimUniforms(night: boolean) {
  return {
    night: uniform(night ? 1 : 0),
    time: uniform(0),
    sad: uniform(0),
    mouthW: uniform(0.16),
    mouthCurve: uniform(2.4),
    mouthOpen: uniform(0),
    mouthO: uniform(0),
    /** Sideways shift of the mouth (chewing, pursing while thinking). */
    mouthX: uniform(0),
    blush: uniform(0.5),
    brow: uniform(0),
    browL: uniform(new THREE.Vector2()),
    browR: uniform(new THREE.Vector2()),
    /** A bean Lim just ate shows through for a while. */
    tint: uniform(new THREE.Color('#9EE6C8')),
    tintAmt: uniform(0),
    /** Rest-space height the tint has risen to (it fills Lim from the belly up). */
    tintLevel: uniform(2),
    disco: uniform(0),
    rot: uniform(new THREE.Matrix3()),
  }
}
export type LimUniforms = ReturnType<typeof createLimUniforms>

/* ── Shading ─────────────────────────────────────────────────────── */

// View-space key light, upper left and in front: camera-relative so the bands
// and the window highlight stay put however the stage is framed.
const L = new THREE.Vector3(-0.45, 0.72, 0.53).normalize()
// The window highlight sits further up and round the crown than the key
// itself, clear of the brows and eyes.
const H = new THREE.Vector3(-0.58, 1.08, 0.3).normalize()
const LR = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), H).normalize()
const LU = new THREE.Vector3().crossVectors(H, LR).normalize()
export const LIGHT = vec3(L.x, L.y, L.z)

/** A colour constant, typed as the vec3 it behaves as. */
export const col = (hex: string) => color(hex) as unknown as V3

export const aaStep = (d: F, aa = 0.006) => float(1).sub(smoothstep(-aa, aa, d))

/**
 * Soft-body normals carry every ripple of the particle sim; blending in the
 * rest normal (turned by the body's rotation) keeps the shading bands smooth
 * while the silhouette still squashes. `spec` keeps more of the ripple so the
 * highlight shimmers when Lim jiggles.
 */
export function smoothNormals(rot: Node<'mat3'>, amount: number): { local: V3; view: V3; spec: V3 } {
  const restN = attribute('restNormal', 'vec3') as unknown as V3
  const turned = rot.mul(restN) as unknown as V3
  const turnedView = normalize(cameraViewMatrix.mul(vec4(turned, 0)).xyz)
  const live = normalize(normalView)
  return {
    local: normalize(mix(normalLocal, turned, amount)),
    view: normalize(mix(live, turnedView, amount)),
    spec: normalize(mix(live, turnedView, Math.min(0.9, amount * 1.4))),
  }
}

export function addRestNormals(geo: THREE.BufferGeometry) {
  geo.setAttribute('restNormal', geo.attributes.normal.clone())
}

type GelOptions = {
  base: V3
  shade: V3
  light: V3
  rim: V3
  rimAmt: F
  /** Light that bleeds through the thin far edge. */
  glow: V3
  /** Size of the window highlight (0 = a plain round glint). */
  window: number
  /** Where the highlight may draw (1 = anywhere). */
  gloss?: F
}

/** Gelatin: soft toon ramp + edge translucency + floor bounce + window glint. */
export function gel(n: V3, spec: V3, o: GelOptions): V3 {
  const v = positionViewDirection
  const ndl = dot(n, LIGHT)
  const wrap = saturate(ndl.add(0.45).div(1.45))
  let c: V3 = mix(o.shade, o.base, smoothstep(0.12, 0.54, wrap))
  c = mix(c, o.light, smoothstep(0.74, 0.94, wrap).mul(0.42))
  const ndv = saturate(dot(n, v))
  const thin = pow(float(1).sub(ndv), 1.5)
  // Light crossing the body lights up the thin rim on the shadow side.
  c = c.add(o.glow.mul(thin.mul(saturate(float(0.35).sub(ndl))).mul(0.6)))
  // The floor bounces a little warmth into the underside.
  c = c.add(o.light.mul(saturate(n.y.negate().sub(0.2)).mul(0.16)))
  c = c.add(o.rim.mul(pow(float(1).sub(ndv), 2.6).mul(o.rimAmt)))

  const r = reflect(v.negate(), spec)
  const hx = dot(r, vec3(LR.x, LR.y, LR.z))
  const hy = dot(r, vec3(LU.x, LU.y, LU.z))
  const facing = smoothstep(0.2, 0.5, dot(r, vec3(H.x, H.y, H.z)))
  if (o.window > 0) {
    const s = o.window * 0.66
    // A softbox with a mullion: the "there's a window in the room" highlight.
    const q = vec2(abs(hx).sub(0.2 * s), abs(hy).sub(0.27 * s))
    const box = length(max(q, 0)).add(min(max(q.x, q.y), 0)).sub(0.1 * s)
    const pane = smoothstep(0.012, 0.03, abs(hx.add(0.02))).mul(smoothstep(0.012, 0.03, abs(hy.sub(0.05))))
    const win = float(1).sub(smoothstep(-0.02, 0.03, box)).mul(mix(float(0.55), float(1), pane)).mul(facing)
    c = mix(c, vec3(1, 1, 1), win.mul(0.7).mul(o.gloss ?? 1))
    const dot2 = float(1).sub(smoothstep(0.045 * s, 0.075 * s, length(vec2(hx.sub(0.52 * s), hy.add(0.3 * s)))))
    c = mix(c, vec3(1, 1, 1), dot2.mul(facing).mul(0.6))
  } else {
    const glint = float(1).sub(smoothstep(0.16, 0.24, length(vec2(hx, hy))))
    c = mix(c, vec3(1, 1, 1), glint.mul(facing).mul(0.8))
  }
  return c
}

export function hullMaterial(ink: V3, width: number, normal: V3 = normalLocal) {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide })
  m.positionNode = positionLocal.add(normal.mul(width))
  m.colorNode = ink
  return m
}

export const inkOf = (u: LimUniforms): V3 => mix(col(PAL.ink), col(PAL.nightInk), u.night)

/** Lim's skin tones under the current tint, mood and time of day. */
function skin(u: LimUniforms, base: V3, height: F) {
  const filled = float(1).sub(smoothstep(u.tintLevel.sub(0.3), u.tintLevel, height))
  const tinted = mix(base, u.tint as unknown as V3, u.tintAmt.mul(filled))
  const b = mix(tinted, col('#D9939B'), u.sad.mul(0.4)).mul(mix(float(1), float(0.84), u.night))
  const shade = mix(mix(col(PAL.shade), (u.tint as unknown as V3).mul(0.62), u.tintAmt), col('#9A3A7C'), u.night)
  return {
    base: b,
    shade,
    light: mix(col(PAL.light), vec3(1, 1, 1), u.tintAmt.mul(0.4)).mul(mix(float(1), float(0.86), u.night)),
    rim: mix(col(PAL.rim), col(PAL.nightRim), u.night),
    rimAmt: mix(float(0.5), float(0.95), u.night),
    glow: mix(mix(col(PAL.glow), u.tint as unknown as V3, u.tintAmt), col('#8E7BFF'), u.night),
  }
}

export type FaceAnchors = { restC: Vec3; eyeX: number; eyeY: number }

/** Lim's body colour: gel shading plus the painted blush, brows and mouth. */
export function limBodyColor(u: LimUniforms, n: { view: V3; spec: V3 }, a: FaceAnchors, window = 1): V3 {
  const rest = attribute('rest', 'vec3') as unknown as V3
  const rn = normalize(rest.sub(vec3(...a.restC)))
  const front = smoothstep(0.3, 0.55, rn.z)
  const p = rest.xy as V2

  let base: V3 = mix(col(PAL.bottom), col(PAL.top), smoothstep(-0.8, 0.9, rest.y))
  const belly = float(1).sub(smoothstep(0.22, 0.62, length(vec2(p.x.mul(0.85), p.y.add(0.42))))).mul(front)
  base = mix(base, col(PAL.belly), belly.mul(0.55))
  const s = skin(u, base, rest.y)
  // The highlight keeps off the face: nothing glossy crosses a brow or an eye.
  const gloss = float(1).sub(front.mul(float(1).sub(smoothstep(a.eyeY + 0.36, a.eyeY + 0.46, rest.y))))
  let c = gel(n.view, n.spec, { ...s, window, gloss })
  // At night the jelly glows a little from inside.
  c = c.add(s.rim.mul(u.night).mul(0.07))

  const cheekY = a.eyeY - 0.29
  const cheekX = a.eyeX + 0.24
  const cheek = (x: number) => float(1).sub(smoothstep(0.05, 0.15, length(vec2(p.x.sub(x), p.y.sub(cheekY).mul(1.4)))))
  c = mix(c, col(PAL.blush), cheek(-cheekX).add(cheek(cheekX)).mul(u.blush).mul(front).mul(0.78))

  // Brows: rounded segments, tilt (radians) + raise per side.
  const brow = (x: number, b: typeof u.browL) => {
    const qx = p.x.sub(x)
    const qy = p.y.sub(b.y.add(a.eyeY + 0.31))
    const cs = cos(b.x)
    const sn = sin(b.x)
    const rx = qx.mul(cs).add(qy.mul(sn))
    const ry = qy.mul(cs).sub(qx.mul(sn))
    return aaStep(length(vec2(max(abs(rx).sub(0.085), 0), ry)).sub(0.024))
  }
  c = mix(c, col(PAL.brow), brow(-a.eyeX, u.browL).add(brow(a.eyeX, u.browR)).min(1).mul(u.brow).mul(front))

  // Mouth: the lens between two parabolas, rounding into an "o"; teeth and a
  // tongue show once it opens.
  const mx = p.x.sub(u.mouthX)
  const my = p.y.sub(a.eyeY - 0.33)
  const q = mx.div(u.mouthW)
  const ex = max(float(1).sub(q.mul(q)), 0)
  const mid = u.mouthCurve.mul(mx.mul(mx))
  const top = mid.add(0.022).add(u.mouthOpen.mul(ex).mul(0.28))
  const bot = mid.sub(0.022).sub(u.mouthOpen.mul(ex))
  const lens = max(abs(mx).sub(u.mouthW), max(my.sub(top), bot.sub(my)))
  const oRx = u.mouthW.mul(0.85).add(0.03)
  const oRy = u.mouthOpen.mul(0.62).add(0.03)
  const oY = my.add(u.mouthOpen.mul(0.36))
  const round = length(vec2(mx.div(oRx), oY.div(oRy))).sub(1).mul(min(oRx, oRy))
  const d = mix(lens, round, saturate(u.mouthO.mul(1.25)))
  const mouth = aaStep(d).mul(front)
  const tongue = aaStep(my.sub(bot.add(u.mouthOpen.mul(0.5)))).mul(smoothstep(0.035, 0.075, u.mouthOpen))
  const teeth = aaStep(top.sub(0.03).sub(u.mouthOpen.mul(0.16)).sub(my))
    .mul(smoothstep(0.06, 0.1, u.mouthOpen))
    .mul(float(1).sub(u.mouthO))
  let inside: V3 = mix(col(PAL.mouth), col(PAL.tongue), tongue)
  inside = mix(inside, col('#FFF8F2'), teeth)
  return mix(c, inside, mouth)
}

/* ── Eyes ────────────────────────────────────────────────────────── */

export type EyeUniforms = ReturnType<typeof createEyeMaterial>['u']

/**
 * One eye, painted on a unit sphere facing +z: sclera, iris, pupil, two
 * catch-lights, hearts and dizzy spirals, then the lids over the top.
 * `side` is −1 for Lim's right eye (screen left), +1 for the other.
 */
export function createEyeMaterial(lim: LimUniforms, side: number) {
  const u = {
    look: uniform(new THREE.Vector2()),
    pupil: uniform(1),
    lidTop: uniform(0.92),
    lidBot: uniform(1),
    seam: uniform(-0.3),
    smile: uniform(-0.35),
    tilt: uniform(0),
    heart: uniform(0),
    dizzy: uniform(0),
  }
  const mat = new THREE.MeshBasicNodeMaterial()
  const p = positionLocal.xy as V2
  const nv = normalize(normalView)
  const lit = dot(nv, LIGHT)

  let c: V3 = mix(col(PAL.eyeShade), col('#FFFFFF'), smoothstep(-0.3, 0.6, lit))
  const q = p.sub(u.look)
  const r = length(q)
  const ang = atan(q.y, q.x)
  const IR = u.pupil.mul(0.6)
  const PR = u.pupil.mul(0.33)
  const plain = float(1).sub(max(u.heart, u.dizzy))

  // Iris: plum up top, a warm crescent underneath (where the light pools).
  let iris: V3 = mix(col(PAL.irisLight), col(PAL.iris), smoothstep(-0.75, 0.25, q.y.div(IR)))
  iris = iris.mul(sin(ang.mul(22)).mul(0.06).add(1))
  iris = mix(iris, col(PAL.pupil), smoothstep(0.74, 1, r.div(IR)))
  c = mix(c, iris, aaStep(r.sub(IR), 0.02).mul(plain))
  c = mix(c, col(PAL.pupil), aaStep(r.sub(PR), 0.02).mul(plain))

  // Hearts.
  const hp = vec2(abs(q.x).div(0.62), q.y.div(0.62).add(0.28))
  const hd = length(vec2(hp.x, hp.y.sub(pow(hp.x, 0.62).mul(0.72)))).sub(0.72)
  c = mix(c, col(PAL.heart), aaStep(hd, 0.03).mul(u.heart))

  // Dizzy: a spiral that keeps turning.
  const pr = length(p)
  const spiral = sin(atan(p.y, p.x).mul(side).add(pr.mul(15)).sub(lim.time.mul(9)))
  c = mix(c, col(PAL.pupil), smoothstep(0.1, 0.35, spiral).mul(float(1).sub(smoothstep(0.7, 0.8, pr))).mul(u.dizzy))

  // Catch-lights sit on the cornea, so they barely move with the iris.
  const glint = (x: number, y: number, rad: number) =>
    aaStep(length(p.sub(u.look.mul(0.55)).sub(vec2(x, y))).sub(rad), 0.02)
  c = mix(c, vec3(1, 1, 1), glint(-0.2, 0.25, 0.17).add(glint(0.2, -0.2, 0.07)).min(1).mul(float(1).sub(u.dizzy)))

  // Lids. The top lid can tilt; both close toward a shared seam.
  const tilt = u.tilt.mul(side)
  const lx = p.x.mul(cos(tilt)).sub(p.y.mul(sin(tilt)))
  const ly = p.x.mul(sin(tilt)).add(p.y.mul(cos(tilt)))
  const seamAt = (x: F) => u.seam.add(u.smile.mul(float(0.14).sub(x.mul(x).mul(0.55))))
  const topLine = mix(seamAt(lx), float(1.4).sub(lx.mul(lx).mul(0.25)), u.lidTop)
  const botLine = mix(seamAt(p.x), float(-1.4), u.lidBot)
  const topLid = smoothstep(-0.02, 0.02, ly.sub(topLine))
  const botLid = smoothstep(-0.02, 0.02, botLine.sub(p.y))
  // The top lid shades the eyeball just under it.
  c = c.mul(mix(float(1), float(0.8), smoothstep(-0.42, 0, ly.sub(topLine)).mul(float(1).sub(u.dizzy))))
  const s = skin(lim, mix(col(PAL.bottom), col(PAL.top), 0.62), float(0.2))
  // Lids take the same ramp as the skin around them, so a shut eye melts into the face.
  const lidWrap = saturate(lit.add(0.45).div(1.45))
  const lidCol = mix(mix(s.shade, s.base, smoothstep(0.12, 0.54, lidWrap)), s.light, smoothstep(0.74, 0.94, lidWrap).mul(0.42))
  const lidNight = lidCol.add(s.rim.mul(lim.night).mul(0.07))
  const closing = float(1).sub(smoothstep(0.85, 1, u.lidTop))
  const lash = aaStep(abs(ly.sub(topLine)).sub(0.05), 0.02).mul(closing)
  const lashBot = aaStep(abs(p.y.sub(botLine)).sub(0.05), 0.02).mul(float(1).sub(smoothstep(0.75, 0.95, u.lidBot)))
  c = mix(c, lidNight, max(topLid, botLid))
  c = mix(c, inkOf(lim), max(lash.mul(float(1).sub(botLid)), lashBot))
  mat.colorNode = c
  return { mat, u }
}

/* ── Toys, floor, shadows ────────────────────────────────────────── */

export function toyMaterial(u: LimUniforms, hex: string, shadeHex: string) {
  const mat = new THREE.MeshBasicNodeMaterial()
  const n = normalize(normalView)
  mat.colorNode = gel(n, n, {
    base: col(hex).mul(mix(float(1), float(0.8), u.night)),
    shade: col(shadeHex).mul(mix(float(1), float(0.7), u.night)),
    light: col('#FFFFFF').mul(0.92),
    rim: mix(col('#FFFFFF'), col(PAL.nightRim), u.night),
    rimAmt: float(0.45),
    glow: col(hex),
    window: 0,
  })
  return mat
}

const rainbow = (h: F): V3 => cos(vec3(0, 0.33, 0.67).add(h).mul(6.2832)).mul(0.5).add(0.5) as unknown as V3

export function floorMaterial(u: LimUniforms) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true })
  const wp = positionWorld.xz as V2
  const grid = wp.mul(1.5)
  const cell = fract(grid).sub(0.5)
  const id = floor(grid)
  const dd = length(cell)
  const aa = fwidth(dd).mul(1.2)
  // Dots fade out toward the horizon before they can shimmer.
  const dots = float(1).sub(smoothstep(float(0.085).sub(aa), float(0.085).add(aa), dd)).mul(smoothstep(-6, -1.5, wp.y))
  const r = length(wp)
  const edge = float(1.6).add(cos(atan(wp.y, wp.x).mul(18)).mul(0.035))
  const ea = fwidth(r).mul(1.5)
  const rug = float(1).sub(smoothstep(edge.sub(ea), edge.add(ea), r))
  const ring = smoothstep(1.16, 1.18, r).mul(float(1).sub(smoothstep(1.24, 1.26, r)))
  let c: V3 = mix(col('#FCE5D8'), col('#2A2250'), u.night)
  let dotCol: V3 = mix(col('#F7CDBF'), col('#3B3170'), u.night)
  // Disco: every dot picks its own colour and they all change on the beat.
  const hash = fract(sin(dot(id, vec2(12.9898, 78.233))).mul(43758.5453))
  const lit = rainbow(hash.add(floor(u.time.mul(4)).mul(0.37)))
  dotCol = mix(dotCol, mix(lit, vec3(1, 1, 1), 0.42), u.disco)
  c = mix(c, dotCol, dots.mul(mix(float(0.8), float(1), u.disco)))
  c = mix(c, mix(col('#C8F0E0'), col('#3D3474'), u.night), rug.mul(mix(float(1), float(0.82), u.disco)))
  c = mix(c, mix(col('#A6E3CA'), col('#4F4592'), u.night), ring.mul(rug))
  mat.colorNode = c
  mat.opacityNode = smoothstep(-7.5, -2.5, wp.y).mul(float(1).sub(smoothstep(9, 12, abs(wp.x))))
  return mat
}

/**
 * Soft contact shadow. `caustic` adds what real gelatin does: the shadow takes
 * the jelly's colour and a bright spot where the body focuses the light.
 */
export function shadowMaterial(u: LimUniforms, tint: string | null) {
  const strength = uniform(0.3)
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
  const d = length(uv().sub(0.5)).mul(2)
  let c: V3 = mix(col(PAL.shadow), col('#07040F'), u.night)
  const alpha: F = pow(saturate(float(1).sub(d)), 1.5).mul(strength)
  if (tint) {
    const through = mix(col(tint), u.tint as unknown as V3, u.tintAmt)
    c = mix(c, through.mul(mix(float(0.7), float(0.5), u.night)), 0.24)
    const spot = float(1).sub(smoothstep(0, 0.42, length(uv().sub(vec2(0.57, 0.46))).mul(2)))
    c = mix(c, mix(col('#FFC2A6'), through, u.tintAmt).mul(mix(float(1), float(0.6), u.night)), spot.mul(0.5))
  }
  mat.colorNode = c
  mat.opacityNode = alpha
  return { mat, strength }
}

/** A ring that spreads across the floor (landings, taps). */
export function rippleMaterial(u: LimUniforms) {
  const k = uniform(1)
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
  const d = length(uv().sub(0.5)).mul(2)
  const width = mix(float(0.16), float(0.05), k)
  const band = smoothstep(float(1).sub(width.mul(2)), float(1).sub(width), d).mul(float(1).sub(smoothstep(float(1).sub(width.mul(0.6)), 1, d)))
  mat.colorNode = mix(col('#FFFFFF'), col(PAL.nightRim), u.night)
  mat.opacityNode = band.mul(float(1).sub(k)).mul(0.75)
  return { mat, k }
}

/** The bubble Lim blows from its nose while asleep: a rim, a glint, not much else. */
export function bubbleMaterial(u: LimUniforms) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
  const n = normalize(normalView)
  const fres = pow(float(1).sub(saturate(dot(n, positionViewDirection))), 2.2)
  const glint = float(1).sub(smoothstep(0.1, 0.2, length(n.xy.sub(vec2(-0.42, 0.45)))))
  mat.colorNode = mix(mix(col('#CFE9FF'), col('#B7A4FF'), u.night), vec3(1, 1, 1), glint)
  mat.opacityNode = fres.mul(0.8).add(0.3).add(glint.mul(0.7)).min(1)
  return mat
}

/** Night glow behind Lim. */
export function haloMaterial(u: LimUniforms) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  const d = length(uv().sub(0.5)).mul(2)
  mat.colorNode = mix(col('#FF8FA8'), col('#8E7BFF'), 0.55)
  mat.opacityNode = pow(saturate(float(1).sub(d)), 2.2).mul(u.night).mul(0.34)
  return mat
}

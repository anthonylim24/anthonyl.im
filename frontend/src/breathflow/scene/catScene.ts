/**
 * BreathFlow's breath companion: a watercolour cat that breathes with you,
 * painted in the technique's pigments on cotton paper. Body and head are
 * shape-matching jellies (src/three/jelly.ts); ears, paws and the tail ride
 * them with `attach`. The face (eyes, nose, mouth, whiskers, blush) is painted
 * in rest space so it follows every wobble.
 *
 *  - inhale: the chest swells and lifts the head, ears perk, eyes widen and
 *    the whiskers rise; the tail curls up.
 *  - hold (full): cheeks puff, everything goes still apart from a tiny shiver.
 *  - exhale: a long "haa" sigh, eyes go soft, shoulders and ears drop, and
 *    the tail sways slowly.
 *  - hold (empty): eyes closed in a contented squint.
 *  - idle: blinks, ear twitches, a lazy tail swish. Poke for a giggle.
 *  - drag (mouse or touch): the body goes loose and stretches after the
 *    finger, then boings home, wobbles and squashes on the paper.
 *
 * Easter egg: five quick taps and the cat pops (in a paint splash) into a
 * pink puffball who puffs up hugely on the inhale, floats on the hold, and
 * blows little clouds of air on the exhale. Five more taps bring the cat back.
 *
 * Everything is TSL, painting over the same paper as the background sheet
 * (wet-in-wet blooms, flicked splatter) with paint fields baked once in
 * paintTextures.ts.
 */
import * as THREE from 'three/webgpu'
import {
  abs,
  attribute,
  clamp,
  color,
  dot,
  float,
  length,
  max,
  min,
  mix,
  mrt,
  normalLocal,
  normalView,
  normalize,
  output,
  pass,
  positionLocal,
  positionViewDirection,
  pow,
  saturate,
  screenUV,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import type { Node } from 'three/webgpu'
import { ao } from 'three/addons/tsl/display/GTAONode.js'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { filmHD } from 'three-blocks/core-tsl-effects'
import { Jelly, icosphere, type Vec3 } from '@/three/jelly'
import { jellyGeometry, syncJellyGeometry } from '@/three/jellyMesh'
import { bindJellyPointer, type JellyPointer } from '@/three/jellyPointer'
import { createStage, type Stage } from '@/three/stage'
import type { Pigment } from '../pigments'
import type { BreathSample } from './breathDrive'
import { SPLATTER_EXTENT, noiseTexture, splatterTexture } from './paintTextures'

type F = Node<'float'>
type V2 = Node<'vec2'>
type V3 = Node<'vec3'>

export type BloomMode = 'play' | 'calm'

export type BloomSceneOptions = {
  canvas: HTMLCanvasElement
  /** Sizes the canvas; the loop pauses while it is off screen. */
  host: HTMLElement
  /** The cat sits at this element's centre, sized to fit inside it. */
  anchor: HTMLElement
  /** Receives drag/poke in play mode. */
  pointerHost: HTMLElement
  mode: BloomMode
  reducedMotion: boolean
  night: boolean
  pigment: Pigment
  /** Edge vignette (full-screen session only; the hero blends into the page). */
  vignette: boolean
  read: () => BreathSample
  onFirstFrame: () => void
}

export type BloomScene = {
  setPigment(pigment: Pigment): void
  setNight(night: boolean): void
  /** A gentle press at a client point (session tap). Counts toward the easter egg. */
  poke(clientX: number, clientY: number): void
  requestRender(): void
  dispose(): void
}

type Form = 'cat' | 'puff'
/** Survives remounts, so a puffball on Home is still a puffball in the session. */
let form: Form = 'cat'
const EGG_TAPS = 5
const EGG_WINDOW = 2.5

const FOV = 30
const CAM_Z = 10
const PAPER_DAY = '#F7F1E6'
const PAPER_NIGHT = '#15161C'

// Unit layout (1 = cat unit; the whole cat spans about -1.1 … 1.2).
const BODY_Y = -0.6
const HEAD_Y = 0.33
const PUFF_Y = -0.12

const PAINT = {
  iris: '#D9A13B',
  nose: '#D9707F',
  earInner: '#E69AA6',
  blush: '#E9737F',
  mouth: '#5A2232',
  puffMass: '#F28AB0',
  puffGlaze: '#FDBDD2',
  puffFeet: '#DA1F4A',
  puffEye: '#15112C',
  puffEyeLow: '#2F5BE8',
  puffBlush: '#F2507C',
  air: '#9CC3E6',
  moon: '#C9D6FF',
  moonGlint: '#F1F4FF',
}

type Face = {
  open: number // eye opening (0 shut … 1.2 wide)
  lid: number // shut-eye arc: +1 relaxed ‿, -1 happy ∩
  squint: number // shut eyes squeezed into > < (puffball)
  pupil: number // pupil width
  mouth: number // open mouth
  blush: number
  whisker: number // radians up
  ear: number // perk (+) / droop (−)
  puff: number // cheek puff
}
const face = (f: Partial<Face>): Face => ({ open: 1, lid: -1, squint: 0, pupil: 0.35, mouth: 0, blush: 0.2, whisker: 0, ear: 0, puff: 0, ...f })

/** Hex → linear RGB as a vec3 uniform value. */
function rgb(hex: string): THREE.Vector3 {
  const c = new THREE.Color(hex)
  return new THREE.Vector3(c.r, c.g, c.b)
}

const smooth01 = (x: number) => Math.min(1, Math.max(0, x))
const aaStep = (d: F, aa = 0.007) => float(1).sub(smoothstep(-aa, aa, d))
const LIGHT = normalize(vec3(-0.45, 0.72, 0.53))
/** Moonlight from behind, upper right (view space), for the night rim. */
const RIM_DIR = normalize(vec3(0.7, 0.45, -0.55))

function shape(detail: number, fn: (x: number, y: number, z: number) => Vec3): { positions: Float32Array; index: Uint32Array } {
  const { positions, index } = icosphere(1, detail)
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = fn(positions[i], positions[i + 1], positions[i + 2])
    positions[i] = x
    positions[i + 1] = y
    positions[i + 2] = z
  }
  return { positions, index }
}

// Sitting cat: a pear, wider and flat at the base.
const catBody = (x: number, y: number, z: number): Vec3 => {
  const low = Math.pow((1 - y) / 2, 1.4)
  let ny = y * 0.62
  if (ny < -0.48) ny = -0.48 + (ny + 0.48) * 0.3
  return [x * 0.53 * (1 + 0.34 * low), ny, z * 0.5 * (1 + 0.28 * low)]
}
// Head: wide, with fuller cheeks low down.
const catHead = (x: number, y: number, z: number): Vec3 => [x * 0.6 * (1 + 0.12 * Math.max(0, -y)), y * 0.5, z * 0.5]
const puffBody = (x: number, y: number, z: number): Vec3 => [x * 0.9, y * 0.86, z * 0.88]

export async function createBloomScene(opts: BloomSceneOptions): Promise<BloomScene> {
  const { canvas, host, reducedMotion } = opts
  const stage = await createStage({ canvas, host, reducedMotion, maxDpr: 2 })
  try {
    return await buildScene(opts, stage)
  } catch (error) {
    stage.dispose()
    throw error
  }
}

async function buildScene(opts: BloomSceneOptions, stage: Stage): Promise<BloomScene> {
  const { host, anchor, pointerHost, mode, reducedMotion, read, onFirstFrame } = opts
  const { renderer } = stage
  const T = stage.time as F
  // High tier (WebGPU): contact occlusion pooled as pigment, a moonlit glow
  // at night, and pen hatching in the shadows. Dropped if frames struggle.
  // `?quality=base|high` forces a tier (for comparing).
  const forced = new URLSearchParams(location.search).get('quality')
  let hq = forced ? forced === 'high' : (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100)
  camera.position.set(0, 0, CAM_Z)

  // ── Uniforms ─────────────────────────────────────────────────────
  const uMass = uniform(rgb(opts.pigment.mass))
  const uGlaze = uniform(rgb(opts.pigment.glaze))
  const uNight = uniform(opts.night ? 1 : 0)
  const uBreath = uniform(0.5)
  const uAspect = uniform(1)
  /** Cat centre in screen UV (y down) and its splatter radius in UV-height units. */
  const uCentre = uniform(new THREE.Vector2(0.5, 0.5))
  const uRadius = uniform(0.2)
  /** One cat unit in UV-height units (for the shadow under it). */
  const uUnitUV = uniform(0.2)
  /** World units per cat unit. */
  const uUnit = uniform(1)
  const uHull = uniform(0.02)
  const uDrop = uniform(new THREE.Vector2(0.5, 0.5))
  const uDropAge = uniform(1)
  const uDropSize = uniform(1)
  const uVignette = uniform(opts.vignette ? 1 : 0)
  // Face (shared by both forms; only one is on screen at a time).
  const uOpen = uniform(1)
  const uLid = uniform(-1)
  const uPupil = uniform(0.35)
  const uMouth = uniform(0)
  const uBlush = uniform(0.2)
  const uWhisker = uniform(0)
  const uSquint = uniform(0)
  const uHQ = uniform(hq ? 1 : 0)
  /** The contact shadow: x in screen UV, and how far the body is lifted (cat units). */
  const uShadowX = uniform(0.5)
  const uLift = uniform(0)
  const paperDay = uniform(rgb(PAPER_DAY))
  const paperNight = uniform(rgb(PAPER_NIGHT))
  const massNode = uMass
  const glazeNode = uGlaze
  // Pen lines stay dark at night too: pale lines glowed like neon on the dark
  // paper; the moonlit rim separates the silhouette instead.
  const ink = mix(massNode.mul(0.3), mix(massNode.mul(0.18), vec3(0.03, 0.035, 0.055), 0.6), uNight) as V3

  // Day: Beer–Lambert glaze, so washes stay chromatic as they thin (paper ×
  // pigment^thickness). Night: luminous pigment laid over dark paper.
  const glaze = (under: V3, pigment: V3, density: F): V3 => {
    const day = under.mul(pow(max(pigment, vec3(0.002)), vec3(density.mul(1.35))))
    const night = mix(under, mix(pigment, vec3(1), 0.3), clamp(density.mul(0.9), 0, 1))
    return mix(day, night, uNight)
  }

  const noiseTex = noiseTexture()
  const splatterTex = splatterTexture()
  const noise = (uv: V2) => texture(noiseTex, uv)

  /** The painted paper at a screen point; the cat is glazed over it too. */
  const paper = (st: V2, splatter: boolean): V3 => {
    const p = vec2(st.x.mul(uAspect), st.y)
    const c = vec2(uCentre.x.mul(uAspect), uCentre.y)
    const spread = uBreath.mul(0.34).add(0.74)
    const drift = vec2(T.mul(0.0031), T.mul(-0.0023))
    const coarse = noise(p.mul(0.55).add(drift)).r.mul(2).sub(1)
    const fine = noise(p.mul(0.8).sub(drift.mul(1.3)).add(0.37)).g.mul(2).sub(1)
    const tooth = noise(p.mul(1.1)).b.mul(2).sub(1)
    const settle = tooth.mul(0.5).add(0.85)
    let col: V3 = mix(paperDay, paperNight, uNight).mul(tooth.mul(0.035).add(1))

    // Wet-in-wet blooms behind the cat; they spread on the inhale.
    const blooms: [number, number, number, number, 'mass' | 'glaze'][] = [
      [0.05, 0.15, 1.7, 0.22, 'mass'],
      [-1.5, 0.9, 0.95, 0.36, 'glaze'],
      [1.55, -0.8, 0.8, 0.26, 'mass'],
      [0.7, 1.75, 0.58, 0.32, 'glaze'],
    ]
    for (const [dx, dy, size, strength, which] of blooms) {
      const centre = c.add(vec2(dx, dy).mul(uRadius))
      const r = uRadius.mul(size).mul(spread)
      const d = length(p.sub(centre)).div(r).add(coarse.mul(0.42)).add(fine.mul(0.13))
      const body = float(1).sub(smoothstep(0.25, 1, d))
      const tide = smoothstep(0.84, 0.975, d).mul(float(1).sub(smoothstep(0.975, 1.03, d)))
      const density = body.mul(0.42).add(tide.mul(0.55)).mul(strength).mul(settle).mul(mix(1, 0.5, uNight))
      col = glaze(col, which === 'mass' ? massNode : glazeNode, density)
    }

    // A wash of shadow pooled under the cat. It follows the body when dragged,
    // spreading out and fading as it's lifted off the paper.
    const spreadUp = uLift.mul(0.5).add(1)
    const sc = vec2(uShadowX.mul(uAspect), c.y.add(uUnitUV.mul(1.06)))
    const sh = p.sub(sc).div(vec2(uUnitUV.mul(0.85), uUnitUV.mul(0.16)).mul(spreadUp))
    const shadow = float(1).sub(smoothstep(0.5, 1, length(sh).add(fine.mul(0.12)))).div(uLift.mul(2.2).add(1))
    // By day a glaze of pigment; at night the dark paper just gets darker.
    col = mix(glaze(col, massNode, shadow.mul(0.3).mul(settle)), col.mul(float(1).sub(shadow.mul(0.45))), uNight)

    if (splatter) {
      const flick = uBreath.mul(0.16).add(0.92)
      const su = p.sub(c).div(uRadius.mul(SPLATTER_EXTENT * 2).mul(flick)).add(0.5)
      const splat = texture(splatterTex, su)
      col = glaze(col, massNode, splat.r.mul(1.05).mul(settle))
      col = glaze(col, glazeNode, splat.g.mul(1.05).mul(settle))
    }

    // A drop of clean glaze where the cat was poked, spreading as it dries.
    const age = clamp(uDropAge, 0, 1)
    const dc = vec2(uDrop.x.mul(uAspect), uDrop.y)
    const dd = length(p.sub(dc)).div(uRadius.mul(age.mul(0.85).add(0.18)).mul(uDropSize)).add(fine.mul(0.24))
    const drop = float(1).sub(smoothstep(0.55, 1, dd)).mul(0.32).add(
      smoothstep(0.82, 0.97, dd).mul(float(1).sub(smoothstep(0.97, 1.03, dd))).mul(0.5),
    ).mul(float(1).sub(age)).mul(0.6)
    col = glaze(col, glazeNode, drop)
    return col
  }

  // ── Paper sheet ──────────────────────────────────────────────────
  const sheetMat = new THREE.MeshBasicNodeMaterial()
  sheetMat.colorNode = paper(screenUV, true)
  sheetMat.depthWrite = false
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sheetMat)
  sheet.position.z = -4
  sheet.renderOrder = -1
  scene.add(sheet)

  // ── Watercolour shading ──────────────────────────────────────────
  const paperUnder = paper(screenUV, false)
  const under = paperUnder
  const grain = noise(screenUV.mul(vec2(uAspect, 1)).mul(1.1)).b
  const rag = noise(screenUV.mul(vec2(uAspect, 1)).mul(2.6)).r.sub(0.5).mul(0.16)
  /**
   * One light for every painted surface: a key light upper left, a soft fill,
   * light bounced up off the paper into the undersides, a specular sheen
   * reserved from the paint, and (at night) a cool moonlit rim from behind.
   */
  const N = normalize(normalView)
  const V = positionViewDirection
  const facing = saturate(dot(N, V))
  const lit = dot(N, LIGHT).mul(0.5).add(0.5).add(rag)
  const L = {
    shadow: float(1).sub(smoothstep(0.42, 0.53, lit)),
    core: float(1).sub(smoothstep(0.17, 0.27, lit)),
    // Blinn half-vector: the highlight sits where the key light reflects
    // toward you, with a soft, slightly ragged edge (a lifted, damp-brush sheen).
    spec: smoothstep(0.93, 0.985, dot(N, normalize(LIGHT.add(V))).add(rag.mul(0.2))),
    bounce: saturate(N.y.negate()).mul(float(1).sub(facing).mul(0.6).add(0.4)),
    pool: pow(float(1).sub(facing), 3),
    rim: smoothstep(0.5, 0.9, float(1).sub(facing)).mul(saturate(dot(N, RIM_DIR).mul(0.8).add(0.2))),
  }
  const num = (x: F | number): F => (typeof x === 'number' ? float(x) : x)
  /** Blinn lobe toward the key light; `lo` sets how broad it is. */
  const sheen = (lo: number) => smoothstep(lo, 0.99, dot(N, normalize(LIGHT.add(V))))

  // Pen hatching (high tier): diagonal strokes in screen space through the
  // shadow side, crossed in the core shadow, broken up by the paper's tooth.
  const hp = screenUV.mul(vec2(uAspect, 1)).div(uUnitUV).mul(17)
  const strokes = (u: F) => float(1).sub(smoothstep(0.05, 0.15, abs(u.add(rag.mul(2.5)).fract().sub(0.5))))
  const tone = L.shadow.mul(0.45).add(L.core.mul(0.55)).add(grain.sub(0.5).mul(0.5))
  const hatching = strokes(hp.x.add(hp.y))
    .mul(smoothstep(0.3, 0.6, tone))
    .add(strokes(hp.x.sub(hp.y).mul(1.1)).mul(smoothstep(0.62, 0.9, tone)))
    .min(1)
    .mul(uHQ)
  /** Unpainted highlight (eye glints): bare paper by day, moonlight at night. */
  const bare = mix(under, color(PAINT.moonGlint), uNight) as unknown as V3

  /**
   * A painted surface. `load` is how much pigment the brush carries; `pale`
   * lightens fur (chest, muzzle) toward paper by day and toward cream at night.
   *
   * Day is transparent watercolour: a Beer–Lambert glaze whose thickness
   * builds in shadow, pools at the turn, and is lifted out in the highlight
   * and where the paper bounces light up into the undersides.
   * Night is moonlit gouache: luminous pigment shaded by the same key light,
   * with a cool rim and a faint cool sheen, never a white blotch.
   */
  /** Bare paper, without the blooms and splatter (under opaque-feeling paint). */
  const plain = mix(paperDay, paperNight, uNight).mul(grain.sub(0.5).mul(0.035).add(1)) as unknown as V3
  type PaintOpts = { pale?: F | number; hatch?: number; clean?: boolean }
  const paint = (pigment: V3, load: F | number, { pale = 0, hatch = 0, clean = false }: PaintOpts = {}): V3 => {
    const b = num(load)
    const pl = num(pale)
    const under = clean ? plain : paperUnder
    const thick = float(0.48)
      .add(L.shadow.mul(0.42))
      .add(L.core.mul(0.2))
      .add(L.pool.mul(0.45))
      .sub(L.bounce.mul(L.shadow).mul(0.22))
    const d = b
      .mul(thick)
      .mul(float(1).sub(L.spec.mul(0.85)))
      .mul(float(1).sub(pl.mul(0.7)))
      .add(grain.sub(0.5).mul(0.18))
      .max(0.02)
    const day = under.mul(pow(max(pigment, vec3(0.002)), vec3(d.mul(1.35))))

    // Pale fur is a lighter tint of the same pigment (cream turned it green).
    const lum = mix(pigment, vec3(1), pl.mul(0.4).add(0.3))
    const value = float(1).sub(L.shadow.mul(0.48)).sub(L.core.mul(0.2)).add(L.bounce.mul(L.shadow).mul(0.14))
    const coverage = clamp(b.mul(1.35), 0, 0.92)
    const lit = lum.mul(value.mul(0.84)).add(grain.sub(0.5).mul(0.05))
    const moon = color(PAINT.moon).mul(L.rim.mul(0.26).add(L.spec.mul(0.14))).mul(coverage)
    const night = mix(under, lit, coverage).add(moon)
    const c = mix(day, night, uNight) as unknown as V3
    return hatch ? (mix(c, ink, hatching.mul(hatch)) as unknown as V3) : c
  }
  const washMat = (pigment: V3, load: number, opts?: PaintOpts) => {
    const m = new THREE.MeshBasicNodeMaterial()
    m.colorNode = paint(pigment, load, opts)
    return m
  }
  /** Ink line: the back faces, pushed out along the normal. */
  const hullMat = (normal: V3 = normalLocal, width: F = uHull as unknown as F) => {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide })
    m.positionNode = positionLocal.add(normal.mul(width))
    m.colorNode = ink
    return m
  }
  /** Ink line for small rigid parts: a scaled-up back face. */
  const shellMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide })
  shellMat.colorNode = ink

  /** Rest-space face coordinate (cat units) and how much it faces the camera. */
  const restUnit = (centre: [number, number]) => {
    const rest = attribute<'vec3'>('rest', 'vec3').div(uUnit)
    const p = vec2(rest.x.sub(centre[0]), rest.y.sub(centre[1]))
    const front = smoothstep(0.1, 0.4, normalize(rest).z)
    return { rest, p, front }
  }
  const pigmentMix = (rest: V3) =>
    mix(glazeNode, massNode, smoothstep(0.35, 0.7, noise(rest.xy.mul(0.4).add(vec2(T.mul(0.006), T.mul(0.004)))).r)) as V3

  // Cat body: a wet-in-wet wash of both pigments, with a pale chest.
  const catBodyMat = new THREE.MeshBasicNodeMaterial()
  {
    const { rest, p, front } = restUnit([0, 0])
    const chest = float(1).sub(smoothstep(0.12, 0.3, length(vec2(p.x.mul(1.2), p.y.sub(-0.05).mul(0.8))))).mul(front)
    catBodyMat.colorNode = paint(pigmentMix(rest), 0.62, { pale: chest, hatch: 0.5 })
  }

  // Cat head: wash + forehead stripes, pale muzzle, painted face.
  const catHeadMat = new THREE.MeshBasicNodeMaterial()
  {
    const { rest, p, front } = restUnit([0, 0])
    const muzzle = float(1).sub(smoothstep(0.1, 0.2, length(vec2(abs(p.x).sub(0.07).mul(0.9), p.y.add(0.13))))).mul(front)
    const forehead = smoothstep(0.62, 0.8, abs(p.x.mul(14).fract().sub(0.5)).mul(2).oneMinus())
      .mul(smoothstep(0.24, 0.36, p.y))
      .mul(float(1).sub(smoothstep(0.1, 0.17, abs(p.x))))
    const pig = pigmentMix(rest)
    let c = paint(pig, 0.62, { pale: muzzle, hatch: 0.45 })
    c = glaze(c, massNode, forehead.mul(0.55).mul(front))

    // Blush.
    const cheek = (x: number) => float(1).sub(smoothstep(0.04, 0.11, length(vec2(p.x.sub(x), p.y.add(0.1).mul(1.5)))))
    c = glaze(c, color(PAINT.blush) as unknown as V3, cheek(-0.33).add(cheek(0.33)).mul(uBlush).mul(front).mul(0.8))

    // Eyes: amber iris, slit pupil that dilates, a bare-paper glint, inked
    // rim. Shut, they become an arc (‿ relaxed or ∩ happy).
    const eye = (cx: number) => {
      const q = p.sub(vec2(cx, 0.06))
      const ry = max(uOpen.mul(0.115), 0.004)
      const e = length(vec2(q.x.div(0.098), q.y.div(ry))).sub(1)
      const openness = smoothstep(0.16, 0.34, uOpen)
      const fill = aaStep(e, 0.06).mul(openness)
      const rim = aaStep(abs(e).sub(0.1), 0.06).mul(openness)
      const pupilW = uPupil.mul(0.07).add(0.012)
      const pupil = aaStep(length(vec2(q.x.div(pupilW), q.y.div(ry.mul(0.86)))).sub(1), 0.08).mul(fill)
      const glint = aaStep(length(q.sub(vec2(-0.028, ry.mul(0.42)))).sub(0.022)).mul(fill)
      const arcY = uLid.mul(q.x.mul(q.x).mul(5.5).sub(0.02))
      const arc = aaStep(abs(q.y.sub(arcY)).sub(0.013)).mul(float(1).sub(smoothstep(0.075, 0.095, abs(q.x)))).mul(float(1).sub(openness))
      return { fill, rim, pupil, glint, arc, q }
    }
    for (const cx of [-0.235, 0.235]) {
      const E = eye(cx)
      const iris = glaze(under, color(PAINT.iris) as unknown as V3, float(0.85).add(smoothstep(-0.05, 0.08, E.q.y).mul(0.4)))
      c = mix(c, iris, E.fill.mul(front))
      // Pupils stay dark at night, when the ink lines turn pale.
      c = mix(c, massNode.mul(0.22) as unknown as V3, E.pupil.mul(front))
      c = mix(c, ink, E.rim.add(E.arc).min(1).mul(front))
      c = mix(c, bare, E.glint.mul(front))
    }

    // Nose: a rounded, downward triangle.
    const nq = p.sub(vec2(0, -0.075))
    const nose = aaStep(max(nq.y.sub(0.022), abs(nq.x).mul(1.35).sub(nq.y).sub(0.034)), 0.008).mul(front)
    c = mix(c, glaze(under, color(PAINT.nose) as unknown as V3, float(1.1)), nose)

    // Mouth: the "ω" when closed, an open "haa" when sighing.
    const mq = p.sub(vec2(0, -0.13))
    const u = abs(mq.x).sub(0.042)
    const wY = u.mul(u).mul(14).sub(0.0247)
    const shut = float(1).sub(smoothstep(0.1, 0.3, uMouth))
    const w = aaStep(abs(mq.y.sub(wY)).sub(0.01)).mul(float(1).sub(smoothstep(0.08, 0.095, abs(mq.x)))).mul(shut)
    const philtrum = aaStep(abs(mq.x).sub(0.008)).mul(smoothstep(-0.03, -0.02, mq.y)).mul(float(1).sub(smoothstep(0.0, 0.01, mq.y.sub(0.04))))
    const oq = p.sub(vec2(0, float(-0.17).sub(uMouth.mul(0.02))))
    const oy = max(uMouth.mul(0.075), 0.002)
    const oe = length(vec2(oq.x.div(uMouth.mul(0.02).add(0.045)), oq.y.div(oy))).sub(1)
    const mouthOpen = aaStep(oe, 0.07).mul(smoothstep(0.08, 0.2, uMouth))
    const tongue = aaStep(length(vec2(oq.x.div(0.04), oq.y.add(oy.mul(0.62)).div(oy.mul(0.5)))).sub(1), 0.1).mul(mouthOpen)
    c = mix(c, ink, w.add(philtrum.mul(0.9)).min(1).mul(front))
    c = mix(c, mix(color(PAINT.mouth), color(PAINT.earInner), tongue.mul(0.8)) as unknown as V3, mouthOpen.mul(front))

    // Whiskers: three a side, lifting on the inhale.
    let whisk: F = float(0)
    for (const s of [-1, 1]) {
      for (const k of [-1, 0, 1]) {
        const a = uWhisker.add(k * 0.17)
        const wx = p.x.mul(s).sub(0.26)
        const wy = p.y.add(0.11 - k * 0.012).sub(wx.mul(a)) // y along the line
        whisk = whisk.add(aaStep(abs(wy).sub(0.0055), 0.005).mul(smoothstep(0, 0.03, wx)).mul(float(1).sub(smoothstep(0.26, 0.34, wx))))
      }
    }
    c = mix(c, ink, whisk.min(1).mul(0.85).mul(smoothstep(0, 0.25, normalize(rest).z)))
    catHeadMat.colorNode = c
  }

  // Ears, paws and tail share the cat's washes.
  const earMat = washMat(massNode, 0.7)
  const earInnerMat = washMat(color(PAINT.earInner) as unknown as V3, 0.75)
  const pawMat = washMat(glazeNode, 0.4)
  const tailMat = washMat(mix(glazeNode, massNode, 0.3) as unknown as V3, 0.55, { hatch: 0.5 })

  // Puffball: a glossy bubblegum-pink ball with Kirby's face: tall navy eyes
  // that turn blue toward the bottom under a big glint, rosy oval cheeks just
  // outside them, and a tiny mouth tucked close underneath.
  const puffMat = new THREE.MeshBasicNodeMaterial()
  {
    const { rest, p, front } = restUnit([0, 0])
    const mottle = smoothstep(0.15, 0.85, noise(rest.xy.mul(0.35)).r).mul(0.45).add(0.3)
    const pig = mix(color(PAINT.puffGlaze), color(PAINT.puffMass), mottle) as unknown as V3
    // A broad soft sheen as well as the crisp glint: it reads as a squishy ball.
    // Painted over clean paper: the background blooms read as bruises through pink.
    let c = paint(pig, 0.8, { pale: sheen(0.82).mul(0.55), clean: true })
    // Cheeks: solid little ovals with a soft edge, rosier when happy.
    const cheek = (x: number) => float(1).sub(smoothstep(0.75, 1, length(vec2(p.x.sub(x).div(0.085), p.y.add(0.035).div(0.042)))))
    c = glaze(c, color(PAINT.puffBlush) as unknown as V3, cheek(-0.3).add(cheek(0.3)).mul(uBlush.mul(0.5).add(0.6)).mul(front))
    for (const cx of [-0.13, 0.13]) {
      const q = p.sub(vec2(cx, 0.15))
      const ry = max(uOpen.mul(0.17), 0.004)
      const e = length(vec2(q.x.div(0.064), q.y.div(ry))).sub(1)
      const openness = smoothstep(0.16, 0.34, uOpen)
      const fill = aaStep(e, 0.06).mul(openness)
      const lower = smoothstep(-0.05, -0.75, q.y.div(ry))
      const iris = mix(color(PAINT.puffEye), color(PAINT.puffEyeLow), lower) as unknown as V3
      const glint = aaStep(length(vec2(q.x.div(0.037), q.y.sub(ry.mul(0.42)).div(ry.mul(0.4)))).sub(1), 0.1).mul(fill)
      const spark = aaStep(length(vec2(q.x.add(0.012).div(0.016), q.y.add(ry.mul(0.62)).div(ry.mul(0.12)))).sub(1), 0.15).mul(fill).mul(0.7)
      // Shut: a soft arc (‿ / ∩), or squeezed tight into > < (pointing in).
      const shut = float(1).sub(openness)
      const arcY = uLid.mul(q.x.mul(q.x).mul(9).sub(0.02))
      const arc = aaStep(abs(q.y.sub(arcY)).sub(0.014)).mul(float(1).sub(smoothstep(0.055, 0.07, abs(q.x))))
      const along = q.x.mul(-Math.sign(cx)) // toward the nose
      const chev = aaStep(abs(abs(q.y).sub(float(0.055).sub(along).mul(0.62))).sub(0.014))
        .mul(float(1).sub(smoothstep(0.045, 0.058, abs(along))))
        .mul(float(1).sub(smoothstep(0.05, 0.065, abs(q.y))))
      const lash = mix(arc, chev, uSquint).mul(shut)
      c = mix(c, iris, fill.mul(front))
      c = mix(c, bare, glint.add(spark).min(1).mul(front))
      c = mix(c, color(PAINT.puffEye) as unknown as V3, lash.mul(front))
    }
    // Mouth: a tiny smile, or a big round "O" to suck in a breath.
    const mq = p.sub(vec2(0, -0.035))
    const smile = aaStep(abs(mq.y.sub(mq.x.mul(mq.x).mul(11))).sub(0.01))
      .mul(float(1).sub(smoothstep(0.035, 0.048, abs(mq.x))))
      .mul(float(1).sub(smoothstep(0.1, 0.3, uMouth)))
    const oy = max(uMouth.mul(0.12), 0.002)
    const oq = mq.add(vec2(0, oy.mul(0.7)))
    const o = aaStep(length(vec2(oq.x.div(uMouth.mul(0.045).add(0.04)), oq.y.div(oy))).sub(1), 0.07).mul(smoothstep(0.08, 0.2, uMouth))
    const tongue = aaStep(length(vec2(oq.x.div(0.045), oq.y.add(oy.mul(0.6)).div(oy.mul(0.45)))).sub(1), 0.1).mul(o)
    c = mix(c, color(PAINT.puffEye) as unknown as V3, smile.mul(front))
    c = mix(c, mix(color(PAINT.mouth), color(PAINT.puffBlush), tongue.mul(0.85)) as unknown as V3, o.mul(front))
    puffMat.colorNode = c
  }
  const footMat = new THREE.MeshBasicNodeMaterial()
  footMat.colorNode = paint(color(PAINT.puffFeet) as unknown as V3, 0.9, { pale: sheen(0.86).mul(0.4), clean: true })
  const armMat = new THREE.MeshBasicNodeMaterial()
  armMat.colorNode = paint(mix(color(PAINT.puffGlaze), color(PAINT.puffMass), 0.55) as unknown as V3, 0.8, { pale: sheen(0.82).mul(0.55), clean: true })
  // Air clouds: a pale blue wash by day, moon-white at night (not grey).
  const airMat = new THREE.MeshBasicNodeMaterial()
  airMat.colorNode = mix(paint(color(PAINT.air) as unknown as V3, 0.38), color(PAINT.moonGlint), uNight.mul(0.55))

  const sphereGeo = new THREE.SphereGeometry(1, 28, 18)
  const coneGeo = new THREE.ConeGeometry(1, 1, 28, 1)
  coneGeo.translate(0, 0.5, 0) // base at the origin

  // ── Bodies (rebuilt when the anchor resizes) ─────────────────────
  const catGroup = new THREE.Group()
  const puffGroup = new THREE.Group()
  scene.add(catGroup, puffGroup)

  type Soft = {
    jelly: Jelly
    geo: THREE.BufferGeometry
    mesh: THREE.Mesh
    hull: THREE.Mesh
    rest: Float32Array
    rest0: Vec3
    /** Lowest rest point below the centre. */
    bottom: number
    /** Firm settings, and how loose a grab makes the anchor (0..1 of firm). */
    firm: { k: number; c: number; stiffness: number; beta: number; minK: number; upright: number }
    /** 1 while held; `grab` firms up quickly after release, `wobble` slowly. */
    grab: number
    wobble: number
  }
  const makeSoft = (
    group: THREE.Group,
    positions: Float32Array,
    index: Uint32Array,
    mat: THREE.Material,
    jopts: NonNullable<ConstructorParameters<typeof Jelly>[1]>,
    anchor: { k: number; c: number; minK: number },
    upright: number,
  ): Soft => {
    const jelly = new Jelly(positions, jopts)
    jelly.upright = upright
    const geo = jellyGeometry(jelly, index)
    const mesh = new THREE.Mesh(geo, mat)
    const hull = new THREE.Mesh(geo, hullMat())
    mesh.frustumCulled = hull.frustumCulled = false
    group.add(mesh, hull)
    const rest0: Vec3 = [...jelly.center]
    let bottom = 0
    for (let i = 1; i < jelly.x.length; i += 3) bottom = Math.min(bottom, jelly.x[i] - rest0[1])
    const firm = { ...anchor, stiffness: jopts.stiffness ?? 0.07, beta: jopts.beta ?? 0.5, upright }
    return { jelly, geo, mesh, hull, rest: Float32Array.from(jelly.x), rest0, bottom, firm, grab: 0, wobble: 0 }
  }
  const dropSoft = (s: Soft | null) => {
    if (!s) return
    s.mesh.removeFromParent()
    s.hull.removeFromParent()
    ;(s.hull.material as THREE.Material).dispose()
    s.geo.dispose()
  }

  const part = (group: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, shell = 1.16) => {
    const g = new THREE.Group()
    const mesh = new THREE.Mesh(geo, mat)
    const line = new THREE.Mesh(geo, shellMat)
    line.scale.setScalar(shell)
    g.add(mesh, line)
    group.add(g)
    return g
  }
  const ears = [-1, 1].map((s) => {
    const g = part(catGroup, coneGeo, earMat, 1)
    const outerLine = g.children[1]
    outerLine.scale.set(1.18, 1.1, 1.4)
    const inner = new THREE.Mesh(coneGeo, earInnerMat)
    inner.scale.set(0.58, 0.72, 0.6)
    inner.position.set(0, 0.04, 0.45)
    g.add(inner)
    return { g, s }
  })
  const paws = [-1, 1].map((s) => ({ g: part(catGroup, sphereGeo, pawMat), s }))
  const feet = [-1, 1].map((s) => ({ g: part(puffGroup, sphereGeo, footMat, 1.12), s }))
  const arms = [-1, 1].map((s) => ({ g: part(puffGroup, sphereGeo, armMat, 1.14), s }))

  // Tail: a tube swept along a curve every frame (rings + a tip and a base vertex).
  const TAIL_N = 28
  const TAIL_SIDES = 12
  const tailPos = new Float32Array((TAIL_N * TAIL_SIDES + 2) * 3)
  const tailGeo = new THREE.BufferGeometry()
  {
    const idx: number[] = []
    for (let i = 0; i < TAIL_N - 1; i++) {
      for (let j = 0; j < TAIL_SIDES; j++) {
        const a0 = i * TAIL_SIDES + j
        const a1 = i * TAIL_SIDES + ((j + 1) % TAIL_SIDES)
        // Wound so the normals face out (t × b = −n flips the naive order).
        idx.push(a0, a1, a0 + TAIL_SIDES, a1, a1 + TAIL_SIDES, a0 + TAIL_SIDES)
      }
    }
    const tipV = TAIL_N * TAIL_SIDES
    for (let j = 0; j < TAIL_SIDES; j++) {
      const base = (TAIL_N - 1) * TAIL_SIDES
      idx.push(base + j, base + ((j + 1) % TAIL_SIDES), tipV)
      idx.push(j, tipV + 1, (j + 1) % TAIL_SIDES)
    }
    const attr = new THREE.BufferAttribute(tailPos, 3)
    attr.setUsage(THREE.DynamicDrawUsage)
    tailGeo.setAttribute('position', attr)
    tailGeo.setIndex(idx)
    tailGeo.computeVertexNormals()
  }
  const tail = new THREE.Mesh(tailGeo, tailMat)
  const tailLine = new THREE.Mesh(tailGeo, hullMat())
  tail.frustumCulled = tailLine.frustumCulled = false
  catGroup.add(tailLine, tail)
  const spine = Array.from({ length: TAIL_N }, () => new THREE.Vector3())
  const tan = new THREE.Vector3()
  const nrm = new THREE.Vector3()
  const bin = new THREE.Vector3()

  const AIR_N = 18
  const air = new THREE.InstancedMesh(sphereGeo, airMat, AIR_N)
  const airLine = new THREE.InstancedMesh(sphereGeo, shellMat, AIR_N)
  air.frustumCulled = airLine.frustumCulled = false
  puffGroup.add(airLine, air)
  const puffs = Array.from({ length: AIR_N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, size: 0 }))
  let nextPuff = 0

  let U = 1
  // High-tier post passes (built with the pipeline below; sized with the cat).
  let aoPass: ReturnType<typeof ao> | null = null
  let glowPass: ReturnType<typeof bloom> | null = null
  let body: Soft | null = null
  let head: Soft | null = null
  let puff: Soft | null = null
  const home: Vec3 = [0, 0, 0]
  const bodies: Jelly[] = []
  const headMount: Vec3 = [0, 0, 0]

  const build = (u: number) => {
    U = u
    uUnit.value = u
    uHull.value = 0.022 * u
    if (aoPass) {
      aoPass.radius.value = 0.32 * u
      aoPass.thickness.value = 0.6 * u
    }
    dropSoft(body)
    dropSoft(head)
    dropSoft(puff)
    const scaled = (s: { positions: Float32Array; index: Uint32Array }) => {
      for (let i = 0; i < s.positions.length; i++) s.positions[i] *= u
      return s
    }
    const b = scaled(shape(4, catBody))
    body = makeSoft(catGroup, b.positions, b.index, catBodyMat, { stiffness: mode === 'calm' ? 0.09 : 0.07, beta: 0.35, damping: 1.6, substeps: 2 }, { k: 16, c: 5.5, minK: 0.1 }, 0.04)
    const h = scaled(shape(4, catHead))
    // A grabbed head stretches off the neck a little, then springs back on.
    head = makeSoft(catGroup, h.positions, h.index, catHeadMat, { stiffness: 0.12, beta: 0.3, damping: 1.8, substeps: 2 }, { k: 90, c: 13, minK: 0.3 }, 0.08)
    const k = scaled(shape(4, puffBody))
    puff = makeSoft(puffGroup, k.positions, k.index, puffMat, { stiffness: 0.08, beta: 0.4, damping: 1.4, substeps: 2 }, { k: 16, c: 5.5, minK: 0.1 }, 0.05)
    // The neck: the head rides this point on the body's goal shape.
    headMount[0] = 0
    headMount[1] = (HEAD_Y - BODY_Y) * u
    headMount[2] = 0.04 * u
    place(true)
    setBodies()
  }

  /** Move the bodies onto their anchors (snap on rebuild, follow otherwise). */
  const place = (snap: boolean) => {
    if (!body || !head || !puff) return
    const targets: [Soft, number][] = [[body, BODY_Y], [head, HEAD_Y], [puff, PUFF_Y]]
    for (const [s, y] of targets) {
      const t: Vec3 = [home[0], home[1] + y * U, home[2]]
      if (snap) {
        s.jelly.translate(t[0] - s.jelly.center[0], t[1] - s.jelly.center[1], t[2] - s.jelly.center[2])
        s.jelly.center[0] = t[0]
        s.jelly.center[1] = t[1]
        s.jelly.center[2] = t[2]
      }
      s.jelly.anchor = { target: t, k: s.firm.k, c: s.firm.c }
    }
  }

  const setBodies = () => {
    bodies.length = 0
    if (form === 'cat' && head && body) bodies.push(head.jelly, body.jelly)
    else if (puff) bodies.push(puff.jelly)
  }

  // ── Layout: track the anchor element ─────────────────────────────
  const layout = () => {
    const w = Math.max(1, host.clientWidth)
    const h = Math.max(1, host.clientHeight)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    uAspect.value = camera.aspect
    const halfH = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAM_Z
    const dist = CAM_Z - sheet.position.z
    const sh = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * dist * 1.05
    sheet.scale.set(sh * camera.aspect, sh, 1)

    const hr = host.getBoundingClientRect()
    const ar = anchor.getBoundingClientRect()
    const cx = ar.left + ar.width / 2 - hr.left
    const cy = ar.top + ar.height / 2 - hr.top
    const wpp = (2 * halfH) / h
    const dx = (cx - w / 2) * wpp - home[0]
    const dy = -(cy - h / 2) * wpp - home[1]
    home[0] += dx
    home[1] += dy
    // Room for a full inhale (and the puffball's float) inside the anchor.
    const u = (Math.min(ar.width, ar.height) / 2) * wpp / 1.34
    uCentre.value.set(cx / w, cy / h)
    uUnitUV.value = u / (2 * halfH)
    uRadius.value = (u * 0.78) / (2 * halfH)

    if (!body || Math.abs(u - U) / U > 0.04) build(u)
    else {
      for (const s of [body, head, puff]) s?.jelly.translate(dx, dy, 0)
      place(false)
    }
  }
  stage.onResize(layout)
  const anchorObserver = new ResizeObserver(() => {
    layout()
    stage.requestRender()
  })
  anchorObserver.observe(anchor)

  // ── State ────────────────────────────────────────────────────────
  const now = () => performance.now() / 1000
  let clock = 0
  let lastAmp = 0.5
  let dir = 1
  let holdStart = 0
  let wasHold = false
  let taps: number[] = []
  /** The body being dragged. */
  let held: Jelly | null = null
  let pokedUntil = 0
  let nextBlink = now() + 2
  let blinkUntil = 0
  let nextTwitch = now() + 3
  let twitch = { side: 1, until: 0 }
  // Transformation: the old form shrinks away in a splash, the new one pops in.
  let morph = { to: form, at: -10 }
  const pop = { cat: form === 'cat' ? 1 : 0, puff: form === 'puff' ? 1 : 0, vCat: 0, vPuff: 0 }
  const f = face({})
  const tailSwish = { x: 0, v: 0 }
  const tmp: Vec3 = [0, 0, 0]
  const quat = new THREE.Quaternion()
  const quat2 = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const dummy = new THREE.Object3D()

  const ease = (cur: number, target: number, rate: number, dt: number) =>
    reducedMotion || dt === 0 ? target : cur + (target - cur) * (1 - Math.exp(-rate * dt))

  // Reduced motion freezes the scene clock, so paint drops and the giggle
  // end on wall-clock timers instead.
  let dropTimer: ReturnType<typeof setTimeout> | undefined
  let faceTimer: ReturnType<typeof setTimeout> | undefined
  const dropAt = (x: number, y: number, size = 1) => {
    const v = new THREE.Vector3(x, y, 0).project(camera)
    uDrop.value.set(v.x * 0.5 + 0.5, 0.5 - v.y * 0.5)
    uDropAge.value = 0
    uDropSize.value = size
    if (reducedMotion) {
      clearTimeout(dropTimer)
      dropTimer = setTimeout(() => {
        uDropAge.value = 1
        stage.requestRender()
      }, 1200)
    }
  }

  const transform = () => {
    form = form === 'cat' ? 'puff' : 'cat'
    morph = { to: form, at: now() }
    setBodies()
    dropAt(home[0], home[1], 2.4)
    if (reducedMotion) {
      pop.cat = form === 'cat' ? 1 : 0
      pop.puff = form === 'puff' ? 1 : 0
    }
    stage.requestRender()
  }

  /** Every tap: a giggle, and five quick ones swap the form. */
  const tapped = () => {
    const t = now()
    pokedUntil = t + 0.6
    taps = taps.filter((x) => t - x < EGG_WINDOW)
    taps.push(t)
    if (taps.length >= EGG_TAPS) {
      taps = []
      transform()
    } else if (!reducedMotion) {
      const main = form === 'cat' ? head : puff
      main?.jelly.kick(0, 1.2 * U, 0)
    }
    if (reducedMotion) {
      clearTimeout(faceTimer)
      faceTimer = setTimeout(() => stage.requestRender(), 650)
    }
    stage.requestRender()
  }

  let pointer: JellyPointer | null = null
  if (mode === 'play') {
    pointer = bindJellyPointer({
      host: pointerHost,
      camera,
      bodies,
      reducedMotion,
      pokeStrength: 3,
      // Easy to catch, and the whole body comes along when it's grabbed.
      touchDrag: true,
      pickScale: 1.3,
      grabRadius: 1.15,
      grip: 0.42,
      onPoke: (_, point) => {
        dropAt(point[0], point[1])
        tapped()
      },
      onGrab: (j) => {
        held = j
        stage.requestRender()
      },
      onRelease: () => {
        held = null
      },
    })
  }

  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const sphere = new THREE.Sphere()
  const hit = new THREE.Vector3()
  const poke = (clientX: number, clientY: number) => {
    const r = host.getBoundingClientRect()
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    for (const j of bodies) {
      sphere.center.set(...j.center)
      sphere.radius = j.radius * 1.15
      if (!ray.ray.intersectSphere(sphere, hit)) continue
      if (!reducedMotion) {
        const d = ray.ray.direction
        const s = j.radius * 1.1 // a press, not a slap
        j.impulse([hit.x, hit.y, hit.z], [d.x * s, d.y * s, d.z * s], j.radius * 0.8)
      }
      dropAt(hit.x, hit.y)
      break
    }
    // The whole session button counts, so a tap near the cat still giggles.
    tapped()
  }

  /** Reduced motion: no physics; pose the goal shape straight from rest. */
  const pose = (s: Soft, centre: Vec3) => {
    const { jelly, rest, rest0 } = s
    const sc = jelly.scale
    const [qx, qy, qz] = jelly.squash
    for (let i = 0; i < rest.length; i += 3) {
      jelly.x[i] = centre[0] + (rest[i] - rest0[0]) * sc * qx
      jelly.x[i + 1] = centre[1] + (rest[i + 1] - rest0[1]) * sc * qy
      jelly.x[i + 2] = centre[2] + (rest[i + 2] - rest0[2]) * sc * qz
    }
    jelly.center[0] = centre[0]
    jelly.center[1] = centre[1]
    jelly.center[2] = centre[2]
  }

  // ── Post: bleed → (high tier: pooled occlusion + night glow) → paper
  //    tooth → vignette → film grain ─────────────────────────────────
  const pipeline = new THREE.RenderPipeline(renderer)
  const scenePass = pass(scene, camera)
  if (hq) scenePass.setMRT(mrt({ output, normal: normalView }))
  const tex = scenePass.getTextureNode('output')
  const st = screenUV
  const sp = vec2(st.x.mul(uAspect), st.y)
  const flow = noise(sp.mul(4.3).add(vec2(T.mul(0.01), 0)))
  const wobble = vec2(flow.r, flow.g).sub(0.5).mul(0.0036)
  const sa = tex.sample(st.add(wobble)).rgb
  const sb = tex.sample(st.add(wobble.mul(-1.4)).add(vec2(0.0007, -0.0005))).rgb
  const bled = mix(sa, min(sa, sb), mix(0.5, 0.0, uNight)).add(mix(vec3(0), max(sa, sb).sub(sa), uNight.mul(0.4))) as V3
  const tooth = noise(sp.mul(4)).b.mul(2).sub(1)
  const vd = length(st.sub(0.5).mul(vec2(1, 0.9)))
  const vig = mix(1, mix(0.9, 0.78, uNight), smoothstep(0.42, 0.98, vd).mul(uVignette))
  const finish = (c: V3) =>
    filmHD(vec4(c.mul(tooth.mul(0.05).add(1)).mul(vig), 1), {
      intensityNode: uniform(0.09),
      grainScaleNode: uniform(1.5),
      grainSpeedNode: uniform(0),
      scanlineIntensityNode: uniform(0),
    })
  const baseOutput = finish(bled)
  if (hq) {
    // Where the head meets the body, paws tuck in and the tail wraps round,
    // pigment pools by day (the paint glazes over itself, so it deepens in its
    // own colour) and shadow deepens at night.
    aoPass = ao(scenePass.getTextureNode('depth'), scenePass.getTextureNode('normal'), camera)
    aoPass.resolutionScale = 0.5
    aoPass.scale.value = 1.6
    aoPass.radius.value = 0.32 * U
    aoPass.thickness.value = 0.6 * U
    const occ = float(1).sub(aoPass.getTextureNode().r).mul(1.2).min(1)
    const pooled = mix(bled.mul(pow(max(bled, vec3(0.002)), vec3(occ.mul(0.8)))), bled.mul(float(1).sub(occ.mul(0.55))), uNight)
    // Moonlight glows softly off the rim and the glints at night.
    glowPass = bloom(tex, 0, 0.55, 0.78)
    pipeline.outputNode = finish(pooled.add(glowPass.rgb) as V3)
  } else pipeline.outputNode = baseOutput
  stage.onStruggle(() => {
    if (!hq) return
    hq = false
    uHQ.value = 0
    scenePass.setMRT(null)
    pipeline.outputNode = baseOutput
    pipeline.needsUpdate = true
  })

  // ── Frame ────────────────────────────────────────────────────────
  const massTarget = rgb(opts.pigment.mass)
  const glazeTarget = rgb(opts.pigment.glaze)
  let nightTarget = opts.night ? 1 : 0
  let first = true

  const springPop = (x: number, v: number, target: number, dt: number): [number, number] => {
    if (reducedMotion || dt === 0) return [target, 0]
    // Shrinking is quick and crisp; growing overshoots like a balloon.
    const k = target > x ? 170 : 260
    const c = target > x ? 11 : 24
    v += (k * (target - x) - c * v) * dt
    return [Math.max(0, x + v * dt), v]
  }

  /**
   * Grabbed, a body goes loose: its anchor lets it be carried off and it turns
   * gooier, so it stretches toward the finger. Let go, the anchor firms up
   * fast (it boings home) but the goo settles slowly (it wobbles on arrival).
   * Bodies with a floor squash when they land on the paper.
   */
  const loosen = (s: Soft, dt: number, floorY: number | null) => {
    const on = held === s.jelly
    s.grab = on ? 1 : ease(s.grab, 0, 5, dt)
    s.wobble = on ? 1 : ease(s.wobble, 0, 1.1, dt)
    const j = s.jelly
    const { k, c, stiffness, beta, minK } = s.firm
    j.anchor!.k = k * (1 - (1 - minK) * s.grab)
    j.anchor!.c = c * (1 - 0.55 * s.wobble)
    j.stiffness = stiffness * (1 - 0.5 * s.wobble)
    // Gooey once let go (linear deformation would also let it spin while held).
    j.beta = Math.min(0.85, beta + 0.35 * (s.wobble - s.grab))
    // Held, it stays upright and stretches toward the finger instead of tumbling.
    j.upright = s.firm.upright + 0.3 * s.grab
    j.floor = floorY === null ? null : floorY + s.bottom * j.scale * j.squash[1] - 0.03 * U
  }
  const shadowAt = new THREE.Vector3()
  /** Lift the contact shadow and follow the body on screen. */
  const castShadow = (j: Jelly, restY: number) => {
    shadowAt.set(j.center[0], home[1] + BODY_Y * U, 0).project(camera)
    uShadowX.value = shadowAt.x * 0.5 + 0.5
    uLift.value = Math.max(0, (j.center[1] - restY) / U)
  }

  const frame = (dt: number) => {
    clock += dt
    const t = now()
    const sample = read()
    const a = sample.amplitude
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 2.5)
    uMass.value.lerp(massTarget, k)
    uGlaze.value.lerp(glazeTarget, k)
    uNight.value += (nightTarget - uNight.value) * (reducedMotion ? 1 : 1 - Math.exp(-dt * 4))
    uBreath.value += (a - uBreath.value) * (reducedMotion ? 1 : 1 - Math.exp(-dt * 6))
    if (glowPass) glowPass.strength.value = 0.5 * uNight.value
    if (!reducedMotion) uDropAge.value = Math.min(1, uDropAge.value + dt / 2.6)
    if (!body || !head || !puff) return

    // Which way is the breath going? (Works per tick under reduced motion.)
    if (Math.abs(a - lastAmp) > 1e-4) dir = a > lastAmp ? 1 : -1
    lastAmp = a
    if (sample.hold && !wasHold) holdStart = t
    wasHold = sample.hold
    const full = a > 0.5
    const phase = sample.hold ? (full ? 'full' : 'empty') : dir > 0 ? 'in' : 'out'
    const poked = t < pokedUntil
    const sighBell = Math.sin(Math.PI * smooth01(sample.progress))

    // Morph: shrink the old form, then pop the new one in after the splash.
    const since = t - morph.at
    const showCat = morph.to === 'cat' ? since > 0.28 : false
    const showPuff = morph.to === 'puff' ? since > 0.28 : false
    ;[pop.cat, pop.vCat] = springPop(pop.cat, pop.vCat, showCat ? 1 : 0, dt)
    ;[pop.puff, pop.vPuff] = springPop(pop.puff, pop.vPuff, showPuff ? 1 : 0, dt)
    if (reducedMotion) {
      pop.cat = form === 'cat' ? 1 : 0
      pop.puff = form === 'puff' ? 1 : 0
    }
    catGroup.visible = pop.cat > 0.01
    puffGroup.visible = pop.puff > 0.01

    // Blinks and twitches (idle life; none mid-hold so the stillness reads).
    if (!reducedMotion && t > nextBlink) {
      blinkUntil = t + 0.14
      nextBlink = t + (Math.random() < 0.2 ? 0.3 : 2.6 + Math.random() * 3.4)
    }
    if (!reducedMotion && t > nextTwitch) {
      twitch = { side: Math.random() < 0.5 ? -1 : 1, until: t + 0.18 }
      nextTwitch = t + 3.5 + Math.random() * 5
    }
    const blinking = t < blinkUntil && phase !== 'empty' && !poked

    // ── Face targets ──
    let target: Face
    const holding = held !== null
    if (form === 'cat') {
      target = holding
        ? face({ open: 1.25, pupil: 0.1, mouth: 0.4, blush: 0.7, ear: 0.45, whisker: 0.16 })
        : poked
        ? face({ open: 0, lid: -1, mouth: 0.45, blush: 0.9, ear: 0.3, whisker: 0.12 })
        : phase === 'in'
          ? face({ open: 0.95 + 0.25 * a, pupil: 0.2, blush: 0.2, ear: 0.35 * a, whisker: 0.1 * a })
          : phase === 'full'
            ? face({ open: 1.05, pupil: 0.25, blush: 0.55, ear: 0.3, whisker: 0.1, puff: 1 })
            : phase === 'out'
              ? face({ open: 0.38, pupil: 0.6, mouth: 0.95 * sighBell, blush: 0.25, ear: -0.4 * (1 - a), whisker: -0.12 * (1 - a) })
              : face({ open: 0, lid: -1, pupil: 0.6, blush: 0.35, ear: -0.25, whisker: -0.1 })
    } else {
      target = holding
        ? face({ open: 0, squint: 1, mouth: 0.7, blush: 1 })
        : poked
        ? face({ open: 0, lid: -1, mouth: 0.4, blush: 1 })
        : phase === 'in'
          ? face({ open: 0, squint: 1, mouth: 0.35 + 0.65 * Math.min(1, sighBell + 0.4), blush: 0.4 })
          : phase === 'full'
            ? face({ open: 1, mouth: 0, blush: 0.9, puff: 1 })
            : phase === 'out'
              ? face({ open: 0.85, mouth: 0.45 * sighBell, blush: 0.5 })
              : face({ open: 0, lid: -1, blush: 0.5 })
    }
    const r = poked ? 20 : 7
    f.open = ease(f.open, blinking ? 0 : target.open, blinking ? 60 : r, dt)
    f.lid = ease(f.lid, blinking ? 1 : target.lid, 14, dt)
    f.squint = ease(f.squint, blinking ? 0 : target.squint, 14, dt)
    f.pupil = ease(f.pupil, target.pupil, 3, dt)
    f.mouth = ease(f.mouth, target.mouth, 9, dt)
    f.blush = ease(f.blush, target.blush, 4, dt)
    f.whisker = ease(f.whisker, target.whisker, 5, dt)
    f.ear = ease(f.ear, target.ear, 8, dt)
    f.puff = ease(f.puff, target.puff, 5, dt)
    uOpen.value = f.open
    uLid.value = f.lid
    uSquint.value = f.squint
    uPupil.value = f.pupil
    uMouth.value = f.mouth
    uBlush.value = f.blush
    uWhisker.value = f.whisker

    const shiver = sample.hold && !reducedMotion ? 0.012 * Math.sin(clock * 9.5) + 0.005 * Math.sin(clock * 15.1) : 0
    const sway = reducedMotion ? 0 : 0.01 * Math.sin(clock * 1.3) + 0.006 * Math.sin(clock * 2.3 + 1.1)

    // ── Cat ── (only the form on screen is simulated)
    if (catGroup.visible) {
      const bj = body.jelly
      const hj = head.jelly
      const p = pop.cat
      // Chest swells on the inhale; shoulders settle on the exhale.
      bj.scale = p * (1 + 0.1 * a)
      bj.squash[0] = 1 + 0.06 * a + sway + shiver
      bj.squash[1] = 1 + 0.05 * a - 0.04 * (1 - a) * (phase === 'out' ? 1 : 0.5) - sway - shiver * 0.8
      bj.squash[2] = 1 + 0.08 * a
      hj.scale = p * (1 + 0.02 * a)
      hj.squash[0] = 1 + 0.07 * f.puff + shiver * 0.6
      hj.squash[1] = 1 - 0.03 * f.puff
      hj.squash[2] = 1 + 0.04 * f.puff
      // The head nods up on the inhale, bows on the exhale, tilts when poked.
      euler.set(-0.12 * (a - 0.5) + (phase === 'empty' ? 0.06 : 0), 0, poked ? 0.12 * Math.sin(t * 18) : 0.04 * Math.sin(clock * 0.7))
      quat.setFromEuler(euler)
      if (reducedMotion) {
        pose(body, bj.anchor!.target)
      }
      loosen(body, dt, home[1] + BODY_Y * U)
      loosen(head, dt, null)
      castShadow(bj, bj.anchor!.target[1])
      bj.attach(headMount, tmp)
      head.jelly.anchor!.target = [tmp[0], tmp[1], tmp[2]]
      if (reducedMotion) pose(head, tmp)
      else {
        hj.uprightTarget[0] = quat.x
        hj.uprightTarget[1] = quat.y
        hj.uprightTarget[2] = quat.z
        hj.uprightTarget[3] = quat.w
        bj.step(dt)
        hj.step(dt)
      }
      syncJellyGeometry(body.geo)
      syncJellyGeometry(head.geo)

      // Ears: on the head, perk with the breath, flick on a twitch.
      quat2.set(...hj.rotation)
      for (const ear of ears) {
        hj.attach([ear.s * 0.31 * U, 0.33 * U, -0.03 * U], tmp)
        ear.g.position.set(tmp[0], tmp[1], tmp[2])
        const flick = t < twitch.until && twitch.side === ear.s ? 0.35 : 0
        euler.set(-0.12 - 0.25 * Math.max(0, -f.ear) + flick * 0.5, 0, -ear.s * (0.34 - 0.18 * f.ear + 0.3 * Math.max(0, -f.ear)))
        ear.g.quaternion.copy(quat2).multiply(quat.setFromEuler(euler))
        ear.g.scale.set(0.19 * U * p, 0.34 * U * p * (1 + 0.12 * f.ear), 0.09 * U * p)
      }
      quat2.set(...bj.rotation)
      for (const paw of paws) {
        bj.attach([paw.s * 0.19 * U, -0.47 * U, 0.4 * U], tmp)
        paw.g.position.set(tmp[0], tmp[1], tmp[2])
        paw.g.quaternion.copy(quat2)
        paw.g.scale.set(0.15 * U * p, 0.1 * U * p, 0.17 * U * p)
      }

      // Tail: wraps around the right side and curls up at the tip. It lifts on
      // the inhale, holds still on holds, and sways on the exhale and at rest.
      const swishTarget = held ? 0.3 * Math.sin(clock * 8) : sample.hold ? 0 : phase === 'out' ? 0.35 * Math.sin(clock * 1.6) : 0.22 * Math.sin(clock * 2.1)
      if (reducedMotion || dt === 0) tailSwish.x = sample.hold ? 0 : 0.1
      else {
        tailSwish.v += (40 * (swishTarget - tailSwish.x) - 7 * tailSwish.v) * dt
        tailSwish.x += tailSwish.v * dt
      }
      const lift = 0.1 + 0.25 * a
      const radius = (s: number) => (0.095 - 0.03 * s) * U * p
      for (let i = 0; i < TAIL_N; i++) {
        const s = i / (TAIL_N - 1)
        const tip = smooth01((s - 0.55) / 0.45)
        const th = -0.6 + s * 2.05 + tailSwish.x * s * s
        const rr = 0.66 + 0.08 * s
        const y = -0.44 + 0.06 * s + tip * tip * lift + tip * Math.max(0, tailSwish.x) * 0.15
        bj.attach([Math.cos(th) * rr * U, y * U, Math.sin(th) * rr * U], tmp)
        spine[i].set(tmp[0], tmp[1], tmp[2])
      }
      // Rings around the spine, carried along by parallel transport.
      nrm.set(0, 1, 0)
      for (let i = 0; i < TAIL_N; i++) {
        tan.subVectors(spine[Math.min(TAIL_N - 1, i + 1)], spine[Math.max(0, i - 1)]).normalize()
        nrm.addScaledVector(tan, -nrm.dot(tan)).normalize()
        bin.crossVectors(tan, nrm)
        const r = radius(i / (TAIL_N - 1))
        for (let j = 0; j < TAIL_SIDES; j++) {
          const ang = (j / TAIL_SIDES) * Math.PI * 2
          const c = Math.cos(ang) * r
          const sn = Math.sin(ang) * r
          const o = (i * TAIL_SIDES + j) * 3
          tailPos[o] = spine[i].x + nrm.x * c + bin.x * sn
          tailPos[o + 1] = spine[i].y + nrm.y * c + bin.y * sn
          tailPos[o + 2] = spine[i].z + nrm.z * c + bin.z * sn
        }
      }
      const tipO = TAIL_N * TAIL_SIDES * 3
      const end = spine[TAIL_N - 1]
      const rEnd = radius(1)
      tailPos[tipO] = end.x + tan.x * rEnd
      tailPos[tipO + 1] = end.y + tan.y * rEnd
      tailPos[tipO + 2] = end.z + tan.z * rEnd
      // Round off the base too (it shows when the tail sways out).
      tan.subVectors(spine[1], spine[0]).normalize()
      const r0 = radius(0)
      tailPos[tipO + 3] = spine[0].x - tan.x * r0
      tailPos[tipO + 4] = spine[0].y - tan.y * r0
      tailPos[tipO + 5] = spine[0].z - tan.z * r0
      syncJellyGeometry(tailGeo) // any indexed mesh with normals works here
    }

    // ── Puffball ──
    if (puffGroup.visible) {
      const pj = puff.jelly
      const p = pop.puff
      // Huge puff on the inhale; floats while it holds the breath in.
      pj.scale = p * (1 + 0.34 * Math.max(0, a))
      pj.squash[0] = 1 + sway + shiver + 0.04 * f.puff
      pj.squash[1] = 1 - sway - shiver * 0.8
      pj.squash[2] = 1 + 0.03 * f.puff
      const floatT = phase === 'full' ? smooth01((t - holdStart) / 0.8) : 0
      const bob = reducedMotion ? 0 : Math.sin(clock * 2.4) * 0.05
      const target: Vec3 = [home[0], home[1] + (PUFF_Y + 0.08 * a + floatT * (0.14 + bob)) * U, home[2]]
      pj.anchor!.target = target
      loosen(puff, dt, home[1] + PUFF_Y * U)
      castShadow(pj, home[1] + (PUFF_Y + 0.08 * a) * U)
      if (reducedMotion) pose(puff, target)
      else pj.step(dt)
      syncJellyGeometry(puff.geo)

      // Off the paper (floating, held, or flung), the arms flap and feet dangle.
      const groundY = home[1] + (PUFF_Y + 0.08 * a) * U
      const dangle = Math.max(floatT, held === pj ? 1 : 0, smooth01((pj.center[1] - groundY) / (0.2 * U)))
      quat2.set(...pj.rotation)
      const flap = reducedMotion ? 0 : dangle * Math.sin(clock * 15) * 0.55 + (poked ? Math.sin(t * 22) * 0.4 : 0)
      for (const arm of arms) {
        pj.attach([arm.s * 0.86 * U, -0.08 * U, 0.08 * U], tmp)
        arm.g.position.set(tmp[0], tmp[1], tmp[2])
        euler.set(0, 0, arm.s * (0.6 + 0.4 * dangle + flap))
        arm.g.quaternion.copy(quat2).multiply(quat.setFromEuler(euler))
        arm.g.scale.set(0.21 * U * p, 0.15 * U * p, 0.17 * U * p)
      }
      for (const foot of feet) {
        // Feet stay on the paper until it floats, then dangle.
        pj.attach([foot.s * 0.37 * U, -0.8 * U, 0.16 * U], tmp)
        const floorY = home[1] + (PUFF_Y - 0.84) * U
        const fy = dangle > 0.02 ? tmp[1] : Math.max(floorY, Math.min(tmp[1], floorY + 0.05 * U))
        foot.g.position.set(tmp[0], fy, tmp[2])
        euler.set(0.15 + dangle * 0.35, foot.s * 0.32, foot.s * dangle * 0.2)
        foot.g.quaternion.setFromEuler(euler)
        foot.g.scale.set(0.32 * U * p, 0.17 * U * p, 0.42 * U * p)
      }

      // Little clouds of air on the exhale.
      // Not while it's being thrown around: the clouds would trail across its face.
      if (!reducedMotion && form === 'puff' && phase === 'out' && p > 0.5 && dangle < 0.1 && sighBell > 0.15 && t > nextPuff) {
        nextPuff = t + 0.16
        const c = puffs.find((q) => q.life <= 0)
        if (c) {
          pj.attach([0, -0.18 * U, 0.86 * U], tmp)
          c.p.set(tmp[0], tmp[1], tmp[2] + 0.1 * U)
          // Blown off to one side and up, so the clouds don't cover the face.
          const side = (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 0.5)
          c.v.set(side * U, (0.05 + Math.random() * 0.3) * U, 0.5 * U)
          c.life = 1
          c.size = (0.035 + Math.random() * 0.04) * U
        }
      }
      for (let i = 0; i < AIR_N; i++) {
        const c = puffs[i]
        if (c.life > 0) {
          c.life -= dt / 1.1
          c.p.addScaledVector(c.v, dt)
          c.v.multiplyScalar(Math.exp(-2.2 * dt))
        }
        const s = c.life > 0 ? c.size * (1 + (1 - c.life) * 1.6) * Math.min(1, c.life * 3) : 0
        dummy.position.copy(c.p)
        dummy.scale.setScalar(s)
        dummy.updateMatrix()
        air.setMatrixAt(i, dummy.matrix)
        dummy.scale.setScalar(s * 1.14)
        dummy.updateMatrix()
        airLine.setMatrixAt(i, dummy.matrix)
      }
      air.instanceMatrix.needsUpdate = true
      airLine.instanceMatrix.needsUpdate = true
    }

    pipeline.render()
    if (first) {
      first = false
      onFirstFrame()
    }
  }

  layout()
  await renderer.compileAsync(scene, camera)
  stage.start(frame)

  return {
    setPigment(pigment) {
      massTarget.copy(rgb(pigment.mass))
      glazeTarget.copy(rgb(pigment.glaze))
      stage.requestRender()
    },
    setNight(night) {
      nightTarget = night ? 1 : 0
      stage.requestRender()
    },
    poke,
    requestRender: () => stage.requestRender(),
    dispose() {
      clearTimeout(dropTimer)
      clearTimeout(faceTimer)
      pointer?.dispose()
      anchorObserver.disconnect()
      stage.dispose()
      dropSoft(body)
      dropSoft(head)
      dropSoft(puff)
      for (const m of [sheetMat, catBodyMat, catHeadMat, earMat, earInnerMat, pawMat, tailMat, puffMat, footMat, armMat, airMat, shellMat]) m.dispose()
      sheet.geometry.dispose()
      sphereGeo.dispose()
      coneGeo.dispose()
      tailGeo.dispose()
      ;(tailLine.material as THREE.Material).dispose()
      air.dispose()
      airLine.dispose()
      noiseTex.dispose()
      splatterTex.dispose()
      aoPass?.dispose()
      glowPass?.dispose()
      pipeline.dispose()
    },
  }
}

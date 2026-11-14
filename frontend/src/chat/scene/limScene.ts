/**
 * Lim, the jelly companion. A gumdrop-shaped shape-matching soft body (the
 * shared Jelly toolkit) in a gelatin shader, with painted lidded eyes, a
 * springy tuft, and a small stage of toys: jelly beans to bump, throw and
 * feed to Lim, and a bouncy gumball.
 *
 * The page drives Lim through moods (typing, thinking, talking, …) and
 * one-shot beats (hop on send, babble per streamed chunk, cheer when done).
 * Everything else is Lim's own: anticipation before every jump, stretch in
 * the air, squash + dust + a floor ripple on landing, falling asleep when
 * ignored, getting dizzy when shaken, and a handful of easter eggs (see
 * `stunt`, the poke combo that pops Lim into a litter of mini Lims, and
 * feeding).
 */
import * as THREE from 'three/webgpu'
import { float, mix, normalView, normalize } from 'three/tsl'
import { createStage } from '../../three/stage'
import { Jelly, icosphere, type Vec3 } from '../../three/jelly'
import { skinJelly, skinnedJellyGeometry, syncJellyGeometry } from '../../three/jellyMesh'
import { bindJellyPointer } from '../../three/jellyPointer'
import { sound } from '../sound'
import type { Stunt } from '../eggs'
import { ITEMS, actionsFor, type Action, type ItemSpec, type PlaceSpec, type Trait, type Tweak } from '../world/spec'
import { Weather, backdropMaterial, createPlaceUniforms, easePlace } from './env'
import { ItemExtras, bodyRest, createItemMaterials, shadeOf } from './items'
import { Pool, Tuft, heartGeometry, starGeometry } from './fx'
import {
  CONFETTI,
  FACES,
  PAL,
  addRestNormals,
  bubbleMaterial,
  dustMaterial,
  col,
  createEyeMaterial,
  createLimUniforms,
  floorMaterial,
  gel,
  haloMaterial,
  hullMaterial,
  inkOf,
  limBodyColor,
  rippleMaterial,
  shadowMaterial,
  smoothNormals,
  toyMaterial,
  type Face,
  type FaceName,
  type V3,
} from './limLook'

export type LimMood = 'idle' | 'typing' | 'thinking' | 'talking' | 'happy' | 'sad'
/** Small things the page tells Lim about. */
export type LimReaction = 'key' | 'shout' | 'wink'

export type LimSceneOptions = {
  canvas: HTMLCanvasElement
  host: HTMLElement
  reducedMotion: boolean
  night: boolean
  mood: LimMood
  /** A word to float above Lim's head ("boop!", "z", "yum!"). */
  onEmote?: (word: string) => void
  /** Top of Lim's head in host px, plus px per world unit. */
  onAnchor?: (x: number, y: number, unit: number) => void
  onFirstFrame?: () => void
  /** The world to start in (restored from a previous visit). */
  world?: LimWorld
  /** The items or the place changed. */
  onWorld?: (world: LimWorld) => void
}

export type LimWorld = { items: ItemSpec[]; place: PlaceSpec | null; tweak?: Tweak; /** Names of what Lim has on. */ worn?: string[] }

export type LimScene = {
  setMood(mood: LimMood): void
  setNight(night: boolean): void
  /** Look toward a point in viewport px (pointer, caret, a hovered chip). */
  lookAt(clientX: number, clientY: number): void
  hop(): void
  talk(): void
  cheer(confetti: boolean): void
  stunt(kind: Stunt): void
  react(kind: LimReaction): void
  /** Drop an item into the world; `then` is what Lim does with it once it lands. */
  addItem(spec: ItemSpec, then?: Action): void
  /** Move to a place, or back to the studio with null. */
  setPlace(spec: PlaceSpec | null): void
  /** Have Lim do something with an item by name ('' = the newest). False if there is no such item. */
  act(action: Action, target: string): boolean
  /** Change the weather, gravity, grip or light of wherever Lim is. */
  tweak(set: Tweak): void
  clear(what: 'items' | 'place' | 'all'): void
  world(): LimWorld
  /** Something is being made (the model is thinking): Lim conjures until told to stop. */
  conjure(on: boolean, made?: boolean): void
  dispose(): void
}

const FOV = 30
const PITCH = THREE.MathUtils.degToRad(10)
const LIM_H = 1.75
const FLOOR_LINE = 0.8
const G = 14
/** Items fall a little faster than Lim: small things read better snappy. */
const ITEM_G = 16
const MINIS = 6
const MAX_ITEMS = 6
const MINI = 0.36
const POKE_WORDS = ['hehe!', 'boop!', 'eep!', 'squish!', 'tee-hee', 'wobble!', 'again!']

/** Gumdrop: a squat sphere, wider and flat at the base. */
function gumdropRest(detail: number): { positions: Float32Array; index: Uint32Array } {
  const { positions, index } = icosphere(1, detail)
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1]
    const widen = 1 + 0.16 * ((1 - y) / 2) ** 1.6
    // The base flattens through a smooth curve, not a crease: no corner to
    // show when Lim squashes, puffs up or turns over.
    let ny = y * 0.95
    if (ny < -0.5) ny = -0.5 - 0.36 * Math.tanh((-0.5 - ny) / 0.36)
    positions[i] *= widen
    positions[i + 1] = ny
    positions[i + 2] *= widen * 0.92
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

const FACE_KEYS = [
  'w', 'curve', 'open', 'o', 'blush', 'lidTop', 'lidBot', 'seam', 'smile', 'tilt', 'brow', 'sad', 'pupil', 'heart', 'dizzy',
] as const satisfies readonly (keyof Face)[]
/** How fast each part of the face moves (1/s): lids and mouths snap, blush lingers. */
const FACE_RATE: Record<(typeof FACE_KEYS)[number], number> = {
  w: 14, curve: 14, open: 16, o: 14, blush: 6, lidTop: 20, lidBot: 20, seam: 16, smile: 16, tilt: 10,
  brow: 10, sad: 4, pupil: 11, heart: 12, dizzy: 10,
}

const smooth = (k: number) => {
  const x = Math.min(1, Math.max(0, k))
  return x * x * (3 - 2 * x)
}

export async function createLimScene(opts: LimSceneOptions): Promise<LimScene> {
  const { canvas, host, reducedMotion } = opts
  const stage = await createStage({ canvas, host, reducedMotion, alpha: true })
  const { renderer } = stage
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80)
  const u = createLimUniforms(opts.night)
  const ink = inkOf(u)
  const emote = (word: string) => opts.onEmote?.(word)

  // ── Lim ──────────────────────────────────────────────────────────
  const limRest = gumdropRest(4)
  // Soft enough to ring for a few beats after every move, firm enough (low
  // beta) that impacts squash and spring back instead of settling as a pancake.
  const LIM_STIFF = 0.115
  const LIM_BETA = 0.28
  const lim = new Jelly(limRest.positions, {
    stiffness: LIM_STIFF,
    beta: LIM_BETA,
    damping: 1.25,
    gravity: [0, -G, 0],
    floor: 0,
    friction: 0.45,
    // However hard Lim is shaken or thrown, the surface never folds over itself.
    maxStray: 0.34,
  })
  const UPRIGHT = 0.08
  lim.upright = UPRIGHT
  const limGeo = skinnedJellyGeometry(lim, limRest.index)
  addRestNormals(limGeo)
  const limN = smoothNormals(u.rot, 0.6)
  const restC: Vec3 = [...lim.center]
  const eyeL = surfacePoint(limRest.positions, [-0.36, 0.2, 0.91])
  const eyeR = surfacePoint(limRest.positions, [0.36, 0.2, 0.91])
  const EYE_R = 0.215
  const eyeRest = (s: { p: Vec3; n: Vec3 }): Vec3 => [
    s.p[0] - s.n[0] * EYE_R * 0.3,
    s.p[1] - s.n[1] * EYE_R * 0.3,
    s.p[2] - s.n[2] * EYE_R * 0.3,
  ]
  const eyeRests = [eyeRest(eyeL), eyeRest(eyeR)]
  const eyeNormals = [eyeL.n, eyeR.n]
  const anchors = { restC, eyeX: Math.abs(eyeL.p[0]), eyeY: eyeL.p[1] }
  const mouthRest = surfacePoint(limRest.positions, [0, anchors.eyeY - 0.33, 0.97]).p
  const headTopRest: Vec3 = [0, 0.95, 0]
  const baseRest: Vec3 = [0, -0.8, 0]
  const restEyeGap = Math.hypot(eyeRests[0][0] - eyeRests[1][0], eyeRests[0][1] - eyeRests[1][1], eyeRests[0][2] - eyeRests[1][2])
  const restHeight = headTopRest[1] - baseRest[1]

  const bodyMat = new THREE.MeshBasicNodeMaterial()
  bodyMat.colorNode = limBodyColor(u, limN, anchors)
  const limMesh = new THREE.Mesh(limGeo, bodyMat)
  const limHull = new THREE.Mesh(limGeo, hullMaterial(ink, 0.03, limN.local))
  limMesh.frustumCulled = limHull.frustumCulled = false
  scene.add(limMesh, limHull)

  // Eyes: a painted ball in an ink ring.
  const sphere = new THREE.SphereGeometry(1, 32, 20)
  const eyeMats = [createEyeMaterial(u, -1), createEyeMaterial(u, 1)]
  const eyeHullMat = hullMaterial(ink, 0)
  const rims: THREE.Mesh[] = []
  const makeEye = (i: number) => {
    const group = new THREE.Group()
    const rim = new THREE.Mesh(sphere, eyeHullMat)
    rim.scale.setScalar(1.13)
    group.add(new THREE.Mesh(sphere, eyeMats[i].mat), rim)
    scene.add(group)
    rims.push(rim)
    return group
  }
  const eyes = [makeEye(0), makeEye(1)]

  // The tuft: same jelly, one size smaller.
  const tuft = new Tuft(
    [[0.02, 0.86, 0.04], [0.03, 1.03, 0.04], [0.09, 1.18, 0.04], [0.21, 1.27, 0.04], [0.33, 1.27, 0.04], [0.42, 1.21, 0.04]],
    [0.085, 0.08, 0.07, 0.06, 0.048, 0.034],
  )
  const tuftMat = new THREE.MeshBasicNodeMaterial()
  {
    const n = normalize(normalView)
    const tinted = mix(col(PAL.top), u.tint as unknown as V3, u.tintAmt)
    tuftMat.colorNode = gel(n, n, {
      base: mix(tinted, col('#D9939B'), u.sad.mul(0.4)).mul(mix(float(1), float(0.84), u.night)),
      // A lighter shade than the body's: at this size a full shadow band reads as a dark nick in the tip.
      shade: mix(mix(col(PAL.shade), col(PAL.top), 0.55), col('#9A3A7C'), u.night),
      light: col(PAL.light),
      rim: mix(col(PAL.rim), col(PAL.nightRim), u.night),
      rimAmt: float(0.4),
      glow: col(PAL.glow),
      window: 0,
    })
  }
  const tuftMesh = new THREE.Mesh(tuft.geo, tuftMat)
  const tuftHull = new THREE.Mesh(tuft.geo, hullMaterial(ink, 0.026))
  tuftMesh.frustumCulled = tuftHull.frustumCulled = false
  scene.add(tuftMesh, tuftHull)

  // A nose bubble for naps: swells on the out-breath, pops when Lim wakes.
  const noseRest = surfacePoint(limRest.positions, [0.1, anchors.eyeY - 0.2, 0.97]).p
  const bubble = new THREE.Mesh(sphere, bubbleMaterial(u))
  bubble.visible = false
  bubble.renderOrder = 3
  scene.add(bubble)
  let bubbleSize = 0

  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMaterial(u))
  halo.scale.setScalar(5.2)
  halo.renderOrder = -1
  scene.add(halo)
  const limParts = [limMesh, limHull, tuftMesh, tuftHull, halo, ...eyes]

  // ── Floor, shadows, ripples ──────────────────────────────────────
  const pu = createPlaceUniforms()
  let site: PlaceSpec | null = opts.world?.place ?? null
  /** Tweaks on top of the place (or of the studio): weather, gravity, grip, light. */
  let mods: Tweak = { ...opts.world?.tweak }
  const air = () => ({
    weather: mods.weather ?? site?.weather ?? 'none',
    weatherColor: mods.weatherColor ?? site?.weatherColor ?? '#FFFFFF',
    gravity: mods.gravity ?? site?.gravity ?? 1,
    slippery: mods.slippery ?? site?.slippery ?? false,
    dark: mods.dark ?? site?.dark ?? false,
  })
  easePlace(pu, site, 1)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 30),
    floorMaterial(u, { amount: pu.amount, floor: pu.floor, dots: pu.dots, rug: pu.rug, pattern: pu.pattern }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.z = 3
  // A hair below the contact plane, so the ink line closes under every body.
  floor.position.y = -0.045
  scene.add(floor)
  // The sky rides on the camera, far behind everything, so it always fills the view.
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backdropMaterial(pu))
  backdrop.position.z = -60
  backdrop.renderOrder = -20
  backdrop.frustumCulled = false
  camera.add(backdrop)
  scene.add(camera)
  const weather = new Weather()
  scene.add(weather.mesh)
  weather.set(air().weather, air().weatherColor)

  const flat = new THREE.PlaneGeometry(1, 1)
  const makeShadow = (tint: string | null) => {
    const { mat, strength } = shadowMaterial(u, tint)
    const mesh = new THREE.Mesh(flat, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = -0.03
    mesh.renderOrder = 1
    scene.add(mesh)
    return { mesh, strength }
  }
  type Shadow = ReturnType<typeof makeShadow>
  const limShadow = makeShadow(PAL.top)

  const ripples = Array.from({ length: 4 }, () => {
    const { mat, k } = rippleMaterial(u)
    const mesh = new THREE.Mesh(flat, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = -0.025
    mesh.renderOrder = 2
    mesh.visible = false
    scene.add(mesh)
    return { mesh, k, size: 1, speed: 1 }
  })
  let nextRipple = 0
  const ripple = (x: number, z: number, size: number, speed = 1.6) => {
    if (reducedMotion) return
    const r = ripples[nextRipple++ % ripples.length]
    r.mesh.position.x = x
    r.mesh.position.z = z
    r.k.value = 0
    r.size = size
    r.speed = speed
    r.mesh.visible = true
  }

  // ── Items ────────────────────────────────────────────────────────
  // Everything on the stage that isn't Lim: built from a spec (see items.ts),
  // so the starter toys, the catalog and things the model invents are one kind.
  const itemMats = createItemMaterials(u, ink)
  const makeToy = (spec: ItemSpec, renew: boolean) => {
    const rest = bodyRest(spec)
    const has = (trait: Trait) => spec.traits.includes(trait)
    const soft = has('soft')
    const jelly = new Jelly(rest.positions, {
      stiffness: soft ? 0.24 : 0.34,
      beta: soft ? 0.16 : 0.05,
      damping: has('bouncy') ? 0.35 : has('floaty') ? 1.6 : 1.1,
      maxStray: soft ? 0.1 : 0.06,
      gravity: [0, -16, 0],
      floor: rest.lift,
      friction: has('bouncy') ? 0.86 : 0.4,
      substeps: 2,
    })
    const geo = skinnedJellyGeometry(jelly, rest.index)
    const hex = spec.parts[0].color
    // The body gets materials of its own: they change while it is in hand.
    const mesh = new THREE.Mesh(geo, toyMaterial(u, hex, shadeOf(hex)))
    const hull = new THREE.Mesh(geo, hullMaterial(ink, 0.016))
    mesh.frustumCulled = hull.frustumCulled = false
    const extras = new ItemExtras(spec, [0, 0, 0], itemMats)
    scene.add(mesh, hull, extras.group)
    return {
      spec, has, hex, jelly, geo, mesh, hull, extras, shadow: makeShadow(null), r: rest.radius, half: rest.half,
      slot: 0, depth: 0.25, beta: jelly.beta, stiffness: jelly.stiffness,
      /** A starter toy comes back after it is eaten; anything else is gone. */
      renew,
      /** Seconds at rest; the sim skips toys that have settled. */
      still: 0,
      asleep: false,
      /** Being swallowed since this time, then gone until `backAt`. */
      eatenAt: -1,
      backAt: -1 as number,
      worn: null as 'hat' | 'glasses' | null,
      lastVy: 0,
      nextFx: 0,
    }
  }
  type Toy = ReturnType<typeof makeToy>
  const toys: Toy[] = []
  const wakeToy = (toy: Toy) => {
    toy.asleep = false
    toy.still = 0
  }

  // ── Particles ────────────────────────────────────────────────────
  const plain = (side: THREE.Side = THREE.DoubleSide) => new THREE.MeshBasicNodeMaterial({ side })
  const popIn = (k: number) => Math.min(1, k * 9) * Math.min(1, (1 - k) * 2.5)
  const confetti = new Pool(new THREE.PlaneGeometry(0.12, 0.07), plain(), 140, {
    gravity: 6.5, drag: 1.6, flutter: 1.4, settle: true, shape: (k) => Math.min(1, (1 - k) * 6),
  })
  // Dust puffs: soft discs lying on the floor that swell as they slide out from
  // under a landing and thin away. Never in front of the body.
  const dust = new Pool(new THREE.PlaneGeometry(2, 2), dustMaterial(u), 40, {
    gravity: 0, drag: 3.4, shape: (k) => (0.6 + 0.8 * k) * Math.min(1, (1 - k) * 3.5),
  })
  dust.mesh.renderOrder = 2
  const stars = new Pool(starGeometry(4, 0.34), plain(), 40, { gravity: 3, drag: 2.2, billboard: true, shape: popIn })
  const hearts = new Pool(heartGeometry(), plain(), 24, { gravity: -1.1, drag: 1.4, billboard: true, flutter: 1.8, shape: popIn })
  const pools = [confetti, dust, stars, hearts]
  for (const p of pools) scene.add(p.mesh)

  // ── Layout ───────────────────────────────────────────────────────
  let halfW = 2.5
  let topY = 4
  let unit = 100
  let w = 1
  let h = 1
  let wide = true
  const camBase = new THREE.Vector3()
  let camTargetY = 0
  // Desktop layout (the page's own breakpoint): the stage dissolves over its
  // last 72px before the chat panel. The camera slides over by half of that so
  // Lim stands in the middle of what's visible, and `reach` is the half-width
  // of that visible stage.
  const desk = window.matchMedia('(min-width: 1024px)')
  let shiftX = 0
  let reach = 2.5
  const layout = (sw: number, sh: number) => {
    w = sw
    h = sh
    wide = sw >= 820
    const aspect = sw / sh
    let vh = LIM_H / (sh < 220 ? 0.52 : wide ? 0.38 : 0.55)
    const minW = wide ? 5.6 : 4.6
    if (vh * aspect < minW) vh = minW / aspect
    const dist = vh / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    camTargetY = (FLOOR_LINE - 0.5) * vh
    camera.aspect = aspect
    unit = sh / vh
    shiftX = desk.matches ? 36 / unit : 0
    camBase.set(shiftX, camTargetY + dist * Math.sin(PITCH), dist * Math.cos(PITCH))
    camera.position.copy(camBase)
    camera.lookAt(shiftX, camTargetY, 0)
    camera.updateProjectionMatrix()
    backdrop.scale.set(2 * 60 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * aspect * 1.04, 2 * 60 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * 1.04, 1)
    pu.aspect.value = aspect
    halfW = (vh * aspect) / 2
    reach = halfW - shiftX
    topY = camTargetY + vh / 2 - 0.05
    unit = sh / vh
  }
  stage.onResize(layout)

  // ── Start pose: Lim pops to life where the static mascot stood ───
  lim.translate(0, 0.81, 0)
  /** Everything the pointer can grab and that collides; items and minis come and go. */
  const bodies: Jelly[] = [lim]
  const info = new Map<Jelly, { r: number; m: number; toy?: Toy }>([[lim, { r: 1, m: 6 }]])

  // ── State ────────────────────────────────────────────────────────
  let t = 0
  let mood: LimMood = opts.mood
  let night = opts.night
  let grabbed = false
  let grabbedAt = 0
  let held: Toy | null = null
  let errand: { toy: Toy; then: () => void; by: number; x: number } | null = null
  let keepy: { toy: Toy; count: number; until: number; cool: number } | null = null
  let hugUntil = 0
  let hugSide = 1
  let lastOuch = -9
  /** Conjuring since this time (0 = not). */
  let conjuring = 0
  let nextSpark = 0
  let nextMutter = 0
  let mutters = 0
  let nearSince = 0
  let snatched = false
  let pokedUntil = 0
  let pokes: number[] = []
  let happyUntil = 0
  let act: { face: FaceName; until: number } | null = null
  let winkUntil = 0
  let cheerTimer: ReturnType<typeof setTimeout> | undefined
  let talkOpen = 0
  let talkO = 0
  let lastTalk = 0
  let talkCount = 0
  let nextBlink = 1.5
  let blinkUntil = 0
  let nextFidget = 4
  let nextWobble = 0
  let thinkSide = 1
  let nextHomeHop = 0
  let nextSaccade = 0
  let entryScale = reducedMotion ? 1 : 0.72
  let entryVel = 0
  let lastActive = 0
  let sleep: 'awake' | 'yawning' | 'asleep' = 'awake'
  let napUntil = 0
  let nextZ = 0
  let shaken = 0
  let shakeDir = 0
  let dizzyUntil = 0
  let nextOrbit = 0
  let lastBonk = -1
  let lastShout = -9
  let lastKey = 0
  let inflate = 0
  let nextShiver = 0
  let shiverSide = 1
  let full = 0
  let chewUntil = 0
  let chewSide = 1
  let shake = 0
  let call: { x: number; z: number; until: number } | null = null
  let dance: { t0: number; until: number; step: number; lean: number } | null = null
  let flip: { t0: number; dur: number; at: number } | null = null
  let spin: { t0: number; dur: number; turns: number; at: number } | null = null
  let popped: { t0: number; merging: boolean } | null = null
  const size = { x: 1, v: 0, target: 1, until: 0 }
  const squash = { x: 0, v: 0 }
  /** Cheek puff: widens the body at the middle for a beat (chewing). */
  const cheeks = { x: 0, v: 0 }
  const queue: { at: number; fn: () => void }[] = []
  const look = { x: 0, y: 0, at: -10, clientX: 0, clientY: 0 }
  const wander = { x: 0, y: 0, until: 0 }
  const jitter = { x: 0, y: 0 }
  const lean = { yaw: 0, pitch: 0, roll: 0 }
  const par = { x: 0, y: 0 }
  const f: Face & { blink: number } = { ...FACES[mood], browL: [...FACES[mood].browL], browR: [...FACES[mood].browR], blink: 0 }
  let wasAirborne = false
  let lastVy = 0
  const vbar: Vec3 = [0, 0, 0]
  const prevV: Vec3 = [0, 0, 0]
  const tmp: Vec3 = [0, 0, 0]
  const tmp2: Vec3 = [0, 0, 0]
  const mouthAt: Vec3 = [0, 0, 0]
  const eyeMid: Vec3 = [0, 0, 0]
  const quat = new THREE.Quaternion()
  const eyeQuat = new THREE.Quaternion()
  const NO_TURN = new THREE.Quaternion()
  const CAM_DIR = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH))
  const rotM4 = new THREE.Matrix4()
  const euler = new THREE.Euler(0, 0, 0, 'YXZ')
  const proj = new THREE.Vector3()
  let hostRect = host.getBoundingClientRect()
  stage.onResize(() => {
    hostRect = host.getBoundingClientRect()
  })

  const ease = (cur: number, target: number, rate: number, dt: number) =>
    reducedMotion ? target : cur + (target - cur) * (1 - Math.exp(-rate * dt))
  const later = (delay: number, fn: () => void) => queue.push({ at: t + delay, fn })
  const setAct = (name: FaceName, dur: number) => {
    act = { face: name, until: t + dur }
  }
  const toHost = (p: Vec3): [number, number] => {
    proj.set(p[0], p[1], p[2]).project(camera)
    return [((proj.x + 1) / 2) * w, ((1 - proj.y) / 2) * h]
  }

  // ── Effects ──────────────────────────────────────────────────────
  const burst = (count: number, power: number) => {
    if (reducedMotion) return
    lim.attach(headTopRest, tmp)
    for (let k = 0; k < count; k++) {
      const c = confetti.spawn(CONFETTI[k % CONFETTI.length], 2.4 + Math.random() * 1.4)
      c.p.set(tmp[0] + (Math.random() - 0.5) * 0.6, tmp[1] + 0.1, tmp[2] + (Math.random() - 0.5) * 0.4)
      const a = Math.random() * Math.PI * 2
      const s = (1.2 + Math.random() * 2.6) * power
      c.v.set(Math.cos(a) * s, (4.2 + Math.random() * 3.4) * power, Math.sin(a) * s * 0.4)
      c.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      c.angle = Math.random() * Math.PI
      c.spin = (Math.random() - 0.5) * 16
    }
  }
  /** Confetti falling from above the stage. */
  const rain = (count: number) => {
    if (reducedMotion) return
    for (let k = 0; k < count; k++) {
      const c = confetti.spawn(CONFETTI[k % CONFETTI.length], 3 + Math.random() * 1.5)
      c.p.set((Math.random() - 0.5) * 2 * halfW, topY + Math.random() * 0.8, (Math.random() - 0.5) * 1.6)
      c.v.set((Math.random() - 0.5) * 1.5, -Math.random() * 2, 0)
      c.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      c.spin = (Math.random() - 0.5) * 16
    }
  }
  /** A ring of dust kicked out along the floor. */
  const puff = (x: number, z: number, count: number, power: number, radius = 1.15) => {
    if (reducedMotion) return
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + Math.random() * 0.6
      const d = dust.spawn('#ffffff', 0.3 + Math.random() * 0.14, 0.2 + Math.random() * 0.14)
      d.p.set(x + Math.cos(a) * radius, -0.02, z + Math.sin(a) * radius * 0.8)
      d.v.set(Math.cos(a) * (1.6 + Math.random()) * power, 0, Math.sin(a) * 1.2 * power)
      // Flat on the floor.
      d.axis.set(1, 0, 0)
      d.angle = -Math.PI / 2
    }
  }
  const sparkle = (x: number, y: number, z: number, count: number, power = 1) => {
    if (reducedMotion) return
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2
      const s = stars.spawn(k % 3 ? '#FFD25E' : '#FFFFFF', 0.45 + Math.random() * 0.35, 0.07 + Math.random() * 0.08)
      s.p.set(x, y, z)
      s.v.set(Math.cos(a) * 3 * power, Math.sin(a) * 3 * power + 1, 0)
      s.spin = (Math.random() - 0.5) * 12
    }
  }
  const love = (count: number) => {
    if (reducedMotion) return
    lim.attach(headTopRest, tmp)
    for (let k = 0; k < count; k++) {
      const hrt = hearts.spawn(k % 2 ? '#FF4F86' : '#FF8FA8', 1.3 + Math.random() * 0.7, 0.1 + Math.random() * 0.07)
      hrt.p.set(tmp[0] + (Math.random() - 0.5) * 1.3, tmp[1] - 0.3 + Math.random() * 0.4, tmp[2] + 0.5)
      hrt.v.set((Math.random() - 0.5) * 1.2, 1 + Math.random(), 0)
      hrt.angle = (Math.random() - 0.5) * 0.6
    }
  }
  const grav = () => G * air().gravity
  const toyGravity = (toy: Toy): Vec3 => [0, toy.has('floaty') ? 2.4 : -ITEM_G * air().gravity, 0]
  /** Gravity, grip and light follow the place. */
  const applyPlace = () => {
    lim.gravity = [0, -grav(), 0]
    lim.friction = air().slippery ? 0.95 : 0.45
    for (const toy of toys) {
      if (!toy.worn && toy.eatenAt < 0) toy.jelly.gravity = toyGravity(toy)
      toy.jelly.friction = air().slippery ? 0.96 : toy.has('bouncy') ? 0.86 : 0.4
      wakeToy(toy)
    }
    u.night.value = night || air().dark ? 1 : 0
    weather.set(air().weather, air().weatherColor)
  }
  /** A thump on the floor jolts every toy near it. */
  const shock = (x: number, z: number, power: number) => {
    for (const toy of toys) {
      if (toy.eatenAt >= 0 || toy.backAt >= 0 || toy.worn) continue
      const d = Math.hypot(toy.jelly.center[0] - x, toy.jelly.center[2] - z)
      const k = power / (1 + d * d * 0.6)
      if (k < 0.4) continue
      wakeToy(toy)
      toy.jelly.kick(Math.sign(toy.jelly.center[0] - x) * k * 0.3, k, 0)
      toy.jelly.spin(0, 0, (Math.random() - 0.5) * k * 2)
    }
  }

  // ── Moves ────────────────────────────────────────────────────────
  /** Every jump is three beats: crouch (anticipation), launch stretched, land squashed. */
  const jump = (vx: number, vyAsked: number, vz: number, antic = 0.11) => {
    if (reducedMotion) return
    // Never higher than the stage has room for (head and tuft included).
    const vy = Math.min(vyAsked, Math.sqrt(2 * grav() * Math.max(0.04, topY - 1.75 * lim.scale - 0.6)))
    squash.v += 2.2 + vy * 0.2
    later(antic, () => {
      if (popped) return
      lim.kick(vx, vy, vz)
      squash.v -= 2.4 + vy * 0.26
      tuft.flick(-vx * 0.6, -vy * 0.5, 0)
      if (vy > 4) {
        puff(lim.center[0], lim.center[2], 5, 0.7)
        sound.boing(vy / 9)
      }
    })
  }
  /** Draw a toy over everything while it's in hand or on its way into Lim's mouth. */
  const onTop = (toy: Toy, on: boolean) => {
    // In hand it holds its shape instead of dangling from the pinned patch.
    toy.jelly.beta = on ? 0.06 : toy.beta
    toy.jelly.stiffness = on ? 0.4 : toy.stiffness
    toy.hull.renderOrder = on ? 9 : 0
    toy.mesh.renderOrder = on ? 10 : 0
    // Still writes depth, so the floor (drawn later) doesn't paint over it.
    for (const m of [toy.mesh.material, toy.hull.material] as THREE.Material[]) m.depthTest = !on
  }
  /** Something happened: reset the nap timer, and wake Lim unless a nap was asked for. */
  const active = (nudge = false) => {
    lastActive = t
    if (nudge) napUntil = 0
    if (sleep === 'awake' || t < napUntil) return
    const was = sleep
    sleep = 'awake'
    if (was === 'asleep' && !reducedMotion) {
      // The bubble bursts first.
      lim.attach(noseRest, tmp)
      sparkle(tmp[0] + 0.1, tmp[1], tmp[2] + 0.3, 4, 0.5)
      sound.pop()
      setAct('shock', 0.6)
      emote('!')
      jump(0, 3.6, 0, 0.02)
      sound.squeak()
    }
  }
  const nod = (to: 'sleepy' | 'now') => {
    if (reducedMotion) return
    sleep = 'yawning'
    setAct('yawn', 1.7)
    squash.v -= 3.2
    sound.yawn()
    later(to === 'now' ? 1.7 : 2.4, () => {
      if (sleep !== 'yawning') return
      sleep = 'asleep'
      nextZ = t + 0.6
    })
  }
  const dizzy = () => {
    if (t < dizzyUntil) return
    dizzyUntil = t + 3.4
    shaken = 0
    setAct('dizzy', 3.4)
    emote('woah…')
  }
  const startDance = (dur: number) => {
    if (popped) return
    dance = { t0: t, until: t + dur, step: -1, lean: 0 }
    setAct('happy', dur)
  }
  const startSpin = (turns: number, dur: number) => {
    spin = { t0: t, dur, turns, at: 0 }
    sound.whoosh()
  }
  const startFlip = () => {
    const vy = Math.min(wide ? 8.2 : 6.4, Math.sqrt(2 * grav() * Math.max(0.2, topY - 3.4)))
    const antic = 0.16
    jump(0, vy, 0, antic)
    flip = { t0: t + antic + 0.07, dur: Math.max(0.4, (2 * vy) / grav() - 0.16), at: 0 }
    setAct('flying', flip.dur + antic + 0.07)
    later(antic + flip.dur + 0.05, () => {
      setAct('smug', 1.2)
      sparkle(lim.center[0], lim.center[1] + 1.1, 0.6, 8)
      sound.sparkle()
    })
  }
  const resize = (target: number, dur: number) => {
    size.target = target
    size.until = t + dur
    size.v += (target - size.x) * 6
    sound.boing(target > 1 ? 0.9 : 0.3)
    if (target > 1) later(0.25, () => shock(lim.center[0], lim.center[2], 5))
  }

  // ── Mini Lims (the poke-combo easter egg) ────────────────────────
  type Mini = { jelly: Jelly; geo: THREE.BufferGeometry; parts: THREE.Object3D[]; eyes: THREE.Group[]; shadow: Shadow; nextHop: number }
  let minis: Mini[] | null = null
  const buildMinis = (): Mini[] => {
    const rest = gumdropRest(2)
    const mat = new THREE.MeshBasicNodeMaterial()
    const n = normalize(normalView)
    mat.colorNode = limBodyColor(u, { view: n, spec: n }, anchors)
    const hullMat = hullMaterial(ink, 0.02)
    return Array.from({ length: MINIS }, () => {
      const jelly = new Jelly(rest.positions, {
        stiffness: 0.2, beta: 0.3, damping: 1.2, gravity: [0, -16, 0], floor: 0, friction: 0.4, substeps: 2,
      })
      jelly.upright = 0.14
      jelly.scale = MINI
      const geo = skinnedJellyGeometry(jelly, rest.index)
      const mesh = new THREE.Mesh(geo, mat)
      const hull = new THREE.Mesh(geo, hullMat)
      mesh.frustumCulled = hull.frustumCulled = false
      const miniEyes = [0, 1].map((i) => {
        const group = new THREE.Group()
        const rim = new THREE.Mesh(sphere, eyeHullMat)
        rim.scale.setScalar(1.13)
        group.add(new THREE.Mesh(sphere, eyeMats[i].mat), rim)
        return group
      })
      const shadow = makeShadow(PAL.top)
      const parts = [mesh, hull, ...miniEyes, shadow.mesh]
      for (const p of parts) p.visible = false
      scene.add(mesh, hull, ...miniEyes)
      info.set(jelly, { r: MINI, m: 1 })
      return { jelly, geo, parts, eyes: miniEyes, shadow, nextHop: 0 }
    })
  }
  /** Put a body's rest shape (scaled) at a point, at rest. */
  const place = (jelly: Jelly, geo: THREE.BufferGeometry, scale: number, x: number, y: number, z: number) => {
    const rest = geo.attributes.rest.array as Float32Array
    let cy = 0
    for (let i = 1; i < rest.length; i += 3) cy += rest[i]
    cy /= jelly.count
    for (let i = 0; i < rest.length; i += 3) {
      jelly.x[i] = x + rest[i] * scale
      jelly.x[i + 1] = y + (rest[i + 1] - cy) * scale
      jelly.x[i + 2] = z + rest[i + 2] * scale
    }
    jelly.v.fill(0)
    jelly.goal.set(jelly.x)
    jelly.center[0] = x
    jelly.center[1] = y
    jelly.center[2] = z
  }
  const pop = () => {
    if (popped || reducedMotion) return
    minis ??= buildMinis()
    popped = { t0: t, merging: false }
    const [cx, cy, cz] = lim.center
    for (const toy of toys) unwear(toy)
    errand = keepy = null
    for (const p of limParts) p.visible = false
    limShadow.mesh.visible = false
    bodies.splice(bodies.indexOf(lim), 1)
    minis.forEach((m, i) => {
      const a = (i / MINIS) * Math.PI * 2
      place(m.jelly, m.geo, MINI, cx + Math.cos(a) * 0.4, Math.max(0.4, cy) + Math.sin(a) * 0.3, cz * 0.5)
      m.jelly.kick(Math.cos(a) * 4.5, 4.5 + Math.random() * 3 + Math.sin(a) * 2, (Math.random() - 0.5) * 2)
      m.nextHop = t + 0.9 + Math.random() * 0.6
      m.jelly.scale = MINI
      for (const p of m.parts) p.visible = true
      bodies.push(m.jelly)
    })
    inflate = 0
    pokes = []
    dance = flip = spin = null
    burst(60, 1.15)
    sparkle(cx, cy, cz + 1, 12, 1.4)
    ripple(cx, cz, 5.5, 1.3)
    shock(cx, cz, 3.2)
    shake += 0.09
    setAct('whee', 6)
    sound.pop()
    emote('pop!')
  }
  const merge = () => {
    if (!popped || !minis) return
    let mx = 0
    for (const m of minis) {
      mx += m.jelly.center[0] / MINIS
      for (const p of m.parts) p.visible = false
      bodies.splice(bodies.indexOf(m.jelly), 1)
    }
    place(lim, limGeo, 1, THREE.MathUtils.clamp(mx, -halfW + 1.2, halfW - 1.2), restC[1] + 0.81, 0)
    for (const p of limParts) p.visible = true
    limShadow.mesh.visible = true
    bodies.unshift(lim)
    popped = null
    entryScale = 0.32
    entryVel = 2
    squash.x = 0
    squash.v = 0
    setAct('happy', 1.6)
    puff(lim.center[0], 0, 10, 1.3)
    shock(lim.center[0], 0, 4)
    sound.pop()
    later(0.12, () => sound.chime())
    emote('ta-da!')
    active()
  }

  // ── Feeding ──────────────────────────────────────────────────────
  const eat = (toy: Toy) => {
    toy.eatenAt = t
    toy.jelly.gravity = [0, 0, 0]
    toy.jelly.anchor = { target: mouthAt, k: 420, c: 30 }
    const inPlay = bodies.indexOf(toy.jelly)
    if (inPlay >= 0) bodies.splice(inPlay, 1)
    later(0.26, () => {
      toy.mesh.visible = toy.hull.visible = toy.shadow.mesh.visible = toy.extras.group.visible = false
      toy.eatenAt = -1
      toy.backAt = toy.renew ? t + 6 + Math.random() * 3 : Infinity
      toy.jelly.anchor = null
      // Anything but a starter toy is gone for good once it is swallowed.
      if (!toy.renew) later(0, () => removeToy(toy, false))
      full += 1
      chewUntil = t + 1.1
      // Eyes open and on the busy cheek while chewing; shut only for the swallow.
      setAct('munch', 1.1)
      later(1.1, () => setAct('chew', 0.32))
      // Four chews, cheeks out on each, then the swallow.
      for (let k = 0; k < 4; k++) {
        later(0.06 + k * 0.26, () => {
          cheeks.v += 9
          chewSide = k % 2 ? 1 : -1
          lim.kick(chewSide * 0.18, 0, 0)
          u.browL.value.y += 0.02
          sound.blip()
        })
      }
      later(1.1, () => {
        // The gulp: a swallow down, and the belly swells where the colour starts.
        squash.v += 2.6
        size.v += 0.9
        sound.gulp()
        // The colour rises from the belly as the bean goes down.
        u.tint.value.set(toy.hex)
        u.tintLevel.value = 0.1
        tintGoal = 0.56
        tintUntil = t + 9
      })
      later(1.45, () => {
        if (toy.has('hot')) {
          // Too spicy: steam, a yelp, and a lap of the stage.
          setAct('shock', 1.4)
          u.tint.value.set('#E8402E')
          emote('HOT!')
          sound.squeak()
          jump(0, 6, 0, 0.04)
          for (let k = 0; k < 4; k++) later(k * 0.12, () => sparkle(mouthAt[0], mouthAt[1], mouthAt[2] + 0.2, 4, 0.7))
          return
        }
        if (toy.has('cold')) {
          setAct('worried', 1.4)
          emote('brr!')
          for (let k = 0; k < 8; k++) later(k * 0.06, () => lim.kick(k % 2 ? -0.9 : 0.9, 0, 0))
          return
        }
        setAct('smug', 1.1)
        emote(full >= 3 ? 'so full…' : 'yum!')
        if (full >= 3) later(0.9, () => nod('now'))
      })
      later(2.8, () => {
        if (sleep !== 'awake' || popped) return
        // A burp, and the embarrassment afterwards.
        squash.v -= 4
        lim.kick(0, 1.6, 0)
        setAct('ooh', 0.5)
        sound.burp()
        emote('burp')
        later(0.5, () => setAct('smug', 0.9))
      })
    })
  }
  let tintGoal = 0
  let tintUntil = 0
  const returnToy = (toy: Toy) => {
    toy.backAt = -1
    toy.jelly.scale = 1
    toy.jelly.gravity = toyGravity(toy)
    seat(toy)
    place(toy.jelly, toy.geo, 1, toy.slot, topY + 0.4, toy.depth)
    toy.mesh.visible = toy.hull.visible = toy.shadow.mesh.visible = toy.extras.group.visible = true
    onTop(toy, false)
    wakeToy(toy)
    bodies.push(toy.jelly)
  }

  // ── The world: items in and out ──────────────────────────────────
  // `saved` keeps a bean that has been eaten and is growing back; otherwise only what is really on the stage.
  const worldNow = (saved = false): LimWorld => ({
    items: toys.filter((toy) => (saved ? toy.backAt !== Infinity : toy.backAt < 0)).map((toy) => toy.spec),
    place: site,
    tweak: mods,
    worn: toys.filter((toy) => toy.worn).map((toy) => toy.spec.name),
  })
  const changed = () => opts.onWorld?.(worldNow(true))
  /** A free spot on the floor: clear of Lim's skirt, as far from the other items as it can get. */
  const seat = (toy: Toy) => {
    const edge = Math.max(1.45, reach - 0.3 - toy.r)
    let bestScore = -Infinity
    for (let k = 0; k < 14; k++) {
      const x = (k % 2 ? 1 : -1) * Math.min(edge, 1.5 + toy.r + Math.floor(k / 2) * 0.42)
      let room = 3
      for (const other of toys) {
        if (other !== toy && other.backAt < 0 && !other.worn) room = Math.min(room, Math.abs(other.jelly.center[0] - x) - other.r - toy.r)
      }
      // Room to spare matters most; among roomy spots, the nearer one wins.
      const score = Math.min(0.5, room) * 3 - Math.abs(x) * 0.12
      if (score > bestScore) {
        bestScore = score
        toy.slot = x
      }
    }
    // Nothing nudges things apart when motion is reduced, so fan them out in depth.
    toy.depth = reducedMotion ? -0.5 + (toys.indexOf(toy) % 5) * 0.3 : -0.4 + (toys.indexOf(toy) % 3) * 0.42
  }
  const addToy = (spec: ItemSpec, renew: boolean, height: number) => {
    const toy = makeToy(spec, renew)
    toys.push(toy)
    info.set(toy.jelly, { r: toy.r, m: toy.has('heavy') ? 4 : 1, toy })
    bodies.push(toy.jelly)
    seat(toy)
    toy.jelly.gravity = toyGravity(toy)
    if (air().slippery) toy.jelly.friction = 0.96
    place(toy.jelly, toy.geo, 1, toy.slot, Math.max(height, toy.half[1] + 0.02), toy.depth)
    return toy
  }
  const removeToy = (toy: Toy, poof: boolean) => {
    const i = toys.indexOf(toy)
    if (i < 0) return
    if (held === toy) {
      snatched = true
      pointer.release()
      snatched = false
      held = null
    }
    toys.splice(i, 1)
    const b = bodies.indexOf(toy.jelly)
    if (b >= 0) bodies.splice(b, 1)
    info.delete(toy.jelly)
    if (errand?.toy === toy) errand = null
    if (keepy?.toy === toy) keepy = null
    if (poof && !reducedMotion) {
      sparkle(toy.jelly.center[0], toy.jelly.center[1], toy.jelly.center[2] + 0.2, 7, 0.8)
      sound.pop()
    }
    scene.remove(toy.mesh, toy.hull, toy.shadow.mesh)
    toy.extras.dispose()
    toy.geo.dispose()
    for (const m of [toy.mesh.material, toy.hull.material, toy.shadow.mesh.material] as THREE.Material[]) m.dispose()
    changed()
  }

  // ── Wearing things ───────────────────────────────────────────────
  const unwear = (toy: Toy) => {
    if (!toy.worn) return
    toy.worn = null
    toy.jelly.anchor = null
    toy.jelly.upright = 0
    toy.jelly.gravity = toyGravity(toy)
    bodies.push(toy.jelly)
    wakeToy(toy)
    toy.jelly.kick((Math.random() < 0.5 ? -1 : 1) * 2.4, 3.2, 0)
  }
  const wear = (toy: Toy) => {
    const slot = toy.has('hat') ? 'hat' : 'glasses'
    for (const other of toys) if (other.worn === slot) unwear(other)
    toy.worn = slot
    wakeToy(toy)
    onTop(toy, false)
    const b = bodies.indexOf(toy.jelly)
    if (b >= 0) bodies.splice(b, 1)
    toy.jelly.gravity = [0, 0, 0]
    toy.jelly.anchor = { target: [...toy.jelly.center], k: 900, c: 55 }
    toy.jelly.upright = 0.5
    if (reducedMotion) {
      // Nothing will spring it into place: put it there.
      lim.attach(slot === 'hat' ? [0, 0.84 + toy.half[1], 0.02] : [0, anchors.eyeY + 0.01, eyeL.p[2] + 0.2], tmp)
      place(toy.jelly, toy.geo, 1, tmp[0], tmp[1], tmp[2])
      return
    }
    later(0.45, () => {
      setAct('smug', 1.3)
      emote('ta-da!')
      sound.sparkle()
      squash.v += 2
    })
  }

  // ── Things Lim does with an item ─────────────────────────────────
  /** Hop over next to an item, then do something once there. */
  const approach = (toy: Toy, then: () => void, gap = 0.15) => {
    const side = Math.sign(lim.center[0] - toy.jelly.center[0]) || 1
    // Lim's skirt is about 1.25 wide: stand that far off, plus the item, plus a gap.
    const x = THREE.MathUtils.clamp(toy.jelly.center[0] + side * (1.25 * lim.scale + toy.r + gap), -reach + 1.15, reach - 1.15)
    call = { x, z: 0, until: t + 3.2 }
    errand = { toy, then, by: t + 1.9, x }
    nextHomeHop = Math.min(nextHomeHop, t + 0.15)
  }
  /** Send an item up in an arc that comes down over Lim's head. */
  const lob = (toy: Toy) => {
    const g = Math.max(2, -toyGravity(toy)[1] || ITEM_G * air().gravity)
    lim.attach(headTopRest, tmp2)
    const peak = Math.min(topY - toy.r - 0.1, tmp2[1] + 1.25)
    const up = Math.sqrt(2 * g * Math.max(0.3, peak - toy.jelly.center[1]))
    // Time to rise to the peak and fall back to just above the head.
    const time = up / g + Math.sqrt((2 * Math.max(0.05, peak - tmp2[1] - toy.r - 0.3)) / g)
    toy.jelly.velocity(tmp)
    toy.jelly.kick((lim.center[0] - toy.jelly.center[0]) / time - tmp[0], up - tmp[1], -tmp[2])
    toy.jelly.spin(0, 0, (Math.random() - 0.5) * 5)
  }
  const play = (action: Action, toy: Toy) => {
    if (reducedMotion || popped || toy.backAt >= 0 || toy.eatenAt >= 0) return
    active(true)
    const gaze = () => {
      wander.x = THREE.MathUtils.clamp((toy.jelly.center[0] - lim.center[0]) / 1.4, -1, 1)
      wander.y = THREE.MathUtils.clamp((toy.jelly.center[1] - lim.center[1]) / 1.2, -0.7, 0.9)
      wander.until = t + 1.8
      look.at = -10
    }
    gaze()
    if (action === 'remove') {
      // Something Lim is wearing comes off; anything else goes back in the box.
      if (toy.worn) {
        emote('phew')
        return unwear(toy)
      }
      emote('bye!')
      return removeToy(toy, true)
    }
    if (toy.worn && action !== 'look') unwear(toy)
    if (action === 'look') {
      setAct('ooh', 0.9)
      squash.v += 1.5
    } else if (action === 'eat') {
      if (!toy.has('edible')) {
        setAct('squint', 0.9)
        emote('not food!')
        for (let k = 0; k < 4; k++) later(k * 0.09, () => lim.kick(k % 2 ? -1 : 1, 0, 0))
        return
      }
      setAct('aah', 0.5)
      wakeToy(toy)
      later(0.3, () => {
        if (toys.includes(toy) && toy.eatenAt < 0 && !popped) {
          onTop(toy, true)
          eat(toy)
        }
      })
    } else if (action === 'wear') {
      if (!toy.has('hat') && !toy.has('glasses')) {
        setAct('thinking', 0.9)
        return emote('how?')
      }
      wakeToy(toy)
      wear(toy)
    } else if (action === 'kick') {
      approach(toy, () => {
        const dir = Math.sign(toy.jelly.center[0] - lim.center[0]) || 1
        lim.kick(dir * 2.4, 2.6, 0)
        squash.v += 2
        later(0.13, () => {
          wakeToy(toy)
          if (toy.has('heavy')) {
            // It barely budges, and Lim bounces off.
            toy.jelly.kick(dir * 0.8, 0.6, 0)
            lim.kick(-dir * 3, 2.2, 0)
            setAct('hit', 0.5)
            emote('oof!')
            sound.bonk(0.9)
            return
          }
          toy.jelly.kick(dir * (4.5 + Math.random() * 2), 5.5 + Math.random() * 1.5, 0)
          toy.jelly.spin(0, 0, -dir * 7)
          sparkle(toy.jelly.center[0], toy.jelly.center[1], toy.jelly.center[2] + 0.3, 5)
          sound.bonk(0.7)
          setAct('happy', 1)
          if (toy.has('musical')) sound.beat(0)
        })
      })
    } else if (action === 'bounce') {
      approach(toy, () => {
        // Pop it up over Lim's head and keep it up.
        wakeToy(toy)
        toy.jelly.velocity(tmp)
        lob(toy)
        keepy = { toy, count: 0, until: t + 8, cool: t + 0.4 }
        setAct('whee', 0.8)
      }, 0.3)
    } else if (action === 'hug' && (toy.has('prickly') || toy.has('hot') || toy.has('cold'))) {
      // Some things don't hug back.
      approach(toy, () => (toy.has('prickly') ? ouch(toy) : feel(toy)), 0)
    } else if (action === 'hug') {
      approach(toy, () => {
        hugSide = Math.sign(toy.jelly.center[0] - lim.center[0]) || 1
        hugUntil = t + 1.5
        setAct('chew', 1.5)
        happyUntil = t + 2.2
        love(4)
        wakeToy(toy)
        toy.jelly.kick(-hugSide * 1.2, 1.2, 0)
        emote('aww')
        sound.sparkle()
      }, 0)
    } else if (action === 'nap') {
      approach(toy, () => {
        napUntil = t + 9
        nod('now')
      }, 0.05)
    } else if (action === 'dance') {
      startDance(4.5)
      emote('♪')
    }
  }
  /** What Lim makes of something new. */
  const greet = (toy: Toy, then?: Action) => {
    if (reducedMotion) return
    const act1 =
      then ??
      (toy.has('scary') ? null
        : toy.has('hat') || toy.has('glasses') ? 'wear'
        : toy.has('musical') ? 'dance'
        : toy.has('hot') || toy.has('cold') || toy.has('prickly') ? 'hug'
        : toy.has('bouncy') && !toy.has('floaty') ? 'bounce'
        : 'look')
    later(0.2, () => {
      if (!toys.includes(toy)) return
      play('look', toy)
      emote(toy.spec.name.length <= 12 ? `${toy.spec.name}!` : 'ooh!')
    })
    later(1.1, () => {
      if (!toys.includes(toy) || popped) return
      if (!act1) {
        // Scary: jump, then back off to the far side and peek.
        setAct('shock', 0.9)
        emote('eek!')
        sound.squeak()
        lim.kick(-Math.sign(toy.jelly.center[0]) * 1.5, 3.4, 0)
        call = { x: -Math.sign(toy.jelly.center[0] || 1) * Math.max(0, reach - 1.25), z: 0, until: t + 6 }
        later(0.9, () => setAct('worried', 2.4))
      } else if (act1 !== 'look') play(act1, toy)
    })
  }
  /** Too hot or too cold to cuddle. */
  const feel = (toy: Toy) => {
    const away = Math.sign(lim.center[0] - toy.jelly.center[0]) || 1
    if (toy.has('hot')) {
      setAct('shock', 0.9)
      emote('hot!')
      sound.squeak()
      lim.kick(away * 2.4, 4, 0)
      sparkle(toy.jelly.center[0], toy.jelly.center[1] + toy.r, toy.jelly.center[2] + 0.3, 5, 0.6)
    } else {
      setAct('worried', 1.4)
      emote('brr!')
      for (let k = 0; k < 10; k++) later(k * 0.055, () => lim.kick(k % 2 ? -0.9 : 0.9, 0, 0))
    }
  }
  const ouch = (toy: Toy) => {
    lastOuch = t
    setAct('hit', 0.6)
    emote('ouch!')
    sound.squeak()
    const away = Math.sign(lim.center[0] - toy.jelly.center[0]) || 1
    lim.kick(away * 2.6, 3.6, 0)
    sparkle(toy.jelly.center[0], toy.jelly.center[1] + toy.r, toy.jelly.center[2] + 0.3, 4, 0.6)
    later(0.6, () => setAct('worried', 1.2))
  }
  const MUTTERS = ['hmm…', 'mixing…', 'a pinch of sparkle', 'squish, squish', 'nearly…', 'so close…']
  /** Waiting on the model: a ring of sparkles gathers overhead while Lim fusses beneath it. */
  const conjureBeat = () => {
    if (!conjuring || popped) return
    const age = t - conjuring
    lim.attach(headTopRest, tmp)
    const cx = tmp[0]
    const cy = Math.min(topY - 0.5, tmp[1] + 0.95)
    if (t > nextSpark) {
      nextSpark = t + 0.07
      // The ring tightens and quickens the longer it takes.
      const a = t * (4 + Math.min(4, age * 0.4))
      const r = 0.75 - Math.min(0.35, age * 0.03) + Math.sin(t * 3) * 0.06
      const s = stars.spawn(CONFETTI[Math.floor(t * 9) % CONFETTI.length], 0.55, 0.07 + Math.random() * 0.05)
      s.p.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.42, 0.4 + Math.sin(a) * 0.3)
      s.v.set(-Math.sin(a) * 0.6, 0.25, 0)
      s.spin = 6
    }
    if (t > nextMutter) {
      nextMutter = t + 1.7
      // Past the last line it keeps to the late ones rather than starting over.
      emote(MUTTERS[mutters < MUTTERS.length ? mutters : MUTTERS.length - 2 + (mutters % 2)])
      mutters++
      // Up on tiptoe for a look, then a little stir.
      if (mutters % 2) jump(0, 2.6, 0, 0.06)
      else for (let k = 0; k < 4; k++) later(k * 0.1, () => lim.kick(k % 2 ? -1 : 1, 0, 0))
      tuft.flick((Math.random() - 0.5) * 5, 2, 0)
      sound.blip()
    }
    // Eyes on the sparkles.
    wander.x = Math.sin(t * 1.4) * 0.35
    wander.y = 0.9
    wander.until = t + 0.3
    look.at = -10
    if (!act || act.until < t + 0.2) setAct(mutters % 2 ? 'ooh' : 'typing', 0.6)
  }
  /** Errands and games in progress (called every frame). */
  const pastimes = () => {
    conjureBeat()
    if (errand) {
      const near = Math.abs(lim.center[0] - errand.x) < 0.4 && lim.contacts > 0
      if (!toys.includes(errand.toy) || popped) errand = null
      else if (near || t > errand.by) {
        const { then } = errand
        errand = null
        call = null
        then()
      }
    }
    if (keepy) {
      const { toy } = keepy
      toy.jelly.velocity(tmp)
      const dx = toy.jelly.center[0] - lim.center[0]
      lim.attach(headTopRest, tmp2)
      const overhead = Math.abs(dx) < 1.1 && toy.jelly.center[1] < tmp2[1] + 0.5 + toy.r && toy.jelly.center[1] > tmp2[1] - 0.3
      if (!toys.includes(toy) || popped || grabbed || t > keepy.until || held === toy) keepy = null
      else if (overhead && tmp[1] < 0 && t > keepy.cool) {
        // Header: Lim hops into it and sends it back up over its head.
        keepy.count++
        keepy.cool = t + 0.35
        if (lim.contacts > 0) lim.kick(dx * 0.8, 2.4, 0)
        squash.v -= 2
        tuft.flick(0, 4, 0)
        lob(toy)
        sound.boing(0.5)
        emote(`${keepy.count}!`)
        if (keepy.count >= 5) {
          keepy = null
          later(0.5, () => {
            setAct('smug', 1.3)
            burst(24, 0.8)
          })
        }
      } else if (toy.jelly.contacts > 0 && t > keepy.cool + 0.5) {
        // Dropped it.
        const count = keepy.count
        keepy = null
        setAct(count >= 2 ? 'happy' : 'sad', 1)
        emote(count >= 2 ? 'phew!' : 'oops')
      }
    }
  }
  /** How the place makes Lim feel, now and then. */
  const moodBeat = () => {
    const w = air().weather
    const mood2 = w === 'rain' ? 'wet' : w === 'snow' ? 'cold' : (site?.mood ?? (air().gravity < 0.6 ? 'floaty' : null))
    if (!mood2) return
    if (mood2 === 'cold') {
      setAct('worried', 1.1)
      emote('brr')
      for (let k = 0; k < 10; k++) later(k * 0.055, () => lim.kick(k % 2 ? -0.8 : 0.8, 0, 0))
    } else if (mood2 === 'hot') {
      setAct('squint', 1.3)
      squash.v += 3.5
      emote('phew')
    } else if (mood2 === 'floaty') {
      jump((Math.random() - 0.5) * 2, 5.4, 0)
      setAct('whee', 1.6)
      later(0.3, () => lim.spin(0, 0, (Math.random() < 0.5 ? -1 : 1) * 1.2))
    } else if (mood2 === 'wet') {
      setAct('squint', 0.9)
      for (let k = 0; k < 6; k++) later(k * 0.08, () => lim.kick(k % 2 ? -1.4 : 1.4, 0, 0))
      tuft.flick(6, 0, 0)
    } else if (mood2 === 'spooky') {
      setAct('worried', 1.6)
      wander.x = Math.random() < 0.5 ? -1 : 1
      wander.y = 0.2
      wander.until = t + 0.7
      later(0.7, () => {
        wander.x = -wander.x
        wander.until = t + 0.8
      })
    } else if (mood2 === 'party') {
      startDance(2.4)
    } else if (mood2 === 'cozy') {
      setAct('sleepy', 1.6)
      squash.v += 1.5
    } else {
      setAct('happy', 1)
      squash.v += 1.5
    }
  }

  // ── Pointer: grab, fling, poke, feed, call ───────────────────────
  const pointer = bindJellyPointer({
    host,
    camera,
    bodies,
    reducedMotion,
    touchDrag: true,
    pokeStrength: 3.2,
    // A wide, soft grip and a stretch limit: Lim pulls like taffy and trails a
    // wild pointer instead of creasing where the grabbed patch ends.
    grabRadius: 1.2,
    maxStretch: (body) => (body === lim ? 1.2 : Infinity),
    onPoke(body) {
      active(true)
      const toy = info.get(body)?.toy
      if (toy) {
        wakeToy(toy)
        body.kick((Math.random() - 0.5) * 1.5, 3 + Math.random() * 1.5, 0)
        body.spin(0, 0, (Math.random() - 0.5) * 9)
        sound.squeak()
        return
      }
      if (body !== lim) {
        body.kick(0, 3.5, 0)
        sound.squeak()
        return
      }
      pokedUntil = t + 0.55
      const now = t
      pokes = pokes.filter((p) => now - p < 4)
      pokes.push(now)
      // Giggle: a couple of quick side-to-side shivers.
      for (let k = 0; k < 3; k++) later(0.06 + k * 0.09, () => lim.kick(k % 2 ? -1.1 : 1.1, k === 0 ? 1.6 : 0, 0))
      squash.v += 3
      tuft.flick((Math.random() - 0.5) * 4, 2, 0)
      sound.squeak()
      // The third poke in a row knocks off whatever Lim is wearing.
      if (pokes.length === 3) for (const toy of toys) unwear(toy)
      // Keep poking and Lim puffs up… and up… and pops.
      if (pokes.length === 5) {
        happyUntil = t + 2
        burst(48, 1)
        emote('hehehe!')
      } else if (pokes.length >= 10) {
        pop()
      } else if (pokes.length > 5) {
        inflate = (pokes.length - 5) * 0.1
        setAct('worried', 1.6)
        emote(pokes.length === 9 ? 'uh oh…' : pokes.length === 7 ? 'careful!' : POKE_WORDS[pokes.length % POKE_WORDS.length])
      } else {
        emote(POKE_WORDS[Math.floor(Math.random() * POKE_WORDS.length)])
      }
    },
    onGrab(body) {
      active(true)
      if (body === lim) {
        grabbed = true
        grabbedAt = t
        sound.squeak()
        return
      }
      const toy = info.get(body)?.toy
      if (toy) {
        held = toy
        wakeToy(toy)
        onTop(toy, true)
      }
    },
    onRelease(body) {
      if (body === lim) {
        grabbed = false
        lim.velocity(vbar)
        if (Math.hypot(vbar[0], vbar[1]) > 6) sound.whoosh()
        return
      }
      const toy = info.get(body)?.toy
      if (!toy || snatched) return
      held = null
      wakeToy(toy)
      const near = Math.hypot(toy.jelly.center[0] - mouthAt[0], toy.jelly.center[1] - mouthAt[1])
      if (toy.has('edible') && !popped && sleep === 'awake' && near < 0.62) return eat(toy)
      onTop(toy, false)
      // Let go of a hat over Lim's head (or glasses over its eyes) and it goes on.
      lim.attach(headTopRest, tmp)
      const overHead = Math.hypot(toy.jelly.center[0] - tmp[0], toy.jelly.center[1] - tmp[1]) < 0.75
      if (!popped && ((toy.has('hat') && overHead) || (toy.has('glasses') && near < 0.8))) wear(toy)
    },
  })

  // Tap the floor and Lim hops over to see what's there.
  const tapRay = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const groundHit = new THREE.Vector3()
  const onTap = (e: PointerEvent) => {
    if (reducedMotion || e.button > 0 || pointer.grabbing() || popped) return
    if (e.target instanceof Element && e.target.closest('a, button, input, textarea')) return
    ndc.set(((e.clientX - hostRect.left) / w) * 2 - 1, -((e.clientY - hostRect.top) / h) * 2 + 1)
    tapRay.setFromCamera(ndc, camera)
    if (!tapRay.ray.intersectPlane(ground, groundHit) || groundHit.z < -1.4 || groundHit.z > 2.6) return
    active()
    call = {
      x: THREE.MathUtils.clamp(groundHit.x, -halfW + 1.15, halfW - 1.15),
      z: THREE.MathUtils.clamp(groundHit.z, -0.5, 0.6),
      until: t + 6,
    }
    ripple(groundHit.x, groundHit.z, 1.5, 2.4)
    nextHomeHop = Math.min(nextHomeHop, t + 0.28)
  }
  host.addEventListener('pointerdown', onTap)

  // ── Frame ────────────────────────────────────────────────────────
  const brain = (dt: number) => {
    lim.velocity(vbar)
    const speed = Math.hypot(vbar[0], vbar[1], vbar[2])
    const resting = lim.contacts > 0 && Math.abs(vbar[1]) < 0.4
    const busy = grabbed || mood === 'thinking' || mood === 'talking' || Boolean(dance || flip || spin) || t < dizzyUntil
    if (call && t > call.until) call = null

    // Home: centre stage, a step toward the chat while you type (where there's room), or
    // wherever the floor was last tapped.
    const homeX = call ? call.x : reach >= 3.1 && (mood === 'typing' || mood === 'talking') ? 0.3 : 0
    const homeZ = call ? call.z : 0
    const off = homeX - lim.center[0]
    const offZ = homeZ - lim.center[2]
    if (resting && !grabbed && !dance && sleep !== 'asleep' && t > nextHomeHop && (Math.abs(off) > 0.28 || Math.abs(offZ) > 0.5)) {
      const dir = Math.sign(off) * Math.min(1, Math.abs(off))
      jump(dir * 2.3, 4.6, offZ * 1.6, 0.08)
      nextHomeHop = t + 0.75
    }

    // Puffed up and worried: a shiver, and a nervous blink.
    if (inflate > 0 && t > nextShiver) {
      shiverSide = -shiverSide
      lim.kick(shiverSide * 0.45, 0, 0)
      nextShiver = t + 0.06
      if (Math.random() < 0.06) blinkUntil = t + 0.12
    }

    // Poke combo wears off; a full tummy settles; a tint fades.
    if (pokes.length && t - pokes[pokes.length - 1] > 3) {
      pokes = []
      inflate = 0
    }
    full = Math.max(0, full - dt * 0.04)
    if (t > tintUntil) tintGoal = 0
    u.tintAmt.value = ease(u.tintAmt.value, tintGoal, tintGoal > 0 ? 9 : 0.5, dt)
    u.tintLevel.value = Math.min(3, u.tintLevel.value + dt * 2.3)
    cheeks.v += (-260 * cheeks.x - 16 * cheeks.v) * dt
    cheeks.x += cheeks.v * dt

    // Thinking: shift the weight to one side, hold, then the other, with a slow blink on the turn.
    if (mood === 'thinking' && !dance && !flip && t > nextWobble) {
      thinkSide = -thinkSide
      lim.attach(headTopRest, tmp)
      lim.impulse([tmp[0], tmp[1] - 0.2, tmp[2]], [thinkSide * 2.4, 0, 0], 1.3)
      lim.kick(thinkSide * 0.5, 0.9, 0)
      squash.v += 1.4
      tuft.flick(thinkSide * 3.2, 0.8, 0)
      if (thinkSide > 0) blinkUntil = t + 0.22
      nextWobble = t + 1.05
    }

    // Idle life: little unprompted beats so Lim never stands frozen.
    if (!busy && (mood === 'idle' || mood === 'happy') && sleep === 'awake' && !held && t > nextFidget) {
      const roll = Math.random()
      const pals = toys.filter((toy) => toy.backAt < 0 && toy.eatenAt < 0 && !toy.has('scary') && !toy.has('prickly'))
      const whim = Math.random()
      if ((site || mods.weather || mods.gravity) && whim < 0.35) moodBeat()
      else if (pals.length && whim < 0.7 && !errand && !keepy) {
        // Play with something: whatever this item allows, short of eating it or putting it away.
        const toy = pals[Math.floor(Math.random() * pals.length)]
        const options = actionsFor(toy.spec).filter((a) => a !== 'remove' && a !== 'eat' && a !== 'nap' && !(a === 'wear' && toy.worn))
        play(options[Math.floor(Math.random() * options.length)], toy)
      } else if (roll < 0.2) jump(0, 3.4, 0)
      else if (roll < 0.42) {
        lim.attach(headTopRest, tmp)
        lim.impulse(tmp, [(Math.random() < 0.5 ? -1 : 1) * 2.2, 0, 0], 1.1)
      } else if (roll < 0.56) squash.v += 4
      else if (roll < 0.68) tuft.flick((Math.random() - 0.5) * 7, 3, 0)
      else if (roll < 0.8) {
        // Notice a toy.
        const toy = toys[Math.floor(Math.random() * toys.length)]
        if (!toy) return
        wander.x = THREE.MathUtils.clamp((toy.jelly.center[0] - lim.center[0]) / 1.4, -1, 1)
        wander.y = -0.55
        wander.until = t + 1.6
      } else if (roll < 0.9) {
        winkUntil = t + 0.32
        squash.v += 1.5
      } else {
        wander.x = (Math.random() - 0.5) * 1.6
        wander.y = (Math.random() - 0.3) * 1.2
        wander.until = t + 1.4
      }
      nextFidget = t + 2.5 + Math.random() * 3
    }

    // Ignored for a while: a yawn, then a nap.
    if (sleep === 'awake' && mood === 'idle' && !busy && !popped && !held && t - lastActive > (night || site?.mood === 'cozy' ? 24 : 50)) nod('sleepy')
    if (sleep !== 'awake' && (mood !== 'idle' || grabbed)) active(grabbed)
    if (sleep === 'asleep' && t > nextZ) {
      emote('z')
      sound.snore()
      nextZ = t + 2.4
    }

    if (t > nextBlink) {
      blinkUntil = t + 0.12
      nextBlink = t + (Math.random() < 0.2 ? 0.26 : 2.2 + Math.random() * 3.4)
    }

    // Shaken about → dizzy.
    // Every hard change of direction in hand counts toward getting dizzy.
    const dir = Math.abs(vbar[0]) > 2.2 ? Math.sign(vbar[0]) : 0
    if (grabbed && dir && dir === -shakeDir) shaken += 0.42
    if (dir) shakeDir = dir
    shaken = Math.max(0, shaken - dt * 0.35)
    // Material: gooey in a gentle hand (pulls out like taffy), firm when shaken
    // hard or mid-stunt, where a soft body would smear.
    const goo = grabbed ? Math.max(0, 1 - shaken / 0.45) : 0
    const firm = flip || spin ? 1 : 0
    // The grabbed patch can't turn with the body, so in hand Lim is held
    // facing you: no folding round the grip, and the face stays in view.
    if (!flip && !spin) lim.upright = grabbed ? 0.6 : UPRIGHT
    lim.beta = flip ? 0.04 : LIM_BETA + (0.44 - LIM_BETA) * goo
    lim.stiffness = LIM_STIFF + (0.095 - LIM_STIFF) * goo + (0.3 - LIM_STIFF) * firm
    if (shaken > 1.6 && !grabbed) dizzy()
    prevV[0] = vbar[0]
    prevV[1] = vbar[1]
    prevV[2] = vbar[2]
    if (t < dizzyUntil) {
      if (t > nextOrbit) {
        lim.attach(headTopRest, tmp)
        const a = t * 5
        const s = stars.spawn('#FFD25E', 0.5, 0.085)
        s.p.set(tmp[0] + Math.cos(a) * 0.62, tmp[1] + 0.12 + Math.sin(a * 2) * 0.04, tmp[2] + Math.sin(a) * 0.3 + 0.2)
        s.v.set(0, 0.2, 0)
        s.spin = 5
        nextOrbit = t + 0.085
      }
      if (resting) lim.impulse([lim.center[0], lim.center[1] + 0.8, lim.center[2]], [Math.sin(t * 3.1) * 14 * dt, 0, 0], 1.2)
    }

    // Dancing: a hop on every beat, leaning into alternate sides.
    if (dance) {
      const step = Math.floor((t - dance.t0) / 0.25)
      if (step !== dance.step) {
        dance.step = step
        sound.beat(step)
        if (step % 2 === 0) {
          const side = (step / 2) % 2 ? 1 : -1
          dance.lean = side * 0.2
          if (lim.contacts > 0) lim.kick(side * 0.7, 2.9, 0)
          squash.v += 2.6
          tuft.flick(-side * 4, 0, 0)
          toys.forEach((toy, i) => {
            if (toy.backAt >= 0 || toy.eatenAt >= 0 || toy.worn || (i + step / 2) % 2) return
            wakeToy(toy)
            toy.jelly.kick(0, 3.4, 0)
            toy.jelly.spin(0, 0, side * 1.6)
          })
        }
        if (step % 16 === 12) startSpin(1, 0.4)
        if (step % 8 === 0) burst(12, 0.8)
      }
      if (t > dance.until) dance = null
    }
    u.disco.value = ease(u.disco.value, dance ? 1 : 0, 6, dt)

    // Landing: squash proportional to the impact, dust, a ripple, a thump.
    const airborne = lim.contacts === 0
    if (wasAirborne && !airborne && lastVy < -2.5) {
      const impact = -lastVy
      squash.v += Math.min(6.5, impact * 0.62)
      tuft.flick(0, -impact * 0.7, 0)
      if (impact > 4.5) {
        puff(lim.center[0], lim.center[2], Math.min(12, Math.round(impact)), Math.min(1.6, impact / 7))
        ripple(lim.center[0], lim.center[2], 2.6 + impact * 0.16)
        shock(lim.center[0], lim.center[2], impact * 0.42)
        shake += Math.min(0.06, impact * 0.0045)
        sound.thud(impact / 11)
      }
    }
    lift = ease(lift, airborne || flip ? 1 : 0, airborne || flip ? 14 : 40, dt)
    wasAirborne = airborne
    lastVy = vbar[1]

    // Squash & stretch: sprung, and stretched along the fall while airborne.
    const droop = mood === 'sad' ? FACES.sad.droop : sleep === 'asleep' ? 0.07 : 0
    const hang = grabbed && airborne ? -0.17 : 0
    const stretch = hang || airborne && !grabbed && !flip ? hang - Math.min(0.2, Math.abs(vbar[1]) * 0.022 + speed * 0.006) : 0
    squash.v += (-150 * (squash.x - droop - stretch) - 10 * squash.v) * dt
    // In the air the squash is capped lower: a wide airborne pancake pinches at the sides.
    squash.x = THREE.MathUtils.clamp(squash.x + squash.v * dt, -0.34, airborne ? 0.24 : 0.4)
    // A cartwheel turns as one clean shape: no squash riding through it.
    if (flip && t > flip.t0) {
      squash.x *= Math.exp(-14 * dt)
      squash.v *= Math.exp(-14 * dt)
    }
    entryVel += (-120 * (entryScale - 1) - 7 * entryVel) * dt
    entryScale += entryVel * dt
    if (size.until && t > size.until) {
      size.target = 1
      size.until = 0
    }
    // Tucks in for a cartwheel, so the turn clears the floor.
    const sizeGoal = size.target * (1 + inflate + Math.min(3, full) * 0.045) * (flip && t > flip.t0 - 0.05 ? 0.84 : 1)
    size.v += (-90 * (size.x - sizeGoal) - 9 * size.v) * dt
    size.x += size.v * dt
    sound.setVoice(1 / Math.max(0.5, size.x) ** 1.4)
    const breathe = sleep === 'asleep' ? Math.sin(t * 1.8) * 0.045 : Math.sin(t * 2.1) * (mood === 'thinking' ? 0.03 : 0.024)
    lim.scale = entryScale * size.x * (1 + breathe) * (mood === 'sad' ? 0.975 : 1)
    info.get(lim)!.r = lim.scale
    lim.squash[0] = 1 + squash.x * 0.55
    lim.squash[2] = 1 + squash.x * 0.55
    lim.squash[1] = 1 - squash.x
  }

  const minisBrain = () => {
    if (!popped || !minis) return
    const age = t - popped.t0
    const gather = age > 2.6
    let far = 0
    for (const m of minis) {
      far = Math.max(far, Math.abs(m.jelly.center[0]))
      if (m.jelly.contacts === 0 || t < m.nextHop) continue
      if (gather && m === minis[0] && age < 3.5) continue
      const toCentre = -m.jelly.center[0]
      const vx = gather ? THREE.MathUtils.clamp(toCentre * 2.2, -3.2, 3.2) : (Math.random() - 0.5) * 5
      m.jelly.kick(vx, 3 + Math.random() * 1.8, gather ? -m.jelly.center[2] * 2 : (Math.random() - 0.5) * 1.5)
      m.nextHop = t + 0.34 + Math.random() * 0.3
      if (Math.random() < 0.25) sound.squeak()
    }
    if (gather && !popped.merging && (far < 0.75 || age > 6)) {
      popped.merging = true
      for (const m of minis) m.jelly.kick(-m.jelly.center[0] * 3, 5, 0)
      // They dive into the middle and the big body bursts out of the pile.
      later(0.14, () => {
        burst(30, 0.9)
        merge()
      })
    }
  }

  const collide = () => {
    for (let a = 0; a < bodies.length; a++) {
      for (let b = a + 1; b < bodies.length; b++) {
        const A = bodies[a]
        const B = bodies[b]
        const ia = info.get(A)!
        const ib = info.get(B)!
        if (ia.toy?.asleep && ib.toy?.asleep) continue
        // Lim is a gumdrop, widest at the base: its collision ball sits low
        // and wide so toys are pushed clear of the skirt, not just the middle.
        const low = A === lim ? 0.26 * lim.scale : 0
        const dx = B.center[0] - A.center[0]
        const dy = B.center[1] - (A.center[1] - low)
        // Depth counts for less against Lim, so a toy is pushed out to the side
        // of the silhouette instead of sitting in front of it.
        const dz = (B.center[2] - A.center[2]) * (A === lim ? 0.35 : 1)
        const dist = Math.hypot(dx, dy, dz)
        const min = ia.r * (A === lim ? 1.16 : 1) + ib.r
        if (dist >= min || dist < 1e-4) continue
        // Lim opens wide for a bean in hand; don't shove it away from the mouth.
        if ((A === lim && ib.toy === held) || (B === lim && ia.toy === held)) continue
        // Nor the ball mid keepy-uppy: the header does that job.
        if (keepy && A === lim && ib.toy === keepy.toy) continue
        if (ia.toy) wakeToy(ia.toy)
        if (ib.toy) wakeToy(ib.toy)
        const nx = dx / dist
        const ny = dy / dist
        const nz = dz / dist
        const wa = ib.m / (ia.m + ib.m)
        const wb = ia.m / (ia.m + ib.m)
        const pen = min - dist
        A.translate(-nx * pen * wa, -ny * pen * wa, -nz * pen * wa)
        B.translate(nx * pen * wb, ny * pen * wb, nz * pen * wb)
        // Nothing gets pressed through the floor (a sleeping toy has no sim to push it back up).
        for (const body of [A, B]) {
          const ground = body.floor ?? 0
          let low = ground
          for (let i = 1; i < body.x.length; i += 3) if (body.x[i] < low) low = body.x[i]
          if (low < ground) body.translate(0, ground - low, 0)
        }
        A.velocity(tmp)
        B.velocity(tmp2)
        const rel = (tmp2[0] - tmp[0]) * nx + (tmp2[1] - tmp[1]) * ny + (tmp2[2] - tmp[2]) * nz
        if (rel >= 0) continue
        const j = -1.5 * rel
        A.kick(-nx * j * wa, -ny * j * wa, -nz * j * wa)
        B.kick(nx * j * wb, ny * j * wb, nz * j * wb)
        // Something small hitting Lim leaves a dent that rings, not a shove.
        if (A === lim && ib.toy?.has('prickly') && j > 1 && t - lastOuch > 1.4 && !grabbed) ouch(ib.toy)
        if (A === lim && j > 2) {
          const cx = A.center[0] + nx * ia.r
          const cy = A.center[1] - low + ny * ia.r
          const cz = A.center[2] + nz * ia.r
          lim.impulse([cx, cy, cz], [-nx * j * 0.9, -ny * j * 0.9, -nz * j * 0.9], 0.9)
          if (j > 7 && t - lastBonk > 0.3 && !grabbed) {
            lastBonk = t
            setAct('hit', 0.38)
            sparkle(cx, cy, cz + 0.3, 5)
            sound.bonk(Math.min(1, j / 14))
          }
        }
      }
    }
  }

  /** Stage walls and ceiling. Returns the hardest wall hit this frame. */
  const walls = (body: Jelly) => {
    // Bodies meet the stage edges whole: the body is moved back inside and its
    // motion reflected, so nothing is ever sliced flat by an invisible plane.
    const X = reach - (body === lim ? 0.06 : 0.4)
    const XR = X
    const { x } = body
    let minX = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (let i = 0; i < x.length; i += 3) {
      if (x[i] < minX) minX = x[i]
      if (x[i] > maxX) maxX = x[i]
      if (x[i + 1] > maxY) maxY = x[i + 1]
      if (x[i + 2] < minZ) minZ = x[i + 2]
      if (x[i + 2] > maxZ) maxZ = x[i + 2]
    }
    // A body wider than the stage (big Lim on a phone) just centres.
    const dx = maxX - minX > X + XR ? -(minX + maxX) / 2 + (XR - X) / 2 : minX < -X ? -X - minX : maxX > XR ? XR - maxX : 0
    // Lim's ceiling is lower: the tuft needs the headroom.
    const top = body === lim ? topY - 0.62 : topY
    const dy = maxY > top ? top - maxY : 0
    // Depth is a shallow lane, measured at the body's middle (a body is deeper than the lane).
    const cz = (minZ + maxZ) / 2
    const dz = cz < -0.6 ? -0.6 - cz : cz > 0.55 ? 0.55 - cz : 0
    if (!dx && !dy && !dz) return 0
    body.translate(dx, dy, dz)
    body.velocity(tmp2)
    let hit = 0
    if (dx && tmp2[0] * dx < 0) {
      hit = Math.abs(tmp2[0])
      body.kick(-1.5 * tmp2[0], 0, 0)
      // The near side takes the knock, so the body rings instead of just turning round.
      body.impulse([dx > 0 ? minX : maxX, body.center[1], body.center[2]], [Math.sign(dx) * hit * 0.5, 0, 0], body.radius * 1.2)
    }
    if (dy && tmp2[1] > 0) body.kick(0, -1.3 * tmp2[1], 0)
    if (dz && tmp2[2] * dz < 0) body.kick(0, 0, -1.45 * tmp2[2])
    return hit
  }

  /** A bean held close enough to the open mouth gets snatched out of your hand. */
  const snatch = () => {
    if (!held || !held.has('edible') || popped || sleep !== 'awake' || grabbed) return
    const d = Math.hypot(held.jelly.center[0] - mouthAt[0], held.jelly.center[1] - mouthAt[1])
    if (d > 0.8) {
      nearSince = d < 1.7 ? nearSince : t
      return
    }
    // Give the "aah" a beat to open before the bite.
    if (t - nearSince < 0.16) return
    const toy = held
    snatched = true
    pointer.release()
    snatched = false
    held = null
    squash.v -= 1.6
    eat(toy)
  }

  const stepToys = (dt: number) => {
    for (const toy of toys) {
      if (toy.backAt >= 0) {
        if (t > toy.backAt && !popped) returnToy(toy)
        continue
      }
      if (toy.eatenAt >= 0) toy.jelly.scale = Math.max(0.05, 1 - (t - toy.eatenAt) / 0.24)
      if (toy.worn && toy.jelly.anchor) {
        // Worn things are sprung to their spot on Lim, so they wobble along.
        lim.attach(toy.worn === 'hat' ? [0, 0.84 + toy.half[1], 0.02] : [0, anchors.eyeY + 0.01, eyeL.p[2] + 0.2], toy.jelly.anchor.target)
        for (let k = 0; k < 4; k++) toy.jelly.uprightTarget[k] = lim.rotation[k]
      }
      if (toy.has('glowing') && t > toy.nextFx && !reducedMotion) {
        toy.nextFx = t + 1.1 + Math.random() * 1.4
        sparkle(toy.jelly.center[0], toy.jelly.center[1] + toy.r * 0.6, toy.jelly.center[2] + 0.2, 2, 0.35)
      }
      // Floaty things hover at head height instead of escaping to the ceiling.
      if (toy.has('floaty') && !toy.worn && toy.eatenAt < 0 && toy !== held) {
        toy.jelly.gravity[1] = THREE.MathUtils.clamp((1.35 + toy.r - toy.jelly.center[1]) * 7, -4, 4) + Math.sin(t * 1.3 + toy.r * 40) * 0.5
        toy.asleep = false
      }
      if (toy.asleep) continue
      toy.jelly.step(dt)
      toy.jelly.velocity(tmp)
      // Bouncy things give back most of a fall.
      if (toy.has('bouncy') && toy.jelly.contacts > 0 && toy.lastVy < -2.2 && toy !== held && !toy.worn) {
        toy.jelly.kick(0, -toy.lastVy * 0.72, 0)
        tmp[1] = -toy.lastVy * 0.72
      }
      toy.lastVy = toy.jelly.contacts > 0 ? 0 : tmp[1]
      const calm = toy.jelly.contacts > 0 && Math.hypot(tmp[0], tmp[1], tmp[2]) < 0.06 && toy !== held && toy.eatenAt < 0 && !toy.worn
      toy.still = calm ? toy.still + dt : 0
      if (toy.still > 0.7) toy.asleep = true
    }
  }

  const faceName = (): FaceName => {
    if (grabbed) {
      // Carried: surprise, then a worried look at the drop, then up at whoever has hold.
      const k = (t - grabbedAt) % 3.6
      return k < 1.1 ? 'grabbed' : k < 2.4 ? 'worried' : 'ooh'
    }
    if (act && t < act.until) return act.face
    if (held && held.has('edible') && sleep === 'awake') {
      const d = Math.hypot(held.jelly.center[0] - mouthAt[0], held.jelly.center[1] - mouthAt[1])
      if (d < 1.7) return 'aah'
    }
    if (t < pokedUntil) return 'poked'
    if (t < happyUntil) return 'happy'
    if (sleep === 'asleep') return 'asleep'
    if (lim.contacts === 0 && Math.hypot(vbar[0], vbar[1]) > 6) return 'whee'
    if (mood === 'idle' && night && t - lastActive > 9) return 'sleepy'
    return mood
  }

  const updateFace = (dt: number) => {
    const target = FACES[faceName()]
    for (const k of FACE_KEYS) f[k] = ease(f[k], target[k], FACE_RATE[k], dt)
    for (let i = 0; i < 2; i++) {
      f.browL[i] = ease(f.browL[i], target.browL[i], 10, dt)
      f.browR[i] = ease(f.browR[i], target.browR[i], 10, dt)
    }
    talkOpen = ease(talkOpen, 0, 16, dt)
    talkO = ease(talkO, 0, 12, dt)
    const blinking = !reducedMotion && t < blinkUntil
    f.blink = ease(f.blink, blinking ? 1 : 0, blinking ? 70 : 20, dt)

    const talking = mood === 'talking'
    // Chewing: the closed mouth works side to side.
    u.mouthW.value = f.w * (t < chewUntil ? 1 + Math.sin(t * 24) * 0.16 : 1)
    u.mouthCurve.value = f.curve + (t < dizzyUntil ? Math.sin(t * 9) * 1.4 : 0)
    u.mouthOpen.value = f.open + (talking ? talkOpen : 0)
    u.mouthO.value = Math.min(1, f.o + (talking ? talkO : 0))
    u.mouthX.value = ease(
      u.mouthX.value,
      t < chewUntil ? chewSide * 0.15 : mood === 'thinking' && !act ? thinkSide * 0.065 : 0,
      18,
      dt,
    )
    u.blush.value = f.blush
    u.brow.value = f.brow
    u.browL.value.set(f.browL[0], f.browL[1])
    u.browR.value.set(f.browR[0], f.browR[1])
    u.sad.value = f.sad

    // Gaze: whatever is most interesting right now. A bean in hand beats the
    // pointer; thinking looks up and away; sadness looks at the floor.
    lim.attach(eyeRests[0], tmp)
    lim.attach(eyeRests[1], tmp2)
    eyeMid[0] = (tmp[0] + tmp2[0]) / 2
    eyeMid[1] = (tmp[1] + tmp2[1]) / 2
    eyeMid[2] = (tmp[2] + tmp2[2]) / 2
    const eyeGap = Math.hypot(tmp[0] - tmp2[0], tmp[1] - tmp2[1], tmp[2] - tmp2[2])
    const toward = (x: number, y: number, reach: number): [number, number] => {
      const dx = (x - eyeMid[0]) / reach
      const dy = (y - eyeMid[1]) / reach
      const l = Math.max(1, Math.hypot(dx, dy))
      return [dx / l, dy / l]
    }
    let gx = 0
    let gy = 0
    if (sleep === 'asleep' || t < dizzyUntil) {
      gy = -0.2
    } else if (grabbed && (t - grabbedAt) % 3.6 > 1.1 && (t - grabbedAt) % 3.6 < 2.4) {
      // A long way down.
      gx = Math.sin(t * 2.3) * 0.25
      gy = -0.5
    } else if (t < chewUntil) {
      gx = chewSide * 0.7
      gy = -0.35
    } else if (held) {
      ;[gx, gy] = toward(held.jelly.center[0], held.jelly.center[1], 1.1)
    } else if (mood === 'thinking') {
      // A 2.4 s loop: stare up-left, then a quick dart up-right and back.
      const k = (t % 2.4) / 2.4
      gx = k < 0.62 ? -0.6 + Math.sin(t * 0.9) * 0.08 : 0.55
      gy = k < 0.62 ? 0.62 : 0.5
    } else if (mood === 'sad') {
      gy = -0.75
    } else if (call && t < call.until - 4.6) {
      ;[gx, gy] = toward(call.x, 0, 1.4)
    } else if (mood === 'talking' && t - look.at > 0.6) {
      gx = Math.sin(t * 1.3) * 0.08
    } else if (t - look.at < (mood === 'typing' ? 6 : 2.5)) {
      const [ex, ey] = toHost(eyeMid)
      const dx = (look.clientX - hostRect.left - ex) / (unit * 3)
      const dy = -(look.clientY - hostRect.top - ey) / (unit * 3)
      const l = Math.max(1, Math.hypot(dx, dy))
      gx = dx / l
      gy = dy / l
    } else if (t < wander.until) {
      gx = wander.x
      gy = wander.y
    }
    // Eyes never hold perfectly still: tiny darts between fixations.
    if (t > nextSaccade) {
      jitter.x = (Math.random() - 0.5) * 0.09
      jitter.y = (Math.random() - 0.5) * 0.06
      nextSaccade = t + 0.5 + Math.random() * 1.6
    }
    look.x = ease(look.x, gx + jitter.x, 16, dt)
    look.y = ease(look.y, gy + jitter.y, 16, dt)

    // Head turn + lean follow the gaze (the eyes lead, the body follows);
    // typing leans right in. Flips and spins ride on top.
    const leanAmt = mood === 'typing' || held ? 1 : 0.4
    lean.yaw = ease(lean.yaw, THREE.MathUtils.clamp(look.x, -1, 1) * 0.28 * leanAmt, 5, dt)
    lean.pitch = ease(lean.pitch, -THREE.MathUtils.clamp(look.y, -1, 1) * 0.1 * leanAmt, 5, dt)
    const sway =
      sleep === 'asleep' ? Math.sin(t * 0.58) * 0.05
      : t < dizzyUntil ? Math.sin(t * 3.1) * 0.16
      : mood === 'thinking' ? thinkSide * 0.1
      : 0
    lean.roll = ease(lean.roll, -lean.yaw * 0.3 + (dance?.lean ?? 0) + sway + (t < chewUntil ? -chewSide * 0.07 : 0) + (t < hugUntil ? hugSide * 0.2 : 0), dance ? 14 : 5, dt)
    // Flips and pirouettes are rigid turns of the whole body (so nothing
    // twists or creases), with the upright target turning in step. The flip
    // is an aerial cartwheel: Lim's face stays toward you all the way round.
    let flipAngle = 0
    if (flip) {
      const k = (t - flip.t0) / flip.dur
      flipAngle = -Math.PI * 2 * smooth(k)
      if (k >= 0) lim.rotate(0, 0, 1, flipAngle - flip.at)
      flip.at = k >= 0 ? flipAngle : 0
      lim.upright = k >= 0 ? 0.3 : UPRIGHT
      if (k >= 1) {
        flip = null
        lim.upright = UPRIGHT
      }
    }
    let spinAngle = 0
    if (spin) {
      const k = (t - spin.t0) / spin.dur
      spinAngle = Math.PI * 2 * spin.turns * smooth(k)
      lim.rotate(0, 1, 0, spinAngle - spin.at)
      spin.at = spinAngle
      lim.upright = 0.3
      if (k >= 1) {
        spin = null
        lim.upright = UPRIGHT
      }
    }
    euler.set(lean.pitch, lean.yaw + spinAngle, lean.roll + flipAngle)
    quat.setFromEuler(euler)
    lim.uprightTarget[0] = quat.x
    lim.uprightTarget[1] = quat.y
    lim.uprightTarget[2] = quat.z
    lim.uprightTarget[3] = quat.w

    // Eyes ride the goal shape; their scale follows the local stretch.
    const sxEye = eyeGap / restEyeGap
    lim.attach(headTopRest, tmp)
    lim.attach(baseRest, tmp2)
    const syEye = Math.hypot(tmp[0] - tmp2[0], tmp[1] - tmp2[1], tmp[2] - tmp2[2]) / restHeight
    lim.attach(mouthRest, mouthAt)
    quat.set(...lim.rotation)
    // Eyes counter-turn most of the way back toward the camera as the head
    // yaws or pitches (as eyes do), so the iris never slides off round the
    // side and leaves a blank white; they still roll with the body.
    proj.set(0, 0, 1).applyQuaternion(quat)
    eyeQuat.setFromUnitVectors(proj, CAM_DIR)
    eyeQuat.slerp(NO_TURN, 0.3).multiply(quat)
    const open = 1 - f.blink
    eyes.forEach((eye, i) => {
      lim.attach(eyeRests[i], tmp)
      eye.position.set(tmp[0], tmp[1], tmp[2])
      eye.quaternion.copy(eyeQuat)
      // An eye turning away from the camera tucks into the body instead of
      // hanging off the silhouette.
      proj.set(...eyeNormals[i]).applyQuaternion(quat)
      const facing = smooth((proj.y * Math.sin(PITCH) + proj.z * Math.cos(PITCH) - 0.45) / 0.3)
      eye.scale.set(EYE_R * sxEye * facing, EYE_R * syEye * facing, EYE_R * 0.72 * facing)
      const e = eyeMats[i].u
      const wink = i === 1 && t < winkUntil ? 0 : 1
      e.look.value.set(look.x * 0.3, look.y * 0.27 + (mood === 'sad' ? -0.04 : 0))
      e.pupil.value = f.pupil
      e.lidTop.value = f.lidTop * open * wink
      e.lidBot.value = f.lidBot * open * wink
      e.seam.value = f.seam
      e.smile.value = wink ? f.smile : 1
      e.tilt.value = f.tilt
      e.heart.value = f.heart
      e.dizzy.value = f.dizzy
      // A shut eye is a lid and a lash line: the ink ring tucks away behind it.
      rims[i].scale.setScalar(1.13 - 0.2 * (1 - smooth(e.lidTop.value * 4)))
    })
    // The tuft shows the mood: wilts when sad or asleep, stands up when startled.
    const name = faceName()
    const bend =
      sleep === 'asleep' || mood === 'sad' ? 0.62
      : grabbed || name === 'shock' || name === 'whee' || name === 'worried' || name === 'ooh' ? -0.42
      : mood === 'typing' ? -0.3
      : 0
    // Thinking: it curls over and straightens again, like twirling a pencil.
    tuft.bend = ease(tuft.bend, mood === 'thinking' && !grabbed ? -0.35 + 0.25 * Math.sin(t * 2.6 + 1) : bend, 7, dt)

    const blown = sleep === 'asleep' && !popped ? 0.1 + 0.17 * (0.5 - 0.5 * Math.cos(t * 1.8 - 0.6)) : 0
    bubbleSize = ease(bubbleSize, blown, blown ? 5 : 30, dt)
    bubble.visible = bubbleSize > 0.01
    if (bubble.visible) {
      lim.attach(noseRest, tmp)
      bubble.position.set(tmp[0] + bubbleSize * 0.75, tmp[1] + bubbleSize * 0.1, tmp[2] + bubbleSize * 0.8)
      bubble.scale.setScalar(bubbleSize)
    }
    halo.position.set(lim.center[0], lim.center[1], lim.center[2] - 0.8)
    halo.quaternion.copy(camera.quaternion)
  }

  const updateMinis = () => {
    if (!popped || !minis) return
    for (const m of minis) {
      skinJelly(m.geo, m.jelly, 0.05, 0)
      syncJellyGeometry(m.geo)
      updateShadow(m.shadow, m.jelly, 3.1 * MINI, 0.36)
      quat.set(...m.jelly.rotation)
      m.eyes.forEach((eye, i) => {
        m.jelly.attach(eyeRests[i], tmp)
        eye.position.set(tmp[0], tmp[1], tmp[2])
        eye.quaternion.copy(quat)
        eye.scale.set(EYE_R * MINI, EYE_R * MINI, EYE_R * MINI * 0.72)
      })
    }
  }

  const updateShadow = (s: Shadow, body: Jelly, size: number, base: number) => {
    let minY = Infinity
    for (let i = 1; i < body.x.length; i += 3) minY = Math.min(minY, body.x[i])
    const lift = Math.max(0, minY)
    // The key light sits up and to the left, so the shadow slides right as the body rises.
    s.mesh.position.x = body.center[0] + lift * 0.16
    s.mesh.position.z = body.center[2]
    const k = 1 + lift * 0.35
    s.mesh.scale.set(size * k, size * 0.62 * k, 1)
    s.strength.value = base / (1 + lift * 1.6)
  }

  const updateCamera = (dt: number) => {
    if (reducedMotion) return
    // A little parallax toward the pointer, and a shake on heavy landings.
    const fresh = t - look.at < 3
    const px = fresh ? THREE.MathUtils.clamp(((look.clientX - hostRect.left) / w) * 2 - 1, -1.6, 1.6) : 0
    const py = fresh ? THREE.MathUtils.clamp(((look.clientY - hostRect.top) / h) * 2 - 1, -1.2, 1.2) : 0
    par.x = ease(par.x, px, 2.2, dt)
    par.y = ease(par.y, py, 2.2, dt)
    shake *= Math.exp(-9 * dt)
    camera.position.set(
      camBase.x + par.x * 0.22 + Math.sin(t * 67) * shake,
      camBase.y - par.y * 0.1 + Math.cos(t * 53) * shake,
      camBase.z,
    )
    camera.lookAt(shiftX + par.x * 0.05, camTargetY, 0)
  }

  // The gumdrop's flat base belongs to the floor: off the ground it rounds out
  // (and flattens again on contact), so an airborne Lim is a droplet, not a
  // dome with its bottom sliced off.
  const limRestAttr = limGeo.attributes.rest.array as Float32Array
  let lift = 0
  const down = new THREE.Vector3()
  const roundBase = () => {
    if (lift < 0.01) return
    const out = limGeo.attributes.position.array as Float32Array
    down.set(0, -1, 0).applyQuaternion(quat.set(...lim.rotation))
    const amt = lift * 0.42 * lim.scale
    for (let i = 0; i < out.length; i += 3) {
      const y = limRestAttr[i + 1]
      if (y > -0.35) continue
      const r2 = (limRestAttr[i] * limRestAttr[i] + limRestAttr[i + 2] * limRestAttr[i + 2]) / 1.3
      const k = amt * Math.min(1, (-0.35 - y) / 0.4) * Math.max(0, 1 - r2)
      out[i] += down.x * k
      out[i + 1] = Math.max(0, out[i + 1] + down.y * k)
      out[i + 2] += down.z * k
    }
  }

  // Chewing: the cheek on the chewing side bulges out, alternating with each chew.
  const puffCheek = () => {
    const amt = Math.max(0, cheeks.x) * 0.5
    if (amt < 0.004) return
    const out = limGeo.attributes.position.array as Float32Array
    down.set(chewSide, 0, 0).applyQuaternion(quat.set(...lim.rotation))
    for (let i = 0; i < out.length; i += 3) {
      const x = limRestAttr[i] * chewSide
      const y = limRestAttr[i + 1]
      const z = limRestAttr[i + 2]
      if (x < 0.3 || z < -0.5) continue
      // A soft bump on the side of the face, out at the silhouette.
      const d2 = ((x - 0.95) / 0.8) ** 2 + ((y + 0.12) / 0.62) ** 2
      if (d2 >= 1) continue
      const k = amt * (1 - d2) ** 2
      out[i] += down.x * k
      out[i + 1] += down.y * k
      out[i + 2] += down.z * k
    }
  }

  let first = true
  let anchorKey = ''
  const frame = (dt: number) => {
    if (dt > 0) {
      t += dt
      u.time.value = t
      pu.time.value = t
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].at <= t) queue.splice(i, 1)[0].fn()
      }
      if (popped) {
        minisBrain()
        for (const m of minis!) m.jelly.step(dt)
      } else {
        pastimes()
        brain(dt)
        lim.step(dt)
      }
      snatch()
      stepToys(dt)
      collide()
      for (const body of bodies) {
        const hit = walls(body)
        if (body === lim && hit > 7 && t - lastBonk > 0.35) {
          lastBonk = t
          const side = Math.sign(lim.center[0])
          sparkle(side * (reach - 0.2), lim.center[1] + 0.3, lim.center[2] + 0.6, 7)
          setAct('hit', 0.45)
          shake += 0.04
          shaken += 0.75
          sound.bonk(Math.min(1, hit / 16))
          if (shaken > 1.6 && !grabbed) dizzy()
        }
      }
      for (const r of ripples) {
        if (!r.mesh.visible) continue
        r.k.value = Math.min(1, r.k.value + dt * r.speed)
        const s = r.size * (0.25 + 0.75 * (1 - (1 - r.k.value) ** 3))
        r.mesh.scale.set(s, s * 0.62, 1)
        if (r.k.value >= 1) r.mesh.visible = false
      }
      updateCamera(dt)
    }
    easePlace(pu, site, dt > 0 ? 1 - Math.exp(-3.5 * dt) : 1)
    updateFace(dt)
    tuft.scale = topY < 3 ? 0.62 : 1
    tuft.slack = flip || spin ? 0.3 : 1
    tuft.step(dt, (rest, out) => lim.attach(rest, out))
    for (const p of pools) p.step(dt, t, camera)
    if (!popped) {
      // Lim is drawn as a smooth skin over the particles: all of the squash,
      // stretch and tumble, a soft-limited share of the ripples, never a crease.
      skinJelly(limGeo, lim, flip ? 0.02 : 0.052 - 0.03 * Math.min(1, shaken), 0)
      puffCheek()
      roundBase()
      syncJellyGeometry(limGeo)
      u.rot.value.setFromMatrix4(rotM4.makeRotationFromQuaternion(quat.set(...lim.rotation)))
      updateShadow(limShadow, lim, 3.4 * lim.scale, 0.62)
    }
    updateMinis()
    for (const toy of toys) {
      if (toy.asleep && !first) continue
      skinJelly(toy.geo, toy.jelly, 0.045, toy.jelly.floor)
      syncJellyGeometry(toy.geo)
      toy.extras.update(toy.jelly)
      toy.shadow.mesh.visible = !toy.worn && toy.mesh.visible
      updateShadow(toy.shadow, toy.jelly, 3.4 * toy.r * toy.jelly.scale, 0.24)
    }
    const hatOn = toys.some((toy) => toy.worn === 'hat')
    if (!popped) tuftMesh.visible = tuftHull.visible = !hatOn
    weather.step(dt, t, { w: reach, h: topY }, camera, 0)
    renderer.render(scene, camera)
    if (import.meta.env.DEV) (window as { __limFrame?: () => void }).__limFrame?.()
    if (opts.onAnchor) {
      lim.attach(headTopRest, tmp)
      const [ax, ay] = toHost(tmp)
      // Only touch the DOM when the anchor actually moved.
      const key = `${Math.round(ax * 2)}|${Math.round(ay * 2)}|${Math.round(unit)}`
      if (key !== anchorKey) {
        anchorKey = key
        opts.onAnchor(ax, ay, unit)
      }
    }
    if (first) {
      first = false
      opts.onFirstFrame?.()
    }
  }

  // Starter toys (or whatever was here last visit) drop in one after another.
  ;(opts.world?.items ?? [ITEMS.gumball.spec, ITEMS.bean.spec]).slice(0, MAX_ITEMS).forEach((spec, i) => {
    // Jelly beans grow back, so there is always something to feed Lim.
    addToy(spec, spec.name === 'jelly bean', reducedMotion ? 0 : 1.2 + i * 0.45)
  })
  for (const toy of toys) {
    skinJelly(toy.geo, toy.jelly, 0.045, 0)
    syncJellyGeometry(toy.geo)
    toy.extras.update(toy.jelly)
  }
  applyPlace()
  await renderer.compileAsync(scene, camera)
  stage.start(frame)
  if (!reducedMotion) {
    // Entrance: pop, hop, shake it off, then look at you.
    jump(0, 4.2, 0, 0.18)
    later(0.95, () => {
      for (let k = 0; k < 4; k++) later(k * 0.08, () => lim.kick(k % 2 ? -1.3 : 1.3, 0, 0))
      tuft.flick(5, 0, 0)
    })
    later(1.5, () => {
      blinkUntil = t + 0.12
      nextBlink = t + 0.3
    })
  }

  /** Reduced motion: the scene clock is frozen, so timed smiles end on wall-clock time. */
  const stillSmile = () => {
    happyUntil = t + 2.2
    stage.requestRender()
    clearTimeout(cheerTimer)
    cheerTimer = setTimeout(() => {
      happyUntil = 0
      stage.requestRender()
    }, 2200)
  }

  const api: LimScene = {
    setMood(next) {
      if (next === mood) return
      if (next === 'talking') talkCount = 0
      mood = next
      active()
      stage.requestRender()
    },
    setNight(next) {
      u.night.value = next || air().dark ? 1 : 0
      if (next !== night && !reducedMotion && t > 0.5) {
        active()
        if (next) {
          // Lights out: "ooh", look up at the dark, then get comfy.
          setAct('ooh', 1.1)
          wander.x = 0.2
          wander.y = 0.9
          wander.until = t + 1.1
          look.at = -10
        } else {
          // Lights on: too bright!
          setAct('squint', 0.9)
          squash.v += 3
        }
        sound.sparkle()
      }
      night = next
      stage.requestRender()
    },
    lookAt(clientX, clientY) {
      if (Math.abs(clientX - look.clientX) + Math.abs(clientY - look.clientY) > 2) active()
      look.clientX = clientX
      look.clientY = clientY
      look.at = t
    },
    hop() {
      if (reducedMotion || grabbed || popped) return
      active()
      jump(0, wide ? 6.6 : 5.2, 0)
    },
    talk() {
      if (reducedMotion || t - lastTalk < 0.065) return
      lastTalk = t
      // Babble: every chunk is a new mouth shape, and a syllable if sound is on.
      talkOpen = 0.07 + Math.random() * 0.1
      talkO = Math.random() < 0.35 ? 0.8 : 0
      sound.blip()
      if (++talkCount % 5 === 0) {
        squash.v -= 2.4
        lim.kick(0, 1.4, 0)
        tuft.flick((Math.random() - 0.5) * 3, 0, 0)
      }
    },
    cheer(withConfetti) {
      if (reducedMotion) return stillSmile()
      happyUntil = t + 2.2
      active()
      if (popped) return
      jump(0, wide ? 5.2 : 4.2, 0)
      for (const toy of toys) {
        if (toy.worn || toy.backAt >= 0) continue
        wakeToy(toy)
        toy.jelly.kick((Math.random() - 0.5) * 2, 4 + Math.random() * 2, 0)
      }
      if (withConfetti) {
        burst(64, 1)
        later(0.35, () => startSpin(1, 0.4))
        sound.chime()
      }
    },
    stunt(kind) {
      if (reducedMotion) return stillSmile()
      active()
      if (popped) return
      // No headroom for a cartwheel on a small stage: pirouette instead.
      if (kind === 'flip' && topY > 3.75) startFlip()
      else if (kind === 'spin' || kind === 'flip') {
        jump(0, 3.8, 0)
        later(0.12, () => startSpin(2, 0.72))
        setAct('whee', 1.2)
      } else if (kind === 'dance') startDance(8)
      else if (kind === 'party') {
        startDance(5)
        for (let k = 0; k < 5; k++) later(k * 0.5, () => rain(22))
        sound.chime()
        emote('party!')
      } else if (kind === 'pop') later(0.3, pop)
      else if (kind === 'jump') {
        jump(0, Math.min(9.2, Math.sqrt(2 * grav() * Math.max(0.2, topY - 3.35))), 0, 0.2)
        setAct('whee', 1.5)
        emote('whee!')
      } else if (kind === 'love') {
        setAct('love', 3.4)
        jump(0, 3.6, 0)
        for (let k = 0; k < 6; k++) later(0.2 + k * 0.35, () => love(3))
        sound.sparkle()
      } else if (kind === 'sleep') {
        // Naps through the reply (and talks in its sleep) until disturbed after.
        napUntil = t + 9
        nod('now')
      }
      else if (kind === 'big') {
        resize(1.3, 6)
        setAct('ooh', 1)
        emote('BIG.')
      } else if (kind === 'tiny') {
        resize(0.5, 6)
        setAct('shock', 0.8)
        emote('eep')
      } else if (kind === 'boo') {
        setAct('shock', 1.3)
        lim.kick(0, 3.6, -0.8)
        for (let k = 0; k < 8; k++) later(0.35 + k * 0.05, () => lim.kick(k % 2 ? -0.8 : 0.8, 0, 0))
        sound.squeak()
        emote('eek!')
      } else if (kind === 'wave') {
        jump(0, 3.8, 0)
        later(0.5, () => {
          winkUntil = t + 0.45
          squash.v += 2
        })
        emote('hi!')
      }
    },
    react(kind) {
      if (reducedMotion) return
      active()
      if (kind === 'key') {
        // A tiny nod per keystroke: Lim reads along.
        if (lim.contacts > 0 && !grabbed && t - lastKey > 0.09) squash.v += 0.55
        lastKey = t
      } else if (kind === 'shout') {
        if (popped) return
        setAct('shock', 0.9)
        if (t - lastShout < 1.5) return
        lastShout = t
        lim.kick(-0.4, 1.7, 0)
        emote('eep!')
        sound.squeak()
      } else if (kind === 'wink') {
        winkUntil = t + 0.45
        squash.v += 2
      }
    },
    addItem(spec, then) {
      // A bean that was eaten and is growing back just comes back now, rather than a second one piling up.
      const regrowing = toys.find((toy) => toy.spec.name === spec.name && toy.renew && toy.backAt >= 0 && toy.backAt !== Infinity)
      if (regrowing && !popped) {
        returnToy(regrowing)
        active(true)
        greet(regrowing, then)
        changed()
        return
      }
      // Room for one more: the oldest thing not being worn makes way.
      const live = toys.filter((toy) => toy.backAt < 0)
      // A narrow stage has two seats' worth of floor: fewer things before the oldest makes way.
      if (live.length >= (reach < 3 ? 4 : MAX_ITEMS)) removeToy(live.find((toy) => !toy.worn && toy !== held) ?? live[0], true)
      // With motion reduced nothing falls: it is simply there, on the floor.
      const toy = addToy(spec, spec.name === 'jelly bean', spec.traits.includes('floaty') ? 1.4 : reducedMotion ? 0 : topY + 0.5)
      active(true)
      greet(toy, then)
      // Still: no performance, but a hat still ends up on Lim's head.
      if (reducedMotion && (toy.has('hat') || toy.has('glasses'))) wear(toy)
      changed()
      stage.requestRender()
    },
    setPlace(spec) {
      if (JSON.stringify(spec) === JSON.stringify(site) && Object.keys(mods).length === 0) return
      site = spec
      // A new place brings its own air.
      mods = {}
      applyPlace()
      changed()
      stage.requestRender()
      if (reducedMotion) return
      active(true)
      // Look around at the new place, then feel it.
      setAct('ooh', 1.2)
      wander.x = 0.3
      wander.y = 0.9
      wander.until = t + 1.2
      look.at = -10
      squash.v += 3
      sound.whoosh()
      if (spec) later(1.4, moodBeat)
    },
    tweak(set) {
      mods = { ...mods, ...set }
      applyPlace()
      changed()
      stage.requestRender()
      if (reducedMotion) return
      active(true)
      setAct('ooh', 1)
      wander.x = 0
      wander.y = 0.9
      wander.until = t + 1
      look.at = -10
      later(1.1, moodBeat)
    },
    act(action, target) {
      const name = target.trim().toLowerCase()
      const live = toys.filter((toy) => toy.backAt < 0 && toy.eatenAt < 0)
      const found =
        !name || name === 'it' || name === 'that'
          ? live[live.length - 1]
          : (live.find((x) => x.spec.name === name) ?? live.find((x) => x.spec.name.includes(name) || name.includes(x.spec.name)))
      if (!found) return false
      // "Take it off" means the one Lim has on, if there are two alike.
      const toy = action === 'remove' && !found.worn ? (live.find((x) => x.worn && x.spec.name === found.spec.name) ?? found) : found
      if (reducedMotion) {
        // No performance, just the outcome (where there is one).
        if (action === 'remove' && toy.worn) {
          unwear(toy)
          seat(toy)
          place(toy.jelly, toy.geo, 1, toy.slot, toy.half[1] + 0.02, toy.depth)
        } else if (action === 'remove') removeToy(toy, false)
        else if (action === 'wear' && (toy.has('hat') || toy.has('glasses'))) wear(toy)
        else if (action === 'eat' && toy.has('edible')) {
          u.tint.value.set(toy.hex)
          u.tintLevel.value = 3
          u.tintAmt.value = 0.56
          if (toy.renew) {
            toy.backAt = Infinity
            toy.mesh.visible = toy.hull.visible = toy.shadow.mesh.visible = toy.extras.group.visible = false
            const b = bodies.indexOf(toy.jelly)
            if (b >= 0) bodies.splice(b, 1)
          } else removeToy(toy, false)
        }
        // Anything else is a performance Lim is not giving; the item is still there (the page says so).
        stage.requestRender()
        return true
      }
      play(action, toy)
      return true
    },
    clear(what) {
      if (what !== 'place') for (const toy of [...toys]) removeToy(toy, true)
      if (what !== 'items') api.setPlace(null)
      changed()
      stage.requestRender()
    },
    world: () => worldNow(),
    conjure(on, made = true) {
      if (reducedMotion || Boolean(conjuring) === on) return
      if (on) {
        conjuring = t || 0.001
        nextSpark = nextMutter = t + 0.3
        mutters = 0
        active(true)
        return
      }
      conjuring = 0
      if (!made) {
        // Nothing came of it: the ring fizzles out and Lim deflates a little.
        setAct('sad', 1.1)
        squash.v += 3
        emote('pfft…')
        return
      }
      // Done: the ring pops.
      lim.attach(headTopRest, tmp)
      sparkle(tmp[0], Math.min(topY - 0.5, tmp[1] + 0.95), 0.5, 10, 1)
      sound.sparkle()
    },
    dispose() {
      clearTimeout(cheerTimer)
      host.removeEventListener('pointerdown', onTap)
      pointer.dispose()
      stage.dispose()
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose()
          const m = o.material as THREE.Material | THREE.Material[]
          for (const mat of Array.isArray(m) ? m : [m]) mat.dispose()
        }
      })
      if (import.meta.env.DEV) delete (window as { __lim?: LimScene }).__lim
    },
  }
  // Dev handle for driving beats from the console.
  if (import.meta.env.DEV) (window as { __lim?: LimScene }).__lim = api
  return api
}

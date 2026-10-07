/**
 * BreathFlow's breath bloom: a shape-matching jelly (src/three/jelly.ts) that
 * inflates and deflates with the breath, painted as watercolour on cotton
 * paper. Everything is TSL:
 *
 *  - paper: wet-in-wet pigment blooms with cauliflower (fbm) edges and dark
 *    tide lines that spread on the inhale and recede on the exhale, granulated
 *    pigment specks that drift, and a drop bloom wherever you poke.
 *  - bloom: pigment pools and darkens at the silhouette, granulates on the
 *    rest-shape coordinate (so the texture doesn't swim as it deforms), shows
 *    backrun rims, keeps a paper-white highlight, and drifts between the
 *    technique's two pigments. It thins out as it inflates, like a wash
 *    spreading over more paper.
 *  - post: colour bleed (noise displacement + darkest-wins pickup), paper
 *    tooth, a soft vignette, and three-blocks film grain.
 *
 * Day paints subtractively (paper × pigment). Night paints luminous pigment
 * onto dark paper.
 */
import * as THREE from 'three/webgpu'
import {
  attribute,
  clamp,
  dot,
  float,
  length,
  max,
  min,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  normalView,
  normalize,
  pass,
  positionViewDirection,
  pow,
  screenUV,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import type { Node } from 'three/webgpu'
import { filmHD } from 'three-blocks/core-tsl-effects'
import { Jelly, icosphere } from '@/three/jelly'
import { jellyGeometry, syncJellyGeometry } from '@/three/jellyMesh'
import { bindJellyPointer, type JellyPointer } from '@/three/jellyPointer'
import { createStage, type Stage } from '@/three/stage'
import type { Pigment } from '../pigments'
import type { BreathSample } from './breathDrive'

type F = Node<'float'>
type V2 = Node<'vec2'>
type V3 = Node<'vec3'>

export type BloomMode = 'play' | 'calm'

export type BloomSceneOptions = {
  canvas: HTMLCanvasElement
  /** Sizes the canvas; the loop pauses while it is off screen. */
  host: HTMLElement
  /** The bloom sits at this element's centre, sized to fit inside it. */
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
  /** A gentle press at a client point (session touch). */
  poke(clientX: number, clientY: number): void
  requestRender(): void
  dispose(): void
}

const FOV = 30
const CAM_Z = 10
const DETAIL = 4
/** Inflation at amplitude 1. */
const BREATH_GAIN = 0.36
const PAPER_DAY = '#F7F1E6'
const PAPER_NIGHT = '#15161C'

/** Hex → linear RGB as a vec3 uniform value. */
function rgb(hex: string): THREE.Vector3 {
  const c = new THREE.Color(hex)
  return new THREE.Vector3(c.r, c.g, c.b)
}

export async function createBloomScene(opts: BloomSceneOptions): Promise<BloomScene> {
  const { canvas, host, reducedMotion } = opts
  const stage = await createStage({ canvas, host, reducedMotion, maxDpr: 1.5 })
  try {
    return await buildBloomScene(opts, stage)
  } catch (error) {
    stage.dispose()
    throw error
  }
}

async function buildBloomScene(opts: BloomSceneOptions, stage: Stage): Promise<BloomScene> {
  const { host, anchor, pointerHost, mode, reducedMotion, read, onFirstFrame } = opts
  const { renderer } = stage
  const T = stage.time as F

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100)
  camera.position.set(0, 0, CAM_Z)

  // ── Uniforms ─────────────────────────────────────────────────────
  const uMass = uniform(rgb(opts.pigment.mass))
  const uGlaze = uniform(rgb(opts.pigment.glaze))
  const uNight = uniform(opts.night ? 1 : 0)
  const uBreath = uniform(0.5)
  const uAspect = uniform(1)
  /** Bloom centre in screen UV (y down) and its rest radius in UV-height units. */
  const uCentre = uniform(new THREE.Vector2(0.5, 0.5))
  const uRadius = uniform(0.2)
  const uRestR = uniform(1)
  const uDrop = uniform(new THREE.Vector2(0.5, 0.5))
  const uDropAge = uniform(1)
  const uVignette = uniform(opts.vignette ? 1 : 0)
  const paperDay = uniform(rgb(PAPER_DAY))
  const paperNight = uniform(rgb(PAPER_NIGHT))
  const massNode = uMass
  const glazeNode = uGlaze

  // Day: Beer–Lambert glaze, so washes stay chromatic as they thin (paper ×
  // pigment^thickness). Night: luminous pigment laid over dark paper.
  const glaze = (under: V3, pigment: V3, density: F): V3 => {
    const day = under.mul(pow(max(pigment, vec3(0.002)), vec3(density.mul(1.35))))
    const night = mix(under, mix(pigment, vec3(1), 0.3), clamp(density.mul(0.9), 0, 1))
    return mix(day, night, uNight)
  }

  /** The painted paper at a screen point: the same function backs the sheet and shows through the bloom. */
  const paper = (st: V2): V3 => {
    const p = vec2(st.x.mul(uAspect), st.y)
    const c = vec2(uCentre.x.mul(uAspect), uCentre.y)
    const spread = uBreath.mul(0.34).add(0.74)
    // One slow fbm field and one finer one shape every bloom's cauliflower edge.
    const coarse = mx_fractal_noise_float(vec3(p.mul(2.3), T.mul(0.012)), 4, 2, 0.5)
    const fine = mx_fractal_noise_float(vec3(p.mul(6.2).add(4.1), T.mul(0.02)), 3, 2, 0.55)
    const tooth = mx_fractal_noise_float(vec3(p.mul(70), 1.7), 2, 2, 0.5)
    let col: V3 = mix(paperDay, paperNight, uNight).mul(tooth.mul(0.035).add(1))

    const blooms: [number, number, number, number, 'mass' | 'glaze'][] = [
      // dx, dy (× radius), size, strength, pigment
      [0.05, 0.02, 1.85, 0.32, 'mass'],
      [-1.5, 0.9, 0.95, 0.4, 'glaze'],
      [1.55, -0.8, 0.8, 0.3, 'mass'],
      [0.7, 1.75, 0.58, 0.36, 'glaze'],
    ]
    for (const [dx, dy, size, strength, which] of blooms) {
      const centre = c.add(vec2(dx, dy).mul(uRadius))
      const r = uRadius.mul(size).mul(spread)
      const d = length(p.sub(centre)).div(r).add(coarse.mul(0.55)).add(fine.mul(0.16))
      const body = float(1).sub(smoothstep(0.25, 1, d))
      // Pigment collects at the drying front: a crisp tide line.
      const tide = smoothstep(0.84, 0.975, d).mul(float(1).sub(smoothstep(0.975, 1.03, d)))
      const settle = tooth.mul(0.5).add(0.85) // granulation into the paper's tooth
      const density = body.mul(0.42).add(tide.mul(0.55)).mul(strength).mul(settle)
      col = glaze(col, which === 'mass' ? massNode : glazeNode, density)
    }

    // A drop of clean glaze where the bloom was poked, spreading as it dries.
    const age = clamp(uDropAge, 0, 1)
    const dc = vec2(uDrop.x.mul(uAspect), uDrop.y)
    const dd = length(p.sub(dc)).div(uRadius.mul(age.mul(0.85).add(0.18))).add(fine.mul(0.3))
    const drop = float(1).sub(smoothstep(0.55, 1, dd)).mul(0.32).add(
      smoothstep(0.82, 0.97, dd).mul(float(1).sub(smoothstep(0.97, 1.03, dd))).mul(0.5),
    ).mul(float(1).sub(age)).mul(0.6)
    col = glaze(col, glazeNode, drop)

    // Drifting granules of pigment, densest near the bloom.
    const drift = vec2(T.mul(0.006), T.mul(-0.009))
    const fleck = smoothstep(0.66, 0.73, mx_noise_float(vec3(p.add(drift).mul(64), 3.3)))
    const near = float(1).sub(smoothstep(0.6, 3.1, length(p.sub(c)).div(uRadius)))
    col = glaze(col, massNode, fleck.mul(near).mul(0.45))
    return col
  }

  // ── Paper sheet behind the bloom ─────────────────────────────────
  const sheetMat = new THREE.MeshBasicNodeMaterial()
  sheetMat.colorNode = paper(screenUV)
  sheetMat.depthWrite = false
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sheetMat)
  sheet.position.z = -4
  sheet.renderOrder = -1
  scene.add(sheet)

  // ── The bloom ────────────────────────────────────────────────────
  const bloomMat = new THREE.MeshBasicNodeMaterial()
  {
    const rest = attribute<'vec3'>('rest', 'vec3').div(uRestR)
    const ndv = clamp(dot(normalView, positionViewDirection), 0, 1)
    const rim = float(1).sub(ndv)
    const pool = pow(rim, 3.4)
    const wetEdge = smoothstep(0.88, 0.985, rim)
    const driftField = mx_fractal_noise_float(rest.mul(1.5).add(vec3(0, T.mul(0.035), T.mul(0.01))), 3, 2, 0.5)
    const hue = smoothstep(-0.28, 0.32, driftField.add(uBreath.mul(0.12)))
    const pigment = mix(massNode, glazeNode, hue)
    // Backruns: cauliflower blooms inside the wash with darker rims.
    const back = mx_fractal_noise_float(rest.mul(2.2).add(7.3), 3, 2, 0.5)
    const backRim = smoothstep(0.16, 0.2, back).mul(float(1).sub(smoothstep(0.2, 0.25, back)))
    const backLift = smoothstep(0.2, 0.26, back)
    const grain = mx_noise_float(rest.mul(26)).mul(0.5).add(0.5)
    // Leave the paper white where the light falls.
    const lit = dot(normalView, normalize(vec3(-0.42, 0.58, 0.7)))
    const highlight = smoothstep(0.7, 0.9, lit.add(driftField.mul(0.22)))
    const thin = mix(1.12, 0.84, clamp(uBreath, 0, 1.3))
    const density = clamp(
      float(0.5)
        .add(pool.mul(0.55))
        .add(wetEdge.mul(0.45))
        .add(backRim.mul(0.1))
        .sub(backLift.mul(0.08))
        .add(grain.sub(0.5).mul(0.22))
        .sub(lit.mul(0.12))
        .sub(highlight.mul(0.5))
        .mul(thin),
      0.04,
      1.4,
    )
    bloomMat.colorNode = glaze(paper(screenUV), pigment, density)
  }

  // ── Layout: track the anchor element ─────────────────────────────
  let halfH = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAM_Z
  const home: [number, number, number] = [0, 0, 0]
  let radius = 1
  let jelly: Jelly | null = null
  let mesh: THREE.Mesh | null = null
  let restCentre: [number, number, number] = [0, 0, 0]
  const bodies: Jelly[] = []

  const buildJelly = (r: number) => {
    const { positions, index } = icosphere(r, DETAIL)
    const body = new Jelly(positions, {
      stiffness: mode === 'calm' ? 0.08 : 0.06,
      beta: 0.38,
      damping: mode === 'calm' ? 1.7 : 1.25,
      substeps: 2,
    })
    const geo = jellyGeometry(body, index)
    body.translate(home[0], home[1], home[2])
    body.anchor = { target: [...home], k: 16, c: 5.5 }
    restCentre = [...home]
    if (mesh) {
      mesh.geometry.dispose()
      mesh.geometry = geo
    } else {
      mesh = new THREE.Mesh(geo, bloomMat)
      mesh.frustumCulled = false
      scene.add(mesh)
    }
    jelly = body
    bodies[0] = body
    uRestR.value = r
  }

  const layout = () => {
    const w = Math.max(1, host.clientWidth)
    const h = Math.max(1, host.clientHeight)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    uAspect.value = camera.aspect
    halfH = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAM_Z
    const dist = CAM_Z - sheet.position.z
    const sh = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * dist * 1.05
    sheet.scale.set(sh * camera.aspect, sh, 1)

    const hr = host.getBoundingClientRect()
    const ar = anchor.getBoundingClientRect()
    const cx = ar.left + ar.width / 2 - hr.left
    const cy = ar.top + ar.height / 2 - hr.top
    const wpp = (2 * halfH) / h
    home[0] = (cx - w / 2) * wpp
    home[1] = -(cy - h / 2) * wpp
    // Leave room for a full inhale (and a sip on top) inside the anchor.
    const r = (Math.min(ar.width, ar.height) / 2) * wpp * 0.6
    uCentre.value.set(cx / w, cy / h)
    uRadius.value = r / (2 * halfH)

    if (!jelly || Math.abs(r - radius) / radius > 0.04) {
      radius = r
      buildJelly(r)
    } else {
      jelly.translate(home[0] - restCentre[0], home[1] - restCentre[1], 0)
      restCentre = [...home]
      if (jelly.anchor) jelly.anchor.target = [...home]
    }
  }
  stage.onResize(layout)
  const anchorObserver = new ResizeObserver(() => {
    layout()
    stage.requestRender()
  })
  anchorObserver.observe(anchor)

  // ── Interaction ──────────────────────────────────────────────────
  const dropAt = (x: number, y: number) => {
    // World point on the bloom → screen UV for the drop bloom.
    const v = new THREE.Vector3(x, y, 0).project(camera)
    uDrop.value.set(v.x * 0.5 + 0.5, 0.5 - v.y * 0.5)
    uDropAge.value = 0
  }
  let pointer: JellyPointer | null = null
  if (mode === 'play') {
    pointer = bindJellyPointer({
      host: pointerHost,
      camera,
      bodies,
      reducedMotion,
      touchDrag: false,
      pokeStrength: 3.2,
      onPoke: (_, point) => dropAt(point[0], point[1]),
    })
  }

  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const sphere = new THREE.Sphere()
  const hit = new THREE.Vector3()
  const poke = (clientX: number, clientY: number) => {
    if (!jelly || reducedMotion) return
    const r = host.getBoundingClientRect()
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    sphere.center.set(...jelly.center)
    sphere.radius = jelly.radius * 1.1
    if (!ray.ray.intersectSphere(sphere, hit)) return
    const d = ray.ray.direction
    const s = jelly.radius * 1.1 // a press, not a slap
    jelly.impulse([hit.x, hit.y, hit.z], [d.x * s, d.y * s, d.z * s], jelly.radius * 0.8)
    dropAt(hit.x, hit.y)
  }

  // ── Post: bleed → paper tooth → vignette → film grain ────────────
  const pipeline = new THREE.RenderPipeline(renderer)
  const scenePass = pass(scene, camera)
  const tex = scenePass.getTextureNode('output')
  {
    const st = screenUV
    const q = vec3(st.x.mul(uAspect).mul(34), st.y.mul(34), T.mul(0.04))
    const wobble = vec2(mx_noise_float(q), mx_noise_float(q.add(9.7))).mul(0.0024)
    const a = tex.sample(st.add(wobble)).rgb
    const b = tex.sample(st.add(wobble.mul(-1.4)).add(vec2(0.0008, -0.0006))).rgb
    // Darkest pigment wins at the edges, so washes bleed outward a touch.
    const bled = mix(a, min(a, b), mix(0.55, 0.0, uNight)).add(mix(vec3(0), max(a, b).sub(a), uNight.mul(0.4)))
    const tooth = mx_fractal_noise_float(vec3(st.x.mul(uAspect).mul(260), st.y.mul(260), 2.2), 2, 2, 0.5)
    const toothed = bled.mul(tooth.mul(0.05).add(1))
    const d = length(st.sub(0.5).mul(vec2(1, 0.9)))
    const vig = mix(1, mix(0.9, 0.78, uNight), smoothstep(0.42, 0.98, d).mul(uVignette))
    const graded = vec4(toothed.mul(vig), 1)
    pipeline.outputNode = filmHD(graded, {
      intensityNode: uniform(0.09),
      grainScaleNode: uniform(1.5),
      grainSpeedNode: uniform(reducedMotion ? 0 : 6),
      scanlineIntensityNode: uniform(0),
    })
  }

  // ── Frame ────────────────────────────────────────────────────────
  const mass = rgb(opts.pigment.mass)
  const glazeTarget = rgb(opts.pigment.glaze)
  let nightTarget = opts.night ? 1 : 0
  let clock = 0
  let first = true

  const frame = (dt: number) => {
    clock += dt
    const sample = read()
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 2.5)
    uMass.value.lerp(mass, k)
    uGlaze.value.lerp(glazeTarget, k)
    uNight.value += (nightTarget - uNight.value) * (reducedMotion ? 1 : 1 - Math.exp(-dt * 4))
    uBreath.value += (sample.amplitude - uBreath.value) * (reducedMotion ? 1 : 1 - Math.exp(-dt * 6))
    uDropAge.value = Math.min(1, uDropAge.value + dt / 2.6)

    if (jelly && mesh) {
      const scale = 1 + BREATH_GAIN * Math.max(0, sample.amplitude)
      if (reducedMotion) {
        // No physics: set the shape straight from the rest pose.
        const rest = mesh.geometry.getAttribute('rest').array as Float32Array
        for (let i = 0; i < jelly.x.length; i += 3) {
          jelly.x[i] = restCentre[0] + rest[i] * scale
          jelly.x[i + 1] = restCentre[1] + rest[i + 1] * scale
          jelly.x[i + 2] = restCentre[2] + rest[i + 2] * scale
        }
      } else {
        jelly.scale = scale
        // Surface tension keeps it alive; holds add a fine shiver.
        const shiver = sample.hold ? 0.014 * Math.sin(clock * 9.5) + 0.006 * Math.sin(clock * 15.1) : 0
        const sway = 0.012 * Math.sin(clock * 1.3) + 0.007 * Math.sin(clock * 2.3 + 1.1)
        jelly.squash[0] = 1 + sway + shiver
        jelly.squash[1] = 1 - sway - shiver * 0.8
        jelly.squash[2] = 1 + sway * 0.4
        jelly.step(dt)
      }
      syncJellyGeometry(mesh.geometry)
    }

    pipeline.render()
    if (first) {
      first = false
      onFirstFrame()
    }
  }
  stage.start(frame)

  return {
    setPigment(pigment) {
      mass.copy(rgb(pigment.mass))
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
      pointer?.dispose()
      anchorObserver.disconnect()
      stage.dispose()
      mesh?.geometry.dispose()
      sheet.geometry.dispose()
      bloomMat.dispose()
      sheetMat.dispose()
      pipeline.dispose()
    },
  }
}

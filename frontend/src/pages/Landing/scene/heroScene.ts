/**
 * Landing hero: a soft-body glass droplet (three-blocks MeshTransmissionNodeMaterial)
 * floating over a hand-painted ultramarine field, with an ink core that sloshes
 * inside it. Physics is a small set of damped springs on the CPU; the surface
 * deformation, normals and post-processing are TSL.
 *
 * Interaction: drag the droplet (mouse/pen), tap/click to poke it, hover to
 * make it lean toward you. Scrolling lifts it with inertia and floods the frame
 * with ink so the hero hands off to the dark section below.
 */
import * as THREE from 'three/webgpu'
import {
  Fn,
  abs,
  color,
  cross,
  dot,
  exp,
  float,
  length,
  max,
  mix,
  modelPosition,
  mx_fractal_noise_float,
  mx_fractal_noise_vec3,
  mx_noise_float,
  normalGeometry,
  normalize,
  pass,
  positionGeometry,
  pow,
  reflect,
  screenUV,
  select,
  smoothstep,
  texture,
  time,
  transformNormalToView,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import type { Node } from 'three/webgpu'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { MeshTransmissionNodeMaterial } from 'three-blocks/transmission'
import { biplanarTexture, filmHD } from 'three-blocks/core-tsl-effects'
import { BACKDROP_OVERSCAN, layoutBlend, type PaintedField } from './painter'

type V3 = Node<'vec3'>
type F = Node<'float'>

export type HeroSceneOptions = {
  canvas: HTMLCanvasElement
  /** Element whose box defines scroll progress and receives pointer input. */
  host: HTMLElement
  field: PaintedField
  reducedMotion: boolean
  onFirstFrame: () => void
}

export type HeroScene = { dispose: () => void }

const SLOTS = 4
const FOV = 32
const CAM_Z = 9
const BACKDROP_Z = -2.6

function paintEnvironment(): THREE.CanvasTexture {
  // Equirect studio: warm-grey room, two long softboxes and a floor bounce.
  const w = 1024
  const h = 512
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#f4f1ea')
  sky.addColorStop(0.48, '#bdb7ad')
  sky.addColorStop(0.52, '#8d887f')
  sky.addColorStop(1, '#3b3a44')
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)
  g.filter = 'blur(6px)'
  g.fillStyle = '#ffffff'
  g.fillRect(w * 0.12, h * 0.16, w * 0.16, h * 0.22)
  g.fillRect(w * 0.6, h * 0.1, w * 0.07, h * 0.36)
  g.fillStyle = '#c9d0ff'
  g.fillRect(w * 0.8, h * 0.3, w * 0.12, h * 0.05)
  g.fillStyle = '#2433e0'
  g.globalAlpha = 0.55
  g.fillRect(0, h * 0.62, w, h * 0.08)
  const tex = new THREE.CanvasTexture(cv)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Deformable unit-sphere surface: radial field + volume-preserving stretch. */
function softSurface(radial: (n: V3) => F, stretchDir: V3, stretch: F) {
  const surf = (n: V3) => n.mul(radial(n).add(1))
  const n0 = normalGeometry
  const up = select(abs(n0.y).lessThan(0.98), vec3(0, 1, 0), vec3(1, 0, 0))
  const t1 = normalize(cross(n0, up))
  const t2 = cross(n0, t1)
  const e = 0.012
  const pA = surf(n0)
  const pB = surf(normalize(n0.add(t1.mul(e))))
  const pC = surf(normalize(n0.add(t2.mul(e))))
  const nR = normalize(cross(pB.sub(pA), pC.sub(pA)))

  // S = a·ddᵀ + b·(I − ddᵀ); a·b² ≈ 1 keeps the volume honest.
  const a = stretch.add(1)
  const b = float(1).div(a.sqrt())
  const along = (v: V3) => stretchDir.mul(dot(v, stretchDir))
  const position = along(pA).mul(a).add(pA.sub(along(pA)).mul(b))
  const normal = normalize(along(nR).div(a).add(nR.sub(along(nR)).div(b)))
  return { position, normal: varying(normal, 'vSoftNormal') }
}

/** Perturb a local-space normal with the painted normal map (biplanar, no pole pinch). */
function paintedNormal(base: V3, normalTex: THREE.Texture, scale: number, strength: F) {
  const sample = biplanarTexture(texture(normalTex), null, null, scale, positionGeometry, normalGeometry, 6) as Node<'vec4'>
  const pn = sample.xyz.mul(2).sub(1)
  const up = select(abs(base.y).lessThan(0.98), vec3(0, 1, 0), vec3(1, 0, 0))
  const t1 = normalize(cross(base, up))
  const t2 = cross(base, t1)
  return normalize(base.add(t1.mul(pn.x).add(t2.mul(pn.y)).mul(strength)))
}

type Spring = { x: number; v: number }

export async function createHeroScene(opts: HeroSceneOptions): Promise<HeroScene> {
  const { canvas, host, field, reducedMotion, onFirstFrame } = opts
  const narrow = () => host.clientWidth < 820
  // Shader clock; frozen under reduced motion so on-demand frames stay still.
  const T: F = reducedMotion ? float(0) : time

  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, narrow() ? 1.5 : 1.75))
  renderer.toneMapping = THREE.NoToneMapping
  await renderer.init()

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#EDE8DF')
  const env = paintEnvironment()
  scene.environment = env
  scene.environmentIntensity = 0.95

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60)
  camera.position.set(0, 0, CAM_Z)

  // ── Painted backdrop ──────────────────────────────────────────────
  const colorTex = new THREE.CanvasTexture(field.color)
  colorTex.colorSpace = THREE.SRGBColorSpace
  colorTex.anisotropy = 4
  const normalTex = new THREE.CanvasTexture(field.normal)
  normalTex.colorSpace = THREE.NoColorSpace
  normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping

  const uLight = uniform(new THREE.Vector3(-0.55, 0.6, 0.6).normalize())
  const backdropMat = new THREE.MeshBasicNodeMaterial()
  {
    const albedo = texture(colorTex, uv()).rgb
    const n = normalize(texture(normalTex, uv()).xyz.mul(2).sub(1))
    const lambert = dot(n, uLight)
    const glint = pow(max(dot(reflect(uLight.negate(), n), vec3(0, 0, 1)), 0), 28)
    const relief = float(1).sub(n.z) // 0 on flat paper, >0 on ridges
    backdropMat.colorNode = albedo
      .mul(lambert.mul(0.2).add(0.88))
      .add(glint.mul(relief.mul(6).min(1)).mul(0.16))
  }
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backdropMat)
  backdrop.position.z = BACKDROP_Z
  scene.add(backdrop)

  // ── Main droplet: soft-body uniforms ─────────────────────────────
  const uSlot = Array.from({ length: SLOTS }, () => uniform(new THREE.Vector4(0, 0, 1, 0)))
  const uQuad = uniform(new THREE.Vector4())
  const uHover = uniform(new THREE.Vector4(0, 0, 1, 0))
  const uStretchDir = uniform(new THREE.Vector3(0, 1, 0))
  const uStretch = uniform(0)
  const uIdle = uniform(reducedMotion ? 0 : 0.055)
  const uPaint = uniform(0.12)

  const quadAmp = [uQuad.x, uQuad.y, uQuad.z, uQuad.w]
  const radial = (n: V3): F => {
    let d: F = mx_noise_float(n.mul(1.25).add(vec3(0, T.mul(0.11), 3.1))).mul(uIdle)
    for (let k = 0; k < SLOTS; k++) {
      const c = dot(n, uSlot[k].xyz)
      d = d.add(uSlot[k].w.mul(exp(c.sub(1).mul(5.5))))
      d = d.add(quadAmp[k].mul(c.mul(c).mul(1.5).sub(0.5)))
    }
    return d.add(uHover.w.mul(exp(dot(n, uHover.xyz).sub(1).mul(3))))
  }
  const soft = softSurface(radial, uStretchDir, uStretch)

  const glass = new MeshTransmissionNodeMaterial({
    color: 0xffffff,
    transmission: 1,
    roughness: 0.03,
    metalness: 0,
    ior: 1.33,
    thickness: 1.2,
    dispersion: 0.5,
    chromaticAberration: 0.008,
    anisotropicBlur: 0.02,
    distortion: 0.015,
    distortionScale: 0.5,
    temporalDistortion: reducedMotion ? 0 : 0.01,
    attenuationColor: new THREE.Color('#DDE1FF'),
    attenuationDistance: 3.5,
    specularIntensity: 1,
    samples: 4,
  })
  glass.positionNode = soft.position
  glass.normalNode = transformNormalToView(paintedNormal(soft.normal, normalTex, 0.55, uPaint))

  const RADIUS_GEO = narrow() ? [128, 96] : [192, 144]
  const droplet = new THREE.Mesh(new THREE.SphereGeometry(1, RADIUS_GEO[0], RADIUS_GEO[1]), glass)
  scene.add(droplet)

  // ── Ink core: suspended pigment, refracted by the droplet ────────
  const coreMat = new THREE.MeshBasicNodeMaterial()
  {
    const q = normalGeometry.mul(1.1).add(vec3(0, 0, T.mul(0.05)))
    const warp = mx_fractal_noise_vec3(q, 2, 2, 0.5)
    const f = mx_fractal_noise_float(q.add(warp.mul(1.1)).add(T.mul(0.04)), 3, 2, 0.5)
    const ultra = color('#2433E0')
    const deep = color('#151E8F')
    const pale = color('#A3ACFF')
    let c: V3 = mix(deep, ultra, smoothstep(-0.25, 0.25, f))
    c = mix(c, pale, smoothstep(0.32, 0.55, f))
    coreMat.colorNode = c
  }
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 6), coreMat)
  scene.add(core)

  // ── Satellite droplets: idle wobble only, trail the main drop ────
  const satGlass = new MeshTransmissionNodeMaterial({
    color: 0xffffff,
    transmission: 1,
    roughness: 0.03,
    ior: 1.33,
    thickness: 0.6,
    dispersion: 0.4,
    chromaticAberration: 0.012,
    attenuationColor: new THREE.Color('#D5DAFF'),
    attenuationDistance: 1.6,
    samples: 2,
  })
  {
    const seed = modelPosition.mul(0.7)
    const satRadial = (n: V3): F =>
      mx_noise_float(n.mul(1.8).add(seed).add(vec3(0, T.mul(0.35), 0))).mul(0.05)
    const s = softSurface(satRadial, vec3(0, 1, 0), float(0))
    satGlass.positionNode = s.position
    satGlass.normalNode = transformNormalToView(s.normal)
  }
  const satGeo = new THREE.SphereGeometry(1, 64, 48)
  const satellites = [
    { home: new THREE.Vector3(1.25, 0.95, -0.5), r: 0.3 },
    { home: new THREE.Vector3(-1.2, -0.7, 0.6), r: 0.2 },
    { home: new THREE.Vector3(0.55, -1.25, 1.1), r: 0.14 },
  ].map((s, i) => {
    const mesh = new THREE.Mesh(satGeo, satGlass)
    scene.add(mesh)
    return { ...s, mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), phase: i * 2.1 }
  })

  // ── Post: TSL bloom → ink dissolve + vignette → three-blocks film ─
  const uDissolve = uniform(0)
  const uAspect = uniform(1)
  const pipeline = new THREE.RenderPipeline(renderer)
  const scenePass = pass(scene, camera)
  const sceneColor = scenePass.getTextureNode('output')
  const glow = bloom(sceneColor, 0.24, 0.35, 0.95)
  const graded = Fn(() => {
    const st = screenUV
    const base = sceneColor.rgb.add(glow.rgb).toVar()
    const d = length(st.sub(0.5).mul(vec2(1, 0.85)))
    base.mulAssign(mix(1, 0.9, smoothstep(0.4, 0.95, d)))
    // Ink rises from the bottom edge: a crisp, wet front whose raggedness
    // grows with scroll, a thin ultramarine bleed ahead of it, and a band of
    // pigment just inside. A sliver of ink always holds the bottom edge.
    const yb = float(1).sub(st.y)
    const n = mx_fractal_noise_float(vec3(st.x.mul(uAspect).mul(2.4), st.y.mul(2.4), T.mul(0.035)), 4, 2, 0.5)
    const front = uDissolve.mul(1.25).add(0.05).add(n.mul(uDissolve.mul(0.1).add(0.035)))
    const e = yb.sub(front)
    const ink = float(1).sub(smoothstep(-0.002, 0.002, e))
    const bleed = float(1).sub(smoothstep(0, 0.018, e)).mul(float(1).sub(ink)).mul(0.22)
    const band = smoothstep(-0.03, -0.002, e).mul(ink)
    const inked = mix(color('#0E1024'), color('#2433E0'), band.mul(0.9))
    const bled = mix(base, color('#2433E0'), bleed)
    return vec4(mix(bled, inked, ink), 1)
  })()
  pipeline.outputNode = filmHD(graded, {
    intensityNode: uniform(0.2),
    grainScaleNode: uniform(1.7),
    grainSpeedNode: uniform(reducedMotion ? 0 : 10),
    scanlineIntensityNode: uniform(0),
  })

  // ── Layout ───────────────────────────────────────────────────────
  const home = new THREE.Vector3()
  let R = 1.45
  let halfW = 1
  let halfH = 1
  const layout = () => {
    const w = host.clientWidth
    const h = Math.max(1, host.clientHeight)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    uAspect.value = camera.aspect
    halfH = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAM_Z
    halfW = halfH * camera.aspect
    const dist = CAM_Z - BACKDROP_Z
    const bh = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * dist * BACKDROP_OVERSCAN
    backdrop.scale.set(bh * camera.aspect, bh, 1)
    // Desktop: droplet sits right of the headline. Portrait: lower centre.
    const t = layoutBlend(camera.aspect)
    home.set(THREE.MathUtils.lerp(0, halfW * 0.48, t), THREE.MathUtils.lerp(-halfH * 0.55, 0.05, t), 0)
    R = THREE.MathUtils.lerp(Math.min(halfW * 0.5, halfH * 0.25), Math.min(halfH * 0.46, halfW * 0.28), t)
  }
  layout()

  // ── Physics state ────────────────────────────────────────────────
  const pos = home.clone()
  const vel = new THREE.Vector3()
  const target = home.clone()
  const axis = new THREE.Vector3(0, 1, 0)
  const stretch: Spring = { x: 0, v: 0 }
  const coreOff = new THREE.Vector3()
  const coreVel = new THREE.Vector3()
  const dents: Spring[] = Array.from({ length: SLOTS }, () => ({ x: 0, v: 0 }))
  const quads: Spring[] = Array.from({ length: SLOTS }, () => ({ x: 0, v: 0 }))
  const hover = { amp: 0, dir: new THREE.Vector3(0, 0, 1) }
  let nextSlot = 0

  const pointer = { ndc: new THREE.Vector2(0, 0), world: new THREE.Vector3(), inside: false }
  const parallax = new THREE.Vector2()
  let dragging: { pointerId: number; offset: THREE.Vector3; moved: number; dir: THREE.Vector3 } | null = null
  const raycaster = new THREE.Raycaster()
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)

  const updatePointer = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    pointer.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer.ndc, camera)
    raycaster.ray.intersectPlane(plane, pointer.world)
    pointer.inside = true
  }
  const hitDroplet = (): THREE.Vector3 | null => {
    raycaster.setFromCamera(pointer.ndc, camera)
    const sphere = new THREE.Sphere(pos, R * 1.02)
    const hit = raycaster.ray.intersectSphere(sphere, new THREE.Vector3())
    return hit ? hit.sub(pos).normalize() : null
  }
  const poke = (dir: THREE.Vector3, strength: number) => {
    const k = nextSlot++ % SLOTS
    uSlot[k].value.set(dir.x, dir.y, dir.z, 0)
    dents[k].v -= 1.9 * strength
    quads[k].v += 1.1 * strength
  }

  const isControl = (t: EventTarget | null) =>
    t instanceof Element && Boolean(t.closest('a, button, input, textarea, select, [role="button"]'))

  const onMove = (e: PointerEvent) => {
    updatePointer(e)
    if (dragging && e.pointerId === dragging.pointerId) {
      dragging.moved += Math.abs(e.movementX) + Math.abs(e.movementY)
      return
    }
    if (!reducedMotion && e.pointerType === 'mouse') {
      host.style.cursor = hitDroplet() && !isControl(e.target) ? 'grab' : ''
    }
  }
  const onDown = (e: PointerEvent) => {
    if (reducedMotion || isControl(e.target) || e.button > 0) return
    updatePointer(e)
    const dir = hitDroplet()
    if (!dir) return
    if (e.pointerType === 'touch') {
      // Touch keeps native vertical scroll; a tap pokes instead of dragging.
      poke(dir, 0.9)
      return
    }
    e.preventDefault()
    dragging = { pointerId: e.pointerId, offset: pointer.world.clone().sub(pos), moved: 0, dir }
    host.setPointerCapture(e.pointerId)
    host.style.cursor = 'grabbing'
  }
  const onUp = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== dragging.pointerId) return
    if (dragging.moved < 6) poke(dragging.dir, 1)
    dragging = null
    host.style.cursor = ''
    if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId)
  }
  const onLeave = () => {
    pointer.inside = false
  }
  host.addEventListener('pointermove', onMove)
  host.addEventListener('pointerdown', onDown)
  host.addEventListener('pointerup', onUp)
  host.addEventListener('pointercancel', onUp)
  host.addEventListener('pointerleave', onLeave)

  // ── Frame ────────────────────────────────────────────────────────
  let last = performance.now()
  let clock = 0
  let firstFrame = true
  const tmp = new THREE.Vector3()
  const tmp2 = new THREE.Vector3()

  const step = (dt: number) => {
    clock += dt
    const rect = host.getBoundingClientRect()
    const progress = THREE.MathUtils.clamp(-rect.top / Math.max(1, rect.height), 0, 1)
    uDissolve.value = progress

    // Target: home + idle drift + scroll lift (+ drag).
    if (dragging) {
      target.copy(pointer.world).sub(dragging.offset)
      target.x = THREE.MathUtils.clamp(target.x, -halfW * 0.95, halfW * 0.95)
      target.y = THREE.MathUtils.clamp(target.y, -halfH * 0.95, halfH * 0.95)
    } else {
      target.copy(home)
      if (!reducedMotion) {
        target.x += Math.sin(clock * 0.31) * 0.07 + parallax.x * 0.18
        target.y += Math.sin(clock * 0.43 + 1.2) * 0.09 + parallax.y * 0.12
      }
      target.y += progress * halfH * 0.85
    }

    const sub = 3
    const h = dt / sub
    for (let i = 0; i < sub; i++) {
      // Centre of mass: underdamped spring toward target.
      tmp.copy(target).sub(pos).multiplyScalar(dragging ? 90 : 38).addScaledVector(vel, dragging ? -13 : -6.5)
      vel.addScaledVector(tmp, h)
      pos.addScaledVector(vel, h)

      // Stretch tracks speed through an underdamped spring: the drop
      // elongates while it travels and squashes, then jiggles, when it stops.
      const speed = vel.length()
      if (speed > 0.08) axis.lerp(tmp2.copy(vel).divideScalar(speed), 1 - Math.exp(-h * 12)).normalize()
      stretch.v += (62 * (Math.min(speed * 0.075, 0.34) - stretch.x) - 4.2 * stretch.v) * h
      stretch.x += stretch.v * h

      // Ink core sloshes against the glass, opposite the acceleration.
      coreVel.addScaledVector(coreOff, -26 * h).addScaledVector(coreVel, -3.2 * h).addScaledVector(tmp, -0.75 * h)
      coreOff.addScaledVector(coreVel, h)

      for (let k = 0; k < SLOTS; k++) {
        const d = dents[k]
        d.v += (-95 * d.x - 7.5 * d.v) * h
        d.x += d.v * h
        const q = quads[k]
        q.v += (-48 * q.x - 2.6 * q.v) * h
        q.x += q.v * h
      }
    }
    uStretchDir.value.copy(axis)
    uStretch.value = THREE.MathUtils.clamp(stretch.x, -0.24, 0.38)
    for (let k = 0; k < SLOTS; k++) {
      uSlot[k].value.w = THREE.MathUtils.clamp(dents[k].x * 0.16, -0.32, 0.32)
    }
    uQuad.value.set(
      THREE.MathUtils.clamp(quads[0].x * 0.07, -0.16, 0.16),
      THREE.MathUtils.clamp(quads[1].x * 0.07, -0.16, 0.16),
      THREE.MathUtils.clamp(quads[2].x * 0.07, -0.16, 0.16),
      THREE.MathUtils.clamp(quads[3].x * 0.07, -0.16, 0.16),
    )

    // Hover: lean toward the pointer when it is near.
    const near = pointer.inside && !dragging && pointer.world.distanceTo(pos) < R * 1.6
    hover.amp = THREE.MathUtils.lerp(hover.amp, near && !reducedMotion ? 0.07 : 0, 1 - Math.exp(-dt * 6))
    if (near) hover.dir.copy(pointer.world).sub(pos).setZ(R * 0.9).normalize()
    uHover.value.set(hover.dir.x, hover.dir.y, hover.dir.z, hover.amp)

    droplet.position.copy(pos)
    droplet.scale.setScalar(R)
    const coreR = R * 0.28
    coreOff.clampLength(0, R * 0.42)
    core.position.copy(pos).add(coreOff).setZ(pos.z - R * 0.08)
    core.scale.setScalar(coreR)
    if (!reducedMotion) core.rotation.y = clock * 0.12

    for (const sat of satellites) {
      tmp.copy(pos).addScaledVector(sat.home, R)
      tmp.x += Math.sin(clock * 0.5 + sat.phase) * 0.12
      tmp.y += Math.cos(clock * 0.37 + sat.phase) * 0.14
      sat.vel.addScaledVector(tmp.sub(sat.pos), 9 * dt).multiplyScalar(Math.exp(-dt * 2.6))
      sat.pos.addScaledVector(sat.vel, dt)
      sat.mesh.position.copy(sat.pos)
      sat.mesh.scale.setScalar(sat.r * R)
    }

    // Parallax + raking light follow the pointer.
    const px = pointer.inside ? pointer.ndc.x : 0
    const py = pointer.inside ? pointer.ndc.y : 0
    const ease = 1 - Math.exp(-dt * 2.5)
    parallax.x += (px - parallax.x) * ease
    parallax.y += (py - parallax.y) * ease
    camera.position.set(parallax.x * 0.28, parallax.y * 0.18, CAM_Z - progress * 0.8)
    camera.lookAt(0, progress * 0.6, 0)
    uLight.value.set(-0.55 + parallax.x * 0.35, 0.6 + parallax.y * 0.3, 0.6).normalize()
  }

  for (const sat of satellites) sat.pos.copy(home).addScaledVector(sat.home, R)

  const frame = () => {
    const now = performance.now()
    const dt = Math.min(1 / 30, (now - last) / 1000)
    last = now
    step(reducedMotion ? 0 : dt)
    pipeline.render()
    if (firstFrame) {
      firstFrame = false
      onFirstFrame()
    }
  }

  await renderer.compileAsync(scene, camera)

  // Only run while the hero is on screen and the tab is visible.
  let onScreen = true
  let running = false
  const sync = () => {
    const want = onScreen && document.visibilityState === 'visible' && !reducedMotion
    if (want === running) return
    running = want
    last = performance.now()
    renderer.setAnimationLoop(want ? frame : null)
  }
  const io = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting
    sync()
  })
  io.observe(host)
  document.addEventListener('visibilitychange', sync)

  // Reduced motion: render on demand (first frame, resize, scroll).
  const renderOnce = () => {
    if (reducedMotion && onScreen) frame()
  }
  window.addEventListener('scroll', renderOnce, { passive: true })

  const ro = new ResizeObserver(() => {
    layout()
    renderOnce()
  })
  ro.observe(host)

  frame()
  sync()

  return {
    dispose() {
      renderer.setAnimationLoop(null)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('scroll', renderOnce)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerdown', onDown)
      host.removeEventListener('pointerup', onUp)
      host.removeEventListener('pointercancel', onUp)
      host.removeEventListener('pointerleave', onLeave)
      host.style.cursor = ''
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose()
      })
      for (const m of [backdropMat, glass, coreMat, satGlass]) m.dispose()
      for (const t of [colorTex, normalTex, env]) t.dispose()
      pipeline.dispose()
      renderer.dispose()
    },
  }
}

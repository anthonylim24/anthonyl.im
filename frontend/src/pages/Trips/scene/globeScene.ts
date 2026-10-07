/**
 * The Trips toy planet: a squishy clay globe (shape-matching Jelly) with
 * cut-paper continents, candy map pins that ride the jiggle, a paper airplane
 * looping dashed great-circle routes, and soft cloud puffs.
 *
 * Two looks share one scene:
 *  - `world`  — real lat/lng pins on a painted toy atlas (Trips index, create).
 *  - `region` — a tiny-planet diorama for one trip: its places fitted to the
 *               top cap of a patchwork meadow world, joined by a dashed route.
 *
 * Interaction: drag to stretch the planet (mouse/pen), tap/click to poke it,
 * hover a pin to pop it and show its label, click a pin to select it.
 */
import * as THREE from 'three/webgpu'
import {
  abs,
  asin,
  atan,
  attribute,
  color,
  dot,
  float,
  mix,
  mx_noise_float,
  normalLocal,
  normalView,
  normalize,
  positionLocal,
  positionViewDirection,
  smoothstep,
  texture,
  uv,
  vec2,
  vec3,
} from 'three/tsl'
import { createStage } from '@/three/stage'
import { Jelly, icosphere, type Vec3 } from '@/three/jelly'
import { jellyGeometry, syncJellyGeometry } from '@/three/jellyMesh'
import { bindJellyPointer } from '@/three/jellyPointer'
import { paintAtlas, TOY, centroid, type LatLng } from './worldMap'

export type GlobePin = LatLng & { id: string; fill: string; label: string }
export type GlobeMode = 'world' | 'region'

export type GlobeSceneOptions = {
  canvas: HTMLCanvasElement
  /** Box that sizes the canvas and receives pointer input. */
  host: HTMLElement
  mode: GlobeMode
  pins: GlobePin[]
  reducedMotion: boolean
  /** Where the camera starts looking (world mode). Defaults to the first pin. */
  focus?: LatLng | null
  /** Floating label the scene positions over the hovered pin. */
  label?: HTMLElement | null
  onSelect?: (id: string) => void
  onFirstFrame?: () => void
}

export type GlobeScene = {
  setPins(pins: GlobePin[]): void
  /** Add one pin that drops from the sky and boings the planet on landing. */
  dropPin(pin: GlobePin): void
  /** World mode: swing the camera round to look at this spot. */
  setFocus(at: LatLng | null | undefined): void
  dispose(): void
}

const R = 1
const UP = new THREE.Vector3(0, 1, 0)
const DEG = Math.PI / 180

function dirFromLatLng(p: LatLng, out = new THREE.Vector3()) {
  const la = p.lat * DEG
  const ln = p.lng * DEG
  return out.set(Math.cos(la) * Math.sin(ln), Math.sin(la), Math.cos(la) * Math.cos(ln))
}

/** Fit a trip's places onto the top cap: spread clusters, nudge overlaps apart. */
function regionLayout(pins: readonly LatLng[]): THREE.Vector3[] {
  const c = centroid(pins)
  if (!c) return []
  const cosLat = Math.cos(c.lat * DEG) || 1
  const raw = pins.map((p) => {
    let dl = p.lng - c.lng
    if (dl > 180) dl -= 360
    if (dl < -180) dl += 360
    return { x: dl * cosLat, y: p.lat - c.lat }
  })
  const ext = Math.max(1e-6, ...raw.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
  const pts = raw.map((p) => {
    const x = p.x / ext
    const y = p.y / ext
    const r = Math.hypot(x, y)
    if (r < 1e-6) return { x: 0, y: 0 }
    const r2 = Math.pow(r, 0.62)
    return { x: (x / r) * r2, y: (y / r) * r2 }
  })
  const MIN = pins.length > 14 ? 0.14 : 0.2
  for (let it = 0; it < 40; it++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[j].x - pts[i].x
        const dy = pts[j].y - pts[i].y
        const d = Math.hypot(dx, dy)
        if (d >= MIN) continue
        const push = (MIN - d) / 2
        const ux = d > 1e-6 ? dx / d : Math.cos(i + j)
        const uy = d > 1e-6 ? dy / d : Math.sin(i + j)
        pts[i].x -= ux * push
        pts[i].y -= uy * push
        pts[j].x += ux * push
        pts[j].y += uy * push
      }
    }
  }
  return pts.map((p) => {
    const r = Math.min(1, Math.hypot(p.x, p.y))
    const theta = r * 0.82
    const phi = Math.atan2(p.y, p.x)
    return new THREE.Vector3(Math.sin(theta) * Math.cos(phi), Math.cos(theta), -Math.sin(theta) * Math.sin(phi))
  })
}

function paperPlaneGeometry(): THREE.BufferGeometry {
  const N = [0, 0, 0.5]
  const L = [-0.42, 0.07, -0.36]
  const Rt = [0.42, 0.07, -0.36]
  const C = [0, 0.015, -0.3]
  const K = [0, -0.15, -0.3]
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute([...N, ...L, ...C, ...N, ...C, ...Rt, ...N, ...K, ...C], 3))
  geo.computeVertexNormals()
  return geo
}

/** A pin's candy body, built once and shared: cone tip + round head. */
function pinParts() {
  const tip = new THREE.ConeGeometry(0.032, 0.1, 18, 1, true)
  tip.rotateX(Math.PI)
  tip.translate(0, 0.05, 0)
  const head = new THREE.SphereGeometry(0.058, 24, 16)
  head.translate(0, 0.125, 0)
  const hull = new THREE.SphereGeometry(0.069, 20, 14)
  hull.translate(0, 0.125, 0)
  const shine = new THREE.SphereGeometry(0.016, 10, 8)
  shine.translate(-0.022, 0.15, 0.04)
  return { tip, head, hull, shine }
}

export async function createGlobeScene(opts: GlobeSceneOptions): Promise<GlobeScene> {
  const { host, canvas, mode, reducedMotion } = opts
  const stage = await createStage({ canvas, host, reducedMotion, alpha: true, maxDpr: 2 })
  const { renderer } = stage
  renderer.setClearColor(0x000000, 0)
  const world = mode === 'world'
  let clock = 0

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)
  scene.add(camera)
  scene.add(new THREE.HemisphereLight('#eef7ff', '#ffd9c7', 1.55))
  const key = new THREE.DirectionalLight('#fff3dc', 2.3)
  key.position.set(-3.2, 4, 5)
  const rim = new THREE.DirectionalLight('#d4e8ff', 1.1)
  rim.position.set(4.5, 1.5, -3)
  camera.add(key, rim)

  // ── Planet: a jelly icosphere with a painted (world) or patchwork (region) skin.
  const ico = icosphere(R, 4)
  const jelly = new Jelly(ico.positions, { stiffness: 0.09, beta: 0.3, damping: 2.1, substeps: 2 })
  jelly.anchor = { target: [0, 0, 0], k: 42, c: 8 }
  const geo = jellyGeometry(jelly, ico.index)
  const restArr = geo.getAttribute('rest').array as Float32Array
  const rd = normalize(attribute('rest', 'vec3'))
  const planetMat = new THREE.MeshPhysicalNodeMaterial({
    roughness: 0.66,
    clearcoat: 0.22,
    clearcoatRoughness: 0.45,
    sheen: 0.55,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color('#ffffff'),
  })
  let atlasTex: THREE.CanvasTexture | null = null
  if (world) {
    atlasTex = new THREE.CanvasTexture(paintAtlas(2048, 1024))
    atlasTex.colorSpace = THREE.SRGBColorSpace
    // No mips: the atan seam would otherwise pick the smallest level along one meridian.
    atlasTex.generateMipmaps = false
    atlasTex.minFilter = THREE.LinearFilter
    atlasTex.anisotropy = 4
    const u = atan(rd.x, rd.z).div(Math.PI * 2).add(0.5)
    const v = asin(rd.y.clamp(-1, 1)).div(Math.PI).add(0.5)
    planetMat.colorNode = texture(atlasTex, vec2(u, v)).rgb
  } else {
    const n = mx_noise_float(rd.mul(2.4))
    const fields = mx_noise_float(rd.mul(4.2).add(vec3(9.1, 2.3, 4.7)))
    const tone = mx_noise_float(rd.mul(9).add(vec3(1.7, 5.1, 3.3)))
    const meadow = mix(color(TOY.mint), color('#c7efb6'), smoothstep(-0.4, 0.5, tone))
    const fieldMask = smoothstep(0.3, 0.32, fields)
    const field = mix(meadow, color(TOY.butter), fieldMask.mul(0.9))
    const lake = float(1).sub(smoothstep(-0.36, -0.34, n))
    const shore = float(1).sub(smoothstep(0.006, 0.014, abs(n.add(0.35))))
    const hedge = float(1).sub(smoothstep(0.006, 0.013, abs(fields.sub(0.31))))
    const ground = mix(mix(field, color(TOY.ocean), lake), color(TOY.ink), shore.max(hedge.mul(float(1).sub(lake))).mul(0.85))
    planetMat.colorNode = ground
  }
  // Soft rim light so the clay reads round on a pastel page.
  const rimTerm = float(1).sub(dot(normalView, positionViewDirection).clamp(0, 1)).pow(2.6)
  planetMat.emissiveNode = color('#ffffff').mul(rimTerm.mul(0.22))
  const planet = new THREE.Mesh(geo, planetMat)
  scene.add(planet)
  // Ink outline: the same deforming geometry, back faces pushed out along normals.
  const outlineMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide })
  outlineMat.colorNode = color(TOY.ink)
  outlineMat.positionNode = positionLocal.add(normalLocal.mul(0.022))
  const outline = new THREE.Mesh(geo, outlineMat)
  scene.add(outline)

  // Contact shadow — the planet floats over the page like a toy on a shelf.
  let shadowMesh: THREE.Mesh | null = null
  if (world) {
    const shadowMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
    shadowMat.colorNode = color(TOY.ink)
    const d = vec2(0.5, 0.5).sub(uv()).length()
    shadowMat.opacityNode = float(1).sub(smoothstep(0.05, 0.5, d)).mul(0.22)
    shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), shadowMat)
    shadowMesh.rotation.x = -Math.PI / 2
    shadowMesh.position.y = -1.3
    scene.add(shadowMesh)
  }

  // Everything that should follow the planet's rigid motion (routes, plane, trees).
  const frame = new THREE.Group()
  scene.add(frame)

  // ── Pins
  const parts = pinParts()
  const tipMat = new THREE.MeshStandardNodeMaterial({ color: TOY.ink, roughness: 0.5 })
  const hullMat = new THREE.MeshBasicNodeMaterial({ color: TOY.ink, side: THREE.BackSide })
  const shineMat = new THREE.MeshBasicNodeMaterial({ color: '#ffffff' })
  type PinState = {
    pin: GlobePin
    group: THREE.Group
    headMat: THREE.MeshPhysicalNodeMaterial
    rest: Vec3
    near: number
    s: number
    sv: number
    h: number
    hv: number
    squash: number
    landed: boolean
    world: THREE.Vector3
    normal: THREE.Vector3
  }
  let pins: PinState[] = []
  const pinScale = world ? 1 : 1.1

  const makePin = (pin: GlobePin, restDir: THREE.Vector3, drop: boolean): PinState => {
    const group = new THREE.Group()
    const headMat = new THREE.MeshPhysicalNodeMaterial({
      color: new THREE.Color(pin.fill),
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    })
    group.add(new THREE.Mesh(parts.tip, tipMat), new THREE.Mesh(parts.hull, hullMat), new THREE.Mesh(parts.head, headMat), new THREE.Mesh(parts.shine, shineMat))
    scene.add(group)
    const rest: Vec3 = [restDir.x * R, restDir.y * R, restDir.z * R]
    const animate = drop && !reducedMotion
    return {
      pin,
      group,
      headMat,
      rest,
      near: jelly.nearest(rest),
      s: animate ? 0.2 : 1,
      sv: 0,
      h: animate ? 1.4 : 0,
      hv: 0,
      squash: 0,
      landed: !animate,
      world: new THREE.Vector3(),
      normal: new THREE.Vector3(0, 1, 0),
    }
  }

  const disposePin = (p: PinState) => {
    p.group.removeFromParent()
    p.headMat.dispose()
  }

  // ── Routes (marching dashes) + the paper airplane
  const dashGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 1, 6)
  const dashMat = new THREE.MeshBasicNodeMaterial({ color: world ? '#ffffff' : TOY.paper })
  const MAX_DASH = 520
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, MAX_DASH)
  dashes.count = 0
  dashes.frustumCulled = false
  frame.add(dashes)
  type Leg = { a: THREE.Vector3; b: THREE.Vector3; angle: number; lift: number; n: number }
  let legs: Leg[] = []

  const legPoint = (leg: Leg, t: number, out: THREE.Vector3) => {
    const sinA = Math.sin(leg.angle) || 1
    const wa = Math.sin((1 - t) * leg.angle) / sinA
    const wb = Math.sin(t * leg.angle) / sinA
    out.copy(leg.a).multiplyScalar(wa).addScaledVector(leg.b, wb)
    if (leg.angle < 1e-4) out.copy(leg.a)
    out.normalize().multiplyScalar(R + 0.03 + leg.lift * Math.sin(Math.PI * t))
    return out
  }

  const rebuildLegs = () => {
    const dirs = pins.map((p) => new THREE.Vector3(...p.rest).normalize())
    legs = []
    const pairs: [number, number][] = []
    for (let i = 0; i + 1 < dirs.length; i++) pairs.push([i, i + 1])
    if (dirs.length >= 3) pairs.push([dirs.length - 1, 0])
    if (dirs.length === 2) pairs.push([1, 0])
    for (const [i, j] of pairs) {
      const angle = dirs[i].angleTo(dirs[j])
      if (angle < 0.02) continue
      const lift = world ? 0.08 + 0.32 * (angle / Math.PI) : 0.04 + 0.22 * (angle / Math.PI)
      const n = Math.max(2, Math.round((angle * (R + lift * 0.6)) / (world ? 0.06 : 0.045)))
      legs.push({ a: dirs[i], b: dirs[j], angle, lift, n })
    }
  }

  const plane = new THREE.Group()
  const planeGeo = paperPlaneGeometry()
  const planeMat = new THREE.MeshStandardNodeMaterial({ color: TOY.paper, roughness: 0.8, side: THREE.DoubleSide, flatShading: true })
  const planeEdges = new THREE.LineSegments(new THREE.EdgesGeometry(planeGeo), new THREE.LineBasicNodeMaterial({ color: TOY.ink }))
  plane.add(new THREE.Mesh(planeGeo, planeMat), planeEdges)
  plane.scale.setScalar(world ? 0.2 : 0.17)
  frame.add(plane)
  const flight = { leg: 0, t: 0.35 }

  // ── Region extras: lollipop trees that ride the wobble.
  type Tree = { rest: Vec3; near: number; size: number }
  let trees: Tree[] = []
  let trunks: THREE.InstancedMesh | null = null
  let crowns: THREE.InstancedMesh | null = null
  if (!world) {
    const TREE_COUNT = 64
    trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.011, 0.07, 6), new THREE.MeshStandardNodeMaterial({ color: '#8a6a4f', roughness: 0.9 }), TREE_COUNT)
    const crownGeo = new THREE.IcosahedronGeometry(0.045, 1)
    crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardNodeMaterial({ roughness: 0.7, flatShading: true }), TREE_COUNT)
    const palette = ['#5fbf8f', '#79cfa0', '#ffb08a', '#ffd166', '#8fd3a8']
    let seed = 11
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < TREE_COUNT; i++) {
      const v = new THREE.Vector3(rand() * 2 - 1, rand() * 1.2 - 0.25, rand() * 2 - 1).normalize()
      const rest: Vec3 = [v.x * R, v.y * R, v.z * R]
      trees.push({ rest, near: jelly.nearest(rest), size: 0.75 + rand() * 0.6 })
      crowns.setColorAt(i, new THREE.Color(palette[i % palette.length]))
    }
    trunks.frustumCulled = false
    crowns.frustumCulled = false
    scene.add(trunks, crowns)
  }

  // ── Clouds
  const cloudMat = new THREE.MeshStandardNodeMaterial({ color: '#ffffff', roughness: 1 })
  cloudMat.emissiveNode = color('#ffffff').mul(0.32)
  const puffGeo = new THREE.IcosahedronGeometry(1, 2)
  const clouds = Array.from({ length: world ? 6 : 4 }, (_, i) => {
    const g = new THREE.Group()
    const blobs = [
      [0, 0, 0, 0.11],
      [0.1, -0.015, 0.01, 0.08],
      [-0.095, -0.02, 0, 0.075],
      [0.03, 0.05, -0.01, 0.07],
    ]
    for (const [x, y, z, r] of blobs) {
      const m = new THREE.Mesh(puffGeo, cloudMat)
      m.position.set(x, y, z)
      m.scale.setScalar(r)
      g.add(m)
    }
    scene.add(g)
    const axis = new THREE.Vector3(Math.sin(i * 2.4), 1.6 + Math.cos(i * 1.3), Math.cos(i * 3.1)).normalize()
    const start = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, i * 1.9)
    start.sub(axis.clone().multiplyScalar(start.dot(axis))).normalize()
    return { g, axis, start, radius: (world ? 1.3 : 1.22) + (i % 3) * 0.07, speed: 0.05 + (i % 4) * 0.012, phase: i * 1.1, size: 0.9 + (i % 3) * 0.25 }
  })

  // ── Camera
  const elFor = (p: LatLng) => THREE.MathUtils.clamp(p.lat * 0.55, -8, 32) * DEG
  const focus = opts.focus ?? opts.pins[0] ?? { lat: 25, lng: 130 }
  const view = {
    az: world ? focus.lng * DEG : 0,
    el: world ? elFor(focus) : 54 * DEG,
    dist: 5.6,
    spin: 0,
  }
  // A pending swing toward a focus; idle spin resumes once it lands.
  let aim: { az: number; el: number } | null = null
  const setFocus = (p: LatLng | null | undefined) => {
    if (!world || !p) return
    const az = p.lng * DEG
    aim = { az: view.az + Math.atan2(Math.sin(az - view.az), Math.cos(az - view.az)), el: elFor(p) }
    if (reducedMotion) {
      view.az = aim.az
      view.el = aim.el
      aim = null
      stage.requestRender()
    }
  }
  const lookAt = new THREE.Vector3(0, world ? -0.1 : 0.08, 0)
  stage.onResize((w, h) => {
    camera.aspect = w / h
    const halfV = 15 * DEG
    const halfH = Math.atan(Math.tan(halfV) * camera.aspect)
    const reach = world ? 1.6 : 1.42
    view.dist = Math.max(world ? 5.4 : 4.6, reach / Math.sin(Math.min(halfV, halfH)))
    camera.updateProjectionMatrix()
  })
  const placeCamera = () => {
    const az = world ? view.az : view.az + Math.sin(clock * 0.22) * 0.32
    camera.position.set(Math.cos(view.el) * Math.sin(az), Math.sin(view.el), Math.cos(view.el) * Math.cos(az)).multiplyScalar(view.dist).add(lookAt)
    camera.lookAt(lookAt)
  }

  // ── Pin picking (pins win over the jelly grab)
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const toCam = new THREE.Vector3()
  const hitSphere = new THREE.Sphere()
  const hitPoint = new THREE.Vector3()
  let hovered: PinState | null = null
  let pressed: PinState | null = null
  let pointerInside = false
  const headWorld = (p: PinState, out: THREE.Vector3) => out.copy(p.normal).multiplyScalar(0.125 * pinScale * p.s).add(p.group.position)
  const pickPin = (e: PointerEvent): PinState | null => {
    const r = host.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    let best: PinState | null = null
    let bestD = Infinity
    for (const p of pins) {
      toCam.copy(camera.position).sub(p.world).normalize()
      if (p.normal.dot(toCam) < 0.18) continue
      headWorld(p, hitSphere.center)
      hitSphere.radius = 0.095 * pinScale
      if (!ray.ray.intersectSphere(hitSphere, hitPoint)) continue
      const d = hitPoint.distanceTo(ray.ray.origin)
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    return best
  }
  const setHovered = (p: PinState | null) => {
    if (p === hovered) return
    hovered = p
    canvas.style.cursor = p ? 'pointer' : ''
    stage.requestRender()
  }
  const onCanvasMove = (e: PointerEvent) => {
    pointerInside = true
    if (e.pointerType === 'mouse') setHovered(pickPin(e))
  }
  const onCanvasDown = (e: PointerEvent) => {
    const p = pickPin(e)
    if (!p) return
    // Keep jellyPointer (bound on the host) from grabbing the planet under a pin.
    e.stopPropagation()
    pressed = p
    setHovered(p)
  }
  const onCanvasUp = (e: PointerEvent) => {
    if (!pressed) return
    const p = pickPin(e)
    if (p === pressed) opts.onSelect?.(p.pin.id)
    pressed = null
  }
  const onCanvasLeave = () => {
    pointerInside = false
    pressed = null
    setHovered(null)
  }
  canvas.addEventListener('pointermove', onCanvasMove)
  canvas.addEventListener('pointerdown', onCanvasDown)
  canvas.addEventListener('pointerup', onCanvasUp)
  canvas.addEventListener('pointerleave', onCanvasLeave)

  const jellyPointer = bindJellyPointer({
    host,
    camera,
    bodies: [jelly],
    reducedMotion,
    grabRadius: 0.55,
    pokeStrength: 3.2,
    onPoke: (_body, point) => {
      // Pins near the poke hop.
      for (const p of pins) {
        const d = Math.hypot(p.world.x - point[0], p.world.y - point[1], p.world.z - point[2])
        if (d < 0.55) p.hv += (0.55 - d) * 7
      }
    },
  })

  const setPins = (next: GlobePin[], drop = false) => {
    const keep = new Map(pins.map((p) => [p.pin.id, p]))
    const dirs = world ? next.map((p) => dirFromLatLng(p)) : regionLayout(next)
    const fresh: PinState[] = []
    next.forEach((pin, i) => {
      const old = keep.get(pin.id)
      const dir = dirs[i]
      if (old && old.pin.lat === pin.lat && old.pin.lng === pin.lng && old.pin.fill === pin.fill) {
        old.pin = pin
        old.rest = [dir.x * R, dir.y * R, dir.z * R]
        old.near = jelly.nearest(old.rest)
        fresh.push(old)
        keep.delete(pin.id)
      } else {
        fresh.push(makePin(pin, dir, drop))
      }
    })
    for (const p of keep.values()) disposePin(p)
    pins = fresh
    if (hovered && !pins.includes(hovered)) hovered = null
    rebuildLegs()
    flight.leg = Math.min(flight.leg, Math.max(0, legs.length - 1))
    if (!world) {
      // Keep trees off the pins so the route stays legible.
      const pinDirs = pins.map((p) => new THREE.Vector3(...p.rest))
      trees = trees.map((t) => {
        const v = new THREE.Vector3(...t.rest)
        if (!pinDirs.some((d) => d.distanceTo(v) < 0.16)) return t
        v.y = -Math.abs(v.y) - 0.2
        v.normalize()
        const rest: Vec3 = [v.x * R, v.y * R, v.z * R]
        return { ...t, rest, near: jelly.nearest(rest) }
      })
    }
    stage.requestRender()
  }

  // ── Per-frame helpers
  const tmpA: Vec3 = [0, 0, 0]
  const tmpB: Vec3 = [0, 0, 0]
  const ride = (rest: Vec3, i: number, out: THREE.Vector3) => {
    jelly.attach(rest, tmpA)
    jelly.attach([restArr[i * 3], restArr[i * 3 + 1], restArr[i * 3 + 2]], tmpB)
    return out.set(
      tmpA[0] + jelly.x[i * 3] - tmpB[0],
      tmpA[1] + jelly.x[i * 3 + 1] - tmpB[1],
      tmpA[2] + jelly.x[i * 3 + 2] - tmpB[2],
    )
  }
  const center = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const m4 = new THREE.Matrix4()
  const pA = new THREE.Vector3()
  const pB = new THREE.Vector3()
  const tan = new THREE.Vector3()
  const side = new THREE.Vector3()
  const upv = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0)

  const updatePins = (dt: number) => {
    for (const p of pins) {
      const target = p === hovered ? 1.38 : 1
      p.sv += (300 * (target - p.s) - 15 * p.sv) * dt
      p.s += p.sv * dt
      const before = p.h
      p.hv += (-110 * p.h - 6.5 * p.hv) * dt
      p.h += p.hv * dt
      if (!p.landed && before > 0 && p.h <= 0) {
        p.landed = true
        p.squash = 0.45
        // The planet feels the landing.
        const n = p.normal
        jelly.impulse([p.world.x, p.world.y, p.world.z], [-n.x * 2.2, -n.y * 2.2, -n.z * 2.2], 0.4)
      }
      if (p.h < 0 && p.landed) p.h *= 0.5
      p.squash *= Math.exp(-7 * dt)
      ride(p.rest, p.near, p.world)
      p.normal.copy(p.world).sub(center).normalize()
      p.group.position.copy(p.normal).multiplyScalar(Math.max(0, p.h)).add(p.world)
      p.group.quaternion.setFromUnitVectors(UP, p.normal)
      const s = Math.max(0.01, p.s) * pinScale
      p.group.scale.set(s * (1 + p.squash * 0.5), s * (1 - p.squash), s * (1 + p.squash * 0.5))
    }
  }

  const updateDashes = (phase: number) => {
    let k = 0
    for (const leg of legs) {
      for (let i = 0; i < leg.n && k < MAX_DASH; i++) {
        const t = (i + phase) / leg.n
        legPoint(leg, t, pA)
        legPoint(leg, Math.min(1, t + 0.01), pB)
        tan.copy(pB).sub(pA)
        if (tan.lengthSq() < 1e-12) continue
        tan.normalize()
        q.setFromUnitVectors(UP, tan)
        // Dashes fade in/out at the ends so the route grows out of each pin.
        const ends = Math.min(1, Math.min(t, 1 - t) * 6)
        scl.set(1, (world ? 0.028 : 0.022) * ends, 1)
        m4.compose(pA, q, scl)
        dashes.setMatrixAt(k++, m4)
      }
    }
    dashes.count = k
    dashes.instanceMatrix.needsUpdate = true
  }

  const updatePlane = (dt: number) => {
    if (legs.length === 0) {
      // No route: lazy loop around the planet.
      flight.t += dt * 0.07
      const a = flight.t * Math.PI * 2
      pA.set(Math.sin(a), 0.35 + Math.sin(a * 2) * 0.08, Math.cos(a)).normalize().multiplyScalar(R + 0.3)
      pB.set(Math.sin(a + 0.02), 0.35 + Math.sin((a + 0.02) * 2) * 0.08, Math.cos(a + 0.02)).normalize().multiplyScalar(R + 0.3)
    } else {
      const leg = legs[flight.leg % legs.length]
      const speed = (world ? 0.5 : 0.32) / Math.max(0.3, leg.angle)
      flight.t += dt * Math.min(0.9, speed)
      if (flight.t >= 1) {
        flight.t = 0
        flight.leg = (flight.leg + 1) % legs.length
      }
      const cur = legs[flight.leg % legs.length]
      legPoint(cur, flight.t, pA)
      legPoint(cur, Math.min(1, flight.t + 0.01), pB)
    }
    tan.copy(pB).sub(pA).normalize()
    upv.copy(pA).normalize()
    side.crossVectors(upv, tan).normalize()
    upv.crossVectors(tan, side).normalize()
    m4.makeBasis(side, upv, tan)
    plane.quaternion.setFromRotationMatrix(m4)
    plane.rotateZ(Math.sin(clock * 2.1) * 0.18)
    plane.position.copy(pA)
  }

  const updateClouds = () => {
    for (const c of clouds) {
      const a = c.phase + clock * c.speed
      c.g.position.copy(c.start).applyAxisAngle(c.axis, a).multiplyScalar(c.radius)
      c.g.position.y += Math.sin(clock * 0.8 + c.phase) * 0.03
      c.g.lookAt(camera.position)
      const breathe = 1 + Math.sin(clock * 1.3 + c.phase) * 0.04
      c.g.scale.set(c.size * breathe, c.size / breathe, c.size)
    }
  }

  const updateTrees = () => {
    if (!trunks || !crowns) return
    trees.forEach((t, i) => {
      ride(t.rest, t.near, pA)
      upv.copy(pA).sub(center).normalize()
      q.setFromUnitVectors(UP, upv)
      scl.setScalar(t.size)
      m4.compose(pB.copy(upv).multiplyScalar(0.03 * t.size).add(pA), q, scl)
      trunks!.setMatrixAt(i, m4)
      m4.compose(pB.copy(upv).multiplyScalar(0.085 * t.size).add(pA), q, scl)
      crowns!.setMatrixAt(i, m4)
    })
    for (let i = trees.length; i < trunks.count; i++) {
      trunks.setMatrixAt(i, hidden)
      crowns.setMatrixAt(i, hidden)
    }
    trunks.instanceMatrix.needsUpdate = true
    crowns.instanceMatrix.needsUpdate = true
  }

  const label = opts.label ?? null
  const labelPos = new THREE.Vector3()
  const updateLabel = () => {
    if (!label) return
    if (!hovered) {
      label.style.opacity = '0'
      return
    }
    headWorld(hovered, labelPos).addScaledVector(hovered.normal, 0.09 * pinScale).project(camera)
    const x = (labelPos.x * 0.5 + 0.5) * stage.size.w
    const y = (-labelPos.y * 0.5 + 0.5) * stage.size.h
    if (label.textContent !== hovered.pin.label) label.textContent = hovered.pin.label
    label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
    label.style.opacity = '1'
  }

  setPins(opts.pins, true)

  let first = true
  stage.start((dt) => {
    clock += dt
    const busy = hovered || pressed || jellyPointer.grabbing() || (pointerInside && jellyPointer.hovered())
    const want = world ? (busy ? 0 : 0.085) : 0
    if (aim) {
      const k = 1 - Math.exp(-2.6 * dt)
      view.az += (aim.az - view.az) * k
      view.el += (aim.el - view.el) * k
      view.spin = 0
      if (Math.abs(aim.az - view.az) + Math.abs(aim.el - view.el) < 0.003) aim = null
    } else {
      view.spin += (want - view.spin) * (1 - Math.exp(-3 * dt))
      view.az += view.spin * dt
    }
    placeCamera()
    if (!reducedMotion) {
      jelly.scale = 1 + Math.sin(clock * 1.35) * 0.008
      jelly.anchor!.target[1] = Math.sin(clock * 0.9) * 0.035
    }
    jelly.step(dt)
    syncJellyGeometry(geo)
    center.set(...jelly.center)
    frame.position.copy(center)
    frame.quaternion.set(...jelly.rotation)
    if (shadowMesh) {
      const lift = center.y
      shadowMesh.scale.setScalar(1 - lift * 1.6)
    }
    updatePins(dt)
    updateDashes(reducedMotion ? 0.5 : (clock * 0.55) % 1)
    updatePlane(dt)
    updateClouds()
    updateTrees()
    updateLabel()
    renderer.render(scene, camera)
    if (first) {
      first = false
      opts.onFirstFrame?.()
    }
  })

  return {
    setPins: (next) => setPins(next, true),
    dropPin(pin) {
      setPins([...pins.map((p) => p.pin), pin], true)
    },
    setFocus,
    dispose() {
      canvas.removeEventListener('pointermove', onCanvasMove)
      canvas.removeEventListener('pointerdown', onCanvasDown)
      canvas.removeEventListener('pointerup', onCanvasUp)
      canvas.removeEventListener('pointerleave', onCanvasLeave)
      jellyPointer.dispose()
      stage.dispose()
      for (const p of pins) disposePin(p)
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat?.dispose()
      })
      for (const g of Object.values(parts)) g.dispose()
      atlasTex?.dispose()
    },
  }
}

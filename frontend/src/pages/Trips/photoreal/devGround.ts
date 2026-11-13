import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from "three"
import type { Ground, GroundContext, GroundPalette } from "./ground"

// DEV ONLY. With no Google tiles key in a dev build, the scene stands on a
// small architect's massing model instead: a paper ground with a survey
// grid and a few thousand clay blocks laid out deterministically around the
// day's stops. It exists so the chrome, pins, route and camera can be built
// and screenshotted locally. Loaded by dynamic import behind
// `import.meta.env.DEV`, so none of it reaches a production bundle.

const PITCH = 84
const STREET = 18
const CLEARING = 62
const REACH = 1300
const HALF_MAX = 3200

interface Box {
  x0: number
  x1: number
  z0: number
  z1: number
  h: number
}

function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function layout(stops: ReadonlyArray<{ x: number; z: number }>): Box[] {
  let minX = 0
  let maxX = 0
  let minZ = 0
  let maxZ = 0
  for (const s of stops) {
    minX = Math.min(minX, s.x)
    maxX = Math.max(maxX, s.x)
    minZ = Math.min(minZ, s.z)
    maxZ = Math.max(maxZ, s.z)
  }
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const halfX = Math.min(HALF_MAX, (maxX - minX) / 2 + REACH)
  const halfZ = Math.min(HALF_MAX, (maxZ - minZ) / 2 + REACH)
  const random = mulberry(20260614)
  const boxes: Box[] = []
  const block = PITCH - STREET
  for (let gx = Math.floor((cx - halfX) / PITCH); gx <= Math.ceil((cx + halfX) / PITCH); gx++) {
    for (let gz = Math.floor((cz - halfZ) / PITCH); gz <= Math.ceil((cz + halfZ) / PITCH); gz++) {
      const x = gx * PITCH
      const z = gz * PITCH
      const roll = random()
      const split = random()
      const tall = random()
      // A slow swell so the skyline has districts rather than static.
      const district = 0.5 + 0.5 * Math.sin(x / 520 + 1.3) * Math.cos(z / 610 - 0.4)
      const mx = x + block / 2
      const mz = z + block / 2
      if (roll < 0.07) continue // a square, a park
      if (stops.some((s) => Math.hypot(s.x - mx, s.z - mz) < CLEARING)) continue
      const base = 9 + district * 22
      const parts = split < 0.3 ? 1 : split < 0.72 ? 2 : 4
      const gap = 5
      const cell = parts === 1 ? block : (block - gap) / 2
      for (let i = 0; i < parts; i++) {
        const ox = parts === 4 ? (i % 2) * (cell + gap) : parts === 2 && split < 0.5 ? i * (cell + gap) : 0
        const oz = parts === 4 ? Math.floor(i / 2) * (cell + gap) : parts === 2 && split >= 0.5 ? i * (cell + gap) : 0
        const w = parts === 2 && split >= 0.5 ? block : cell
        const d = parts === 2 && split < 0.5 ? block : cell
        const h = base * (0.55 + random() * 0.9) + (tall > 0.965 ? 30 + random() * 46 : 0)
        boxes.push({ x0: x + ox, x1: x + ox + w, z0: z + oz, z1: z + oz + d, h })
      }
    }
  }
  return boxes
}

function gridTexture(ink: string, paper: string): CanvasTexture {
  const size = 512
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext("2d")!
  g.fillStyle = paper
  g.fillRect(0, 0, size, size)
  g.strokeStyle = ink
  g.globalAlpha = 0.16
  g.lineWidth = 1.5
  g.strokeRect(0, 0, size, size)
  g.globalAlpha = 0.07
  g.lineWidth = 1
  for (let i = 1; i < 4; i++) {
    g.beginPath()
    g.moveTo((i * size) / 4, 0)
    g.lineTo((i * size) / 4, size)
    g.moveTo(0, (i * size) / 4)
    g.lineTo(size, (i * size) / 4)
    g.stroke()
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

export function createDevGround(ctx: GroundContext): Ground {
  const boxes = layout(ctx.stops)
  const group = new Group()
  group.name = "dev-ground"

  const EXTENT = 60_000
  const TILE_M = 500
  const groundMat = new MeshStandardMaterial({ roughness: 1, metalness: 0 })
  const plane = new Mesh(new PlaneGeometry(EXTENT, EXTENT), groundMat)
  plane.rotation.x = -Math.PI / 2
  plane.receiveShadow = true
  group.add(plane)

  const blockMat = new MeshStandardMaterial({ roughness: 0.92, metalness: 0 })
  const unit = new BoxGeometry(1, 1, 1)
  unit.translate(0, 0.5, 0)
  const city = new InstancedMesh(unit, blockMat, boxes.length)
  const matrix = new Matrix4()
  const shade = new Color()
  const random = mulberry(7)
  boxes.forEach((b, i) => {
    matrix.makeScale(b.x1 - b.x0, b.h, b.z1 - b.z0)
    matrix.setPosition((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2)
    city.setMatrixAt(i, matrix)
    city.setColorAt(i, shade.setScalar(0.9 + random() * 0.1))
  })
  city.castShadow = true
  city.receiveShadow = true
  city.frustumCulled = false
  group.add(city)

  // One soft shadow map over the city: this is what makes it read as a model.
  ctx.renderer.shadowMap.enabled = true
  const sun = ctx.sun
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096)
  const reach = 2600
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 100, far: 12_000 })
  sun.shadow.camera.updateProjectionMatrix()
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 1.2
  sun.shadow.radius = 3
  sun.shadow.intensity = 0.85

  let texture: CanvasTexture | null = null
  const setPalette = (p: GroundPalette) => {
    texture?.dispose()
    texture = gridTexture(p.ink, p.dark ? p.surface : p.sunken)
    texture.repeat.set(EXTENT / TILE_M, EXTENT / TILE_M)
    groundMat.map = texture
    groundMat.color.set(p.dark ? 0xffffff : 0xe9e6df)
    groundMat.needsUpdate = true
    blockMat.color.set(p.dark ? new Color(p.surface).lerp(new Color(p.ink), 0.3) : new Color(p.canvas).lerp(new Color(0xffffff), 0.8))
    ctx.invalidate()
  }
  setPalette(ctx.palette)

  const roofAt = (x: number, z: number): number => {
    for (const b of boxes) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return b.h
    return 0
  }

  return {
    group,
    update: () => {},
    busy: () => false,
    hasContent: () => true,
    progress: () => 1,
    floorAt: (x, z) => {
      const y = roofAt(x, z)
      return { distance: 8000 - y, point: { x, y, z }, normal: { x: 0, y: 1, z: 0 } }
    },
    blocked(from, to) {
      const dx = to.x - from.x
      const dy = to.y - from.y
      const dz = to.z - from.z
      for (const b of boxes) {
        // Slab test of the segment against the block.
        let t0 = 0
        let t1 = 0.97
        const axes: Array<[number, number, number, number]> = [
          [from.x, dx, b.x0, b.x1],
          [from.y, dy, 0, b.h],
          [from.z, dz, b.z0, b.z1],
        ]
        let hit = true
        for (const [o, d, lo, hi] of axes) {
          if (Math.abs(d) < 1e-9) {
            if (o < lo || o > hi) hit = false
          } else {
            const a = (lo - o) / d
            const c = (hi - o) / d
            t0 = Math.max(t0, Math.min(a, c))
            t1 = Math.min(t1, Math.max(a, c))
            if (t0 > t1) hit = false
          }
          if (!hit) break
        }
        if (hit) return true
      }
      return false
    },
    resize: () => {},
    setErrorTarget: () => {},
    setPalette,
    setSun(dir) {
      sun.position.set(dir.x * 6000, dir.y * 6000, dir.z * 6000)
      sun.target.position.set(0, 0, 0)
      sun.target.updateMatrixWorld()
    },
    attribution: () => "Dev ground · no map tiles key in this build",
    dispose() {
      ctx.renderer.shadowMap.enabled = false
      sun.castShadow = false
      sun.shadow.map?.dispose()
      plane.geometry.dispose()
      groundMat.dispose()
      texture?.dispose()
      unit.dispose()
      blockMat.dispose()
      city.dispose()
    },
  }
}

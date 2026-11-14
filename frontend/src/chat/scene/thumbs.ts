/**
 * The toy box's pictures: each toy drawn as the real 3D model.
 *
 * One small renderer serves every card. A toy is rendered once into the
 * shared canvas and copied to the card's own 2D canvas; the copy is kept, so
 * reopening the box costs nothing. Stills are made one per frame (the first
 * render of a look compiles its shaders), and only the card under the pointer
 * or with focus is animated: it turns once round and settles.
 */
import * as THREE from 'three/webgpu'
import type { ItemSpec } from '../world/spec'
import { Fixture, fixtureKind } from './fixtures'
import { buildItemModel, createItemMaterials } from './items'
import { createLimUniforms, inkOf } from './limLook'

/** Card picture size in CSS pixels. */
export const THUMB = 64
const FOV = 26
/** The three-quarter view a toy rests at. */
const REST = -0.5
const TURN = 1.6 // seconds per turn

export type Thumbs = {
  /** Show `spec` in `canvas` (now if it has been drawn before, else when its turn comes). Returns the undo. */
  mount(canvas: HTMLCanvasElement, spec: ItemSpec): () => void
  /** Turn this card's toy round; null lets it finish the turn and rest. */
  spin(canvas: HTMLCanvasElement | null): void
  setNight(night: boolean): void
  dispose(): void
}

type Model = { pivot: THREE.Group; radius: number; dispose(): void }

export async function createThumbs(opts: { night: boolean; reducedMotion: boolean }): Promise<Thumbs> {
  const px = Math.round(THUMB * Math.min(2, window.devicePixelRatio || 1))
  const gl = document.createElement('canvas')
  gl.width = gl.height = px
  const renderer = new THREE.WebGPURenderer({ canvas: gl, antialias: true, alpha: true })
  renderer.setPixelRatio(1)
  renderer.setSize(px, px, false)
  renderer.toneMapping = THREE.NoToneMapping
  renderer.setClearColor(0x000000, 0)
  await renderer.init()

  const u = createLimUniforms(opts.night)
  const ink = inkOf(u)
  const mats = createItemMaterials(u, ink)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 40)
  const models = new Map<string, Model>()
  const stills = new Map<string, HTMLCanvasElement>()
  const cards = new Map<HTMLCanvasElement, ItemSpec>()
  const queue: HTMLCanvasElement[] = []
  const box = new THREE.Box3()
  const centre = new THREE.Vector3()
  const span = new THREE.Vector3()
  let disposed = false
  let raf = 0
  let turning: { canvas: HTMLCanvasElement; angle: number; stop: boolean } | null = null
  let last = 0

  const modelOf = (spec: ItemSpec): Model => {
    const known = models.get(spec.name)
    if (known) return known
    const pivot = new THREE.Group()
    let dispose: () => void
    if (fixtureKind(spec)) {
      const f = new Fixture(spec, u, ink)
      f.place(0, 1.7)
      // Face the opening toward the viewer's left, like on the stage.
      pivot.add(f.group)
      dispose = () => f.dispose()
    } else {
      const m = buildItemModel(spec, u, mats)
      pivot.add(m.group)
      dispose = () => m.dispose()
    }
    pivot.updateMatrixWorld(true)
    box.setFromObject(pivot)
    box.getCenter(centre)
    box.getSize(span)
    // Turn about the middle of the thing.
    pivot.children[0].position.sub(centre)
    pivot.traverse((o) => (o.frustumCulled = false))
    pivot.visible = false
    scene.add(pivot)
    // It must stay in frame all the way round.
    const model = { pivot, radius: Math.max(0.12, Math.hypot(span.x, span.z) / 2, span.y / 2) * 1.12, dispose }
    models.set(spec.name, model)
    return model
  }

  const render = (spec: ItemSpec, angle: number) => {
    const m = modelOf(spec)
    for (const other of models.values()) other.pivot.visible = other === m
    m.pivot.rotation.y = angle
    const d = m.radius / Math.sin(THREE.MathUtils.degToRad(FOV / 2))
    camera.position.set(0, d * 0.22, d * 0.975)
    camera.lookAt(0, 0, 0)
    renderer.render(scene, camera)
  }
  const copy = (to: HTMLCanvasElement, from: HTMLCanvasElement) => {
    if (to.width !== px) to.width = to.height = px
    const ctx = to.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, px, px)
    ctx.drawImage(from, 0, 0, px, px)
  }
  const stillOf = (spec: ItemSpec) => {
    let still = stills.get(spec.name)
    if (!still) {
      render(spec, REST)
      still = document.createElement('canvas')
      copy(still, gl)
      stills.set(spec.name, still)
    }
    return still
  }

  const frame = (now: number) => {
    raf = 0
    if (disposed) return
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0)
    last = now
    if (turning) {
      const spec = cards.get(turning.canvas)
      if (!spec) turning = null
      else {
        const before = turning.angle
        turning.angle += ((Math.PI * 2) / TURN) * dt
        // Asked to stop: carry on to the front and rest there.
        const lap = Math.PI * 2
        if (turning.stop && Math.floor(turning.angle / lap) > Math.floor(before / lap)) {
          copy(turning.canvas, stillOf(spec))
          turning = null
        } else {
          render(spec, REST + turning.angle)
          copy(turning.canvas, gl)
        }
      }
    }
    // One new still a frame.
    const next = queue.shift()
    if (next) {
      const spec = cards.get(next)
      if (spec && next !== turning?.canvas) copy(next, stillOf(spec))
    }
    if (turning || queue.length) raf = requestAnimationFrame(frame)
    else last = 0
  }
  const wake = () => {
    if (!raf && !disposed) raf = requestAnimationFrame(frame)
  }

  return {
    mount(canvas, spec) {
      cards.set(canvas, spec)
      const still = stills.get(spec.name)
      if (still) copy(canvas, still)
      else {
        queue.push(canvas)
        wake()
      }
      return () => {
        cards.delete(canvas)
        if (turning?.canvas === canvas) turning = null
      }
    },
    spin(canvas) {
      if (opts.reducedMotion) return
      if (!canvas) {
        if (turning) turning.stop = true
        return
      }
      if (turning?.canvas === canvas) {
        turning.stop = false
        return
      }
      // The one that was turning snaps home.
      if (turning) {
        const spec = cards.get(turning.canvas)
        if (spec) copy(turning.canvas, stillOf(spec))
      }
      if (!cards.has(canvas)) return
      turning = { canvas, angle: 0, stop: false }
      wake()
    },
    setNight(night) {
      const v = night ? 1 : 0
      if (u.night.value === v) return
      u.night.value = v
      stills.clear()
      queue.length = 0
      queue.push(...cards.keys())
      wake()
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      for (const m of models.values()) m.dispose()
      models.clear()
      stills.clear()
      cards.clear()
      renderer.dispose()
    },
  }
}

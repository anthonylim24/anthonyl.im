/**
 * Pointer play for Jelly bodies: grab a patch of the surface and stretch or
 * fling it (mouse/pen, or touch when `touchDrag` is on), tap to poke. Links,
 * buttons and form fields under the pointer are left alone.
 */
import * as THREE from 'three/webgpu'
import type { Jelly, Vec3 } from './jelly'

export type JellyPointerOptions = {
  host: HTMLElement
  camera: THREE.Camera
  bodies: Jelly[]
  reducedMotion: boolean
  /**
   * Let touch drag the body. A touch that lands on a body doesn't scroll the
   * page; touches elsewhere still do.
   */
  touchDrag?: boolean
  /** Grab patch radius as a fraction of body radius. */
  grabRadius?: number
  /** Hit sphere around each body, as a multiple of its mean radius. */
  pickScale?: number
  /** How firmly the grabbed patch follows the pointer (0..1 per substep). */
  grip?: number
  pokeStrength?: number
  onPoke?: (body: Jelly, point: Vec3) => void
  onGrab?: (body: Jelly) => void
  onRelease?: (body: Jelly) => void
}

export type JellyPointer = {
  /** Pointer in NDC and whether it is over the host. */
  readonly pointer: { ndc: THREE.Vector2; inside: boolean }
  /** Body currently under the pointer (null if none). */
  hovered(): Jelly | null
  grabbing(): Jelly | null
  dispose(): void
}

const isControl = (t: EventTarget | null) =>
  t instanceof Element && Boolean(t.closest('a, button, input, textarea, select, label, [role="button"], [data-no-jelly]'))

export function bindJellyPointer(opts: JellyPointerOptions): JellyPointer {
  const { host, camera, bodies, reducedMotion } = opts
  const grabRadius = opts.grabRadius ?? 0.85
  const pokeStrength = opts.pokeStrength ?? 4
  const pickScale = opts.pickScale ?? 1.08
  const grip = opts.grip ?? 0.28
  const pointer = { ndc: new THREE.Vector2(), inside: false }
  const ray = new THREE.Raycaster()
  const sphere = new THREE.Sphere()
  const hit = new THREE.Vector3()
  const plane = new THREE.Plane()
  const onPlane = new THREE.Vector3()
  let drag: {
    id: number
    body: Jelly
    start: THREE.Vector3
    pins: { i: number; offset: Vec3; k: number }[]
    /** Screen position at grab, and the furthest the pointer has strayed from it. */
    x0: number
    y0: number
    moved: number
  } | null = null

  const setPointer = (e: PointerEvent) => {
    const r = host.getBoundingClientRect()
    pointer.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    pointer.inside = true
    ray.setFromCamera(pointer.ndc, camera)
  }

  const pick = (): { body: Jelly; point: THREE.Vector3 } | null => {
    let best: { body: Jelly; point: THREE.Vector3 } | null = null
    let bestD = Infinity
    for (const body of bodies) {
      sphere.center.set(...body.center)
      sphere.radius = body.radius * pickScale
      if (!ray.ray.intersectSphere(sphere, hit)) continue
      const d = hit.distanceTo(ray.ray.origin)
      if (d < bestD) {
        bestD = d
        best = { body, point: hit.clone() }
      }
    }
    return best
  }

  const poke = (body: Jelly, point: THREE.Vector3, strength = 1) => {
    const dir = ray.ray.direction
    const s = pokeStrength * strength * body.radius
    body.impulse([point.x, point.y, point.z], [dir.x * s, dir.y * s, dir.z * s], body.radius * 0.7)
    opts.onPoke?.(body, [point.x, point.y, point.z])
  }

  const onMove = (e: PointerEvent) => {
    setPointer(e)
    if (drag && e.pointerId === drag.id) {
      // movementX/Y read 0 for touch in some browsers, so measure from the grab point.
      drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0))
      if (ray.ray.intersectPlane(plane, onPlane)) {
        for (const pin of drag.pins) {
          drag.body.pin(pin.i, [onPlane.x + pin.offset[0], onPlane.y + pin.offset[1], onPlane.z + pin.offset[2]], pin.k)
        }
      }
      return
    }
    if (!reducedMotion && e.pointerType === 'mouse') host.style.cursor = pick() && !isControl(e.target) ? 'grab' : ''
  }

  const onDown = (e: PointerEvent) => {
    if (reducedMotion || isControl(e.target) || e.button > 0) return
    setPointer(e)
    const found = pick()
    if (!found) return
    if (e.pointerType === 'touch' && !opts.touchDrag) {
      poke(found.body, found.point, 0.9)
      return
    }
    e.preventDefault()
    const { body, point } = found
    camera.getWorldDirection(onPlane)
    plane.setFromNormalAndCoplanarPoint(onPlane.negate(), point)
    const r = body.radius * grabRadius
    const pins = body.within([point.x, point.y, point.z], r).map((i) => {
      const d = Math.hypot(body.x[i * 3] - point.x, body.x[i * 3 + 1] - point.y, body.x[i * 3 + 2] - point.z)
      return {
        i,
        offset: [body.x[i * 3] - point.x, body.x[i * 3 + 1] - point.y, body.x[i * 3 + 2] - point.z] as Vec3,
        k: grip * (1 - d / r) ** 3 + 0.004,
      }
    })
    drag = { id: e.pointerId, body, start: point.clone(), pins, x0: e.clientX, y0: e.clientY, moved: 0 }
    host.setPointerCapture(e.pointerId)
    host.style.cursor = 'grabbing'
    opts.onGrab?.(body)
  }

  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    const { body, start, moved } = drag
    body.unpinAll()
    if (moved < 6) poke(body, start)
    opts.onRelease?.(body)
    drag = null
    host.style.cursor = ''
    if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId)
  }
  const onLeave = () => {
    pointer.inside = false
  }
  // Pointer events can't stop a touch from panning the page; a non-passive
  // touchstart can, so a finger on the body drags it instead of scrolling.
  const onTouchStart = (e: TouchEvent) => {
    if (reducedMotion || isControl(e.target) || e.touches.length > 1) return
    const t = e.touches[0]
    const r = host.getBoundingClientRect()
    pointer.ndc.set(((t.clientX - r.left) / r.width) * 2 - 1, -((t.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(pointer.ndc, camera)
    if (pick()) e.preventDefault()
  }

  host.addEventListener('pointermove', onMove)
  host.addEventListener('pointerdown', onDown)
  host.addEventListener('pointerup', onUp)
  host.addEventListener('pointercancel', onUp)
  host.addEventListener('pointerleave', onLeave)
  if (opts.touchDrag) host.addEventListener('touchstart', onTouchStart, { passive: false })

  return {
    pointer,
    hovered: () => (pointer.inside ? (ray.setFromCamera(pointer.ndc, camera), pick()?.body ?? null) : null),
    grabbing: () => drag?.body ?? null,
    dispose() {
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerdown', onDown)
      host.removeEventListener('pointerup', onUp)
      host.removeEventListener('pointercancel', onUp)
      host.removeEventListener('pointerleave', onLeave)
      host.removeEventListener('touchstart', onTouchStart)
      host.style.cursor = ''
    },
  }
}

import * as THREE from 'three/webgpu'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Jelly, icosphere } from '../jelly'
import { bindJellyPointer, type JellyPointer } from '../jellyPointer'

/** A unit jelly ball at the origin seen square-on, where host pixel x maps to world x = px / 25 - 2. */
function setup() {
  const host = document.createElement('div')
  host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100)
  camera.position.set(0, 0, 5)
  camera.updateMatrixWorld()
  const body = new Jelly(icosphere(1, 2).positions)
  const onGrab = vi.fn()
  const pointer = bindJellyPointer({ host, camera, bodies: [body], reducedMotion: false, onGrab })
  const down = (x: number) => host.dispatchEvent(new PointerEvent('pointerdown', { clientX: (x + 2) * 25, clientY: 50, pointerId: 1, button: 0, pointerType: 'mouse' }))
  const move = (x: number) => host.dispatchEvent(new PointerEvent('pointermove', { clientX: (x + 2) * 25, clientY: 50, pointerId: 1, pointerType: 'mouse' }))
  return { body, onGrab, pointer, down, move }
}

let bound: JellyPointer | null = null
afterEach(() => bound?.dispose())

describe('bindJellyPointer', () => {
  it('grabs a body near its edge but not the air beside it', () => {
    const { onGrab, pointer, down } = setup()
    bound = pointer
    down(1.2)
    expect(onGrab).not.toHaveBeenCalled()
    down(0.95)
    expect(onGrab).toHaveBeenCalledOnce()
  })

  it('holds the body where it was grabbed until the pointer moves', () => {
    const { body, pointer, down, move } = setup()
    bound = pointer
    const pin = vi.spyOn(body, 'pin')
    down(0.95)
    move(0.95)
    expect(pin).toHaveBeenCalled()
    for (const [i, target] of pin.mock.calls) {
      expect(target[0]).toBeCloseTo(body.x[i * 3], 5)
      expect(target[1]).toBeCloseTo(body.x[i * 3 + 1], 5)
      expect(target[2]).toBeCloseTo(body.x[i * 3 + 2], 5)
    }
  })
})

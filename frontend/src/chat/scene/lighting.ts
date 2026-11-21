/**
 * The lit look's studio, matched to the Blender renders (`art/studio.py`): Poly Haven's CC0
 * `studio_small_08` for reflections and ambient, one large warm key from the upper left that casts
 * the only shadows, a broad front light, a cool fill and a rim. The shadows fall on a catcher over
 * the floor, so the floor keeps its own colours. Night dims the room and cools it.
 *
 * Phones on WebGL2 (iOS before WebGPU, older Android) get no shadow map: the iOS Simulator's WebGL2
 * fails the shadow test everywhere, greying the whole floor, and no such phone was at hand to show
 * otherwise. Their toys keep the blob contact shadows at full strength instead.
 */
import * as THREE from 'three/webgpu'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { PAL } from './limLook'
import studioUrl from './studio.hdr?url'

export type Lighting = {
  /** The environment has arrived (until then the lights alone light the stage). */
  ready: Promise<void>
  /** The key casts real shadows (otherwise the blobs carry the contact). */
  readonly shadows: boolean
  /** 0 by day, 1 by night, anything between while the lights change. */
  update(night: number): void
  dispose(): void
}

// Bright and cartoonish: a strong ambient and fill keep the shadow sides light, as an animated short would.
const DAY = { env: 0.78, key: 1.6, front: 0.55, fill: 0.38, rim: 0.8 }
const NIGHT = { env: 0.34, key: 0.85, front: 0.5, fill: 0.35, rim: 1.4 }

export function createLighting(scene: THREE.Scene, renderer: THREE.WebGPURenderer, { mobile, shadows }: { mobile: boolean; shadows: boolean }): Lighting {
  renderer.shadowMap.enabled = shadows
  renderer.shadowMap.type = THREE.PCFShadowMap
  const lights = new THREE.Group()
  const light = (hex: string, at: [number, number, number]) => {
    const l = new THREE.DirectionalLight(hex, 1)
    l.position.set(...at)
    lights.add(l, l.target)
    return l
  }
  const key = light('#FFF3E6', [-3.6, 10.4, 4.8])
  const front = light('#FFF4E8', [0.8, 3.2, 8.4])
  const fill = light('#E4ECFF', [7.6, 2.8, 5.2])
  const rim = light('#FFFFFF', [2.4, 6, -7.6])
  key.castShadow = shadows
  key.shadow.mapSize.setScalar(mobile ? 1024 : 2048)
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 6, bottom: -5, near: 1, far: 30 })
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.03
  key.shadow.radius = 5
  scene.add(lights)

  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.ShadowNodeMaterial({ color: new THREE.Color(PAL.shadow), opacity: 0.34, depthWrite: false }))
  catcher.rotation.x = -Math.PI / 2
  catcher.position.set(0, -0.04, 3)
  catcher.receiveShadow = true
  catcher.renderOrder = 1
  catcher.visible = shadows
  scene.add(catcher)

  const dayKey = new THREE.Color('#FFF3E6')
  const nightKey = new THREE.Color('#A9A0FF')
  let env: THREE.Texture | null = null
  const ready = new HDRLoader().loadAsync(studioUrl).then((tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping
    env = tex
    scene.environment = tex
    scene.environmentRotation.set(0, THREE.MathUtils.degToRad(200), 0)
  })

  return {
    ready,
    shadows,
    update(night) {
      const k = (a: number, b: number) => a + (b - a) * night
      scene.environmentIntensity = k(DAY.env, NIGHT.env)
      key.intensity = k(DAY.key, NIGHT.key)
      key.color.copy(dayKey).lerp(nightKey, night)
      front.intensity = k(DAY.front, NIGHT.front)
      fill.intensity = k(DAY.fill, NIGHT.fill)
      rim.intensity = k(DAY.rim, NIGHT.rim)
      ;(catcher.material as THREE.ShadowNodeMaterial).opacity = k(0.34, 0.6)
    },
    dispose() {
      scene.remove(lights, catcher)
      key.shadow.dispose()
      catcher.geometry.dispose()
      ;(catcher.material as THREE.Material).dispose()
      env?.dispose()
      if (scene.environment === env) scene.environment = null
    },
  }
}

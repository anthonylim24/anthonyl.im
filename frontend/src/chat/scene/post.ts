/**
 * The lit look's screen-space passes, one rung at a time (see `quality.ts`):
 *
 *   lit  the scene with 4× MSAA and a soft bloom
 *   ao   + ground-truth ambient occlusion, resolved with TRAA
 *   ssr  + screen-space reflections (the studio floor and glossy toys)
 *   gi   SSGI in place of the AO: one bounce of colour, toys tinting the floor and Lim
 *
 * Without motion (reduced motion renders on demand) nothing temporal runs: the scene keeps MSAA.
 */
import * as THREE from 'three/webgpu'
import { diffuseColor, float, Fn, metalness, mix, mrt, normalView, output, packNormalToRGB, pass, sample, unpackRGBToNormal, vec3, vec4, velocity } from 'three/tsl'
import type { Node, NodeBuilder } from 'three/webgpu'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { ao } from 'three/addons/tsl/display/GTAONode.js'
import { ssgi } from 'three/addons/tsl/display/SSGINode.js'
import { ssr } from 'three/addons/tsl/display/SSRNode.js'
import { traa } from 'three/addons/tsl/display/TRAANode.js'
import type { Rung } from './quality'

export type Post = {
  readonly rung: Rung
  setRung(rung: Rung): void
  render(): void
  dispose(): void
}

type Disposable = { dispose(): void }

/**
 * A screen-space input only surfaces write. Mist, light beams, weather and blob shadows draw over
 * the stage without writing depth; under their material's blending a zero leaves the surface
 * behind them in the normals, the colours and the motion.
 */
const solid = (node: Node<'vec4'>) =>
  Fn(({ material }: NodeBuilder) => (material.transparent && !material.depthWrite ? vec4(0) : node))() as unknown as Node<'vec4'>

/** What GI tints and how much SSR reflects. Unlit surfaces (the floor, the sky, painted scenery) already show their final colour and take no bounce. */
const bounce = Fn(({ material }: NodeBuilder) => vec4((material as THREE.NodeMaterial).lights ? diffuseColor.rgb : vec3(0), metalness))() as unknown as Node<'vec4'>

export function createPost(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  { rung: first, temporal, mobile }: { rung: Rung; temporal: boolean; mobile: boolean },
): Post {
  const pipeline = new THREE.RenderPipeline(renderer)
  let owned: Disposable[] = []
  let rung = first

  const build = (r: Rung): Node<'vec4'> => {
    for (const n of owned) n.dispose()
    owned = []
    const screen = r !== 'lit'
    const scenePass = pass(scene, camera, { samples: screen && temporal ? 0 : 4 })
    owned.push(scenePass)
    const color = scenePass.getTextureNode('output')
    let out: Node<'vec4'> = color
    if (screen) {
      // WebGPU allows 32 bytes of colour targets per pixel, and every target here costs 8: a
      // surface's diffuse colour and its reflectivity (its metalness) share one.
      const surface = r === 'ssr' || r === 'gi'
      const targets = mrt({
        output,
        normal: solid(vec4(packNormalToRGB(normalView), 1)),
        ...(temporal ? { velocity: solid(vec4(velocity as unknown as Node<'vec2'>, 0, 1)) } : null),
        ...(surface ? { material: solid(bounce) } : null),
      })
      for (const name of ['normal', 'velocity', 'material']) {
        targets.setBlendMode(name, new THREE.BlendMode(THREE.MaterialBlending))
        targets.setClearColor(name, new THREE.Color(0, 0, 0), 0)
      }
      scenePass.setMRT(targets)
      scenePass.getTexture('normal').type = THREE.UnsignedByteType
      if (surface) scenePass.getTexture('material').type = THREE.UnsignedByteType
      const depth = scenePass.getTextureNode('depth')
      const normalTex = scenePass.getTextureNode('normal')
      const normal = sample((uv) => unpackRGBToNormal(normalTex.sample(uv)))
      if (r === 'gi') {
        const gi = ssgi(color, depth, normal, camera)
        gi.sliceCount.value = mobile ? 1 : 2
        gi.stepCount.value = mobile ? 8 : 10
        gi.radius.value = 2
        gi.giIntensity.value = 1.5
        // A toy box, not a cave: occlusion marks a contact, it never greys a whole side.
        gi.aoIntensity.value = 0.45
        gi.resolutionScale = mobile ? 0.5 : 1
        gi.useTemporalFiltering = temporal
        owned.push(gi)
        out = vec4(color.rgb.mul(gi.getAONode()).add(scenePass.getTextureNode('material').rgb.mul(gi.getGINode().rgb)), color.a)
      } else {
        const occlusion = ao(depth, normal, camera)
        occlusion.resolutionScale = 0.5
        occlusion.radius.value = 0.45
        occlusion.samples.value = mobile ? 8 : 12
        occlusion.useTemporalFiltering = temporal
        owned.push(occlusion)
        // At full strength GTAO dims whole curved bodies, not just their contact; the renders keep the colours bright.
        out = vec4(color.rgb.mul(mix(float(1), occlusion.getTextureNode().r, 0.3)), color.a)
      }
      if (surface) {
        const reflect = ssr(color, depth, normal, { metalnessNode: scenePass.getTextureNode('material').a, roughnessNode: float(0.06), camera })
        reflect.resolutionScale = 0.5
        reflect.maxDistance.value = 6
        reflect.thickness.value = 0.04
        owned.push(reflect)
        // The reflection arrives already weighted by reflectivity, distance and angle (its alpha is the hit distance).
        // It is screened on, not added: the floor is already near white in display colours, and an added
        // reflection clips every channel there, leaving a white ghost instead of a tint.
        out = vec4(out.rgb.add(reflect.getTextureNode().rgb.mul(vec3(out.a).sub(out.rgb).max(0))), out.a)
      }
    }
    const glow = bloom(out, 0.4, 0.5, 1)
    owned.push(glow)
    out = vec4(out.rgb.add(glow.rgb), out.a)
    if (screen && temporal) {
      const resolved = traa(out, scenePass.getTextureNode('depth'), scenePass.getTextureNode('velocity'), camera)
      owned.push(resolved)
      // TRAA writes an opaque alpha, so the frame's own goes back on (the canvas is clear where the scene isn't).
      // Its colour is averaged over jittered frames and can outrun that alpha where the floor fades out; a
      // premultiplied pixel brighter than its alpha is invalid, and WebKit smears it along the row.
      out = vec4((resolved as unknown as Node<'vec4'>).rgb.min(vec3(color.a)), color.a)
    }
    return out
  }

  pipeline.outputNode = build(rung)
  return {
    get rung() {
      return rung
    },
    setRung(next) {
      if (next === rung) return
      rung = next
      pipeline.outputNode = build(next)
      pipeline.needsUpdate = true
    },
    render() {
      pipeline.render()
    },
    dispose() {
      for (const n of owned) n.dispose()
      owned = []
      pipeline.dispose()
    },
  }
}

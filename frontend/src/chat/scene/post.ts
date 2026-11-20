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
import { diffuseColor, float, metalness, mix, mrt, normalView, output, packNormalToRGB, pass, sample, unpackRGBToNormal, vec4, velocity } from 'three/tsl'
import type { Node } from 'three/webgpu'
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
      scenePass.setMRT(mrt({
        output,
        normal: packNormalToRGB(normalView),
        ...(temporal ? { velocity } : null),
        ...(surface ? { material: vec4(diffuseColor.rgb, metalness) } : null),
      }))
      scenePass.getTexture('normal').type = THREE.UnsignedByteType
      if (surface) scenePass.getTexture('material').type = THREE.UnsignedByteType
      const depth = scenePass.getTextureNode('depth')
      const normalTex = scenePass.getTextureNode('normal')
      const normal = sample((uv) => unpackRGBToNormal(normalTex.sample(uv)))
      if (r === 'gi') {
        const gi = ssgi(color, depth, normal, camera)
        gi.sliceCount.value = mobile ? 1 : 2
        gi.stepCount.value = mobile ? 8 : 10
        gi.radius.value = 4
        gi.giIntensity.value = 0.15
        gi.aoIntensity.value = 1.4
        gi.resolutionScale = mobile ? 0.5 : 1
        gi.useTemporalFiltering = temporal
        owned.push(gi)
        out = vec4(color.rgb.mul(gi.a).add(scenePass.getTextureNode('material').rgb.mul(gi.rgb)), color.a)
      } else {
        const occlusion = ao(depth, normal, camera)
        occlusion.resolutionScale = 0.5
        occlusion.radius.value = 0.45
        occlusion.samples.value = mobile ? 8 : 12
        occlusion.useTemporalFiltering = temporal
        owned.push(occlusion)
        out = vec4(color.rgb.mul(occlusion.getTextureNode().r), color.a)
      }
      if (surface) {
        const reflect = ssr(color, depth, normal, { metalnessNode: scenePass.getTextureNode('material').a, roughnessNode: float(0.06), camera })
        reflect.resolutionScale = 0.5
        reflect.maxDistance.value = 6
        reflect.thickness.value = 0.04
        owned.push(reflect)
        // Mixed in by the reflection's own weight; `blendColor` would divide by a zero alpha where the canvas is clear.
        const hit = reflect.getTextureNode()
        out = vec4(mix(out.rgb, hit.rgb, hit.a), out.a)
      }
    }
    const glow = bloom(out, 0.4, 0.5, 1)
    owned.push(glow)
    out = vec4(out.rgb.add(glow.rgb), out.a)
    if (screen && temporal) {
      const resolved = traa(out, scenePass.getTextureNode('depth'), scenePass.getTextureNode('velocity'), camera)
      owned.push(resolved)
      // TRAA writes an opaque alpha; the canvas is clear wherever the scene was.
      out = vec4((resolved as unknown as Node<'vec4'>).rgb, color.a)
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

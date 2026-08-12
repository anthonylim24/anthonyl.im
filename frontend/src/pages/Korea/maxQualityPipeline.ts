// Max Quality HDR pipeline for Detailed-3D Map Mode.
//
// Pipeline (when toggled on):
//
//   scene              →  HDR RT (HalfFloat, no MSAA — iOS HalfFloat+MSAA is buggy)
//                    ↑
//   clouds (half-res)─┘  (composited as a transparent overlay)
//                    ↓
//                  Bloom (UnrealBloomPass internally half-res of composer)
//                    ↓
//             Grade shader (CDL + split-tone + vignette + grain)
//                    ↓
//                 OutputPass (sRGB encode; NoToneMapping — tiles are LDR)
//                    ↓
//                   SMAA (edge detection on LDR sRGB)
//                    ↓
//                 default framebuffer
//
// Photogrammetry is already tonemapped at source. We never run AgX/ACES
// over it — that was the washed-out gray look. Grade is the only look
// control; OutputPass only encodes. God rays are a separate path: when
// Max Quality is on we do not construct them (VRAM + compile hitch).

import {
  HalfFloatType,
  NoToneMapping,
  RGBAFormat,
  type PerspectiveCamera,
  type Scene,
  type ToneMapping,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js"
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js"
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js"
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js"
import { gradeKindAt, type GradeKind } from "./timeOfDayGrade"
import { VolumetricClouds } from "./volumetricClouds"
import {
  GRADE_APPLY_GLSL,
  GRADE_UNIFORMS_GLSL,
  gradeParamsAt,
  writeGradeUniforms,
  type GradeUniformBag,
} from "./mapGrade"
import type { QualityLod } from "./adaptiveQuality"

// Bloom thresholds per phase. Threshold >1.0 by day so only HDR
// overshoot (sun) glows; threshold ≤0.7 at night so neon + window
// lights bloom even though they're not over 1.0. Strength is kept
// modest — UnrealBloom at half-res is the fill-rate budget for 120 Hz.
const BLOOM: Record<GradeKind, { threshold: number; strength: number; radius: number }> = {
  night:     { threshold: 0.75, strength: 0.38, radius: 0.40 },
  dawn:      { threshold: 0.95, strength: 0.28, radius: 0.36 },
  morning:   { threshold: 1.20, strength: 0.12, radius: 0.28 },
  midday:    { threshold: 1.25, strength: 0.10, radius: 0.28 },
  afternoon: { threshold: 1.10, strength: 0.18, radius: 0.32 },
  dusk:      { threshold: 0.95, strength: 0.28, radius: 0.36 },
  evening:   { threshold: 0.85, strength: 0.32, radius: 0.38 },
}

// Cloud composite — alpha-blends the half-res cloud RT on top of the
// HDR scene buffer. Inserted between RenderPass and bloom.
const CLOUD_COMPOSITE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const CLOUD_COMPOSITE_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform sampler2D tClouds;
  void main() {
    vec4 scene = texture2D(tDiffuse, vUv);
    vec4 clouds = texture2D(tClouds, vUv);
    // Standard alpha-over composite.
    gl_FragColor = vec4(scene.rgb * (1.0 - clouds.a) + clouds.rgb, 1.0);
  }
`

const CloudCompositeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tClouds: { value: null },
  },
  vertexShader: CLOUD_COMPOSITE_VERTEX,
  fragmentShader: CLOUD_COMPOSITE_FRAGMENT,
}

// Filmic grade: exposure / CDL / split-tone / vignette / grain.
// Shared with the god-rays composite so both paths match.
const GRADE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const GRADE_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  ${GRADE_UNIFORMS_GLSL}
  ${GRADE_APPLY_GLSL}
  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    gl_FragColor = vec4(applyGrade(c.rgb, vUv), c.a);
  }
`

const GradeToneShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.0 },
    uContrast: { value: 1.0 },
    uSaturation: { value: 1.0 },
    uLift: { value: new Vector3(0, 0, 0) },
    uGamma: { value: new Vector3(1, 1, 1) },
    uGain: { value: new Vector3(1, 1, 1) },
    uShadowTint: { value: new Vector3(1, 1, 1) },
    uHighlightTint: { value: new Vector3(1, 1, 1) },
    uVignette: { value: 0.08 },
    uGrain: { value: 0.0 },
    uShoulder: { value: 0.06 },
    uGradeTime: { value: 0.0 },
  },
  vertexShader: GRADE_VERTEX,
  fragmentShader: GRADE_FRAGMENT,
}

export interface MaxQualityPipelineOptions {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  size: { w: number; h: number }
  reducedMotion: boolean
}

export class MaxQualityPipeline {
  private renderer: WebGLRenderer
  private composer: EffectComposer
  private renderPass: RenderPass
  private bloom: UnrealBloomPass
  private grade: ShaderPass
  private smaa: SMAAPass
  private cloudComposite: ShaderPass
  private output: OutputPass
  readonly clouds: VolumetricClouds
  private prevToneMapping: ToneMapping
  private prevToneExposure: number
  private prevOutputColorSpace: string
  private reducedMotion: boolean
  private grainEnabled: boolean

  constructor(opts: MaxQualityPipelineOptions) {
    this.renderer = opts.renderer
    this.reducedMotion = opts.reducedMotion
    this.grainEnabled = !opts.reducedMotion
    // Stash existing renderer state so dispose() can restore it
    // cleanly when the user toggles Max Quality off.
    this.prevToneMapping = this.renderer.toneMapping
    this.prevToneExposure = this.renderer.toneMappingExposure
    this.prevOutputColorSpace = this.renderer.outputColorSpace
    // NoToneMapping (passthrough) rather than AgX or ACES — the Google
    // Photorealistic tiles ship as LDR (already tonemapped at source),
    // so running a filmic curve over them again compresses midtones
    // and produces the "gray washed-out" look. The GradeTone shader
    // is the only color/exposure controller in this pipeline.
    this.renderer.toneMapping = NoToneMapping
    this.renderer.toneMappingExposure = 1.0
    // sRGB output for the OutputPass to gamma-encode correctly.
    this.renderer.outputColorSpace = "srgb" as typeof this.renderer.outputColorSpace

    const dpr = this.renderer.getPixelRatio()
    const w = Math.max(1, Math.floor(opts.size.w * dpr))
    const h = Math.max(1, Math.floor(opts.size.h * dpr))

    // HDR render target — HalfFloat for highlights past 1.0.
    // `samples` (MSAA on HalfFloat RT) is deliberately 0: iOS 17
    // Safari has driver bugs that combine MSAA + HalfFloat into a
    // black or solid-tinted output. SMAA at the end of the chain
    // handles edge aliasing instead.
    const hdrRT = new WebGLRenderTarget(w, h, {
      type: HalfFloatType,
      format: RGBAFormat,
      samples: 0,
    })
    this.composer = new EffectComposer(this.renderer, hdrRT)

    // 1) Scene render → HDR RT.
    this.renderPass = new RenderPass(opts.scene, opts.camera)
    this.composer.addPass(this.renderPass)

    // 2) Clouds composite — alpha-over on top of the scene buffer.
    this.clouds = new VolumetricClouds({
      renderer: this.renderer,
      camera: opts.camera,
      size: opts.size,
    })
    this.clouds.setReducedMotion(opts.reducedMotion)
    this.cloudComposite = new ShaderPass(CloudCompositeShader)
    this.cloudComposite.uniforms.tClouds.value = this.clouds.texture
    this.composer.addPass(this.cloudComposite)

    // 3) Bloom — UnrealBloomPass internally half-res of the composer
    //    drawing buffer. Do not pre-halve the constructor size; the
    //    composer's setSize() overwrites it with device pixels.
    this.bloom = new UnrealBloomPass(new Vector2(opts.size.w, opts.size.h), 0.4, 0.5, 1.0)
    this.composer.addPass(this.bloom)

    // 4) Filmic grade (CDL + split-tone + vignette + grain).
    this.grade = new ShaderPass(GradeToneShader)
    this.composer.addPass(this.grade)

    // 5) OutputPass — sRGB encode of the (already LDR) buffer.
    //    Tone mapping is NoToneMapping; tiles are pre-tonemapped.
    this.output = new OutputPass()
    this.composer.addPass(this.output)

    // 6) SMAA — last pass, in LDR sRGB.
    this.smaa = new SMAAPass()
    this.composer.addPass(this.smaa)

    // Size after every pass is registered so SMAA/bloom get device
    // pixels, not CSS pixels.
    this.composer.setPixelRatio(dpr)
    this.composer.setSize(opts.size.w, opts.size.h)
  }

  /** Drive per-phase uniforms (color grade, bloom, cloud palette). */
  setHourPhase(hour: number): void {
    const kind = gradeKindAt(hour)
    writeGradeUniforms(
      this.grade.material.uniforms as unknown as GradeUniformBag,
      gradeParamsAt(hour),
      0,
      this.grainEnabled,
    )
    const b = BLOOM[kind]
    this.bloom.threshold = b.threshold
    this.bloom.strength = b.strength
    this.bloom.radius = b.radius
    this.clouds.setHourPhase(hour, 1)
  }

  setSunDirection(x: number, y: number, z: number): void {
    this.clouds.setSunDirection(x, y, z)
  }

  setGradeEnabled(on: boolean): void {
    this.grade.enabled = on
  }

  /** Drop expensive passes when the frame budget is tight.
   *  Bloom stays on — it's the look the user opted into. Clouds are
   *  the ray-march; SMAA is the last thing we keep. */
  setLod(lod: QualityLod): void {
    this.bloom.enabled = true
    this.cloudComposite.enabled = lod === "full" && !this.reducedMotion
    this.smaa.enabled = lod !== "lite"
  }

  resize(w: number, h: number): void {
    const dpr = this.renderer.getPixelRatio()
    this.composer.setPixelRatio(dpr)
    this.composer.setSize(w, h)
    this.clouds.resize(w, h)
  }

  /** Tick the cloud wind drift + render the entire HDR pipeline. */
  render(timeSec: number): void {
    this.grade.material.uniforms.uGradeTime.value = timeSec
    if (this.cloudComposite.enabled) {
      this.clouds.setTime(timeSec)
      this.clouds.render()
    }
    this.composer.render()
  }

  dispose(): void {
    this.cloudComposite.dispose()
    this.composer.dispose()
    this.clouds.dispose()
    this.bloom.dispose()
    this.grade.dispose()
    this.output.dispose()
    this.smaa.dispose()
    this.renderer.toneMapping = this.prevToneMapping
    this.renderer.toneMappingExposure = this.prevToneExposure
    // outputColorSpace is restored via assignment; the runtime field
    // is a string but the type accepts ColorSpace, which is a string
    // union. Narrow safely.
    this.renderer.outputColorSpace = this.prevOutputColorSpace as typeof this.renderer.outputColorSpace
  }
}

// Helper for non-Max-Quality callers: scene-level renderer setup
// touches (anisotropic + sRGB on tile textures) that we want on
// regardless of mode. Centralized here so the per-tile callback
// in Detailed3DScene stays a one-liner.
export function applyTileQualityHints(
  group: { traverse: (cb: (o: unknown) => void) => void },
  renderer: WebGLRenderer,
): void {
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy())
  // Only color-data textures get the sRGB hint. normalMap/roughnessMap/
  // metalnessMap store data, not color — marking them sRGB would
  // double-decode and shift the entire material's lighting.
  const COLOR_KEYS = ["map", "emissiveMap"] as const
  const DATA_KEYS = ["normalMap", "roughnessMap", "metalnessMap"] as const
  group.traverse((o) => {
    const mesh = o as { material?: unknown }
    if (!mesh.material) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      const matAny = mat as Record<string, unknown>
      for (const k of COLOR_KEYS) {
        const t = matAny[k] as { isTexture?: boolean; anisotropy?: number; colorSpace?: string; needsUpdate?: boolean } | null | undefined
        if (t && t.isTexture) {
          t.anisotropy = maxAniso
          // Google delivers sRGB-encoded color textures.
          if (t.colorSpace !== undefined) t.colorSpace = "srgb"
          t.needsUpdate = true
        }
      }
      for (const k of DATA_KEYS) {
        const t = matAny[k] as { isTexture?: boolean; anisotropy?: number; needsUpdate?: boolean } | null | undefined
        if (t && t.isTexture) {
          t.anisotropy = maxAniso
          t.needsUpdate = true
        }
      }
      // Photogrammetry albedo is pre-lit. Flatten to unlit (albedo
      // via emissive, lit color black) so ambient/hemi/sun cannot
      // re-shade Google's bake. Orbs keep a real PBR response.
      const std = matAny as {
        isMeshStandardMaterial?: boolean
        isMeshPhysicalMaterial?: boolean
        map?: { isTexture?: boolean } | null
        emissiveMap?: unknown
        emissive?: { setRGB: (r: number, g: number, b: number) => void }
        color?: { setRGB: (r: number, g: number, b: number) => void }
        emissiveIntensity?: number
        metalness?: number
        roughness?: number
        envMapIntensity?: number
        userData?: { prelit?: boolean }
      }
      if (
        (std.isMeshStandardMaterial || std.isMeshPhysicalMaterial) &&
        std.map?.isTexture &&
        !std.userData?.prelit
      ) {
        std.emissiveMap = std.map
        std.emissive?.setRGB(1, 1, 1)
        std.emissiveIntensity = 1
        std.color?.setRGB(0, 0, 0)
        std.metalness = 0
        std.roughness = 1
        std.envMapIntensity = 0
        if (std.userData) std.userData.prelit = true
        else std.userData = { prelit: true }
      } else if (typeof matAny.envMapIntensity === "number") {
        matAny.envMapIntensity = 0
      }
    }
  })
  // Make sure the renderer is in sRGB output mode (idempotent — set
  // once when applying hints to the first tile).
  renderer.outputColorSpace = "srgb" as typeof renderer.outputColorSpace
}

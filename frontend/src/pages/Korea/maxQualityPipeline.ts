// Max Quality HDR pipeline for Detailed-3D Map Mode.
//
// Pipeline (when toggled on):
//
//   scene + god-rays  →  HDR RT (HalfFloat, MSAA)
//                    ↑
//   clouds (half-res)─┘  (composited as a transparent overlay)
//                    ↓
//                  Bloom (luminance high-pass → 5-mip Gaussian → composite)
//                    ↓
//             GradeTone shader (per-phase color matrix → AgX → sRGB encode)
//                    ↓
//                   SMAA (edge detection + neighborhood blend)
//                    ↓
//                 default framebuffer
//
// Why this shape:
//   - HalfFloat RT preserves highlights past 1.0 so the bloom pass
//     can read actual HDR overshoot (sun, lit windows at night).
//   - AgX (added in three r167) keeps hue stability on warm sunsets
//     where ACES otherwise crushes orange→yellow and ruins the
//     rose/amber Korea palette.
//   - The custom GradeTone pass folds color grading + tone-mapping +
//     sRGB encode into ONE fullscreen draw, saving ~0.5 ms vs the
//     stock OutputPass for the mobile budget.
//   - SMAA last — it samples LDR sRGB so it has to run after the
//     tone-map. Edge detection on Seoul's long verticals is the
//     specific reason FXAA is rejected.
//   - The clouds run BEFORE bloom so bright fringes can pick up
//     atmospheric glow; the god-rays output is folded into the same
//     HDR RT so its accumulation participates in tone-map and bloom
//     for free (sun shafts now bleed light into the bloom passes).
//
// References: see PR #419 research briefs.

import {
  AgXToneMapping,
  HalfFloatType,
  Matrix3,
  RGBAFormat,
  type PerspectiveCamera,
  type Scene,
  Vector2,
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

// Per-phase color grading matrices. These replace the CSS `filter`
// chain on the canvas — operating in HDR space pre-tonemap gives much
// better warmth without crushing highlights. Each matrix is the
// concatenation of a saturation tweak + a warm/cool color rotation
// + a lift/gain shift; hand-tuned to roughly match the CSS palette
// from `timeOfDayGrade.ts` but with extra cinematic punch.
//
// Layout is column-major as Three.js Matrix3 expects.
const GRADE_MATRIX: Record<GradeKind, [number, number, number, number, number, number, number, number, number]> = {
  // r-out = a*r + b*g + c*b ; etc. Diagonal-dominant so identity-ish.
  night:     [0.85, 0.02, 0.10,  0.02, 0.85, 0.05,  0.05, 0.10, 1.10],
  dawn:      [1.08, 0.04, 0.00,  0.02, 0.98, 0.00,  0.00, -0.02, 0.92],
  morning:   [1.02, 0.00, -0.02, 0.00, 1.02, 0.00,  -0.02, 0.00, 1.04],
  midday:    [1.00, 0.00, 0.00,  0.00, 1.00, 0.00,  0.00, 0.00, 1.00],
  afternoon: [1.05, 0.02, -0.01, 0.01, 1.00, -0.02, -0.02, -0.01, 0.95],
  dusk:      [1.10, 0.04, -0.02, 0.02, 0.96, -0.04, -0.04, -0.02, 0.86],
  evening:   [0.88, 0.00, 0.08,  0.00, 0.92, 0.04,  0.06, 0.08, 1.08],
}

// Per-phase exposure on top of AgX. AgX is filmic so we err on the
// brighter side at night (city lights pop) and slightly cooler at
// midday so highlights don't blow.
const EXPOSURE: Record<GradeKind, number> = {
  night: 1.35,
  dawn: 0.95,
  morning: 1.00,
  midday: 1.00,
  afternoon: 1.05,
  dusk: 1.15,
  evening: 1.20,
}

// Bloom thresholds per phase. Threshold >1.0 by day so only HDR
// overshoot (sun) glows; threshold ≤0.7 at night so neon + window
// lights bloom even though they're not over 1.0.
const BLOOM: Record<GradeKind, { threshold: number; strength: number; radius: number }> = {
  night:     { threshold: 0.55, strength: 0.95, radius: 0.75 },
  dawn:      { threshold: 0.85, strength: 0.55, radius: 0.55 },
  morning:   { threshold: 1.10, strength: 0.30, radius: 0.40 },
  midday:    { threshold: 1.15, strength: 0.25, radius: 0.40 },
  afternoon: { threshold: 1.00, strength: 0.40, radius: 0.50 },
  dusk:      { threshold: 0.85, strength: 0.60, radius: 0.55 },
  evening:   { threshold: 0.70, strength: 0.75, radius: 0.65 },
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

// Custom output pass: per-phase color matrix (HDR) → AgX → sRGB encode.
// AgX is provided by three's built-in `renderer.toneMapping`, but to
// run on a post-process RT we apply the matrix here in HDR space and
// let the renderer's tone-mapping in the OUTPUT step handle the
// filmic curve. Three.js wires this automatically when
// `renderer.outputColorSpace = SRGBColorSpace`.
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
  uniform mat3 uMatrix;
  uniform float uExposure;
  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    vec3 graded = uMatrix * c.rgb * uExposure;
    // Soft clamp so absurd HDR values don't punch through the next
    // tone-map step.
    graded = max(graded, vec3(0.0));
    gl_FragColor = vec4(graded, c.a);
  }
`

const GradeToneShader = {
  uniforms: {
    tDiffuse: { value: null },
    uMatrix: { value: new Matrix3() },
    uExposure: { value: 1.0 },
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
  private prevToneMapping: typeof AgXToneMapping
  private prevToneExposure: number
  private prevOutputColorSpace: string

  constructor(opts: MaxQualityPipelineOptions) {
    this.renderer = opts.renderer
    // Stash existing renderer state so dispose() can restore it
    // cleanly when the user toggles Max Quality off.
    this.prevToneMapping = this.renderer.toneMapping as typeof AgXToneMapping
    this.prevToneExposure = this.renderer.toneMappingExposure
    this.prevOutputColorSpace = this.renderer.outputColorSpace
    this.renderer.toneMapping = AgXToneMapping
    this.renderer.toneMappingExposure = 1.0
    // sRGB output is mandatory for the OutputPass below to encode
    // correctly. Without this, the linear HDR composite gets gamma-
    // mushed and the canvas looks washed-out / orange-tinted (the
    // most-recently-reported regression — pre-fix the screen turned
    // a uniform amber because no tone-mapping was ever applied).
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
    this.composer.setSize(opts.size.w, opts.size.h)
    this.composer.setPixelRatio(dpr)

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

    // 3) Bloom — HDR-aware threshold so we don't bloom every white wall.
    this.bloom = new UnrealBloomPass(new Vector2(opts.size.w, opts.size.h), 0.4, 0.5, 1.0)
    this.composer.addPass(this.bloom)

    // 4) Grade + exposure (matrix in HDR space, identity at midday).
    this.grade = new ShaderPass(GradeToneShader)
    this.composer.addPass(this.grade)

    // 5) OutputPass — applies `renderer.toneMapping` (AgX) +
    //    `renderer.outputColorSpace` (sRGB) to the linear HDR buffer.
    //    Without this pass the HDR values just clamp to 0–1, AgX
    //    never runs, and the canvas looks washed-out / uniform-tinted.
    //    This was the v1 bug.
    this.output = new OutputPass()
    this.composer.addPass(this.output)

    // 6) SMAA — last pass, in LDR sRGB, cleans up edge aliasing.
    //    SMAAPass in three r0.184 takes no constructor args; sizing is
    //    handled via the composer's size + the pass's own setSize().
    this.smaa = new SMAAPass()
    this.smaa.setSize(w, h)
    this.composer.addPass(this.smaa)
  }

  /** Drive per-phase uniforms (color grade, exposure, bloom threshold,
   *  cloud palette). Call once at mount and whenever the KST hour rolls
   *  into a new phase. */
  setHourPhase(hour: number): void {
    const kind = gradeKindAt(hour)
    const m = GRADE_MATRIX[kind]
    const matrix = this.grade.material.uniforms.uMatrix.value as Matrix3
    matrix.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8])
    this.renderer.toneMappingExposure = EXPOSURE[kind]
    const b = BLOOM[kind]
    this.bloom.threshold = b.threshold
    this.bloom.strength = b.strength
    this.bloom.radius = b.radius
    this.clouds.setHourPhase(hour, 1)
  }


  resize(w: number, h: number): void {
    this.composer.setSize(w, h)
    this.clouds.resize(w, h)
    this.smaa.setSize(w, h)
  }

  /** Tick the cloud wind drift + render the entire HDR pipeline. */
  render(timeSec: number): void {
    this.clouds.setTime(timeSec)
    this.clouds.render()
    this.composer.render()
  }

  dispose(): void {
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
  const maxAniso = renderer.capabilities.getMaxAnisotropy()
  const textureKeys = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap"] as const
  group.traverse((o) => {
    const mesh = o as { material?: unknown }
    if (!mesh.material) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      const matAny = mat as Record<string, unknown>
      for (const k of textureKeys) {
        const t = matAny[k] as { isTexture?: boolean; anisotropy?: number; colorSpace?: string; needsUpdate?: boolean } | null | undefined
        if (t && t.isTexture) {
          t.anisotropy = maxAniso
          // Google delivers sRGB-encoded textures. Without this the
          // mid-tones are washed-out gamma-mush.
          if (t.colorSpace !== undefined) t.colorSpace = "srgb"
          t.needsUpdate = true
        }
      }
    }
  })
  // Make sure the renderer is in sRGB output mode (idempotent — set
  // once when applying hints to the first tile).
  renderer.outputColorSpace = "srgb" as typeof renderer.outputColorSpace
}

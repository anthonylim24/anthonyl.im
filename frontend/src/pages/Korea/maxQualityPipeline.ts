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
  HalfFloatType,
  Matrix3,
  NoToneMapping,
  RGBAFormat,
  type PerspectiveCamera,
  type Scene,
  type ToneMapping,
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

// Per-phase color grading matrices. Punchier than the v1 values —
// previously they were so close to identity that the user saw the
// scene as "gray washed out" because AgX tonemap was the dominant
// effect (and it desaturates LDR input). Now we drop AgX entirely
// (LDR Google tiles don't need filmic compression) and let these
// matrices do all the artistic lifting.
//
// Layout: row-major. r-out = m[0]*r + m[1]*g + m[2]*b; etc. Three.js
// `Matrix3.set(n11,n12,n13,n21,n22,n23,n31,n32,n33)` reads in this
// order.
const GRADE_MATRIX: Record<GradeKind, [number, number, number, number, number, number, number, number, number]> = {
  night: [
    // Cool deep blue, lift indigo, crush reds.
    0.55, 0.00, 0.18,
    0.00, 0.62, 0.12,
    0.05, 0.05, 1.25,
  ],
  dawn: [
    // Coral / sodium-pink wash, warm midtones.
    1.18, 0.06, -0.04,
    0.04, 1.02, -0.04,
    -0.10, -0.08, 0.82,
  ],
  morning: [
    // Crisp cool blue, slight contrast lift.
    1.05, -0.02, -0.02,
    -0.02, 1.06, 0.00,
    -0.04, 0.02, 1.10,
  ],
  midday: [
    // Near-honest baseline with a subtle contrast lift.
    1.02, 0.00, -0.02,
    0.00, 1.04, 0.00,
    -0.02, 0.00, 1.04,
  ],
  afternoon: [
    // Warmer light, mild golden bias.
    1.10, 0.04, -0.06,
    0.02, 1.04, -0.04,
    -0.06, -0.02, 0.92,
  ],
  dusk: [
    // Full golden hour — strong warmth, drop blues sharply.
    1.22, 0.06, -0.10,
    0.06, 1.00, -0.10,
    -0.14, -0.10, 0.72,
  ],
  evening: [
    // Melancholic dim-blue; saturation hold on the blue channel.
    0.62, 0.00, 0.10,
    0.00, 0.72, 0.06,
    0.04, 0.08, 1.15,
  ],
}

// Per-phase exposure (a uniform pre-multiplier on rgb before the
// matrix). Without AgX we can be more aggressive — these values
// brighten night a touch so neon pops and dim daylight slightly so
// highlights don't blow. Wired into `grade.uniforms.uExposure` in
// `setHourPhase` (was bugged in v1 — only the renderer's tonemap
// exposure was being driven, but the renderer's tonemap was AgX,
// which we've removed).
const EXPOSURE: Record<GradeKind, number> = {
  night: 1.25,
  dawn: 1.05,
  morning: 1.05,
  midday: 0.98,
  afternoon: 1.02,
  dusk: 1.10,
  evening: 1.15,
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
  private prevToneMapping: ToneMapping
  private prevToneExposure: number
  private prevOutputColorSpace: string

  constructor(opts: MaxQualityPipelineOptions) {
    this.renderer = opts.renderer
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
    // Wire the per-phase exposure into the grade shader's uniform
    // (v1 forgot this — uExposure stayed at 1.0). Renderer tone-map
    // is NoToneMapping so the renderer's exposure is unused.
    this.grade.material.uniforms.uExposure.value = EXPOSURE[kind]
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
    }
  })
  // Make sure the renderer is in sRGB output mode (idempotent — set
  // once when applying hints to the first tile).
  renderer.outputColorSpace = "srgb" as typeof renderer.outputColorSpace
}

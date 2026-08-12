// God-rays / volumetric-light-scattering screen-space pass for the
// Detailed-3D Map Mode scene. Encapsulates the silhouette occlusion
// render target, the composite shader, and the per-frame draw call.
//
// Why a hand-rolled pass instead of pmndrs/postprocessing's
// GodRaysEffect: pmndrs samples the depth texture to build the
// occlusion mask, which is broken under
// `WebGLRenderer({ logarithmicDepthBuffer: true })` — a known
// three.js footgun. Detailed3DScene needs logDepth to z-resolve
// Google's 10+km photogrammetric mesh cleanly, so we sidestep the
// depth-read entirely by re-rendering the scene with a flat black
// MeshBasicMaterial override against a white-cleared RT. Black silhouettes
// against white sky → the radial blur happily walks from each pixel
// toward the projected sun position and accumulates color.
//
// Cost: one half-res scene render (cheap — flat material, no
// lighting), one full-res scene render (the same one we'd do
// anyway), one fullscreen composite with ~40 samples. On a 13" M-class
// MBP at 1.5x DPR this is ~0.4 ms; on a midrange Android it's the
// reason we tier-gate this off by default.

import {
  Color,
  MeshBasicMaterial,
  type PerspectiveCamera,
  type Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three"
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js"
import {
  GRADE_APPLY_GLSL,
  GRADE_UNIFORMS_GLSL,
  writeGradeUniforms,
  type GradeParams,
  type GradeUniformBag,
} from "./mapGrade"

/** Polar 0 = zenith (birds-eye), π/2 = horizon. Shafts peak near 45°. */
export function godRayPitchAttenuation(polarRad: number): number {
  return Math.pow(Math.max(0, Math.sin(2 * polarRad)), 0.85)
}

export function godRayContribution(
  intensity: number,
  pitchAtten: number,
  offscreen: number,
  behind: boolean,
): number {
  if (behind) return 0
  return intensity * pitchAtten * offscreen
}

interface GodRaysPassOptions {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  /** World-space position of the sun (matches the DirectionalLight
   *  in Detailed3DScene). The pass projects this to NDC each frame to
   *  drive the radial-blur center. When the sun is behind the camera
   *  we skip the effect and draw the scene directly. */
  sunPos: Vector3
  /** Viewport size in CSS pixels. The half-res occlusion RT and the
   *  full-res composite RT are both sized from this. */
  size: { w: number; h: number }
  /** Solid clear color for the main scene pass — typically the fog
   *  color so the horizon haze layer is the floor of the composite. */
  clearColor: Color
}

export class GodRaysPass {
  private renderer: WebGLRenderer
  private scene: Scene
  private camera: PerspectiveCamera
  private sunPos: Vector3
  private clearColor: Color

  private occlRT: WebGLRenderTarget
  private sceneRT: WebGLRenderTarget
  private blackMat: MeshBasicMaterial
  private composite: ShaderMaterial
  private fsQuad: FullScreenQuad

  // Reusable scratch so we don't allocate per-frame.
  private ndc = new Vector3()
  private prevClear = new Color()
  private sampleCount = 24

  constructor(opts: GodRaysPassOptions) {
    this.renderer = opts.renderer
    this.scene = opts.scene
    this.camera = opts.camera
    this.sunPos = opts.sunPos.clone()
    this.clearColor = opts.clearColor.clone()

    const dpr = this.renderer.getPixelRatio()
    const w = Math.max(1, Math.floor(opts.size.w * dpr))
    const h = Math.max(1, Math.floor(opts.size.h * dpr))

    // Half-res occlusion RT — silhouette pass only, no need for full
    // pixel density. depthBuffer:true so the override-material render
    // still hides things behind hills.
    this.occlRT = new WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), {
      depthBuffer: true,
    })
    this.sceneRT = new WebGLRenderTarget(w, h, { depthBuffer: true })
    this.blackMat = new MeshBasicMaterial({ color: 0x000000, fog: false })

    this.composite = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tOccl: { value: this.occlRT.texture },
        uSunUV: { value: new Vector2(0.5, 0.5) },
        uIntensity: { value: 0.9 },
        uDecay: { value: 0.96 },
        uDensity: { value: 0.85 },
        uWeight: { value: 0.28 },
        uRayExposure: { value: 0.45 },
        uOffscreen: { value: 0.0 },
        uPitchAtten: { value: 1.0 },
        uSampleCount: { value: 24 },
        uRayColor: { value: new Vector3(1.0, 0.96, 0.88) },
        uGradeOn: { value: 1 },
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
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform sampler2D tOccl;
        uniform vec2 uSunUV;
        uniform float uIntensity;
        uniform float uDecay;
        uniform float uDensity;
        uniform float uWeight;
        uniform float uRayExposure;
        uniform float uOffscreen;
        uniform float uPitchAtten;
        uniform float uSampleCount;
        uniform vec3 uRayColor;
        uniform float uGradeOn;
        ${GRADE_UNIFORMS_GLSL}
        ${GRADE_APPLY_GLSL}

        const int MAX_SAMPLES = 24;

        void main() {
          vec2 delta = (vUv - uSunUV) * (1.0 / max(uSampleCount, 1.0)) * uDensity;
          vec2 uv = vUv;
          float illum = 1.0;
          float accum = 0.0;
          for (int i = 0; i < MAX_SAMPLES; i++) {
            if (float(i) >= uSampleCount) break;
            uv -= delta;
            float sky = texture2D(tOccl, uv).r;
            accum += sky * illum * uWeight;
            illum *= uDecay;
          }
          accum *= uIntensity * uRayExposure * uOffscreen * uPitchAtten;
          accum = min(accum, 0.45);
          vec4 base = texture2D(tDiffuse, vUv);
          vec3 lit = clamp(base.rgb + uRayColor * accum, vec3(0.0), vec3(1.0));
          vec3 outRgb = uGradeOn > 0.5 ? applyGrade(lit, vUv) : lit;
          gl_FragColor = vec4(outRgb, 1.0);
          #include <colorspace_fragment>
        }
      `,
      toneMapped: false,
    })
    this.fsQuad = new FullScreenQuad(this.composite)
  }

  /** Update the world-space sun position. Useful if the scene wants
   *  to track the sun with time-of-day. */
  setSunPosition(p: Vector3): void {
    this.sunPos.copy(p)
  }

  setClearColor(c: Color): void {
    this.clearColor.copy(c)
  }

  /** Per-frame ray strength attenuation in [0, 1]. The caller computes
   *  this from camera pitch (cos(polarAngle) raised to a soft curve)
   *  so rays fade smoothly toward zero as the camera tilts toward the
   *  horizon — that's when the screen fills with bright sky and the
   *  radial accumulator would otherwise blow the highlights out. */
  setPitchAttenuation(v: number): void {
    this.composite.uniforms.uPitchAtten.value = Math.max(0, Math.min(1, v))
  }

  setIntensity(v: number): void {
    this.composite.uniforms.uIntensity.value = Math.max(0, v)
  }

  setRayColor(color: Color): void {
    const v = this.composite.uniforms.uRayColor.value as Vector3
    v.set(color.r, color.g * 0.96, color.b * 0.88)
  }

  setSampleCount(n: number): void {
    this.sampleCount = Math.max(8, Math.min(24, n))
    this.composite.uniforms.uSampleCount.value = this.sampleCount
  }

  setGrade(params: GradeParams, grainEnabled: boolean): void {
    this.composite.uniforms.uGradeOn.value = 1
    writeGradeUniforms(
      this.composite.uniforms as unknown as GradeUniformBag,
      params,
      0,
      grainEnabled,
    )
  }

  setGradeEnabled(on: boolean): void {
    this.composite.uniforms.uGradeOn.value = on ? 1 : 0
  }

  setGradeTime(timeSec: number): void {
    this.composite.uniforms.uGradeTime.value = timeSec
  }

  /** Resize the internal RTs. Honors the renderer's current pixel
   *  ratio so high-DPI displays don't render at a quarter resolution. */
  resize(w: number, h: number): void {
    const dpr = this.renderer.getPixelRatio()
    const pw = Math.max(1, Math.floor(w * dpr))
    const ph = Math.max(1, Math.floor(h * dpr))
    this.sceneRT.setSize(pw, ph)
    this.occlRT.setSize(Math.max(1, pw >> 1), Math.max(1, ph >> 1))
  }

  /** Render the scene with the god-rays composite. Always blits through
   *  the composite so output encoding matches (linear RT → sRGB canvas).
   *  The occlusion pass is skipped when shafts would be invisible. */
  render(): void {
    const r = this.renderer
    const scene = this.scene
    const camera = this.camera

    this.ndc.copy(this.sunPos).project(camera)
    const behind = this.ndc.z > 1 || this.ndc.z < -1
    const sx = (this.ndc.x + 1) * 0.5
    const sy = (this.ndc.y + 1) * 0.5
    const dist = Math.max(0, Math.max(sx - 1, -sx, sy - 1, -sy))
    const offscreen = behind ? 0 : Math.max(0, 1 - dist / 0.3)
    const intensity = this.composite.uniforms.uIntensity.value as number
    const pitch = this.composite.uniforms.uPitchAtten.value as number
    const contrib = godRayContribution(intensity, pitch, offscreen, behind)
    this.composite.uniforms.uSunUV.value.set(sx, sy)
    this.composite.uniforms.uOffscreen.value = offscreen

    const prevClear = this.prevClear
    const prevAlpha = r.getClearAlpha()
    r.getClearColor(prevClear)

    // Main pass — linear working space into the scene RT.
    r.setRenderTarget(this.sceneRT)
    r.setClearColor(this.clearColor, 1)
    r.clear(true, true, true)
    r.render(scene, camera)

    if (contrib >= 0.02) {
      scene.overrideMaterial = this.blackMat
      r.setRenderTarget(this.occlRT)
      r.setClearColor(0xffffff, 1)
      r.clear(true, true, true)
      r.render(scene, camera)
      scene.overrideMaterial = null
      this.composite.uniforms.uSampleCount.value = this.sampleCount
    } else {
      this.composite.uniforms.uSampleCount.value = 0
      this.composite.uniforms.uOffscreen.value = 0
    }

    this.composite.uniforms.tDiffuse.value = this.sceneRT.texture
    r.setRenderTarget(null)
    r.setClearColor(this.clearColor, 1)
    r.clear(true, true, true)
    this.fsQuad.render(r)

    r.setClearColor(prevClear, prevAlpha)
  }

  /** Fully dispose RTs + materials + the fullscreen quad. Call this
   *  when the user toggles god rays off — re-creating the pass on
   *  toggle-on is one frame of stutter and zero ongoing cost. */
  dispose(): void {
    this.occlRT.dispose()
    this.sceneRT.dispose()
    this.blackMat.dispose()
    this.composite.dispose()
    this.fsQuad.dispose()
  }
}

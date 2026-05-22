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

  // Reusable Vector3 for the sun NDC projection so we don't allocate
  // per-frame.
  private ndc = new Vector3()

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
        uWeight: { value: 0.4 },
        uExposure: { value: 0.6 },
        // Mask the rays when the sun is offscreen — they should
        // fall off smoothly as the sun's NDC magnitude crosses 1.
        uOffscreen: { value: 0.0 },
        // Camera-pitch attenuation: 1.0 when looking top-down (little
        // sky in frame), → 0 when looking horizontally toward the
        // horizon (most of the frame is sky and the radial accumulator
        // blows out). Computed each frame from `cos(polarAngle)` in
        // the caller and pushed in via `setPitchAttenuation`.
        uPitchAtten: { value: 1.0 },
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
        uniform float uExposure;
        uniform float uOffscreen;
        uniform float uPitchAtten;

        const int SAMPLES = 40;

        void main() {
          // Direction from this pixel toward the sun, divided by
          // the sample count and the density. The classic Mitchell
          // god-rays kernel — accumulate light along the ray toward
          // the sun, decaying per step.
          vec2 delta = (vUv - uSunUV) * (1.0 / float(SAMPLES)) * uDensity;
          vec2 uv = vUv;
          float illum = 1.0;
          float accum = 0.0;
          for (int i = 0; i < SAMPLES; i++) {
            uv -= delta;
            // The occlusion buffer is BLACK for in-scene geometry,
            // WHITE for sky. We want the SKY to contribute light,
            // so sample channel and weight against (1 - black) =
            // bright sky.
            float sky = texture2D(tOccl, uv).r;
            accum += sky * illum * uWeight;
            illum *= uDecay;
          }
          accum *= uIntensity * uExposure * uOffscreen * uPitchAtten;
          // Hard clamp so the additive composite cannot blow the
          // scene out to white even if the accumulator goes wild
          // (e.g., transient sky coverage spike during a pan).
          accum = min(accum, 0.75);
          vec4 base = texture2D(tDiffuse, vUv);
          // Multiplicative base lift — the silhouette/occlusion path
          // re-renders the scene with a flat MeshBasicMaterial which
          // gives a slightly dimmer base than direct rendering. The
          // 1.15x lift counters that so god-rays terrain reads at the
          // same brightness as the standard view (user reported the
          // god-rays terrain was "quite dark"). Then add warm rays on
          // top — preserves the underlying scene color and stacks
          // sun-shaft light in warm tone.
          gl_FragColor = vec4(
            clamp(base.rgb * 1.15, vec3(0.0), vec3(1.0))
              + vec3(accum * 1.10, accum * 0.95, accum * 0.65),
            1.0
          );
        }
      `,
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

  /** Resize the internal RTs. Honors the renderer's current pixel
   *  ratio so high-DPI displays don't render at a quarter resolution. */
  resize(w: number, h: number): void {
    const dpr = this.renderer.getPixelRatio()
    const pw = Math.max(1, Math.floor(w * dpr))
    const ph = Math.max(1, Math.floor(h * dpr))
    this.sceneRT.setSize(pw, ph)
    this.occlRT.setSize(Math.max(1, pw >> 1), Math.max(1, ph >> 1))
  }

  /** Render the scene with the god-rays composite. Caller should
   *  guard with their effects flag — when off, just call
   *  `renderer.render(scene, camera)` directly and skip this. */
  render(): void {
    const r = this.renderer
    const scene = this.scene
    const camera = this.camera

    // Project the sun to NDC; bail when behind the camera. Math is
    // cheap so we do it every frame.
    this.ndc.copy(this.sunPos).project(camera)
    const behind = this.ndc.z > 1 || this.ndc.z < -1
    if (behind) {
      // Sun isn't visible — direct render. Still clear to the fog
      // color so the page-level fallback doesn't show through the
      // alpha:true canvas.
      r.setRenderTarget(null)
      r.setClearColor(this.clearColor, 1)
      r.clear(true, true, true)
      r.render(scene, camera)
      return
    }

    // Smooth falloff as the sun drifts offscreen — full strength
    // when sunUV is in [0,1], fading to zero by ±0.3 outside.
    const sx = (this.ndc.x + 1) * 0.5
    const sy = (this.ndc.y + 1) * 0.5
    const dist = Math.max(0, Math.max(sx - 1, -sx, sy - 1, -sy))
    const offscreen = Math.max(0, 1 - dist / 0.3)
    this.composite.uniforms.uSunUV.value.set(sx, sy)
    this.composite.uniforms.uOffscreen.value = offscreen

    // 1) Occlusion pass — black geometry against white sky into the
    //    half-res RT. Save + restore the renderer's clear color so
    //    we don't leak white into the next frame's main pass.
    const prevClear = new Color()
    r.getClearColor(prevClear)
    const prevAlpha = r.getClearAlpha()
    scene.overrideMaterial = this.blackMat
    r.setRenderTarget(this.occlRT)
    r.setClearColor(0xffffff, 1)
    r.clear(true, true, true)
    r.render(scene, camera)
    scene.overrideMaterial = null

    // 2) Main pass — full-res with proper materials, clearing to the
    //    fog color so the composite blends correctly.
    r.setRenderTarget(this.sceneRT)
    r.setClearColor(this.clearColor, 1)
    r.clear(true, true, true)
    r.render(scene, camera)

    // 3) Composite — fullscreen quad with the radial-blur shader.
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

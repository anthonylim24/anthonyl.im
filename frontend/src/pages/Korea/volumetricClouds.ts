// Ray-marched volumetric clouds for the Max Quality Detailed-3D Map.
//
// A fullscreen quad ray-marches a 1200–2400 m altitude slab using 4-octave
// FBM noise sampled along the view ray. Slab-intersect bounds the march;
// Beer–Powder shading gives sun-facing fringes a soft glow at dawn/dusk.
// The quad is composed ON TOP of the scene render with `transparent:true`
// so urban geometry behind it remains visible.
//
// Rendered into a half-resolution HDR target (HalfFloatType), then
// upscaled-and-composited by the parent HDR pipeline. The upscale is
// invisible because clouds are low-frequency; halving the resolution
// halves the cost.
//
// References:
//   - Sébastien Hillaire, "A Scalable and Production Ready Sky and
//     Atmosphere Rendering Technique" (SIGGRAPH 2020)
//   - Andrew Schneider, "Nubis: Authoring Real-Time Volumetric Cloudscapes"
//     (Horizon Zero Dawn, GDC 2017)

import {
  Color,
  Matrix4,
  type PerspectiveCamera,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
  HalfFloatType,
  RGBAFormat,
  DataTexture,
  RedFormat,
  UnsignedByteType,
  LinearFilter,
  RepeatWrapping,
} from "three"
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js"
import { gradeKindAt, type GradeKind } from "./timeOfDayGrade"

// Pre-baked 32×32 deterministic noise table for per-pixel jitter so the
// ray-march entry point doesn't band on the cloud edges.
function makeNoiseTexture(): DataTexture {
  const size = 32
  const data = new Uint8Array(size * size)
  let seed = 0x9e3779b9 | 0
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) | 0
    data[i] = (seed >>> 24) & 0xff
  }
  const t = new DataTexture(data, size, size, RedFormat, UnsignedByteType)
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  t.magFilter = LinearFilter
  t.minFilter = LinearFilter
  t.needsUpdate = true
  return t
}

interface PhaseUniforms {
  cloudColor: Color
  highlightColor: Color
  hazeColor: Color
  coverage: number
  density: number
}

const PHASE: Record<GradeKind, PhaseUniforms> = {
  night: {
    cloudColor: new Color("#0b1426"),
    highlightColor: new Color("#1a2a4a"),
    hazeColor: new Color("#0e1a2e"),
    coverage: 0.25,
    density: 0.20,
  },
  dawn: {
    cloudColor: new Color("#f8c4b0"),
    highlightColor: new Color("#ffb070"),
    hazeColor: new Color("#f3b6a0"),
    coverage: 0.55,
    density: 0.85,
  },
  morning: {
    cloudColor: new Color("#eef0f4"),
    highlightColor: new Color("#ffffff"),
    hazeColor: new Color("#cfd9e3"),
    coverage: 0.45,
    density: 0.75,
  },
  midday: {
    cloudColor: new Color("#ffffff"),
    highlightColor: new Color("#ffffff"),
    hazeColor: new Color("#b9c4d2"),
    coverage: 0.40,
    density: 0.90,
  },
  afternoon: {
    cloudColor: new Color("#fde2b8"),
    highlightColor: new Color("#fff0c0"),
    hazeColor: new Color("#e8b878"),
    coverage: 0.50,
    density: 0.85,
  },
  dusk: {
    cloudColor: new Color("#c0606a"),
    highlightColor: new Color("#ffb46a"),
    hazeColor: new Color("#d68a4a"),
    coverage: 0.60,
    density: 1.00,
  },
  evening: {
    cloudColor: new Color("#5a6a86"),
    highlightColor: new Color("#7a89a8"),
    hazeColor: new Color("#3a4a66"),
    coverage: 0.35,
    density: 0.55,
  },
}

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vRayDir;
  uniform mat4 uInvViewProj;
  void main() {
    vUv = uv;
    vec4 farPoint = uInvViewProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    vec4 nearPoint = uInvViewProj * vec4(uv * 2.0 - 1.0, -1.0, 1.0);
    vRayDir = (farPoint.xyz / farPoint.w) - (nearPoint.xyz / nearPoint.w);
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const SKY_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vRayDir;

  uniform vec3 uCameraPos;
  uniform vec3 uSunDir;
  uniform vec3 uCloudColor;
  uniform vec3 uHighlightColor;
  uniform vec3 uHazeColor;
  uniform float uCoverage;
  uniform float uDensity;
  uniform float uTime;
  uniform float uReduced;
  uniform sampler2D uNoise;

  const float CLOUD_BOT = 1200.0;
  const float CLOUD_TOP = 2400.0;
  const int   STEPS = 24;
  const int   LIGHT_STEPS = 6;

  float hash(vec3 p) {
    p = mod(p, 1024.0);
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = p - i;
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i),               hash(i + vec3(1.0,0.0,0.0)), f.x),
          mix(hash(i + vec3(0.0,1.0,0.0)), hash(i + vec3(1.0,1.0,0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0,0.0,1.0)), hash(i + vec3(1.0,0.0,1.0)), f.x),
          mix(hash(i + vec3(0.0,1.0,1.0)), hash(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int k = 0; k < 4; k++) {
      s += a * vnoise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return s;
  }
  float density(vec3 p) {
    p.xz += uTime * 8.0 * (1.0 - uReduced);
    float d = fbm(p * 0.0006) - (1.0 - uCoverage);
    return clamp(d * uDensity, 0.0, 1.0);
  }

  void main() {
    vec3 ro = uCameraPos;
    vec3 rd = normalize(vRayDir);

    // Below-horizon discard: no clouds rendered when looking down at
    // street level (transparent black so the city stays untouched).
    if (rd.y < 0.02) { gl_FragColor = vec4(0.0); return; }

    // Slab intersect against the cloud altitude band.
    float tBot = (CLOUD_BOT - ro.y) / rd.y;
    float tTop = (CLOUD_TOP - ro.y) / rd.y;
    float t0 = max(0.0, min(tBot, tTop));
    float t1 = max(tBot, tTop);
    if (t1 <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float dt = (t1 - t0) / float(STEPS);
    float jitter = texture2D(uNoise, gl_FragCoord.xy / 32.0).r;
    float t = t0 + dt * jitter;

    float T = 1.0;
    vec3 acc = vec3(0.0);

    for (int i = 0; i < STEPS; i++) {
      vec3 p = ro + rd * t;
      float d = density(p);
      if (d > 0.01) {
        // Light march toward the sun for Beer–Powder shading.
        float Tl = 1.0;
        float tl = 0.0;
        for (int j = 0; j < LIGHT_STEPS; j++) {
          tl += 40.0;
          Tl *= exp(-density(p + uSunDir * tl) * 0.9);
        }
        float powder = 1.0 - exp(-d * 4.0);
        vec3 lit = mix(uCloudColor * 0.7, uHighlightColor * Tl * powder + uCloudColor, 0.55);
        float a = 1.0 - exp(-d * dt * 0.012);
        acc += T * a * lit;
        T *= 1.0 - a;
        if (T < 0.02) break;
      }
      t += dt;
    }

    // Subtle haze tint so distant clouds melt into the fog color.
    acc = mix(acc, uHazeColor, 0.15);
    float alpha = 1.0 - T;
    // Smooth horizon fade so the slab's lower edge isn't razor-cut.
    alpha *= smoothstep(0.02, 0.18, rd.y);
    gl_FragColor = vec4(acc, alpha);
  }
`

export interface VolumetricCloudsOptions {
  renderer: WebGLRenderer
  camera: PerspectiveCamera
  size: { w: number; h: number }
}

export class VolumetricClouds {
  private renderer: WebGLRenderer
  private camera: PerspectiveCamera
  private skyMat: ShaderMaterial
  private skyQuad: FullScreenQuad
  private cloudRT: WebGLRenderTarget
  private invViewProj = new Matrix4()
  private noiseTex: DataTexture

  constructor(opts: VolumetricCloudsOptions) {
    this.renderer = opts.renderer
    this.camera = opts.camera
    this.noiseTex = makeNoiseTexture()

    const dpr = this.renderer.getPixelRatio()
    const w = Math.max(1, Math.floor((opts.size.w * dpr) / 2))
    const h = Math.max(1, Math.floor((opts.size.h * dpr) / 2))
    this.cloudRT = new WebGLRenderTarget(w, h, {
      type: HalfFloatType,
      format: RGBAFormat,
      depthBuffer: false,
    })

    const initialPhase = PHASE.midday
    this.skyMat = new ShaderMaterial({
      vertexShader: QUAD_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        uCameraPos: { value: new Vector3() },
        uSunDir: { value: new Vector3(800, 1200, 400).normalize() },
        uCloudColor: { value: initialPhase.cloudColor.clone() },
        uHighlightColor: { value: initialPhase.highlightColor.clone() },
        uHazeColor: { value: initialPhase.hazeColor.clone() },
        uCoverage: { value: initialPhase.coverage },
        uDensity: { value: initialPhase.density },
        uTime: { value: 0 },
        uReduced: { value: 0 },
        uNoise: { value: this.noiseTex },
        uInvViewProj: { value: new Matrix4() },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    this.skyQuad = new FullScreenQuad(this.skyMat)
  }

  setReducedMotion(v: boolean): void {
    this.skyMat.uniforms.uReduced.value = v ? 1 : 0
  }

  setHourPhase(hour: number, lerp = 1): void {
    const phase = PHASE[gradeKindAt(hour)]
    this.skyMat.uniforms.uCloudColor.value.lerp(phase.cloudColor, lerp)
    this.skyMat.uniforms.uHighlightColor.value.lerp(phase.highlightColor, lerp)
    this.skyMat.uniforms.uHazeColor.value.lerp(phase.hazeColor, lerp)
    this.skyMat.uniforms.uCoverage.value =
      this.skyMat.uniforms.uCoverage.value * (1 - lerp) + phase.coverage * lerp
    this.skyMat.uniforms.uDensity.value =
      this.skyMat.uniforms.uDensity.value * (1 - lerp) + phase.density * lerp
  }

  setTime(seconds: number): void {
    this.skyMat.uniforms.uTime.value = seconds
  }

  /** Render the cloud layer into the internal half-res HDR RT.
   *  Caller composites this on top of the scene's color buffer in the
   *  HDR pipeline (typically with a simple alpha-blend or screen-blend
   *  fullscreen pass). */
  render(): void {
    const cam = this.camera
    cam.updateMatrixWorld()
    this.invViewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert()
    this.skyMat.uniforms.uCameraPos.value.copy(cam.position)
    this.skyMat.uniforms.uInvViewProj.value.copy(this.invViewProj)
    const prev = this.renderer.getRenderTarget()
    this.renderer.setRenderTarget(this.cloudRT)
    this.skyQuad.render(this.renderer)
    this.renderer.setRenderTarget(prev)
  }

  /** The half-res RT containing the cloud color/alpha (premultiplied). */
  get texture() {
    return this.cloudRT.texture
  }

  resize(w: number, h: number): void {
    const dpr = this.renderer.getPixelRatio()
    const pw = Math.max(1, Math.floor((w * dpr) / 2))
    const ph = Math.max(1, Math.floor((h * dpr) / 2))
    this.cloudRT.setSize(pw, ph)
  }

  dispose(): void {
    this.cloudRT.dispose()
    this.skyMat.dispose()
    this.skyQuad.dispose()
    this.noiseTex.dispose()
  }
}

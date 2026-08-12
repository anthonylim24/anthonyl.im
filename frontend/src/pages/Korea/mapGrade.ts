// Cinematic color grade for Map Mode. Shared by the Max Quality
// composer, the god-rays composite, and unit tests so every path
// sees the same look.
//
// Pipeline (display-referred LDR, Google tiles are already tonemapped):
//   exposure → contrast around 0.18 → luma saturation → ASC CDL
//   → split-tone → vignette → grain → soft shoulder
//
// Identity at midday is intentional — daytime trip lookups should
// read as honest Seoul, not a filter. Dawn/dusk carry the rose/amber
// Korea signature in the highlight tint only, and stay quiet enough
// that the photogrammetry remains the hero.

import { gradeKindAt, type GradeKind } from "./timeOfDayGrade"

export interface GradeParams {
  exposure: number
  contrast: number
  saturation: number
  lift: [number, number, number]
  gamma: [number, number, number]
  gain: [number, number, number]
  shadowTint: [number, number, number]
  highlightTint: [number, number, number]
  vignette: number
  grain: number
  shoulder: number
}

const IDENTITY_VEC: [number, number, number] = [1, 1, 1]
const ZERO_VEC: [number, number, number] = [0, 0, 0]

const GRADE: Record<GradeKind, GradeParams> = {
  night: {
    exposure: 0.96,
    contrast: 1.06,
    saturation: 0.88,
    lift: [0.008, 0.012, 0.028],
    gamma: [1.02, 1.0, 0.96],
    gain: [0.88, 0.92, 1.06],
    shadowTint: [0.9, 0.94, 1.08],
    highlightTint: [1.06, 1.0, 0.94],
    vignette: 0.12,
    grain: 0.018,
    shoulder: 0.12,
  },
  dawn: {
    exposure: 1.02,
    contrast: 1.04,
    saturation: 1.05,
    lift: [0.016, 0.006, 0.0],
    gamma: [0.98, 1.0, 1.03],
    gain: [1.04, 0.99, 0.94],
    shadowTint: [0.94, 0.92, 1.04],
    highlightTint: [1.08, 1.01, 0.92],
    vignette: 0.1,
    grain: 0.014,
    shoulder: 0.08,
  },
  morning: {
    exposure: 1.02,
    contrast: 1.02,
    saturation: 1.03,
    lift: ZERO_VEC,
    gamma: IDENTITY_VEC,
    gain: [0.99, 1.0, 1.02],
    shadowTint: [0.98, 0.99, 1.03],
    highlightTint: [1.01, 1.0, 0.99],
    vignette: 0.06,
    grain: 0.008,
    shoulder: 0.05,
  },
  midday: {
    exposure: 1.0,
    contrast: 1.0,
    saturation: 1.0,
    lift: ZERO_VEC,
    gamma: IDENTITY_VEC,
    gain: IDENTITY_VEC,
    shadowTint: IDENTITY_VEC,
    highlightTint: IDENTITY_VEC,
    vignette: 0.04,
    grain: 0.005,
    shoulder: 0.03,
  },
  afternoon: {
    exposure: 1.01,
    contrast: 1.03,
    saturation: 1.04,
    lift: [0.006, 0.003, 0.0],
    gamma: [0.99, 1.0, 1.01],
    gain: [1.02, 1.0, 0.97],
    shadowTint: [0.99, 0.98, 1.01],
    highlightTint: [1.04, 1.01, 0.96],
    vignette: 0.08,
    grain: 0.01,
    shoulder: 0.06,
  },
  dusk: {
    exposure: 1.02,
    contrast: 1.05,
    saturation: 1.06,
    lift: [0.014, 0.004, 0.0],
    gamma: [0.98, 1.0, 1.03],
    gain: [1.04, 1.0, 0.94],
    shadowTint: [0.96, 0.92, 1.04],
    highlightTint: [1.08, 1.01, 0.9],
    vignette: 0.1,
    grain: 0.014,
    shoulder: 0.08,
  },
  evening: {
    exposure: 0.98,
    contrast: 1.05,
    saturation: 0.92,
    lift: [0.006, 0.01, 0.022],
    gamma: [1.02, 1.0, 0.97],
    gain: [0.92, 0.95, 1.03],
    shadowTint: [0.9, 0.93, 1.08],
    highlightTint: [1.03, 0.99, 0.97],
    vignette: 0.12,
    grain: 0.016,
    shoulder: 0.1,
  },
}

export function gradeParamsAt(hour: number): GradeParams {
  return GRADE[gradeKindAt(hour)]
}

/** GLSL uniform declarations for the shared applyGrade() helper. */
export const GRADE_UNIFORMS_GLSL = /* glsl */ `
  uniform float uExposure;
  uniform float uContrast;
  uniform float uSaturation;
  uniform vec3 uLift;
  uniform vec3 uGamma;
  uniform vec3 uGain;
  uniform vec3 uShadowTint;
  uniform vec3 uHighlightTint;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uShoulder;
  uniform float uGradeTime;
`

/** Filmic grade. Call as `applyGrade(color, vUv)`. */
export const GRADE_APPLY_GLSL = /* glsl */ `
  vec3 applyGrade(vec3 c, vec2 uv) {
    c *= uExposure;
    // Contrast around filmic mid-grey so blacks/whites move first.
    c = mix(vec3(0.18), c, uContrast);
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(luma), c, uSaturation);
    // ASC CDL: slope / offset / power.
    c = pow(max(c * uGain + uLift, vec3(0.0)), uGamma);
    float split = smoothstep(0.12, 0.62, luma);
    c *= mix(uShadowTint, uHighlightTint, split);
    float v = distance(uv, vec2(0.5));
    c *= 1.0 - uVignette * smoothstep(0.35, 0.98, v);
    // Luminance-weighted grain — shadows pick it up, highlights don't.
    float n = fract(sin(dot(uv * (uGradeTime + 1.7), vec2(12.9898, 78.233))) * 43758.5453);
    c += (n - 0.5) * uGrain * (1.0 - smoothstep(0.35, 0.85, luma));
    // Soft shoulder: compress only the highlights so neon doesn't clip.
    vec3 compressed = c / (c + vec3(0.85));
    c = mix(c, compressed, uShoulder * smoothstep(0.55, 1.2, luma));
    return clamp(c, 0.0, 1.0);
  }
`

export interface GradeUniformBag {
  uExposure: { value: number }
  uContrast: { value: number }
  uSaturation: { value: number }
  uLift: { value: { set: (x: number, y: number, z: number) => void } }
  uGamma: { value: { set: (x: number, y: number, z: number) => void } }
  uGain: { value: { set: (x: number, y: number, z: number) => void } }
  uShadowTint: { value: { set: (x: number, y: number, z: number) => void } }
  uHighlightTint: { value: { set: (x: number, y: number, z: number) => void } }
  uVignette: { value: number }
  uGrain: { value: number }
  uShoulder: { value: number }
  uGradeTime: { value: number }
}

export function writeGradeUniforms(
  bag: GradeUniformBag,
  params: GradeParams,
  timeSec: number,
  grainEnabled: boolean,
): void {
  bag.uExposure.value = params.exposure
  bag.uContrast.value = params.contrast
  bag.uSaturation.value = params.saturation
  bag.uLift.value.set(params.lift[0], params.lift[1], params.lift[2])
  bag.uGamma.value.set(params.gamma[0], params.gamma[1], params.gamma[2])
  bag.uGain.value.set(params.gain[0], params.gain[1], params.gain[2])
  bag.uShadowTint.value.set(params.shadowTint[0], params.shadowTint[1], params.shadowTint[2])
  bag.uHighlightTint.value.set(
    params.highlightTint[0],
    params.highlightTint[1],
    params.highlightTint[2],
  )
  bag.uVignette.value = params.vignette
  bag.uGrain.value = grainEnabled ? params.grain : 0
  bag.uShoulder.value = params.shoulder
  bag.uGradeTime.value = timeSec
}

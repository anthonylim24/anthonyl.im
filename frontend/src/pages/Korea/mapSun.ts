// Time-of-day sun for Map Mode. Google Photorealistic tiles are
// pre-lit in albedo, so the directional light is a *relief* pass —
// enough to give the orbs we own a key light, never a second sun
// that fights the bake (tiles are flattened to unlit in
// applyTileQualityHints).
//
// Frame: ReorientationPlugin parks the user at origin with +Y up,
// +Z north, +X west. Solar azimuth 0 = north, clockwise.

import { gradeKindAt, type GradeKind } from "./timeOfDayGrade"

const DEG = Math.PI / 180
const SEOUL_LAT_DEG = 37.5665
/** Directional light sits this far from origin so god-rays can
 *  project it to NDC without collapsing onto the camera. */
const SUN_DISTANCE = 4000

export interface MapLighting {
  sunPosition: { x: number; y: number; z: number }
  sunDir: { x: number; y: number; z: number }
  sunColor: string
  sunIntensity: number
  ambientColor: string
  ambientIntensity: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  /** Multiplier for the god-ray composite (0 = off). */
  godRayIntensity: number
  elevationRad: number
  azimuthRad: number
  belowHorizon: boolean
}

/** Approximate solar declination in degrees for a civil date. */
export function solarDeclinationDeg(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now)
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 6)
  const day = Number(parts.find((p) => p.type === "day")?.value ?? 1)
  const dayOfYear = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][month - 1] + day
  return 23.44 * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365)
}

export function solarElevationRad(
  hour: number,
  latDeg = SEOUL_LAT_DEG,
  declinationDeg = 22,
): number {
  const lat = latDeg * DEG
  const dec = declinationDeg * DEG
  const hourAngle = (hour - 12) * 15 * DEG
  const sinEl =
    Math.sin(lat) * Math.sin(dec) +
    Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle)
  return Math.asin(Math.min(1, Math.max(-1, sinEl)))
}

/** Azimuth in radians, 0 = north, clockwise (east = π/2). */
export function solarAzimuthRad(
  hour: number,
  latDeg = SEOUL_LAT_DEG,
  declinationDeg = 22,
): number {
  const lat = latDeg * DEG
  const dec = declinationDeg * DEG
  const hourAngle = (hour - 12) * 15 * DEG
  const el = solarElevationRad(hour, latDeg, declinationDeg)
  const cosEl = Math.max(1e-4, Math.cos(el))
  const cosAz = (Math.sin(dec) - Math.sin(el) * Math.sin(lat)) / (cosEl * Math.cos(lat))
  let az = Math.acos(Math.min(1, Math.max(-1, cosAz)))
  if (hourAngle > 0) az = 2 * Math.PI - az
  return az
}

/**
 * Convert solar az/el into the Map Mode scene frame.
 * +Z north, +X west, +Y up. Returns a unit vector pointing *toward*
 * the sun (the DirectionalLight position).
 */
export function sunDirectionFromAzEl(azimuthRad: number, elevationRad: number): {
  x: number
  y: number
  z: number
} {
  const el = elevationRad
  const cosEl = Math.cos(el)
  return {
    x: -Math.sin(azimuthRad) * cosEl,
    y: Math.sin(el),
    z: Math.cos(azimuthRad) * cosEl,
  }
}

const KIND_LIGHT: Record<
  GradeKind,
  {
    sunColor: string
    ambientColor: string
    hemiSky: string
    hemiGround: string
    sunIntensity: number
    ambientIntensity: number
    hemiIntensity: number
    godRayIntensity: number
  }
> = {
  night: {
    sunColor: "#9eb0d4",
    ambientColor: "#1a2540",
    hemiSky: "#1a2540",
    hemiGround: "#0e1a2e",
    sunIntensity: 0.28,
    ambientIntensity: 0.32,
    hemiIntensity: 0.45,
    godRayIntensity: 0,
  },
  dawn: {
    sunColor: "#ffb088",
    ambientColor: "#e8c4b4",
    hemiSky: "#f0c4b0",
    hemiGround: "#b08070",
    sunIntensity: 1.05,
    ambientIntensity: 0.22,
    hemiIntensity: 0.5,
    godRayIntensity: 0.55,
  },
  morning: {
    sunColor: "#fff1d6",
    ambientColor: "#d5e4f0",
    hemiSky: "#9ec7e8",
    hemiGround: "#b8a090",
    sunIntensity: 0.95,
    ambientIntensity: 0.24,
    hemiIntensity: 0.5,
    godRayIntensity: 0,
  },
  midday: {
    sunColor: "#fff6ea",
    ambientColor: "#e8eef4",
    hemiSky: "#7fb2e0",
    hemiGround: "#a89880",
    sunIntensity: 0.85,
    ambientIntensity: 0.26,
    hemiIntensity: 0.48,
    godRayIntensity: 0,
  },
  afternoon: {
    sunColor: "#ffe2b0",
    ambientColor: "#efe4d4",
    hemiSky: "#a3c4dc",
    hemiGround: "#b09070",
    sunIntensity: 1.0,
    ambientIntensity: 0.24,
    hemiIntensity: 0.5,
    godRayIntensity: 0,
  },
  dusk: {
    sunColor: "#ffb088",
    ambientColor: "#c4a090",
    hemiSky: "#e8a888",
    hemiGround: "#8a6050",
    sunIntensity: 1.05,
    ambientIntensity: 0.2,
    hemiIntensity: 0.52,
    godRayIntensity: 0.65,
  },
  evening: {
    sunColor: "#c8b8e0",
    ambientColor: "#3a4a66",
    hemiSky: "#4a5d80",
    hemiGround: "#2a3040",
    sunIntensity: 0.42,
    ambientIntensity: 0.3,
    hemiIntensity: 0.48,
    godRayIntensity: 0.1,
  },
}

export function lightingForHour(
  hour: number,
  opts: { latDeg?: number; declinationDeg?: number } = {},
): MapLighting {
  const latDeg = opts.latDeg ?? SEOUL_LAT_DEG
  const declinationDeg = opts.declinationDeg ?? solarDeclinationDeg()
  const elevationRad = solarElevationRad(hour, latDeg, declinationDeg)
  const azimuthRad = solarAzimuthRad(hour, latDeg, declinationDeg)
  const belowHorizon = elevationRad < 0.02
  const kind = gradeKindAt(hour)
  const palette = KIND_LIGHT[kind]

  // Night / below-horizon: a cool moon from the opposite azimuth so
  // the orbs still have a readable key light.
  const el = belowHorizon ? 0.22 : elevationRad
  const az = belowHorizon ? (azimuthRad + Math.PI) % (2 * Math.PI) : azimuthRad
  const sunDir = sunDirectionFromAzEl(az, el)

  return {
    sunPosition: {
      x: sunDir.x * SUN_DISTANCE,
      y: sunDir.y * SUN_DISTANCE,
      z: sunDir.z * SUN_DISTANCE,
    },
    sunDir,
    sunColor: palette.sunColor,
    sunIntensity: palette.sunIntensity,
    ambientColor: palette.ambientColor,
    ambientIntensity: palette.ambientIntensity,
    hemiSky: palette.hemiSky,
    hemiGround: palette.hemiGround,
    hemiIntensity: palette.hemiIntensity,
    godRayIntensity: belowHorizon ? palette.godRayIntensity * 0.45 : palette.godRayIntensity,
    elevationRad,
    azimuthRad,
    belowHorizon,
  }
}

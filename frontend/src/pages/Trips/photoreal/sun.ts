// Where the sun is for a place and a clock time. The photogrammetry is
// already lit by the day it was flown, so this only keys the things we add
// to the scene (the "you" droplet, the dev model city). Frame: +Y up,
// +Z north, +X west; azimuth 0 = north, clockwise.

const DEG = Math.PI / 180

export interface Sun {
  /** Unit vector pointing at the light (the moon's stand-in after dark). */
  dir: { x: number; y: number; z: number }
  azimuth: number
  /** True solar elevation, negative at night. */
  elevation: number
  belowHorizon: boolean
  /** 0 at the horizon → 1 high in the sky; drives warmth. */
  height: number
}

/** Wall-clock hour (0–24, fractional) in an IANA time zone. */
export function hourIn(timezone: string, now: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now)
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 12)
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0)
    return (hour % 24) + minute / 60
  } catch {
    return 12
  }
}

/** "14:30" → 14.5; null when it isn't a clock time. */
export function clockHour(time?: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time ?? "")
  if (!match) return null
  const hour = Number(match[1]) + Number(match[2]) / 60
  return hour >= 0 && hour < 24 ? hour : null
}

export function dayOfYear(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return 172
  const start = Date.UTC(Number(match[1]), 0, 1)
  const at = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Math.round((at - start) / 86_400_000) + 1
}

export function declinationDeg(dayOfYearN: number): number {
  return 23.44 * Math.sin((2 * Math.PI * (dayOfYearN - 81)) / 365)
}

export function sunAt(input: { hour: number; latDeg: number; date: string }): Sun {
  const lat = input.latDeg * DEG
  const dec = declinationDeg(dayOfYear(input.date)) * DEG
  const hourAngle = (input.hour - 12) * 15 * DEG
  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle)
  const elevation = Math.asin(Math.min(1, Math.max(-1, sinEl)))
  const cosAz =
    (Math.sin(dec) - Math.sin(elevation) * Math.sin(lat)) / (Math.max(1e-4, Math.cos(elevation)) * Math.cos(lat))
  let azimuth = Math.acos(Math.min(1, Math.max(-1, cosAz)))
  if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth
  const belowHorizon = elevation < 2 * DEG
  // After dark, light from a low moon opposite the sun so shapes still read.
  const el = belowHorizon ? 24 * DEG : Math.max(elevation, 14 * DEG)
  const az = belowHorizon ? (azimuth + Math.PI) % (2 * Math.PI) : azimuth
  return {
    dir: { x: -Math.sin(az) * Math.cos(el), y: Math.sin(el), z: Math.cos(az) * Math.cos(el) },
    azimuth,
    elevation,
    belowHorizon,
    height: Math.min(1, Math.max(0, elevation / (50 * DEG))),
  }
}

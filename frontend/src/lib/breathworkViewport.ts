import { detectTier, type DeviceTier } from '@/pages/Korea/deviceTier'

export type OrbQuality = 0 | 1 | 2

const TESLA_UA = /Tesla/i

export function isTeslaUserAgent(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return TESLA_UA.test(userAgent)
}

/**
 * In-car / kiosk Chromium: Tesla, or a coarse-pointer landscape panel
 * shorter than 700px (typical 1024×600 vehicle browser).
 */
export function isConstrainedSessionViewport(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): boolean {
  if (isTeslaUserAgent(userAgent)) return true
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false

  const landscape = window.matchMedia('(orientation: landscape)').matches
  const short = window.matchMedia('(max-height: 700px)').matches
  const coarse = window.matchMedia('(pointer: coarse)').matches
  return landscape && short && coarse
}

export function orbQualityForTier(tier: DeviceTier, constrained: boolean): OrbQuality {
  if (constrained || tier === 'low') return 0
  if (tier === 'medium') return 1
  return 2
}

export function detectOrbQuality(): OrbQuality {
  return orbQualityForTier(detectTier(), isConstrainedSessionViewport())
}

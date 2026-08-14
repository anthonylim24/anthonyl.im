import { useSyncExternalStore } from 'react'

/**
 * In-car / constrained-viewport detection — a hard safety feature. Advanced
 * protocols must not start in this mode.
 *
 * Constrained when the UA is a Tesla browser, or the viewport is landscape
 * with a small height (≤ 700px) and a coarse pointer (car / kiosk touch).
 */

const CONSTRAINED_QUERY = '(orientation: landscape) and (max-height: 700px) and (pointer: coarse)'

export function isTeslaUserAgent(userAgent: string): boolean {
  return /tesla/i.test(userAgent)
}

export function isConstrainedViewport(
  userAgent: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  matches: boolean = typeof window !== 'undefined' && Boolean(window.matchMedia?.(CONSTRAINED_QUERY).matches),
): boolean {
  return isTeslaUserAgent(userAgent) || matches
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined
  const mediaQuery = window.matchMedia(CONSTRAINED_QUERY)
  mediaQuery.addEventListener('change', onChange)
  return () => mediaQuery.removeEventListener('change', onChange)
}

export function useConstrainedViewport(): boolean {
  return useSyncExternalStore(subscribe, () => isConstrainedViewport(), () => false)
}

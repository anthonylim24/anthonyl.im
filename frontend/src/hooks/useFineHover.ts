import { useEffect, useState } from 'react'

export const FINE_HOVER_QUERY = '(hover: hover) and (pointer: fine)'

function readFineHover(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(FINE_HOVER_QUERY).matches
}

/** True only when a mouse / trackpad can hover. Touch taps must not stick `:hover`. */
export function useFineHover(): boolean {
  const [fineHover, setFineHover] = useState(readFineHover)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return

    const mql = window.matchMedia(FINE_HOVER_QUERY)
    const handler = (e: MediaQueryListEvent) => setFineHover(e.matches)

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler)
      return () => mql.removeEventListener('change', handler)
    }

    mql.addListener(handler)
    return () => mql.removeListener(handler)
  }, [])

  return fineHover
}

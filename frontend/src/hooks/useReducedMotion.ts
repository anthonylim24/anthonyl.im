import { useState, useEffect } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function readReducedMotionPreference(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(QUERY).matches
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readReducedMotionPreference)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return
    }

    const mql = window.matchMedia(QUERY)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler)
      return () => mql.removeEventListener('change', handler)
    }

    mql.addListener(handler)
    return () => mql.removeListener(handler)
  }, [])

  return reduced
}

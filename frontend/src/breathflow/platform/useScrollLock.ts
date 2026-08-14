import { useEffect } from 'react'

/** Locks body scroll while `locked` (the fullscreen session overlay). */
export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return

    const body = document.body
    const previousOverflow = body.style.overflow
    const previousOverscroll = body.style.overscrollBehavior
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'

    return () => {
      body.style.overflow = previousOverflow
      body.style.overscrollBehavior = previousOverscroll
    }
  }, [locked])
}

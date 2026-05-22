// Tiny numeric tween hook — eases the displayed value toward `target` over
// `durationMs` using a smooth cubic ease-out. Used by /korea/places to make
// the "47 places" counter feel responsive when filters change, rather than
// flashing the new number instantly. Respects `prefers-reduced-motion` by
// snapping to the target.
//
// No new dep — this is the only place we need a number tween and it's
// trivial enough to keep local.

import { useEffect, useRef, useState } from 'react'

const DEFAULT_DURATION_MS = 320

// cubic ease-out — matches the spirit of our cubic-bezier(0.16, 1, 0.3, 1)
// without bringing in a full bezier solver for a 1-D value.
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function useTweenNumber(
  target: number,
  durationMs: number = DEFAULT_DURATION_MS,
  options: { reducedMotion?: boolean } = {},
): number {
  const reduced = !!options.reducedMotion

  // For reduced-motion users we bypass the tween entirely and return the
  // raw target — no setState in effect, no rAF. The hook becomes a
  // pass-through.
  const [display, setDisplay] = useState(target)
  const fromRef = useRef(target)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const targetRef = useRef(target)

  useEffect(() => {
    if (reduced) return
    // Capture current display via functional setter — avoids reading a
    // ref during render.
    setDisplay((current) => {
      if (current === target) {
        targetRef.current = target
        return current
      }
      fromRef.current = current
      targetRef.current = target
      startRef.current = null

      const tick = (now: number) => {
        if (startRef.current == null) startRef.current = now
        const elapsed = now - startRef.current
        const t = Math.min(1, elapsed / durationMs)
        const eased = easeOutCubic(t)
        const value = fromRef.current + (targetRef.current - fromRef.current) * eased
        setDisplay(Math.round(value))
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick)
        } else {
          setDisplay(targetRef.current)
          rafRef.current = null
        }
      }

      rafRef.current = requestAnimationFrame(tick)
      // Return `current` — the rAF loop above will drive the value from
      // here. Returning the unchanged value here avoids an extra render.
      return current
    })

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [target, durationMs, reduced])

  return reduced ? target : display
}

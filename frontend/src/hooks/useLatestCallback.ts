import { useCallback, useLayoutEffect, useRef } from "react"

/** Stable callback that always calls the latest committed function. Safe to
 *  pass into helpers and event handlers — unlike `useEffectEvent`, which React
 *  restricts to Effect bodies. The ref is published in `useLayoutEffect` so an
 *  abandoned concurrent render cannot leak its callback into in-flight work. */
export function useLatestCallback<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
  const ref = useRef(fn)
  useLayoutEffect(() => {
    ref.current = fn
  })
  return useCallback((...args: Args) => ref.current(...args), [])
}

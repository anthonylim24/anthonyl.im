import { useCallback, useRef } from "react"

/** Stable callback that always calls the latest function. Safe to pass into
 *  helpers and event handlers — unlike `useEffectEvent`, which React restricts
 *  to Effect bodies. */
export function useLatestCallback<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback((...args: Args) => ref.current(...args), [])
}

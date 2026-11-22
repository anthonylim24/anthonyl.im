import { useEffect, useState } from "react"

/**
 * One value held outside React state, so that writing it re-renders the
 * components that read it and not the one that owns it. The workspace keeps
 * the hovered stop and the open 3D view this way: either changes often, and
 * as workspace state each change re-rendered the whole itinerary.
 *
 * Writing it during render is a side effect: to reset one, replace it.
 */
export interface LiveValue<T> {
  get: () => T
  set: (next: T) => void
  subscribe: (onChange: () => void) => () => void
}

export function liveValue<T>(initial: T): LiveValue<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return
      value = next
      for (const listener of [...listeners]) listener()
    },
    subscribe: (onChange) => {
      listeners.add(onChange)
      return () => {
        listeners.delete(onChange)
      }
    },
  }
}

/**
 * What a reader sees of `source`, through `read`, which `key` names. Kept in
 * React state rather than `useSyncExternalStore`: a store update always
 * renders before the next paint, so a hover that moved the map's highlight
 * held that frame. A state update set from a pointer event takes the event's
 * priority, as the highlight did when it was workspace state.
 */
function useSeen<T, R>(source: LiveValue<T>, key: unknown, read: (value: T) => R): R {
  const [seen, setSeen] = useState(() => ({ source, key, value: read(source.get()) }))
  useEffect(() => {
    const sync = () =>
      setSeen((prev) => {
        const value = read(source.get())
        return prev.source === source && Object.is(prev.key, key) && Object.is(prev.value, value) ? prev : { source, key, value }
      })
    // A write between the render and this subscription would be missed.
    sync()
    return source.subscribe(sync)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `read` is fixed by `key`
  }, [source, key])
  return seen.source === source && Object.is(seen.key, key) ? seen.value : read(source.get())
}

const itself = <T,>(value: T): T => value

export function useLiveValue<T>(source: LiveValue<T>): T {
  return useSeen(source, null, itself<T>)
}

/** Whether `source` holds `value`. Re-renders only when that answer changes: two cards per hover, not every card. */
export function useHolds<T>(source: LiveValue<T>, value: T): boolean {
  return useSeen(source, value, (current) => Object.is(current, value))
}

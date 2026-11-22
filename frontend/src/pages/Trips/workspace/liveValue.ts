import { useSyncExternalStore } from "react"

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

export function useLiveValue<T>(source: LiveValue<T>): T {
  return useSyncExternalStore(source.subscribe, source.get, source.get)
}

/** Whether `source` holds `value`. Re-renders only when that answer changes: two cards per hover, not every card. */
export function useHolds<T>(source: LiveValue<T>, value: T): boolean {
  const holds = () => Object.is(source.get(), value)
  return useSyncExternalStore(source.subscribe, holds, holds)
}

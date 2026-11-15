import { createJSONStorage, type StateStorage } from 'zustand/middleware'

function getBrowserLocalStorage(): StateStorage {
  if (
    typeof window === 'undefined'
    || typeof document === 'undefined'
    || window.document !== document
  ) {
    throw new Error('Browser localStorage is unavailable')
  }

  return window.localStorage
}

export function createBrowserJSONStorage<State>() {
  return createJSONStorage<State>(getBrowserLocalStorage)
}

/**
 * Keeps a persisted store in step with the same app open in another tab: when
 * that tab writes `key`, this one re-reads it through the store's own `merge`
 * (which cleans it and, for history, unions sessions by id). Without this the
 * next write from either tab silently replaces the other's.
 */
export function followOtherTabs(store: { persist: { rehydrate: () => Promise<void> | void } }, key: string): void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
  window.addEventListener('storage', (event) => {
    if (event.key === key || event.key === null) void store.persist.rehydrate()
  })
}

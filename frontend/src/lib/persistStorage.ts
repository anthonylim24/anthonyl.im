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

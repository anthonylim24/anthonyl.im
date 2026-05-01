import '@testing-library/jest-dom'

function createTestStorage(): Storage {
  const storage = new Map<string, string>()

  return {
    get length() {
      return storage.size
    },
    clear() {
      storage.clear()
    },
    getItem(key) {
      return storage.get(key) ?? null
    },
    key(index) {
      return Array.from(storage.keys())[index] ?? null
    },
    removeItem(key) {
      storage.delete(key)
    },
    setItem(key, value) {
      storage.set(key, value)
    },
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: createTestStorage(),
})

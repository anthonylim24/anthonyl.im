import '@testing-library/jest-dom'

// happy-dom 20.14+ ships a Web Animations stub whose animations never advance
// or commit their final keyframe. Motion prefers WAAPI when `animate` exists,
// so animated elements would stay at their initial style (opacity 0) forever.
// Without it Motion falls back to its JS animator, which does run here.
if (typeof Element !== 'undefined') {
  delete (Element.prototype as { animate?: unknown }).animate
}

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

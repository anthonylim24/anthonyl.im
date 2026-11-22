import '@testing-library/jest-dom'

// happy-dom 20.14+ ships a Web Animations stub whose animations never advance
// or commit their final keyframe. Motion prefers WAAPI when `animate` exists,
// so animated elements would stay at their initial style (opacity 0) forever.
// Without it Motion falls back to its JS animator, which does run here.
if (typeof Element !== 'undefined') {
  delete (Element.prototype as { animate?: unknown }).animate
}

// Tests never reach the network. happy-dom would send an unmocked `/api/...`
// call to its default origin (http://localhost:3000) and anything else to the
// internet; here both fail at once, as they would offline. Mock the API
// module, or stub `fetch`, to answer a request. Assigned, not stubbed, so
// `vi.restoreAllMocks()` / `vi.unstubAllGlobals()` come back to this.
const realFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const href = typeof input === 'object' && 'url' in input ? input.url : String(input)
  const base = globalThis.location?.href
  const url = URL.canParse(href, base) ? new URL(href, base) : null
  if (url?.protocol === 'http:' || url?.protocol === 'https:') {
    return Promise.reject(new TypeError(`Failed to fetch: tests are offline (${url.href})`))
  }
  return realFetch(input, init)
}) as typeof fetch

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

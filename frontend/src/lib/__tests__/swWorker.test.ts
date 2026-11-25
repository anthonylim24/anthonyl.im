// @vitest-environment node
// Runs public/sw.js against an in-memory Cache Storage and a fake fetch.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const ORIGIN = 'https://anthonyl.im'
const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
const version = source.match(/CACHE_VERSION = '([^']+)'/)![1]

type Req = { url: string; method: string; mode: string; destination: string; cache?: string }
type Listener = (event: unknown) => void

const keyOf = (req: string | Req) => new URL(typeof req === 'string' ? req : req.url, ORIGIN).href

function basic(body: string, contentType = 'text/html; charset=utf-8', status = 200): Response {
  const res = new Response(body, { status, headers: { 'Content-Type': contentType } })
  Object.defineProperty(res, 'type', { value: 'basic' })
  return res
}

function loadWorker(fetchImpl: (req: string | Req) => Promise<Response>) {
  const store = new Map<string, Map<string, Response>>()
  const open = async (name: string) => {
    if (!store.has(name)) store.set(name, new Map())
    const entries = store.get(name)!
    return {
      put: async (req: string | Req, res: Response) => void entries.set(keyOf(req), res),
      match: async (req: string | Req) => entries.get(keyOf(req))?.clone(),
      keys: async () => [...entries.keys()].map((url) => ({ url })),
      delete: async (req: string | Req) => entries.delete(keyOf(req)),
    }
  }
  const caches = {
    open,
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (req: string | Req) => {
      for (const entries of store.values()) {
        const hit = entries.get(keyOf(req))
        if (hit) return hit.clone()
      }
      return undefined
    },
  }
  const listeners: Record<string, Listener> = {}
  const enablePreload = vi.fn(async () => undefined)
  const self = {
    location: new URL(ORIGIN),
    registration: { navigationPreload: { enable: enablePreload } },
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => undefined), matchAll: vi.fn(async () => []) },
  }
  const fetch = vi.fn(fetchImpl)
  // Looked up at call time, so vi.useFakeTimers() reaches the worker too.
  const timers = {
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  }
  runInNewContext(source, { self, caches, fetch, URL, Response, Promise, Set, ...timers })

  const extend = async (type: string, data: object = {}) => {
    let pending: Promise<unknown> = Promise.resolve()
    listeners[type]!({ ...data, waitUntil: (p: Promise<unknown>) => (pending = p) })
    await pending
  }
  /** Dispatch a fetch event; `settled` waits for the work the worker kept going with waitUntil. */
  const dispatch = (path: string, init: Partial<Req> = {}, extra: object = {}) => {
    let response: Promise<Response> | undefined
    const background: Promise<unknown>[] = []
    listeners.fetch!({
      request: { url: new URL(path, ORIGIN).href, method: 'GET', mode: 'no-cors', destination: '', ...init },
      respondWith: (p: Promise<Response>) => (response = p),
      waitUntil: (p: Promise<unknown>) => background.push(p),
      ...extra,
    })
    // waitUntil can be called again while earlier work is pending: wait until a pass adds nothing.
    const settled = async () => {
      let seen = -1
      while (seen !== background.length) {
        seen = background.length
        await Promise.all(background)
      }
    }
    return { response, settled }
  }
  const request = async (path: string, init: Partial<Req> = {}) => {
    const { response, settled } = dispatch(path, init)
    const res = response ? await response : undefined
    await settled()
    return res
  }
  const NAVIGATE = { mode: 'navigate', destination: 'document' }
  const navigate = (path: string) => request(path, NAVIGATE)
  const startNavigation = (path: string, extra: object = {}) => dispatch(path, NAVIGATE, extra)
  const cached = (name: string) => [...(store.get(name)?.keys() ?? [])].map((url) => url.replace(ORIGIN, ''))
  const cachedText = (name: string, path: string) => store.get(name)?.get(`${ORIGIN}${path}`)?.clone().text()
  return { self, fetch, store, extend, request, navigate, startNavigation, cached, cachedText, enablePreload }
}

describe('sw.js', () => {
  it('installs without skipping the wait, and skips only when the page asks', async () => {
    const sw = loadWorker(async () => basic('<html>'))
    await sw.extend('install')
    expect(sw.self.skipWaiting).not.toHaveBeenCalled()
    expect(sw.cached(version)).toEqual(expect.arrayContaining(['/', '/lab', '/breathwork', '/trips', '/trips/korea-2026']))

    await sw.extend('message', { data: { type: 'SKIP_WAITING' } })
    expect(sw.self.skipWaiting).toHaveBeenCalledTimes(1)
  })

  it('keeps one shell per app, without the query', async () => {
    const sw = loadWorker(async () => basic('<html>'))
    await sw.navigate('/trips/korea-2026/day/3?instagram=https%3A%2F%2Fwww.instagram.com%2Fp%2Fabc')
    await sw.navigate('/trips/abc123?url=https%3A%2F%2Fexample.com')
    await sw.navigate('/breathwork/session?technique=cyclic_sighing&rounds=30')
    await sw.navigate('/lab')
    await sw.navigate('/some/unknown/page')
    expect(sw.cached(version).sort()).toEqual(['/', '/breathwork', '/lab', '/trips', '/trips/korea-2026'])
  })

  it('never stores invite links, sign-in pages or files opened directly', async () => {
    const sw = loadWorker(async (req) =>
      keyOf(req).endsWith('.txt') ? basic('User-agent: *', 'text/plain') : basic('<html>'),
    )
    await sw.navigate('/trips/join/secret-token')
    await sw.navigate('/sign-in#/factor-one')
    await sw.navigate('/sign-up')
    await sw.navigate('/robots.txt')
    expect(sw.cached(version)).toEqual([])
  })

  it('keeps the static pages apart from the SPA shell', async () => {
    const sw = loadWorker(async () => basic('<html>static'))
    await sw.navigate('/privacy')
    expect(sw.cached(version)).toEqual(['/privacy'])
  })

  it('answers an offline navigation from its app shell', async () => {
    let online = true
    const sw = loadWorker(async (req) => {
      if (!online) throw new TypeError('Failed to fetch')
      return basic(`<html>${keyOf(req)}`)
    })
    await sw.navigate('/breathwork')
    await sw.navigate('/')
    online = false
    expect(await (await sw.navigate('/breathwork/progress'))!.text()).toBe(`<html>${ORIGIN}/breathwork`)
    expect(await (await sw.navigate('/trips/join/abc'))!.text()).toBe(`<html>${ORIGIN}/`)
  })

  it('answers a stalled navigation from its cached shell, then stores the late answer', async () => {
    vi.useFakeTimers()
    try {
      let release = (): void => undefined
      let stalled = false
      const sw = loadWorker(async () =>
        stalled ? new Promise<Response>((resolve) => (release = () => resolve(basic('<html>v2')))) : basic('<html>v1'),
      )
      await sw.navigate('/trips')
      stalled = true

      const { response, settled } = sw.startNavigation('/trips/abc/day/2')
      await vi.advanceTimersByTimeAsync(3999)
      let answered = false
      void response!.then(() => (answered = true))
      await vi.advanceTimersByTimeAsync(0)
      expect(answered).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(await (await response!).text()).toBe('<html>v1')

      release()
      await settled()
      expect(await sw.cachedText(version, '/trips')).toBe('<html>v2')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps waiting on a slow page that has no shell of its own', async () => {
    vi.useFakeTimers()
    try {
      let release = (): void => undefined
      let stalled = false
      const sw = loadWorker(async () =>
        stalled ? new Promise<Response>((resolve) => (release = () => resolve(basic('<html>invite')))) : basic('<html>root'),
      )
      await sw.navigate('/')
      stalled = true
      const { response } = sw.startNavigation('/trips/join/secret')
      await vi.advanceTimersByTimeAsync(10_000)
      release()
      expect(await (await response!).text()).toBe('<html>invite')
    } finally {
      vi.useRealTimers()
    }
  })

  it('answers with the navigation preload when the browser made one', async () => {
    const sw = loadWorker(async () => basic('<html>fetched'))
    await sw.extend('activate')
    expect(sw.enablePreload).toHaveBeenCalled()
    const { response, settled } = sw.startNavigation('/lab', { preloadResponse: Promise.resolve(basic('<html>preloaded')) })
    expect(await (await response!).text()).toBe('<html>preloaded')
    await settled()
    expect(sw.fetch).not.toHaveBeenCalled()
    expect(await sw.cachedText(version, '/lab')).toBe('<html>preloaded')
  })

  it('refreshes unhashed public files behind a cached answer', async () => {
    let body = 'old'
    const sw = loadWorker(async () => basic(body, 'image/jpeg'))
    expect(await (await sw.request('/og-chatbot.jpg?v=3', { destination: 'image' }))!.text()).toBe('old')
    body = 'new'
    expect(await (await sw.request('/og-chatbot.jpg?v=3', { destination: 'image' }))!.text()).toBe('old')
    expect(await (await sw.request('/og-chatbot.jpg?v=3', { destination: 'image' }))!.text()).toBe('new')
  })

  it('serves hashed bundles from cache without asking the network again', async () => {
    const sw = loadWorker(async () => basic('code', 'text/javascript'))
    await sw.request('/assets/index-abc.js', { destination: 'script' })
    await sw.request('/assets/index-abc.js', { destination: 'script' })
    expect(sw.fetch).toHaveBeenCalledTimes(1)
  })

  it('leaves the API, Clerk, previews and the worker itself to the network', async () => {
    const sw = loadWorker(async () => basic('{}', 'application/json'))
    for (const path of ['/api/korea/places', '/api/trips', '/__clerk/v1/client', '/preview/pr/3/', '/sw.js']) {
      expect(await sw.request(path, { destination: 'script' })).toBeUndefined()
    }
  })

  it('drops old caches, trims the runtime cache, and never navigates clients on activate', async () => {
    const sw = loadWorker(async () => basic('x', 'text/javascript'))
    sw.store.set('korea-offline-v1', new Map())
    sw.store.set('korea-offline-v1-korea-api', new Map())
    const runtime = new Map<string, Response>()
    for (let i = 0; i < 200; i++) runtime.set(`${ORIGIN}/assets/chunk-${i}.js`, basic('x'))
    sw.store.set(`${version}-runtime`, runtime)

    await sw.extend('activate')

    expect([...sw.store.keys()]).toEqual([`${version}-runtime`])
    expect(runtime.size).toBe(150)
    expect(runtime.has(`${ORIGIN}/assets/chunk-0.js`)).toBe(false)
    expect(runtime.has(`${ORIGIN}/assets/chunk-199.js`)).toBe(true)
    expect(sw.self.clients.claim).toHaveBeenCalled()
    expect(sw.self.clients.matchAll).not.toHaveBeenCalled()
  })
})

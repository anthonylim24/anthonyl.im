// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker, unregisterServiceWorker } from '../serviceWorker'

// Stub container shape matching ServiceWorkerContainer for type compat.
function makeContainer(register: ReturnType<typeof vi.fn>) {
  return {
    register,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    controller: null,
    ready: Promise.resolve({} as ServiceWorkerRegistration),
    startMessages: vi.fn(),
    oncontrollerchange: null,
    onmessage: null,
    onmessageerror: null,
    getRegistration: vi.fn(),
    getRegistrations: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as ServiceWorkerContainer
}

describe('service worker registration', () => {
  it('does not register outside production builds even when the flag is on', () => {
    const register = vi.fn().mockResolvedValue(undefined)
    const addEventListener = vi.fn()

    expect(
      registerServiceWorker(
        { PROD: false, VITE_ENABLE_SERVICE_WORKER: 'true' },
        { serviceWorker: makeContainer(register) },
        { addEventListener: addEventListener as Window['addEventListener'] },
      ),
    ).toBe(false)

    expect(addEventListener).not.toHaveBeenCalled()
    expect(register).not.toHaveBeenCalled()
  })

  it('does not register when the toggle is off (default) and clears any existing SW + caches', async () => {
    const register = vi.fn().mockResolvedValue(undefined)
    const unregister = vi.fn().mockResolvedValue(true)
    const cacheDelete = vi.fn().mockResolvedValue(true)
    const container = makeContainer(register) as unknown as ServiceWorkerContainer & {
      getRegistrations: () => Promise<ServiceWorkerRegistration[]>
    }
    container.getRegistrations = vi.fn().mockResolvedValue([{ unregister } as unknown as ServiceWorkerRegistration])
    const caches = {
      keys: vi.fn().mockResolvedValue(['stale-cache']),
      delete: cacheDelete,
    }

    expect(
      registerServiceWorker(
        { PROD: true, VITE_ENABLE_SERVICE_WORKER: 'false' },
        { serviceWorker: container },
        { addEventListener: vi.fn() as unknown as Window['addEventListener'] },
        { caches: caches as unknown as CacheStorage },
      ),
    ).toBe(false)

    // Cleanup runs asynchronously; wait for the microtask queue to drain.
    await new Promise((r) => setTimeout(r, 0))

    expect(register).not.toHaveBeenCalled()
    expect(container.getRegistrations).toHaveBeenCalled()
    expect(unregister).toHaveBeenCalled()
    expect(caches.keys).toHaveBeenCalled()
    expect(cacheDelete).toHaveBeenCalledWith('stale-cache')
  })

  it('registers the worker after window load in production when the toggle is on', async () => {
    const register = vi.fn().mockResolvedValue({
      waiting: null,
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    })
    let loadListener: EventListener | null = null
    const addEventListener = vi.fn((type: string, listener: EventListener) => {
      if (type === 'load') {
        loadListener = listener
      }
    })

    expect(
      registerServiceWorker(
        { PROD: true, VITE_ENABLE_SERVICE_WORKER: 'true' },
        { serviceWorker: makeContainer(register) },
        { addEventListener: addEventListener as Window['addEventListener'] },
      ),
    ).toBe(true)

    expect(addEventListener).toHaveBeenCalledWith('load', expect.any(Function), { once: true })
    expect(register).not.toHaveBeenCalled()

    expect(loadListener).toBeTypeOf('function')
    const listener = loadListener as unknown as EventListener
    listener(new Event('load'))
    await Promise.resolve()

    expect(register).toHaveBeenCalledWith('/sw.js')
  })

  it('unregisterServiceWorker tolerates a missing serviceWorker container', async () => {
    await expect(unregisterServiceWorker({}, { caches: undefined })).resolves.toBeUndefined()
  })

  it('ships a conservative same-origin offline cache worker', () => {
    const worker = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

    expect(worker).toMatch(/CACHE_VERSION = 'breathflow-offline-v\d+'/)
    expect(worker).toContain("'/breathwork'")
    expect(worker).toContain("'/breathwork/progress'")
    expect(worker).toContain("'/breathwork/session?technique=cyclic_sighing&rounds=30'")
    expect(worker).toContain("'/breathwork/session?technique=four_seven_eight&rounds=16'")
    expect(worker).toContain("request.mode === 'navigate'")
    expect(worker).toContain("url.pathname.startsWith('/api/')")
    expect(worker).toContain('Promise.allSettled')
    expect(worker).toContain("fetch(url, { cache: 'reload' })")
    expect(worker).not.toContain('cache.addAll(APP_SHELL)')
    expect(worker).toContain('function cachePutSafe')
    expect(worker).toContain('catch(() => undefined)')
    expect(worker).toContain('void cachePutSafe(cache, request, response.clone())')
    expect(worker).toContain('self.skipWaiting()')
    // New: SKIP_WAITING message bridge so client-side auto-update works.
    expect(worker).toContain('SKIP_WAITING')
  })
})

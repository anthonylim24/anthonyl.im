// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from '../serviceWorker'

describe('service worker registration', () => {
  it('does not register outside production builds', () => {
    const register = vi.fn().mockResolvedValue(undefined)
    const addEventListener = vi.fn()

    expect(
      registerServiceWorker(
        { PROD: false },
        { serviceWorker: { register } },
        { addEventListener: addEventListener as Window['addEventListener'] }
      )
    ).toBe(false)

    expect(addEventListener).not.toHaveBeenCalled()
    expect(register).not.toHaveBeenCalled()
  })

  it('registers the worker after window load in production', async () => {
    const register = vi.fn().mockResolvedValue(undefined)
    let loadListener: EventListener | null = null
    const addEventListener = vi.fn((type: string, listener: EventListener) => {
      if (type === 'load') {
        loadListener = listener
      }
    })

    expect(
      registerServiceWorker(
        { PROD: true },
        { serviceWorker: { register } },
        { addEventListener: addEventListener as Window['addEventListener'] }
      )
    ).toBe(true)

    expect(addEventListener).toHaveBeenCalledWith('load', expect.any(Function), { once: true })
    expect(register).not.toHaveBeenCalled()

    expect(loadListener).toBeTypeOf('function')
    const listener = loadListener as unknown as EventListener
    listener(new Event('load'))
    await Promise.resolve()

    expect(register).toHaveBeenCalledWith('/sw.js')
  })

  it('ships a conservative same-origin offline cache worker', () => {
    const worker = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

    expect(worker).toContain("CACHE_VERSION = 'breathflow-offline-v1'")
    expect(worker).toContain("'/breathwork'")
    expect(worker).toContain("request.mode === 'navigate'")
    expect(worker).toContain("url.pathname.startsWith('/api/')")
    expect(worker).toContain('cache.addAll(APP_SHELL)')
    expect(worker).toContain('self.skipWaiting()')
  })
})

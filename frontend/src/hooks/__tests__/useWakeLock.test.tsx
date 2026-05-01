import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from '../useWakeLock'

type WakeLockMock = WakeLockSentinel & {
  release: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  emitRelease: () => void
}

function createWakeLock(): WakeLockMock {
  const releaseListeners = new Set<EventListenerOrEventListenerObject>()

  const lock = {
    release: vi.fn(async () => {
      lock.emitRelease()
    }),
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'release') {
        releaseListeners.add(listener)
      }
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'release') {
        releaseListeners.delete(listener)
      }
    }),
    dispatchEvent: vi.fn(),
    released: false,
    type: 'screen',
    onrelease: null,
    emitRelease: () => {
      for (const listener of releaseListeners) {
        if (typeof listener === 'function') {
          listener(new Event('release'))
        } else {
          listener.handleEvent(new Event('release'))
        }
      }
    },
  } as unknown as WakeLockMock

  return lock
}

function installWakeLock(request: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request },
  })
}

function setVisibilityState(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  })
}

describe('useWakeLock', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'wakeLock')
  })

  it('does not request a wake lock when disabled', () => {
    const request = vi.fn()
    installWakeLock(request)

    renderHook(() => useWakeLock(false))

    expect(request).not.toHaveBeenCalled()
  })

  it('requests a screen wake lock and releases it on unmount', async () => {
    const lock = createWakeLock()
    const request = vi.fn().mockResolvedValue(lock)
    installWakeLock(request)

    const { unmount } = renderHook(() => useWakeLock(true))

    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'))

    unmount()

    expect(lock.release).toHaveBeenCalledTimes(1)
  })

  it('removes the release listener before intentionally releasing on unmount', async () => {
    const lock = createWakeLock()
    const request = vi.fn().mockResolvedValue(lock)
    installWakeLock(request)

    const { unmount } = renderHook(() => useWakeLock(true))

    await waitFor(() => expect(lock.addEventListener).toHaveBeenCalledWith(
      'release',
      expect.any(Function)
    ))

    const releaseListener = lock.addEventListener.mock.calls.find(
      ([type]) => type === 'release'
    )?.[1]

    unmount()

    expect(lock.removeEventListener).toHaveBeenCalledWith('release', releaseListener)
    expect(lock.release).toHaveBeenCalledTimes(1)
  })

  it('releases a wake lock that resolves after unmount', async () => {
    const lock = createWakeLock()
    let resolveRequest: (lock: WakeLockSentinel) => void = () => {}
    const request = vi.fn(
      () => new Promise<WakeLockSentinel>((resolve) => {
        resolveRequest = resolve
      })
    )
    installWakeLock(request)

    const { unmount } = renderHook(() => useWakeLock(true))
    unmount()

    await act(async () => {
      resolveRequest(lock)
    })

    expect(lock.release).toHaveBeenCalledTimes(1)
  })

  it('reacquires after browser releases the lock and the tab becomes visible', async () => {
    const firstLock = createWakeLock()
    const secondLock = createWakeLock()
    const request = vi.fn()
      .mockResolvedValueOnce(firstLock)
      .mockResolvedValueOnce(secondLock)
    installWakeLock(request)
    setVisibilityState('visible')

    renderHook(() => useWakeLock(true))

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))

    act(() => {
      firstLock.emitRelease()
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  })

  it('reacquires immediately when the browser releases a visible tab lock', async () => {
    const firstLock = createWakeLock()
    const secondLock = createWakeLock()
    const request = vi.fn()
      .mockResolvedValueOnce(firstLock)
      .mockResolvedValueOnce(secondLock)
    installWakeLock(request)
    setVisibilityState('visible')

    renderHook(() => useWakeLock(true))

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))

    act(() => {
      firstLock.emitRelease()
    })

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  })

  it('does not reacquire from an intentional unmount release', async () => {
    const lock = createWakeLock()
    const request = vi.fn().mockResolvedValue(lock)
    installWakeLock(request)
    setVisibilityState('visible')

    const { unmount } = renderHook(() => useWakeLock(true))

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))

    unmount()

    await waitFor(() => expect(lock.release).toHaveBeenCalledTimes(1))
    expect(request).toHaveBeenCalledTimes(1)
  })
})

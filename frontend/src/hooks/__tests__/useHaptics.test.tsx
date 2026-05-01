import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHaptics } from '../useHaptics'

const mocks = vi.hoisted(() => ({
  hapticsEnabled: true,
  constructed: vi.fn(),
  trigger: vi.fn(),
  cancel: vi.fn(),
  destroy: vi.fn(),
}))

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { hapticsEnabled: boolean }) => boolean) =>
    selector({ hapticsEnabled: mocks.hapticsEnabled }),
}))

vi.mock('web-haptics', () => ({
  WebHaptics: class {
    static isSupported = true

    constructor() {
      mocks.constructed()
    }

    trigger = mocks.trigger
    cancel = mocks.cancel
    destroy = mocks.destroy
  },
}))

afterEach(() => {
  mocks.hapticsEnabled = true
  vi.clearAllMocks()
})

describe('useHaptics', () => {
  it('does not create or trigger haptics while disabled', async () => {
    mocks.hapticsEnabled = false

    const { result } = renderHook(() => useHaptics())

    await Promise.resolve()

    act(() => {
      result.current.trigger('selection')
    })

    expect(result.current.isSupported).toBe(false)
    expect(mocks.constructed).not.toHaveBeenCalled()
    expect(mocks.trigger).not.toHaveBeenCalled()
  })

  it('loads web haptics on demand when enabled', async () => {
    const { result } = renderHook(() => useHaptics())

    await waitFor(() => {
      expect(result.current.isSupported).toBe(true)
    })

    act(() => {
      result.current.trigger('selection')
      result.current.cancel()
    })

    expect(mocks.constructed).toHaveBeenCalledTimes(1)
    expect(mocks.trigger).toHaveBeenCalledWith('selection', undefined)
    expect(mocks.cancel).toHaveBeenCalledTimes(1)
  })

  it('destroys the haptics instance on unmount', async () => {
    const { unmount } = renderHook(() => useHaptics())

    await waitFor(() => {
      expect(mocks.constructed).toHaveBeenCalledTimes(1)
    })

    const destroyCount = mocks.destroy.mock.calls.length
    unmount()

    expect(mocks.destroy).toHaveBeenCalledTimes(destroyCount + 1)
  })
})

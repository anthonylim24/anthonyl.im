import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useBodyScrollLock, __testing } from '../useBodyScrollLock'

beforeEach(() => {
  __testing.reset()
  document.body.removeAttribute('style')
  document.documentElement.removeAttribute('style')
  // Force scrollY value for assertion. jsdom always reports 0, but we
  // assign so the hook reads it correctly.
  Object.defineProperty(window, 'scrollY', { value: 240, configurable: true })
  Object.defineProperty(window, 'pageYOffset', { value: 240, configurable: true })
})

afterEach(() => {
  __testing.reset()
  document.body.removeAttribute('style')
  document.documentElement.removeAttribute('style')
})

describe('useBodyScrollLock', () => {
  it('pins body and html on mount when active', () => {
    renderHook(() => useBodyScrollLock(true))

    expect(document.body.style.position).toBe('fixed')
    expect(document.body.style.top).toBe('-240px')
    expect(document.body.style.left).toBe('0px')
    expect(document.body.style.right).toBe('0px')
    expect(document.body.style.width).toBe('100%')
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.body.style.overscrollBehavior).toBe('none')
    expect(document.documentElement.style.overscrollBehavior).toBe('none')
  })

  it('does nothing when inactive', () => {
    renderHook(() => useBodyScrollLock(false))

    expect(document.body.style.position).toBe('')
    expect(document.body.style.top).toBe('')
    expect(__testing.getCount()).toBe(0)
  })

  it('releases body styles on unmount and restores scroll position', () => {
    const { unmount } = renderHook(() => useBodyScrollLock(true))

    expect(document.body.style.position).toBe('fixed')
    expect(__testing.getCount()).toBe(1)

    unmount()

    expect(document.body.style.position).toBe('')
    expect(document.body.style.top).toBe('')
    expect(document.body.style.overflow).toBe('')
    expect(document.documentElement.style.overflow).toBe('')
    expect(__testing.getCount()).toBe(0)
  })

  it('composes via refcount — two locks, one unlock keeps body pinned', () => {
    const a = renderHook(() => useBodyScrollLock(true))
    const b = renderHook(() => useBodyScrollLock(true))

    expect(__testing.getCount()).toBe(2)
    expect(document.body.style.position).toBe('fixed')

    a.unmount()
    expect(__testing.getCount()).toBe(1)
    // Body must still be locked because the second hook is still active.
    expect(document.body.style.position).toBe('fixed')

    b.unmount()
    expect(__testing.getCount()).toBe(0)
    expect(document.body.style.position).toBe('')
  })

  it('preserves the original body inline styles and restores them on unlock', () => {
    document.body.style.position = 'relative'
    document.body.style.overflow = 'auto'

    const { unmount } = renderHook(() => useBodyScrollLock(true))
    expect(document.body.style.position).toBe('fixed')

    unmount()
    expect(document.body.style.position).toBe('relative')
    expect(document.body.style.overflow).toBe('auto')
  })
})

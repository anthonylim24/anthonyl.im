/**
 * useBodyScrollLock — prevent document scroll while a full-screen session is
 * mounted, in a way that actually works on real iOS Safari.
 *
 * Why this exists (and why nothing simpler works on iPhones):
 * - `overflow: hidden` on html/body is ignored by iOS Safari for the
 *   document-level rubber-band gesture (WebKit #176454 — partial support
 *   added in iOS 16; still unreliable across 16–18).
 * - `overscroll-behavior: none` is silently a no-op on iOS 15.x and only
 *   partially honored on 16+; can't be relied on alone.
 * - `touch-action: none` on the page does not block iOS scroll (WebKit
 *   #133112 / #149854 — only `auto` and `manipulation` are wired for
 *   scroll-prevention purposes).
 * - `position: fixed; inset: 0` on a container does NOT stop the body
 *   underneath from scrolling on iOS (Remy Sharp 2012; still reproducible
 *   in 2026 — WebKit #233417).
 *
 * The reliable pattern, used by react-remove-scroll, body-scroll-lock,
 * Headless UI, and MUI's Modal, is to pin `body` itself with `position:
 * fixed` plus an offset that preserves the user's visual scroll position.
 * The body can't scroll if it is itself a fixed element. On unlock, the
 * styles are restored and `window.scrollTo()` returns the user to their
 * pre-lock position.
 *
 * SSR-safe — early-returns when `document` is unavailable.
 */
import { useEffect } from 'react'

interface BodyScrollLockState {
  count: number
  // Saved values to restore once the *last* lock unmounts.
  scrollY: number
  bodyPosition: string
  bodyTop: string
  bodyLeft: string
  bodyRight: string
  bodyWidth: string
  bodyOverflow: string
  htmlOverflow: string
  htmlOverscroll: string
  bodyOverscroll: string
}

// Module-level state so nested locks compose. The body is only unlocked
// when the count reaches zero again.
const state: BodyScrollLockState = {
  count: 0,
  scrollY: 0,
  bodyPosition: '',
  bodyTop: '',
  bodyLeft: '',
  bodyRight: '',
  bodyWidth: '',
  bodyOverflow: '',
  htmlOverflow: '',
  htmlOverscroll: '',
  bodyOverscroll: '',
}

function applyLock() {
  const body = document.body
  const html = document.documentElement
  const scrollY = window.scrollY || window.pageYOffset || 0

  state.scrollY = scrollY
  state.bodyPosition = body.style.position
  state.bodyTop = body.style.top
  state.bodyLeft = body.style.left
  state.bodyRight = body.style.right
  state.bodyWidth = body.style.width
  state.bodyOverflow = body.style.overflow
  state.htmlOverflow = html.style.overflow
  state.htmlOverscroll = html.style.overscrollBehavior
  state.bodyOverscroll = body.style.overscrollBehavior

  body.style.position = 'fixed'
  body.style.top = `-${scrollY}px`
  body.style.left = '0'
  body.style.right = '0'
  body.style.width = '100%'
  body.style.overflow = 'hidden'
  html.style.overflow = 'hidden'
  // Belt + suspenders — also kill rubber-band where the browser honors it.
  html.style.overscrollBehavior = 'none'
  body.style.overscrollBehavior = 'none'
}

function releaseLock() {
  const body = document.body
  const html = document.documentElement

  body.style.position = state.bodyPosition
  body.style.top = state.bodyTop
  body.style.left = state.bodyLeft
  body.style.right = state.bodyRight
  body.style.width = state.bodyWidth
  body.style.overflow = state.bodyOverflow
  html.style.overflow = state.htmlOverflow
  html.style.overscrollBehavior = state.htmlOverscroll
  body.style.overscrollBehavior = state.bodyOverscroll

  // Restore the user's visual scroll position. `auto` instead of `smooth`
  // so this is instantaneous (no jarring animation on session exit).
  window.scrollTo({ top: state.scrollY, left: 0, behavior: 'auto' })
}

/**
 * Locks document scroll while `active` is true. Returns nothing — the lock
 * lifecycle is tied to React's mount/unmount and the `active` flag.
 *
 * Multiple locks compose via a refcount, so nested overlays unlock cleanly.
 */
export function useBodyScrollLock(active: boolean = true): void {
  useEffect(() => {
    if (!active) return
    if (typeof document === 'undefined' || typeof window === 'undefined') return

    if (state.count === 0) {
      applyLock()
    }
    state.count += 1

    return () => {
      state.count = Math.max(0, state.count - 1)
      if (state.count === 0) {
        releaseLock()
      }
    }
  }, [active])
}

// Exposed for tests so they can assert on the refcount without poking at
// implementation details directly.
export const __testing = {
  getCount: () => state.count,
  reset: () => {
    state.count = 0
  },
}

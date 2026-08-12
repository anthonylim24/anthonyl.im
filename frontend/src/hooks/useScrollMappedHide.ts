import { useEffect, type RefObject } from 'react'

const EDGE_PX = 16
const DIRECTION_PX = 8

function readWindowY(): number {
  return window.scrollY || window.pageYOffset || 0
}

function readMaxWindowY(): number {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight
  return Math.max(0, document.documentElement.scrollHeight - viewportHeight)
}

/**
 * Hides a fixed footer while scrolling down and reveals it on scroll up.
 * Transform is toggled; CSS on the element eases the move so iOS URL-bar
 * jitter and rubber-band deltas cannot 1:1-drive the capsule.
 *
 * Overscroll is clamped before the delta is read, and the capsule is always
 * shown within EDGE_PX of the document top or bottom.
 */
export function useScrollMappedHide(
  ref: RefObject<HTMLElement | null>,
  {
    translateX,
    maxHidden,
    enabled,
    scrollRootRef,
  }: {
    translateX: string
    maxHidden: number
    enabled: boolean
    scrollRootRef?: RefObject<HTMLElement | null>
  },
) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const shown = `translate3d(${translateX}, 0px, 0)`
    const hidden = `translate3d(${translateX}, ${maxHidden}px, 0)`

    if (!enabled) {
      el.style.transform = shown
      return
    }

    const scrollRoot = scrollRootRef?.current ?? null
    const readY = () => (scrollRoot ? scrollRoot.scrollTop : readWindowY())
    const readMaxY = () =>
      scrollRoot
        ? Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight)
        : readMaxWindowY()

    let lastY = Math.max(0, Math.min(readMaxY(), readY()))
    let isHidden = false

    const apply = (nextHidden: boolean) => {
      if (isHidden === nextHidden) return
      isHidden = nextHidden
      el.style.transform = nextHidden ? hidden : shown
    }

    const onScroll = () => {
      const maxY = readMaxY()
      const y = Math.max(0, Math.min(maxY, readY()))
      const dy = y - lastY
      lastY = y

      if (y <= EDGE_PX || y >= maxY - EDGE_PX) {
        apply(false)
        return
      }
      if (dy > DIRECTION_PX) apply(true)
      else if (dy < -DIRECTION_PX) apply(false)
    }

    el.style.transform = shown
    const target: EventTarget = scrollRoot ?? window
    target.addEventListener('scroll', onScroll, { passive: true })
    window.visualViewport?.addEventListener('resize', onScroll)
    window.visualViewport?.addEventListener('scroll', onScroll)

    return () => {
      target.removeEventListener('scroll', onScroll)
      window.visualViewport?.removeEventListener('resize', onScroll)
      window.visualViewport?.removeEventListener('scroll', onScroll)
    }
  }, [ref, translateX, maxHidden, enabled, scrollRootRef])
}

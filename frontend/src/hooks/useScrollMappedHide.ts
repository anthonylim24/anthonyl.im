import { useEffect, type RefObject } from 'react'

/**
 * Translates a fixed-position element along the Y axis 1:1 with vertical
 * scroll, hiding it as the user scrolls down and revealing it as they
 * scroll up. The offset is mutated directly on the DOM via
 * `requestAnimationFrame` so the mapping feels instant — no React state
 * round-trip, no debounce, no easing curve fighting the user's gesture.
 *
 * Direct mapping is the design goal: every pixel of scroll delta moves
 * the element exactly one pixel until it hits the clamp at either end.
 * No snapping or auto-finish on scroll-stop — the element rests wherever
 * the gesture leaves it.
 *
 * Special-cases the top and bottom of the scroller (within 8px) so the
 * element is fully visible at rest. Without the top reset, route changes
 * that reset `scrollY` to 0 can leave the element stuck off-screen.
 * Without the bottom reset, hide-on-scroll leaves a dead zone of content
 * padding where the nav used to sit.
 *
 * @param ref Element whose `transform` we mutate. The caller is expected
 *   to set the X portion of its transform via a separate CSS rule (we
 *   compose with `translateX(-50%)` for bottom-centered pills) — we only
 *   own the Y axis.
 * @param translateX X-axis portion to preserve in the composed transform.
 * @param maxHidden Maximum number of pixels to translate downward. Should
 *   be the element's height + its bottom inset so the element fully
 *   leaves the viewport.
 * @param enabled When false the hook is inert and resets the inline
 *   transform — used to disable the behavior on desktop, in reduced-
 *   motion mode, or when the element is unmounted from session routes.
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

    if (!enabled) {
      el.style.transform = `translate3d(${translateX}, 0px, 0)`
      return
    }

    const scrollRoot = scrollRootRef?.current ?? null
    const readY = () => (scrollRoot ? scrollRoot.scrollTop : window.scrollY)

    let lastY = readY()
    let offset = 0
    let raf = 0
    let pending = false

    const apply = () => {
      pending = false
      el.style.transform = `translate3d(${translateX}, ${offset}px, 0)`
    }

    const onScroll = () => {
      const y = readY()
      const dy = y - lastY
      lastY = y
      const maxY = scrollRoot
        ? Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight)
        : Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      if (y < 8 || y >= maxY - 8) {
        offset = 0
      } else {
        offset = Math.max(0, Math.min(maxHidden, offset + dy))
      }
      if (!pending) {
        pending = true
        raf = requestAnimationFrame(apply)
      }
    }

    apply()
    const target: EventTarget = scrollRoot ?? window
    target.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      target.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [ref, translateX, maxHidden, enabled, scrollRootRef])
}

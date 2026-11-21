/**
 * How a scripted scroll moves: smoothly, unless the traveller asked for less
 * motion. Read at call time (a scroll is a one-off), so no listener per card.
 */
export function scrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
}

/** The nearest ancestor that scrolls, or null for the page. */
export function scroller(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node
  }
  return null
}

/**
 * Scrolls whatever holds `target` (the itinerary pane on wide screens, the
 * page on phones) until it sits `gap` px under the sticky day rail, where the
 * rail sits once stuck. Only ever down: a target already that high stays put.
 * The default gap clears the one-line leg above a card or the Now line, so the
 * rail never slices it.
 */
export function scrollUnderRail(target: HTMLElement, gap = 24): void {
  const box = scroller(target)
  const rail = document.querySelector<HTMLElement>("[data-day-rail]")
  const top = box ? box.getBoundingClientRect().top : 0
  const under = top + (rail ? (parseFloat(getComputedStyle(rail).top) || 0) + rail.offsetHeight : 0)
  const delta = target.getBoundingClientRect().top - under - gap
  if (delta > 1) (box ?? window).scrollBy({ top: delta, behavior: scrollBehavior() })
}

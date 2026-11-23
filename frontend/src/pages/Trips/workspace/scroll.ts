/**
 * How a scripted scroll moves: smoothly, unless the traveller asked for less
 * motion. Read at call time (a scroll is a one-off), so no listener per card.
 */
export function scrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
}

/** Which ends of a sideways scroller have content scrolled out of sight. */
export type Clipped = "none" | "start" | "end" | "both"

export function clippedEnds(el: HTMLElement): Clipped {
  const start = el.scrollLeft > 1
  const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
  return start && end ? "both" : start ? "start" : end ? "end" : "none"
}

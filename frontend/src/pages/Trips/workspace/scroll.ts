/**
 * How a scripted scroll moves: smoothly, unless the traveller asked for less
 * motion. Read at call time (a scroll is a one-off), so no listener per card.
 */
export function scrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
}

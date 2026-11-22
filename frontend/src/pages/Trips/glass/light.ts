// The light on the glass: one angle, `--tg-light` on the root, that the
// specular rims in `glass.css` turn toward. It follows a hovering pointer
// (the light sits where the pointer is, seen from the middle of the screen),
// quantised so it changes only every few degrees, and holds still while a
// button is down or the page scrolls: a custom property on the root restyles
// the whole page, so it must not change every frame of a drag or a scroll.
// Touch has no hover; there the light stays at its resting angle, as it does
// under reduced motion.

/** Resting light: from the top left, as every shadow in Trips falls. */
export const REST_ANGLE = 315
const STEP = 10
const SCROLL_HOLD_MS = 180

/**
 * Where the light comes from for a pointer at (x, y) in a w × h viewport, as
 * a `conic-gradient` angle (0 = from the top, clockwise) in STEP-degree steps.
 * Near the middle the direction is noise, so it rests.
 */
export function lightAngle(x: number, y: number, w: number, h: number): number {
  const dx = x - w / 2
  const dy = y - h / 2
  if (Math.hypot(dx, dy) < Math.min(w, h) * 0.08) return REST_ANGLE
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90
  return (((Math.round(deg / STEP) * STEP) % 360) + 360) % 360
}

export function startLight(): () => void {
  const root = document.documentElement
  const set = (deg: number) => root.style.setProperty("--tg-light", `${deg}deg`)
  set(REST_ANGLE)
  const still = window.matchMedia("(prefers-reduced-motion: reduce)")
  let angle = REST_ANGLE
  let pending = REST_ANGLE
  let frame = 0
  let heldUntil = 0

  const write = () => {
    frame = 0
    if (pending === angle) return
    angle = pending
    set(angle)
  }
  const onMove = (event: PointerEvent) => {
    if (still.matches || event.pointerType === "touch" || event.buttons !== 0) return
    if (event.timeStamp < heldUntil) return
    const next = lightAngle(event.clientX, event.clientY, window.innerWidth, window.innerHeight)
    if (next === pending) return
    pending = next
    if (!frame) frame = requestAnimationFrame(write)
  }
  const onScroll = (event: Event) => {
    heldUntil = event.timeStamp + SCROLL_HOLD_MS
  }
  const onStill = () => {
    if (!still.matches) return
    pending = REST_ANGLE
    if (!frame) frame = requestAnimationFrame(write)
  }
  window.addEventListener("pointermove", onMove, { passive: true })
  window.addEventListener("scroll", onScroll, { passive: true, capture: true })
  window.addEventListener("wheel", onScroll, { passive: true, capture: true })
  still.addEventListener("change", onStill)
  return () => {
    if (frame) cancelAnimationFrame(frame)
    window.removeEventListener("pointermove", onMove)
    window.removeEventListener("scroll", onScroll, { capture: true })
    window.removeEventListener("wheel", onScroll, { capture: true })
    still.removeEventListener("change", onStill)
    root.style.removeProperty("--tg-light")
  }
}

// The light on the glass: one angle, `--tg-light`, that the specular rims in
// `glass.css` turn toward. It follows a hovering pointer (the light sits
// where the pointer is, seen from the middle of the screen), quantised so it
// changes only every few degrees, and holds still while a button is down or
// the page scrolls. Touch has no hover; there the light stays at its resting
// angle, as it does under reduced motion.
//
// The angle is written, in one frame, to the glass surfaces themselves, as a
// registered property that does not inherit (each rim takes it from its own
// surface). Measured on a trip overview at 4× CPU: on the root it restyled
// all ~640 elements, 9–11 ms per change; in one class-scoped rule the
// stylesheet update alone cost 4–5 ms; on the half-dozen surfaces, 1 ms.

/** Resting light: from the top left, as every shadow in Trips falls. */
export const REST_ANGLE = 315
const STEP = 10
const SCROLL_HOLD_MS = 180
const CLASSES = ["trips-glass-bar", "trips-glass-pill", "trips-glass-sheet"] as const

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
  const surfaces = CLASSES.map((name) => document.getElementsByClassName(name))
  const still = window.matchMedia("(prefers-reduced-motion: reduce)")
  let angle = REST_ANGLE
  let pending = REST_ANGLE
  let frame = 0
  let heldUntil = 0
  let late = 0

  const paint = (value: string | null) => {
    for (const list of surfaces) {
      for (const el of Array.from(list) as HTMLElement[]) {
        if (value === null) el.style.removeProperty("--tg-light")
        else el.style.setProperty("--tg-light", value)
      }
    }
  }
  const write = () => {
    frame = 0
    if (pending === angle) return
    angle = pending
    paint(angle === REST_ANGLE ? null : `${angle}deg`)
  }
  const aim = (next: number) => {
    if (next === pending) return
    pending = next
    if (!frame) frame = requestAnimationFrame(write)
  }
  const onMove = (event: PointerEvent) => {
    if (still.matches || event.pointerType === "touch" || event.buttons !== 0) return
    if (event.timeStamp < heldUntil) return
    aim(lightAngle(event.clientX, event.clientY, window.innerWidth, window.innerHeight))
  }
  const onScroll = (event: Event) => {
    heldUntil = event.timeStamp + SCROLL_HOLD_MS
  }
  // A click may open a menu or a sheet; it takes the light the rest already have.
  const onClick = () => {
    if (angle === REST_ANGLE) return
    window.clearTimeout(late)
    late = window.setTimeout(() => paint(`${angle}deg`), 60)
  }
  const onStill = () => {
    if (still.matches) aim(REST_ANGLE)
  }
  window.addEventListener("pointermove", onMove, { passive: true })
  window.addEventListener("scroll", onScroll, { passive: true, capture: true })
  window.addEventListener("wheel", onScroll, { passive: true, capture: true })
  window.addEventListener("click", onClick, { capture: true })
  still.addEventListener("change", onStill)
  return () => {
    if (frame) cancelAnimationFrame(frame)
    window.clearTimeout(late)
    window.removeEventListener("pointermove", onMove)
    window.removeEventListener("scroll", onScroll, { capture: true })
    window.removeEventListener("wheel", onScroll, { capture: true })
    window.removeEventListener("click", onClick, { capture: true })
    still.removeEventListener("change", onStill)
    paint(null)
  }
}

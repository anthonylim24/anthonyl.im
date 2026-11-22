// Where a kit menu sits. It floats over the page (portalled, `position:
// fixed`) so a pane that clips its overflow cannot cut it off; this works out
// the spot: beside its button, on the side asked for unless the other has
// more room, and shifted to stay inside the viewport.

export interface Box {
  top: number
  right: number
  bottom: number
  left: number
}

export interface MenuPlacement {
  top: number
  left: number
  /** Opens upward (it sits above its button). */
  up: boolean
  /** Set only when the menu is taller than the room it has: it scrolls. */
  maxHeight: number | null
  transformOrigin: string
}

/** Space between the button and the menu, and the menu and the viewport edge (px). */
const GAP = 6
const MARGIN = 8

export function placeMenu({
  trigger,
  size,
  viewport,
  align,
  side,
}: {
  trigger: Box
  size: { width: number; height: number }
  viewport: { width: number; height: number }
  align: "start" | "end"
  side: "down" | "up"
}): MenuPlacement {
  const below = viewport.height - trigger.bottom - GAP - MARGIN
  const above = trigger.top - GAP - MARGIN
  const up = side === "up" ? size.height <= above || above >= below : size.height > below && above > below
  const room = Math.max(0, up ? above : below)
  const height = Math.min(size.height, room)
  const top = up ? trigger.top - GAP - height : trigger.bottom + GAP

  const wanted = align === "end" ? trigger.right - size.width : trigger.left
  const left = Math.max(MARGIN, Math.min(wanted, viewport.width - MARGIN - size.width))

  return {
    top,
    left,
    up,
    maxHeight: size.height > room ? room : null,
    transformOrigin: `${up ? "bottom" : "top"} ${align === "end" ? "right" : "left"}`,
  }
}

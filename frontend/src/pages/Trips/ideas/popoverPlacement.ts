import { placeMenu, type Box } from "../components/menuPlacement"

// Where the details popover sits on a wide screen: beside the wishlist row
// that opened it, on the right (over the map) when it fits, else the left,
// its top level with the row's and pushed up to stay on screen. When neither
// side has room it drops below or above the row, as a kit menu does.

export interface PopoverPlacement {
  top: number
  left: number
  /** Set only when the popover is taller than the viewport allows: it scrolls. */
  maxHeight: number | null
  side: "right" | "left" | "below" | "above"
  transformOrigin: string
}

/** Space between the row and the popover, and the popover and the viewport edge (px). */
const GAP = 12
const MARGIN = 8

export function placeBeside({
  anchor,
  size,
  viewport,
}: {
  anchor: Box
  size: { width: number; height: number }
  viewport: { width: number; height: number }
}): PopoverPlacement {
  const right = viewport.width - anchor.right - GAP - MARGIN
  const left = anchor.left - GAP - MARGIN
  if (size.width <= right || size.width <= left) {
    const side = size.width <= right ? "right" : "left"
    const room = viewport.height - 2 * MARGIN
    const height = Math.min(size.height, room)
    const top = Math.max(MARGIN, Math.min(anchor.top, viewport.height - MARGIN - height))
    return {
      top,
      left: side === "right" ? anchor.right + GAP : anchor.left - GAP - size.width,
      maxHeight: size.height > room ? room : null,
      side,
      transformOrigin: `top ${side === "right" ? "left" : "right"}`,
    }
  }
  const menu = placeMenu({ trigger: anchor, size, viewport, align: "start", side: "down" })
  return { top: menu.top, left: menu.left, maxHeight: menu.maxHeight, side: menu.up ? "above" : "below", transformOrigin: menu.transformOrigin }
}

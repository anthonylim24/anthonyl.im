import type { Box } from "../components/menuPlacement"

// Where a pin's preview card sits inside the map: above the pin, centred on
// it, or below it when the top of the map has no room, else beside it. The
// map clips what spills over its edge, so the card is always kept inside.

export type PreviewSide = "above" | "below" | "right" | "left"

export interface PreviewPlacement {
  top: number
  left: number
  side: PreviewSide
}

/** Space between the pin and the card, and the card and the map's edge (px). */
const GAP = 10
const MARGIN = 8

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)))

/** `anchor` is the pin's box in the map's own coordinates; `bounds` the map's size. */
export function placePreview({
  anchor,
  size,
  bounds,
}: {
  anchor: Box
  size: { width: number; height: number }
  bounds: { width: number; height: number }
}): PreviewPlacement {
  const centreX = clamp((anchor.left + anchor.right) / 2 - size.width / 2, MARGIN, bounds.width - MARGIN - size.width)
  const centreY = clamp((anchor.top + anchor.bottom) / 2 - size.height / 2, MARGIN, bounds.height - MARGIN - size.height)
  const above = anchor.top - GAP - size.height
  if (above >= MARGIN) return { top: above, left: centreX, side: "above" }
  const below = anchor.bottom + GAP
  if (below + size.height <= bounds.height - MARGIN) return { top: below, left: centreX, side: "below" }
  const right = anchor.right + GAP
  if (right + size.width <= bounds.width - MARGIN) return { top: centreY, left: right, side: "right" }
  const left = anchor.left - GAP - size.width
  if (left >= MARGIN) return { top: centreY, left, side: "left" }
  // A map too small for the card on any side: the roomier of above and below, kept inside the map.
  const roomAbove = anchor.top
  const roomBelow = bounds.height - anchor.bottom
  return roomAbove >= roomBelow
    ? { top: clamp(above, MARGIN, bounds.height - MARGIN - size.height), left: centreX, side: "above" }
    : { top: clamp(below, MARGIN, bounds.height - MARGIN - size.height), left: centreX, side: "below" }
}

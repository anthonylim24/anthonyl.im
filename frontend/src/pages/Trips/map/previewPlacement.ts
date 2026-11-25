import type { Box } from "../components/menuPlacement"

// Where a pin's preview card sits inside the map: above the pin, centred on
// it, or below it when the top of the map has no room, else beside it; of
// the sides with room, the first that covers the fewest other pins, since a
// pin under the card can be neither seen nor pointed at while it shows. The
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

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** `anchor` is the pin's box in the map's own coordinates, `avoid` the other pins' boxes; `bounds` the map's size. */
export function placePreview({
  anchor,
  size,
  bounds,
  avoid = [],
}: {
  anchor: Box
  size: { width: number; height: number }
  bounds: { width: number; height: number }
  avoid?: readonly Box[]
}): PreviewPlacement {
  const centreX = clamp((anchor.left + anchor.right) / 2 - size.width / 2, MARGIN, bounds.width - MARGIN - size.width)
  const centreY = clamp((anchor.top + anchor.bottom) / 2 - size.height / 2, MARGIN, bounds.height - MARGIN - size.height)
  const above = anchor.top - GAP - size.height
  const below = anchor.bottom + GAP
  const right = anchor.right + GAP
  const left = anchor.left - GAP - size.width
  const sides: PreviewPlacement[] = []
  if (above >= MARGIN) sides.push({ top: above, left: centreX, side: "above" })
  if (below + size.height <= bounds.height - MARGIN) sides.push({ top: below, left: centreX, side: "below" })
  if (right + size.width <= bounds.width - MARGIN) sides.push({ top: centreY, left: right, side: "right" })
  if (left >= MARGIN) sides.push({ top: centreY, left, side: "left" })
  if (sides.length > 0) {
    const covered = (at: PreviewPlacement) =>
      avoid.filter((pin) => overlaps(pin, { top: at.top, bottom: at.top + size.height, left: at.left, right: at.left + size.width })).length
    return sides.reduce((best, at) => (covered(at) < covered(best) ? at : best))
  }
  // A map too small for the card on any side: the roomier of above and below, kept inside the map.
  const roomAbove = anchor.top
  const roomBelow = bounds.height - anchor.bottom
  return roomAbove >= roomBelow
    ? { top: clamp(above, MARGIN, bounds.height - MARGIN - size.height), left: centreX, side: "above" }
    : { top: clamp(below, MARGIN, bounds.height - MARGIN - size.height), left: centreX, side: "below" }
}

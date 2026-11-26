import type { Box } from "../components/menuPlacement"

// Of the sides with room, the card takes the first covering the fewest other
// pins: a pin under it can be neither seen nor pointed at. The map clips
// what spills over its edge, so the card is always kept inside.

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

/**
 * `anchor` is the pin's box in the map's own coordinates, `avoid` the other
 * pins' boxes; `bounds` the map's size. `keep` is the side the card is on:
 * while it still fits there, a card that changes size as it shows (a photo's
 * room shutting) stays on it rather than jumping to another.
 */
export function placePreview({
  anchor,
  size,
  bounds,
  avoid = [],
  keep,
}: {
  anchor: Box
  size: { width: number; height: number }
  bounds: { width: number; height: number }
  avoid?: readonly Box[]
  keep?: PreviewSide
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
  const kept = sides.find((at) => at.side === keep)
  if (kept) return kept
  if (sides.length > 0) {
    const covered = (at: PreviewPlacement) =>
      avoid.filter((pin) => overlaps(pin, { top: at.top, bottom: at.top + size.height, left: at.left, right: at.left + size.width })).length
    return sides.reduce((best, at) => (covered(at) < covered(best) ? at : best))
  }
  const roomAbove = anchor.top
  const roomBelow = bounds.height - anchor.bottom
  return roomAbove >= roomBelow
    ? { top: clamp(above, MARGIN, bounds.height - MARGIN - size.height), left: centreX, side: "above" }
    : { top: clamp(below, MARGIN, bounds.height - MARGIN - size.height), left: centreX, side: "below" }
}

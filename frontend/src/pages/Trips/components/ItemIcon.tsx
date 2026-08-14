import { createElement } from "react"
import { itemIcon } from "../theme"

/**
 * Resolves an itinerary item to its Lucide glyph. A component rather than a
 * bare `itemIcon()` call at the use site so the icon isn't a new component
 * type on every render.
 */
export function ItemIcon({
  kind,
  category,
  reservationType,
  className = "h-4 w-4 text-[color:var(--tr-ink-muted)]",
  strokeWidth = 1.5,
}: {
  kind: string
  category?: string
  reservationType?: string
  className?: string
  strokeWidth?: number
}) {
  // createElement, not JSX: the glyph is looked up from a table, so a
  // capitalized local would read to lint as a component defined per render.
  return createElement(itemIcon(kind, category, reservationType), {
    className,
    strokeWidth,
    "aria-hidden": true,
  })
}

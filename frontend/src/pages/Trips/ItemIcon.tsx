import { createElement } from "react"
import type { LucideProps } from "lucide-react"
import { itemIcon } from "./meta"
import type { ItemKind } from "./types"

/**
 * The glyph for an itinerary item. `itemIcon` picks one of a fixed set of
 * module-level icons, so rendering it through `createElement` never creates a
 * component during render (the React compiler cannot see that through a
 * local `const Icon = itemIcon(...)`).
 */
export function ItemIcon({
  kind,
  category,
  reservationType,
  ...props
}: { kind: ItemKind; category?: string; reservationType?: string } & LucideProps) {
  return createElement(itemIcon(kind, category, reservationType), props)
}

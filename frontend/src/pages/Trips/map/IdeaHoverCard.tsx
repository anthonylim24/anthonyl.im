import { useLayoutEffect, useRef, type ReactNode } from "react"
import { sx } from "@/styles/merge"
import { hoverCard as s } from "./hoverCard.stylex"
import { previewId, type IdeaHover } from "./ideaHover"
import type { HoldIdeaHover } from "./useIdeaHover"
import { placePreview } from "./previewPlacement"

// The card of the map's one wishlist preview, drawn inside the map beside
// its pin. Which pin, if any, is `useIdeaHover`'s; the mouse may rest on
// the card (`hold`) as on the pin.

/** The preview's frame: placed beside its pin inside the map, under the id the pin names as its description. */
export function IdeaHoverCard({ hover, hold, children }: { hover: IdeaHover; hold?: HoldIdeaHover; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const card = ref.current
    if (!card) return
    const place = () => {
      const map = card.offsetParent
      if (!map) return
      const box = map.getBoundingClientRect()
      const pin = hover.anchor.getBoundingClientRect()
      const at = placePreview({
        anchor: { top: pin.top - box.top, bottom: pin.bottom - box.top, left: pin.left - box.left, right: pin.right - box.left },
        size: { width: card.offsetWidth, height: card.offsetHeight },
        bounds: { width: box.width, height: box.height },
      })
      // Above the pin the card hangs from its foot, so a photo that fails to load shrinks it toward the pin.
      card.style.top = at.side === "above" ? "auto" : `${at.top}px`
      card.style.bottom = at.side === "above" ? `${box.height - at.top - card.offsetHeight}px` : "auto"
      card.style.left = `${at.left}px`
      card.style.transformOrigin = { above: "bottom center", below: "top center", right: "center left", left: "center right" }[at.side]
    }
    place()
    // A photo's frame given back when a place has none: placed again, still beside the pin.
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(place)
    observer.observe(card)
    return () => observer.disconnect()
  }, [hover])
  return (
    <div ref={ref} id={previewId(hover.id)} role="tooltip" {...sx(s.card, "trips-glass-sheet")} {...hold}>
      {children}
    </div>
  )
}

import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react"
import { sx } from "@/styles/merge"
import { hoverCard as s } from "./hoverCard.stylex"
import type { IdeaHover } from "./ideaHover"
import { placePreview } from "./previewPlacement"

// The card of the map's one wishlist preview, drawn inside the map beside
// its pin. Which pin, if any, is `useIdeaHover`'s.

/** The preview's frame: placed beside its pin inside the map, named as the pin's description. */
export function IdeaHoverCard({ hover, children }: { hover: IdeaHover; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useLayoutEffect(() => {
    const card = ref.current
    const map = card?.offsetParent
    if (!card || !map) return
    const box = map.getBoundingClientRect()
    const pin = hover.anchor.getBoundingClientRect()
    const at = placePreview({
      anchor: { top: pin.top - box.top, bottom: pin.bottom - box.top, left: pin.left - box.left, right: pin.right - box.left },
      size: { width: card.offsetWidth, height: card.offsetHeight },
      bounds: { width: box.width, height: box.height },
    })
    // Above the pin the card hangs from its foot, so a photo that fails to load shrinks it toward the pin.
    if (at.side === "above") {
      card.style.top = "auto"
      card.style.bottom = `${box.height - at.top - card.offsetHeight}px`
    } else card.style.top = `${at.top}px`
    card.style.left = `${at.left}px`
    card.style.transformOrigin = { above: "bottom center", below: "top center", right: "center left", left: "center right" }[at.side]
  }, [hover])
  useEffect(() => {
    const pin = hover.anchor
    pin.setAttribute("aria-describedby", id)
    return () => pin.removeAttribute("aria-describedby")
  }, [hover.anchor, id])
  return (
    <div ref={ref} id={id} role="tooltip" {...sx(s.card, "trips-glass-sheet")}>
      {children}
    </div>
  )
}

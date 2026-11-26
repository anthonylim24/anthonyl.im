import { useLayoutEffect, useRef, type ReactNode } from "react"
import { Heart } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { pv } from "../ideas/preview.stylex"
import { hoverCard as s } from "./hoverCard.stylex"
import type { IdeaHover } from "./ideaHover"
import type { HoldIdeaHover } from "./useIdeaHover"
import { placePreview } from "./previewPlacement"

// The card of the map's one wishlist preview, drawn inside the map beside
// its pin. Which pin, if any, is `useIdeaHover`'s; the mouse may rest on
// the card (`hold`) as on the pin. A fold of several hearts lists their
// names instead: nothing about one place is looked up for it.

/** A fold's card names this many places, then says how many more. */
const FOLD_NAMES = 6

/** The preview's frame: placed beside its pin inside the map. Its pin carries its own description, so nothing waits for this. */
export function IdeaHoverCard({ hover, hold, children }: { hover: IdeaHover; hold?: HoldIdeaHover; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const card = ref.current
    if (!card) return
    const place = () => {
      const map = card.offsetParent
      if (!map) return
      const box = map.getBoundingClientRect()
      const inMap = (el: Element) => {
        const at = el.getBoundingClientRect()
        return { top: at.top - box.top, bottom: at.bottom - box.top, left: at.left - box.left, right: at.right - box.left }
      }
      // Another pin is covered when the middle of its body is: a stem or a rim under the card still shows and takes a click.
      const middleOf = (el: Element) => {
        const at = inMap(el.firstElementChild ?? el)
        const x = (at.left + at.right) / 2
        const y = (at.top + at.bottom) / 2
        return { top: y, bottom: y, left: x, right: x }
      }
      const others = [...map.querySelectorAll("button.atlas-pin")].filter((el) => el !== hover.anchor && el.getClientRects().length > 0)
      const at = placePreview({
        anchor: inMap(hover.anchor),
        size: { width: card.offsetWidth, height: card.offsetHeight },
        bounds: { width: box.width, height: box.height },
        avoid: others.map(middleOf),
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
    <div ref={ref} role="tooltip" {...sx(s.card, "trips-glass-sheet")} {...hold}>
      {hover.names ? <FoldNames names={hover.names} /> : children}
    </div>
  )
}

function FoldNames({ names }: { names: readonly string[] }) {
  const more = names.length - FOLD_NAMES
  return (
    <div {...sx(pv.body)}>
      <p {...sx(a.eyebrow, pv.eyebrow)}>
        <Heart size={12} strokeWidth={2} aria-hidden {...sx(pv.mark)} />
        <span {...sx(pv.eyebrowText)}>{`${names.length} wishlist places`}</span>
      </p>
      <ul {...sx(pv.names)}>
        {names.slice(0, more > 1 ? FOLD_NAMES : names.length).map((name, index) => (
          <li key={index} {...sx(pv.foldName)}>
            {name}
          </li>
        ))}
        {more > 1 && <li {...sx(pv.foldMore)}>{`and ${more} more`}</li>}
      </ul>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { IdeaHover, ReportIdeaHover } from "./ideaHover"

// The map's one wishlist preview: which pin it is for, if any.

/** How long a mouse rests on a pin before its preview shows: passing over the map shows nothing. */
export const HOVER_INTENT_MS = 120
/** How long a preview stays after the mouse leaves its pin or card: time to cross from one to the other. */
export const HOVER_CLOSE_MS = 300

/** What the card itself listens to, so the mouse can rest on it (WCAG 1.4.13). */
export interface HoldIdeaHover {
  onPointerEnter: () => void
  onPointerLeave: () => void
}

/**
 * The previewed pin, the report the pins call, and the card's own
 * listeners. A hover waits for `HOVER_INTENT_MS` and stays while the mouse
 * is on the pin or the card; keyboard focus shows at once; Escape hides it.
 */
export function useIdeaHover(): [IdeaHover | null, ReportIdeaHover, HoldIdeaHover] {
  const [hover, setHover] = useState<IdeaHover | null>(null)
  const shown = useRef<IdeaHover | null>(null)
  // React reports the card's enter before the pin's own leave listener runs, so the leave asks where the mouse went.
  const onCard = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const show = useCallback((next: IdeaHover | null) => {
    // A card that went from under the mouse (its pin removed) heard no leave: the next starts off the card.
    if (next?.anchor !== shown.current?.anchor) onCard.current = false
    shown.current = next
    setHover(next)
  }, [])
  const hideSoon = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => show(null), HOVER_CLOSE_MS)
  }, [show])
  const report = useCallback<ReportIdeaHover>(
    (next, how) => {
      clearTimeout(timer.current)
      if (!next) {
        if (how !== "leave") show(null)
        else if (shown.current && !onCard.current) hideSoon()
      } else if (next.via === "focus") show(next)
      // Back on the pin whose card is up: it stays.
      else if (shown.current?.anchor !== next.anchor) timer.current = setTimeout(() => show(next), HOVER_INTENT_MS)
    },
    [show, hideSoon],
  )
  const hold = useMemo<HoldIdeaHover>(
    () => ({
      onPointerEnter: () => {
        onCard.current = true
        clearTimeout(timer.current)
      },
      onPointerLeave: () => {
        onCard.current = false
        hideSoon()
      },
    }),
    [hideSoon],
  )
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!hover) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") show(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [hover, show])
  return [hover, report, hold]
}

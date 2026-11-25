import { useCallback, useEffect, useRef, useState } from "react"
import type { IdeaHover, ReportIdeaHover } from "./ideaHover"

// The map's one wishlist preview: which pin it is for, if any.

/** How long a mouse rests on a pin before its preview shows: passing over the map shows nothing. */
export const HOVER_INTENT_MS = 120

/**
 * The previewed pin, and the report the pins call. A hover waits for
 * `HOVER_INTENT_MS`; keyboard focus shows at once; Escape hides it.
 */
export function useIdeaHover(): [IdeaHover | null, ReportIdeaHover] {
  const [hover, setHover] = useState<IdeaHover | null>(null)
  const intent = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const report = useCallback<ReportIdeaHover>((next) => {
    clearTimeout(intent.current)
    if (next?.via === "pointer") intent.current = setTimeout(() => setHover(next), HOVER_INTENT_MS)
    else setHover(next)
  }, [])
  useEffect(() => () => clearTimeout(intent.current), [])
  useEffect(() => {
    if (!hover) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHover(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [hover])
  return [hover, report]
}

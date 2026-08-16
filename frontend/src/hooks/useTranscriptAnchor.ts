import { useLayoutEffect, useRef, type RefObject } from "react"
import { applyTurnSpacer, scrollAnchorToTop } from "../lib/transcriptAnchor"

/** Keep the transcript pinned to the latest user message. Spacer height is
 *  refreshed when the turn changes, when `layoutKey` changes (stream end /
 *  panel open), or when the scroller resizes — never while tokens arrive. */
export function useTranscriptAnchor(
  scrollRef: RefObject<HTMLElement | null>,
  anchorId: string | undefined,
  layoutKey?: unknown,
): {
  anchorRef: RefObject<HTMLDivElement | null>
  spacerRef: RefObject<HTMLDivElement | null>
} {
  const anchorRef = useRef<HTMLDivElement>(null)
  const spacerRef = useRef<HTMLDivElement>(null)
  const pinnedIdRef = useRef<string | undefined>(undefined)
  const detachedRef = useRef(true)

  useLayoutEffect(() => {
    const container = scrollRef.current
    const anchor = anchorRef.current
    const spacer = spacerRef.current

    if (!anchorId) {
      pinnedIdRef.current = undefined
      detachedRef.current = true
      if (spacer) spacer.style.height = "0px"
      return
    }
    if (!container || !anchor || !spacer) {
      detachedRef.current = true
      return
    }

    const isNewTurn = pinnedIdRef.current !== anchorId || detachedRef.current
    detachedRef.current = false
    applyTurnSpacer(container, anchor, spacer)
    if (isNewTurn) {
      pinnedIdRef.current = anchorId
      scrollAnchorToTop(container, anchor)
    }
  }, [anchorId, layoutKey, scrollRef])

  useLayoutEffect(() => {
    const container = scrollRef.current
    if (!container || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      const scroller = scrollRef.current
      const anchor = anchorRef.current
      const spacer = spacerRef.current
      if (!scroller || !anchor || !spacer) return
      applyTurnSpacer(scroller, anchor, spacer)
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [layoutKey, scrollRef])

  return { anchorRef, spacerRef }
}

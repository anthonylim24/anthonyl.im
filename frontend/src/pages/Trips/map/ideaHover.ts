// One hover seam for the live map's pins (DOM listeners) and the fallback
// chart's (React props); the map decides what is shown (`IdeaHoverCard.tsx`).

export interface IdeaHover {
  /** The idea's id; for a fold of several hearts, its first's. */
  id: string
  anchor: Element
  via: "pointer" | "focus"
  /** A fold's places, by name: its card lists them instead of previewing one. */
  names?: readonly string[]
}

/** `null` hides the preview at once; `null, "leave"` after a moment, so the mouse can cross to the card. */
export type ReportIdeaHover = (hover: IdeaHover | null, how?: "leave") => void

/** Enough of a DOM or React event to read: both carry these. */
interface PinEvent {
  currentTarget: EventTarget | null
  pointerType?: string
}

/**
 * Named as React's props. A tap is never a hover, and a click's focus is
 * never keyboard focus, so touch keeps tap-to-open alone.
 */
export function ideaHoverHandlers(id: string, report: ReportIdeaHover, names?: readonly string[]) {
  const fold = names ? { names } : {}
  return {
    onPointerEnter(event: PinEvent) {
      if (event.pointerType === "touch" || !(event.currentTarget instanceof Element)) return
      report({ id, anchor: event.currentTarget, via: "pointer", ...fold })
    },
    onPointerLeave() {
      report(null, "leave")
    },
    // A press opens the place's details: the preview has done its job.
    onPointerDown() {
      report(null)
    },
    onFocus(event: PinEvent) {
      const anchor = event.currentTarget
      if (anchor instanceof Element && anchor.matches(":focus-visible")) report({ id, anchor, via: "focus", ...fold })
    },
    onBlur() {
      report(null)
    },
  }
}

// A wishlist pin's preview is shown while a mouse rests on the pin or its
// card, or keyboard focus is on the pin, on the live map and on the
// fallback chart alike.
// The pins report raw pointer and focus events through these handlers (the
// engine as DOM listeners, the chart as React props); the map decides what
// is shown (`IdeaHoverCard.tsx`).

/** Which wishlist pin is previewed, the element to sit beside, and how it was reached. */
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

/** The preview card's id, which its pin names as its description from the start. */
export const previewId = (ideaId: string) => `idea-preview-${ideaId}`

/** Enough of a DOM or React event to read: both carry these. */
interface PinEvent {
  currentTarget: EventTarget | null
  pointerType?: string
}

/**
 * The listeners a wishlist pin needs, named as React's props (the engine
 * adds the same functions as DOM listeners). A tap is never a hover, and a
 * click's focus is never keyboard focus, so touch keeps tap-to-open alone.
 */
export function ideaHoverHandlers(id: string, report: ReportIdeaHover, names?: readonly string[]) {
  const fold = names ? { names } : {}
  return {
    "aria-describedby": previewId(id),
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

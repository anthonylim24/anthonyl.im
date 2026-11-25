// A wishlist pin's preview is shown while a mouse rests on the pin or
// keyboard focus is on it, on the live map and on the fallback chart alike.
// The pins report raw pointer and focus events through these handlers (the
// engine as DOM listeners, the chart as React props); the map decides what
// is shown (`IdeaHoverCard.tsx`).

/** Which wishlist pin is previewed, the element to sit beside, and how it was reached. */
export interface IdeaHover {
  id: string
  anchor: Element
  via: "pointer" | "focus"
}

export type ReportIdeaHover = (hover: IdeaHover | null) => void

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
export function ideaHoverHandlers(id: string, report: ReportIdeaHover) {
  return {
    onPointerEnter(event: PinEvent) {
      if (event.pointerType === "touch" || !(event.currentTarget instanceof Element)) return
      report({ id, anchor: event.currentTarget, via: "pointer" })
    },
    onPointerLeave() {
      report(null)
    },
    // A press opens the place's details: the preview has done its job.
    onPointerDown() {
      report(null)
    },
    onFocus(event: PinEvent) {
      const anchor = event.currentTarget
      if (anchor instanceof Element && anchor.matches(":focus-visible")) report({ id, anchor, via: "focus" })
    },
    onBlur() {
      report(null)
    },
  }
}

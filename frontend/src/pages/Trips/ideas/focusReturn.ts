import { DAY_PIN } from "../map/geo"
import { IDEA_ANCHOR_ATTR } from "./contract"

// Where focus goes as a wishlist place's details or day picker close, when
// what opened them has gone: removing the place or putting it on a day takes
// its heart and its row with it, and the dialog would drop focus on <body>,
// so a keyboard user starts the page over.

const shown = (el: HTMLElement) => el.getClientRects().length > 0

/** The first shown element whose `attr` passes `matches`. Ids are compared, never put into a selector. */
function firstShown(attr: string, matches: (value: string) => boolean): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[${attr}]`)) {
    if (matches(el.getAttribute(attr) ?? "") && shown(el)) return el
  }
  return null
}

/**
 * The nearest thing still on the page that stands for the place: its heart,
 * the fold it is drawn into, its wishlist row, its entry under "On your
 * days", the stop it became or the overview's pin for `dayId`, the day it
 * went to; else the map it was on.
 */
export function ideaFocusReturn(ideaId: string, dayId?: string): HTMLElement | null {
  const map = document.querySelector<HTMLElement>(".maplibregl-canvas[tabindex]")
  return (
    firstShown("data-idea-id", (id) => id === ideaId) ??
    firstShown("data-idea-fold", (ids) => ids.split(" ").includes(ideaId)) ??
    firstShown(IDEA_ANCHOR_ATTR, (id) => id === ideaId) ??
    firstShown("data-scheduled-idea", (id) => id === ideaId) ??
    firstShown("data-pin-id", (id) => id === ideaId || (dayId !== undefined && id === `${DAY_PIN}${dayId}`)) ??
    (map && shown(map) ? map : null)
  )
}

import { DAY_PIN } from "../map/geo"
import { IDEA_ANCHOR_ATTR } from "./contract"

// Where focus goes as a wishlist place's details or day picker close, when
// what opened them has gone: removing the place or putting it on a day takes
// its heart and its row with it, and the dialog would drop focus on <body>,
// so a keyboard user starts the page over.

const shown = (el: HTMLElement) => el.getClientRects().length > 0

/** A point on the page, in client pixels. */
export interface Spot {
  x: number
  y: number
}

const HEART = "[data-idea-id], [data-idea-fold]"

const middle = (el: Element): Spot => {
  const box = el.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

/** Where the map heart (or fold) that has focus is, if one has: a place opened from it can send focus back near it. */
export function focusedHeartSpot(): Spot | undefined {
  const heart = document.activeElement?.closest(HEART)
  return heart ? middle(heart) : undefined
}

/** The shown heart or fold nearest `near`, else the first shown. */
function nearestHeart(near: Spot | undefined): HTMLElement | null {
  const hearts = [...document.querySelectorAll<HTMLElement>(HEART)].filter(shown)
  if (!near || hearts.length === 0) return hearts[0] ?? null
  const away = (el: HTMLElement) => {
    const at = middle(el)
    return Math.hypot(at.x - near.x, at.y - near.y)
  }
  return hearts.reduce((best, el) => (away(el) < away(best) ? el : best))
}

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
 * went to. A place that is gone leaves focus on the wishlist heart nearest
 * where its own was (`near`), else on the map it was on.
 */
export function ideaFocusReturn(ideaId: string, { dayId, near }: { dayId?: string; near?: Spot } = {}): HTMLElement | null {
  const map = document.querySelector<HTMLElement>(".maplibregl-canvas[tabindex]")
  return (
    firstShown("data-idea-id", (id) => id === ideaId) ??
    firstShown("data-idea-fold", (ids) => ids.split(" ").includes(ideaId)) ??
    firstShown(IDEA_ANCHOR_ATTR, (id) => id === ideaId) ??
    firstShown("data-scheduled-idea", (id) => id === ideaId) ??
    firstShown("data-pin-id", (id) => id === ideaId || (dayId !== undefined && id === `${DAY_PIN}${dayId}`)) ??
    nearestHeart(near) ??
    (map && shown(map) ? map : null)
  )
}

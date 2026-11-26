// A fold: wishlist hearts that would sit on each other at the map's zoom,
// drawn as one counted heart that zooms in to them when picked.

export interface ScreenIdea {
  id: string
  x: number
  y: number
}

/**
 * Half a heart's target, its disc and the `::before` around it, in CSS
 * pixels. A heart whose centre is this close to another's, across and down,
 * is under that heart's target: a tap meant for one opens the other.
 */
export const HEART_REACH = 22

/** From this zoom on hearts never fold: what still overlaps is one spot, and is spread apart instead. */
export const FOLD_MAX_ZOOM = 16

interface Group {
  ids: string[]
  x: number
  y: number
}

const touches = (a: { x: number; y: number }, b: { x: number; y: number }, reach: number) =>
  Math.abs(a.x - b.x) < reach && Math.abs(a.y - b.y) < reach

function join(into: Group, from: Group) {
  const n = into.ids.length + from.ids.length
  into.x = (into.x * into.ids.length + from.x * from.ids.length) / n
  into.y = (into.y * into.ids.length + from.y * from.ids.length) / n
  into.ids.push(...from.ids)
}

/**
 * The hearts in groups that are drawn as one: each group's hearts in the
 * order given, the groups in the order of their first heart. A group of one
 * is a heart drawn on its own.
 */
export function foldIdeas(ideas: readonly ScreenIdea[], reach = HEART_REACH): string[][] {
  const groups: Group[] = []
  for (const idea of ideas) {
    const own: Group = { ids: [idea.id], x: idea.x, y: idea.y }
    const near = groups.find((group) => touches(group, own, reach))
    if (near) join(near, own)
    else groups.push(own)
  }
  // A fold sits at the middle of its hearts, which can land on another heart or fold.
  for (let merged = true; merged; ) {
    merged = false
    for (let i = 0; i < groups.length && !merged; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (!touches(groups[i]!, groups[j]!, reach)) continue
        join(groups[i]!, groups[j]!)
        groups.splice(j, 1)
        merged = true
        break
      }
    }
  }
  const order = new Map(ideas.map((idea, index) => [idea.id, index]))
  return groups.map((group) => group.ids.sort((a, b) => order.get(a)! - order.get(b)!))
}

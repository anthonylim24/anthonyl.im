/**
 * Lim's world, client side: read the model's world orders out of the chat
 * stream, and keep what the visitor has built between visits.
 */
import { WORLD_MARK, cleanItem, cleanOps, cleanPlace, cleanTweak, type ItemSpec, type PlaceSpec, type Tweak, type WorldOp } from "./spec"

export type SavedWorld = { items: ItemSpec[]; place: PlaceSpec | null; tweak?: Tweak }

/** True while a streamed reply could still be, or is, a world order (so it is not shown as text). */
export function isWorldReply(content: string): boolean {
  const head = content.trimStart()
  return head.length > 0 && (head.startsWith(WORLD_MARK) || WORLD_MARK.startsWith(head))
}

/** The model's `@@world {json}` answer as safe ops and Lim's line. Never throws. */
export function readWorldReply(content: string): { ops: WorldOp[]; reply: string } {
  const from = content.indexOf('{')
  const to = content.lastIndexOf('}')
  if (from < 0 || to <= from) return { ops: [], reply: '' }
  try {
    const raw = JSON.parse(content.slice(from, to + 1)) as { ops?: unknown; reply?: unknown }
    const reply = typeof raw.reply === 'string' ? raw.reply.replace(/\s+/g, ' ').trim().slice(0, 140) : ''
    return { ops: cleanOps(raw.ops), reply }
  } catch {
    return { ops: [], reply: '' }
  }
}

/* ── Between visits ──────────────────────────────────────────────── */

const WORLD_KEY = "lim-world-v1"
const MADE_KEY = "lim-made-v1"
const MADE_MAX = 8

const read = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode / quota: the world just won't persist */
  }
}

/** The world as it was left, or undefined on a first visit (so the starter toys appear). */
export function loadWorld(): SavedWorld | undefined {
  const raw = read(WORLD_KEY) as { items?: unknown; place?: unknown; tweak?: unknown } | null
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) return undefined
  const items = raw.items.map(cleanItem).filter((x): x is ItemSpec => x !== null).slice(0, 6)
  return { items, place: cleanPlace(raw.place), tweak: cleanTweak(raw.tweak) ?? undefined }
}
export const saveWorld = (world: SavedWorld) => write(WORLD_KEY, world)

export type Made = { items: ItemSpec[]; places: PlaceSpec[] }

/** Things the model invented earlier, kept so they can be had again for free. */
export function loadMade(): Made {
  const raw = read(MADE_KEY) as { items?: unknown; places?: unknown } | null
  return {
    items: (Array.isArray(raw?.items) ? raw.items : []).map(cleanItem).filter((x): x is ItemSpec => x !== null).slice(0, MADE_MAX),
    places: (Array.isArray(raw?.places) ? raw.places : []).map(cleanPlace).filter((x): x is PlaceSpec => x !== null).slice(0, MADE_MAX),
  }
}

export function rememberMade(made: Made, ops: WorldOp[], known: { items: Set<string>; places: Set<string> }): Made {
  const next: Made = { items: [...made.items], places: [...made.places] }
  for (const op of ops) {
    // A spec the cleaner had to name itself is not worth remembering.
    if (op.op === "item" && !known.items.has(op.spec.name) && op.spec.name !== "thing") {
      next.items = [op.spec, ...next.items.filter((x) => x.name !== op.spec.name)].slice(0, MADE_MAX)
    } else if (op.op === "place" && op.spec && !known.places.has(op.spec.name) && op.spec.name !== "somewhere") {
      const spec = op.spec
      next.places = [spec, ...next.places.filter((x) => x.name !== spec.name)].slice(0, MADE_MAX)
    }
  }
  write(MADE_KEY, next)
  return next
}

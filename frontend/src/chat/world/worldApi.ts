/**
 * Lim's world, client side: read the model's world orders out of the chat
 * stream, and keep what the visitor has built between visits.
 */
import { WORLD_MARK, cleanItem, cleanOps, cleanPlace, cleanTweak, type ItemSpec, type PlaceSpec, type Tweak, type WorldOp } from "./spec"

export type SavedWorld = { items: ItemSpec[]; place: PlaceSpec | null; tweak?: Tweak; score?: { you: number; lim: number } }

/** A finished or streaming reply that carries an order: the marker and its opening brace, wherever the model put them (bare, fenced, quoted, after a preface). */
export const hasWorldOrder = (content: string) => new RegExp(`^\\s*${WORLD_MARK}|${WORLD_MARK}\\s*\\{`).test(content)

/**
 * What a reply looks like so far: an order ("yes"), prose ("no"), or too early
 * to tell ("maybe": only whitespace, the start of a code fence, or the start
 * of the marker has arrived, so nothing should be shown yet).
 */
export function orderState(content: string): 'no' | 'maybe' | 'yes' {
  if (hasWorldOrder(content)) return 'yes'
  if (/^\s*`{1,3}[a-z]*\s*$/i.test(content)) return 'maybe'
  const head = content.replace(/^\s*(?:```[a-z]*\s*)?/i, '')
  if (!head) return content.trim() ? 'maybe' : 'no'
  return head.length < WORLD_MARK.length && WORLD_MARK.startsWith(head) ? 'maybe' : 'no'
}
export const isWorldReply = (content: string) => orderState(content) === 'yes'
export const maybeWorldReply = (content: string) => orderState(content) === 'maybe'

/** The first balanced {...} after the marker, minding strings. */
function firstObject(text: string): string | null {
  const start = text.indexOf('{', Math.max(0, text.indexOf(WORLD_MARK)))
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1)
  }
  return null
}

/** The model's `@@world {json}` answer as safe ops and Lim's line. Never throws. */
export function readWorldReply(content: string): { ops: WorldOp[]; reply: string } {
  const json = firstObject(content)
  if (!json) return { ops: [], reply: '' }
  try {
    const raw = JSON.parse(json) as { ops?: unknown; reply?: unknown }
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
  const raw = read(WORLD_KEY) as { items?: unknown; place?: unknown; tweak?: unknown; score?: { you?: unknown; lim?: unknown } | null } | null
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) return undefined
  // Six toys, plus a hoop and a goal.
  const items = raw.items.map(cleanItem).filter((x): x is ItemSpec => x !== null).slice(0, 8)
  const points = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(999, Math.max(0, Math.round(v))) : 0)
  const score = raw.score && typeof raw.score === "object" ? { you: points(raw.score.you), lim: points(raw.score.lim) } : undefined
  return { items, place: cleanPlace(raw.place), tweak: cleanTweak(raw.tweak) ?? undefined, score }
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

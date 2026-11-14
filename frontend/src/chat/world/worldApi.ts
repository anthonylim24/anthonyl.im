/**
 * Lim's world, client side: ask the model what a message means for the toy
 * world, and keep what the visitor has built between visits.
 */
import { Effect } from "effect"
import { fetchApi, parseJson, requireOk } from "../../effect/http"
import { runPromise } from "../../effect/runtime"
import { cleanItem, cleanOps, cleanPlace, cleanTweak, type ItemSpec, type PlaceSpec, type Tweak, type WorldOp } from "./spec"

export type WorldAnswer = { ops: WorldOp[]; reply: string; chat: boolean }
export type SavedWorld = { items: ItemSpec[]; place: PlaceSpec | null; tweak?: Tweak }

const TIMEOUT_MS = 10_000

const askWorldEffect = Effect.fn("LimWorld.ask")(function* (message: string, world: { items: string[]; place: string }, signal?: AbortSignal) {
  const res = yield* fetchApi("/api/lim/world", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: message.slice(0, 240), world: { items: world.items.slice(0, 8), place: world.place.slice(0, 32) } }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
  })
  yield* requireOk(res)
  const raw = yield* parseJson<{ ops?: unknown; reply?: unknown; chat?: unknown }>(res)
  const ops = cleanOps(raw.ops)
  const reply = typeof raw.reply === "string" ? raw.reply.replace(/\s+/g, " ").trim().slice(0, 140) : ""
  return { ops, reply, chat: ops.length === 0 || raw.chat === true } satisfies WorldAnswer
})

/** Rejects when the model is unreachable; the caller carries on without it. */
export const askWorld = (message: string, world: { items: string[]; place: string }, signal?: AbortSignal): Promise<WorldAnswer> =>
  runPromise(askWorldEffect(message, world, signal))

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
    if (op.op === "item" && !known.items.has(op.spec.name)) {
      next.items = [op.spec, ...next.items.filter((x) => x.name !== op.spec.name)].slice(0, MADE_MAX)
    } else if (op.op === "place" && op.spec && !known.places.has(op.spec.name)) {
      const spec = op.spec
      next.places = [spec, ...next.places.filter((x) => x.name !== spec.name)].slice(0, MADE_MAX)
    }
  }
  write(MADE_KEY, next)
  return next
}

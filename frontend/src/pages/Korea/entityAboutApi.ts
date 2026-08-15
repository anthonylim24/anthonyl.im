import { Effect } from "effect"
import { fetchApi, parseJson } from "../../effect/http"
import { runPromise } from "../../effect/runtime"
import type { EntityType } from "./entityLinks"

interface AboutCacheEntry {
  description: string | null
  fetchedAt: number
}

const aboutCache = new Map<string, AboutCacheEntry>()
const inflight = new Map<string, Promise<string | null>>()

function aboutKey(name: string, type: EntityType, city?: string): string {
  return `${type}|${name.toLowerCase().trim()}|${(city ?? "").toLowerCase().trim()}`
}

const fetchAboutEffect = Effect.fn("EntityAboutService.fetch")(function* (
  name: string,
  type: EntityType,
  city?: string,
) {
  const r = yield* fetchApi("/api/entity/about", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, type, city }),
  })
  if (!r.ok) return null
  const j = yield* parseJson<{ description?: string | null }>(r)
  return j.description ?? null
})

/** Lazy dossier blurb for a SmartEntity popover. Cached for the SPA session. */
export function fetchAbout(name: string, type: EntityType, city?: string): Promise<string | null> {
  const key = aboutKey(name, type, city)
  const cached = aboutCache.get(key)
  if (cached) return Promise.resolve(cached.description)
  const pending = inflight.get(key)
  if (pending) return pending

  const promise = runPromise(fetchAboutEffect(name, type, city).pipe(Effect.catchAll(() => Effect.succeed(null))))
    .then((description) => {
      aboutCache.set(key, { description, fetchedAt: Date.now() })
      return description
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}

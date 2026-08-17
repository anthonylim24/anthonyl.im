---
name: effect-ts
description: Effect-TS v3 methodology for this repo. Use when writing, reviewing, or migrating frontend I/O, API clients, SSE streams, tagged errors, or React 19 data loaders. Triggers on Effect, Effect.fn, fetchApi, requestJson, runPromise, Schema.TaggedError, or new /api client code.
---

# Effect-TS (anthonyl.im)

This repo uses **stable Effect v3** on the frontend. Do not install `effect@beta` / v4.

Read this skill before writing network I/O. Patterns here override generic Effect tutorials (no AppLayer, no Schema-decoded trip documents, no platform FetchHttpClient).

Upstream references (adapt, do not copy wholesale):

- [Effect-TS/skills](https://github.com/Effect-TS/skills) — stay on v3; ignore the v4-beta install step
- Effect Language Service is already in `frontend/tsconfig.app.json`

## When to apply

- New or changed `frontend/src/**` API modules, SSE clients, photo/geocode lookups
- React loaders that call those APIs (`useEffect`, `useTransition`, chat send)
- Reviewing a PR that adds `fetch(` outside `apiBase.ts` / `effect/http.ts`

## Architecture

```
UI (React 19)  →  Promise wrapper (runPromise)  →  Effect.fn  →  fetchApi | fetchExternal | readSse
                     useLatestCallback(getToken) ↗
```

| Module | Use for |
|--------|---------|
| `frontend/src/effect/http.ts` | `fetchApi` (same-origin `/api`), `fetchExternal` (absolute third-party URLs), `requestJson`, `readAuthToken`, `readErrorMessage`, `parseJson`, `requireOk` |
| `frontend/src/effect/sse.ts` | `readSse` wrapping `readSseStream` |
| `frontend/src/effect/runtime.ts` | **Only** `runPromise` — unwraps `FiberFailure` via `Cause.failureOption` so callers see the original `Error` |
| `frontend/src/effect/errors.ts` | `Schema.TaggedError` types (`HttpStatusError`, `DecodeError`, `StreamError`, `AuthError`, …) |
| `frontend/src/effect/chatErrors.ts` | `remapChatFailure` / `isLostConnection` |
| `frontend/src/lib/apiBase.ts` | Transport only. Preview-base rewrite + `redirect: "manual"`. Do not bypass. |
| `frontend/src/hooks/useLatestCallback.ts` | Stable latest-fn reader for tokens passed into APIs |

Keep Zustand for BreathFlow persisted stores. Keep `useCloudSync` on Promise/Supabase. Map Mode WebGL must unmount — do not hide it with React `Activity`.

## Write I/O this way

```ts
import { Effect } from "effect"
import { fetchApi, readAuthToken, requestJson } from "../../effect/http"
import { runPromise } from "../../effect/runtime"

const loadTripEffect = Effect.fn("TripsService.get")(function* (
  getToken: () => Promise<string | null>,
  id: string,
) {
  return yield* requestJson<{ trip: Trip }>(getToken, `/api/trips/${encodeURIComponent(id)}`)
})

export function getTrip(getToken: () => Promise<string | null>, id: string) {
  return runPromise(loadTripEffect(getToken, id))
}
```

### Critical rules

| Do | Don't |
|----|--------|
| `Effect.fn("Service.method")` | Anonymous `Effect.gen` for public I/O |
| `runPromise` from `effect/runtime.ts` | `Effect.runPromise` (rejects as `FiberFailure`) |
| `fetchApi` / `requestJson` for `/api/*` | Raw `fetch("/api/...")` or `@effect/platform` FetchHttpClient |
| `fetchExternal` for Wikipedia / Google / etc. | Raw `fetch("https://...")` in feature modules |
| `Schema.TaggedError` + `readErrorMessage(res, mode)` | Invent a new error-body parser per endpoint |
| `Effect.fail` / `Effect.catchTag` | `throw` or `try/catch` around `yield*` |
| `useLatestCallback(getToken)` at call sites | Pass Clerk `getToken` or `useEffectEvent` into APIs |
| `useAuthReady()` as a load-effect dependency | Fetch once before Clerk hydrates and never retry |
| Sequence guards (latest-request-wins) | Commit every overlapping response |
| `useTransition` for list/document success | Wrap SSE token updates in `startTransition` |

### Error-body modes (`readErrorMessage`)

Keep per-endpoint parity. Do not "simplify" to one mode.

- `"message-first"` — trips `requestJson` (default)
- `"error-first"` — ingest `throwOnError`
- `"error-only"` — places + ingest retry/reextract
- `"message-only"` — Korea chat non-OK

### Schema

Use Schema for **error envelopes and tagged errors only**. Do not `Schema.decode` `Trip`, `ExtractedPlace`, or other evolving documents — `Schema.Struct` strips unknown keys and will break fixtures / forward-compat.

### Layers and services

Do **not** add `Effect.Service`, `AppLayer`, or `@effect-atom/atom-react` unless a module has real injectable dependencies (tests already inject store/auth/LLM on the **server**). Frontend I/O is `Effect.fn` + `runPromise`. `@effect-atom/atom-react` may be installed; do not wire it without a concrete need.

### React 19 pairing

- Chat: one write path (`setMessages`). Do not combine `useOptimistic` + `setMessages` in the same turn (duplicate keys).
- Stream tokens **outside** transitions; set `streaming` synchronously when enqueueing the empty assistant bubble.
- `useEffectEvent` is legal **only** inside Effect bodies (`useCloudSync`). Token readers that are passed as arguments must be `useLatestCallback`.
- Overlapping loaders increment a seq ref and ignore stale results.

## Tests

- Effect helpers: `frontend/src/effect/__tests__/`
- Public wrappers stay Promise-based so existing vitest spies on `fetch` keep working
- When adding a field to `T | null` (not `T | null | undefined`), update every fixture — `undefined` is not assignable

## Anti-patterns (forbidden here)

```ts
// FiberFailure leaks to UI
await Effect.runPromise(loadTripEffect(getToken, id))

// Preview /api rewrite skipped
await fetch("/api/trips")

// Abandoned concurrent render publishes an uncommitted callback
ref.current = fn // during render — use useLayoutEffect (see useLatestCallback)

// Schema strips unknown trip keys
const trip = Schema.decodeUnknownSync(TripSchema)(json)
```

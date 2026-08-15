# Effect-TS agent memory

Pointer: full methodology lives at [`.claude/skills/effect-ts/SKILL.md`](../skills/effect-ts/SKILL.md) (same text in [`.agents/skills/effect-ts/SKILL.md`](../skills/effect-ts/SKILL.md)).

Short rules also live under **Frontend Effect-TS** in [`AGENTS.md`](../../AGENTS.md) and [`CLAUDE.md`](../../CLAUDE.md).

Read the skill before adding frontend `fetch`, SSE, or API helpers.

Hard rules:

1. Stable Effect v3 only. Never install `effect@beta` / v4.
2. Public Promise APIs must use `runPromise` from `frontend/src/effect/runtime.ts`.
3. Same-origin `/api/*` goes through `fetchApi` / `requestJson`. Third-party URLs go through `fetchExternal`.
4. Do not Schema-decode `Trip` / `ExtractedPlace` documents.
5. Pass `useLatestCallback(getToken)` into APIs. Do not pass `useEffectEvent` as a function argument.

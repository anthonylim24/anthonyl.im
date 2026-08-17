# React Best Practices (anthonyl.im)

Vendored Vercel React performance rules. **Read [`SKILL.md`](./SKILL.md) first** — it has the Effect I/O override and anthonyl.im adaptations (Vite SPA + Hono/Bun, not Next.js). This checkout does not vendor the upstream `src/` build scripts; do not expect `pnpm build` here.

## This repo

- Frontend: Vite 8 + React 19 (`frontend/`). Bundle splitting is `frontend/vite.config.ts` `advancedChunks`.
- Server: Hono/Bun (`server/src/routes/*`), not Server Actions / RSC.
- I/O: Effect v3 — see [`../effect-ts/SKILL.md`](../effect-ts/SKILL.md). No SWR.

## Structure

- `SKILL.md` — when to apply + repo adaptations
- `rules/` — individual rule files (prefixes: `async-`, `bundle-`, `server-`, `client-`, `rerender-`, `rendering-`, `js-`, `advanced-`)
- `AGENTS.md` — compiled full guide (already present)

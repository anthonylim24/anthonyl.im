# Skill catalog (anthonyl.im)

This repo is a **Vite 8 SPA + Hono/Bun** app (React 19, `react-router-dom`), not Next.js. Canonical skill copies live in `.agents/skills/`. `.claude/skills/` is mostly symlinks to those.

Read the matching skill before writing code. Effect I/O rules win when they conflict with generic React fetch/SWR examples. StyleX rules win when a skill still mentions Tailwind utilities for this repo.

## Use these

| Skill | When | Canonical path |
|-------|------|----------------|
| **code-quality** | Any code: state shape, module boundaries, failure, async, performance, tests, review | [`.agents/skills/code-quality/SKILL.md`](./code-quality/SKILL.md) |
| **design-craft** | Any UI: layout, type, colour, motion, 3D scenes, states, copy, design review | [`.agents/skills/design-craft/SKILL.md`](./design-craft/SKILL.md) |
| **effect-ts** | Any frontend `/api`, SSE, or third-party HTTP | [`.agents/skills/effect-ts/SKILL.md`](./effect-ts/SKILL.md) (symlinked from `.claude/skills/`) |
| **stylex** | UI styling, layout, tokens, visual parity, `*.stylex.ts`, `index.css` semantic classes | [`.agents/skills/stylex/SKILL.md`](./stylex/SKILL.md) (symlinked from `.claude/skills/`) |
| **vercel-react-best-practices** | React 19 render/bundle only. Translate Next.js examples to Vite `React.lazy` + Hono. Effect wins on I/O. Never hide the photoreal 3D view / WebGL with React `Activity`. | [`.agents/skills/vercel-react-best-practices/SKILL.md`](./vercel-react-best-practices/SKILL.md) |
| **clerk** + **clerk-react-patterns** | Clerk auth changes. This repo uses `@clerk/clerk-react` ^5 (Core 2) in a Vite SPA. Gate: `TripsAuthGate` (`KoreaAuthGate` belongs to the unrouted legacy Korea pages). Tokens: `frontend/src/lib/safeAuth.ts` (`useGetToken`, `useAuthReady`). Server JWT: `server/src/middleware/clerkAuth.ts`. Preview login: `scripts/clerk-agent-login.ts` (applies in Chrome; do not paste tickets). | [`.agents/skills/clerk/SKILL.md`](./clerk/SKILL.md), [`.agents/skills/clerk-react-patterns/SKILL.md`](./clerk-react-patterns/SKILL.md) |
| **clerk-testing** | Playwright / Clerk test helpers if needed | [`.agents/skills/clerk-testing/SKILL.md`](./clerk-testing/SKILL.md) |
| **clerk-cli** | Dashboard/CLI ops only — do not invent a new Clerk app | [`.agents/skills/clerk-cli/SKILL.md`](./clerk-cli/SKILL.md) |

## Do not apply (wrong stack)

These vendor skills are present for completeness. Do **not** apply them here:

- `clerk-nextjs-patterns`
- `clerk-react-router-patterns` — this is a Vite + `react-router-dom` SPA, **not** `@clerk/react-router` SSR
- `clerk-vue-patterns`, `clerk-nuxt-patterns`, `clerk-astro-patterns`, `clerk-tanstack-patterns`
- `clerk-expo`
- `clerk-android`, `clerk-swift`
- `clerk-chrome-extension-patterns`
- `clerk-billing`, `clerk-orgs`
- `clerk-webhooks` — no Clerk webhooks in this repo

Short pointers: [`.agents/memory/effect-ts.md`](../memory/effect-ts.md), [`.agents/memory/stylex.md`](../memory/stylex.md), [`.agents/memory/clerk.md`](../memory/clerk.md).

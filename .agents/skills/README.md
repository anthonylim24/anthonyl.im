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
| **verify-trip-save** | Before and after changing the Trips editor's save path (`editorMachine.ts`, `tripMerge.ts`, `useTripEditor.ts`'s save effect, `PATCH /api/trips/:id`) | [`.agents/skills/verify-trip-save/SKILL.md`](./verify-trip-save/SKILL.md) (symlinked from `.claude/skills/`) |
| **clerk** + **clerk-react-patterns** | Clerk auth changes. This repo uses `@clerk/clerk-react` ^5 (Core 2) in a Vite SPA. Gate: `TripsAuthGate`. Tokens: `frontend/src/lib/safeAuth.ts` (`useGetToken`, `useAuthReady`). Server JWT: `server/src/middleware/clerkAuth.ts`. Preview login: `scripts/clerk-agent-login.ts` (applies in Chrome; do not paste tickets). | [`.agents/skills/clerk/SKILL.md`](./clerk/SKILL.md), [`.agents/skills/clerk-react-patterns/SKILL.md`](./clerk-react-patterns/SKILL.md) |
| **clerk-testing** | Playwright / Clerk test helpers if needed | [`.agents/skills/clerk-testing/SKILL.md`](./clerk-testing/SKILL.md) |
| **clerk-cli** | Dashboard/CLI ops only — do not invent a new Clerk app | [`.agents/skills/clerk-cli/SKILL.md`](./clerk-cli/SKILL.md) |

## Not vendored (wrong stack)

The upstream `clerk/skills` pack also ships Next.js, React Router SSR (`@clerk/react-router`), Vue, Nuxt, Astro, TanStack, Expo, Android, Swift, Chrome extension, billing, orgs and webhooks skills. None of them fits this repo, and their template `package.json` files raised Dependabot alerts, so they are not vendored. Do not re-add them. `clerk-setup`, `clerk-custom-ui` and `clerk-backend-api` are vendored for reference; reach for them only when the skills above do not cover the task.

Short pointers: [`.agents/memory/effect-ts.md`](../memory/effect-ts.md), [`.agents/memory/stylex.md`](../memory/stylex.md), [`.agents/memory/clerk.md`](../memory/clerk.md).

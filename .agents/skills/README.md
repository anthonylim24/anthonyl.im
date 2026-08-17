# Skill catalog (anthonyl.im)

This repo is a **Vite 8 SPA + Hono/Bun** app (React 19, `react-router-dom`), not Next.js. Canonical skill copies live in `.agents/skills/`. `.claude/skills/` is mostly symlinks to those.

Read the matching skill before writing code. Effect I/O rules win when they conflict with generic React fetch/SWR examples.

## Use these

| Skill | When | Canonical path |
|-------|------|----------------|
| **effect-ts** | Any frontend `/api`, SSE, or third-party HTTP | [`.agents/skills/effect-ts/SKILL.md`](./effect-ts/SKILL.md) (symlinked from `.claude/skills/`) |
| **vercel-react-best-practices** | React 19 render/bundle only. Translate Next.js examples to Vite `React.lazy` + Hono. Effect wins on I/O. Never hide Map Mode / WebGL with React `Activity`. | [`.agents/skills/vercel-react-best-practices/SKILL.md`](./vercel-react-best-practices/SKILL.md) |
| **impeccable** | Design / critique / polish of existing UI. Reads root `PRODUCT.md`. | [`.agents/skills/impeccable/SKILL.md`](./impeccable/SKILL.md) |
| **clerk** + **clerk-react-patterns** | Clerk auth changes. This repo uses `@clerk/clerk-react` ^5 (Core 2) in a Vite SPA. Gates: `KoreaAuthGate`, `TripsAuthGate`. Tokens: `frontend/src/lib/safeAuth.ts` (`useGetToken`, `useAuthReady`). Server JWT: `server/src/middleware/clerkAuth.ts`. Preview login: `scripts/clerk-agent-login.ts` (applies in Chrome; do not paste tickets). | [`.agents/skills/clerk/SKILL.md`](./clerk/SKILL.md), [`.agents/skills/clerk-react-patterns/SKILL.md`](./clerk-react-patterns/SKILL.md) |
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

## Design skills with caveats

- **design-taste-frontend** — marketing/landing **only**. Do not use for `/breathwork`, `/korea`, `/trips`. Shared-site Inter + Cormorant and `lucide-react` are intentional; BreathFlow uses Geist + Fragment Mono.
- **redesign-existing-projects** — prefer **impeccable** + root `PRODUCT.md`. Do not replace Inter/Lucide.

Short pointers: [`.agents/memory/effect-ts.md`](../memory/effect-ts.md), [`.agents/memory/clerk.md`](../memory/clerk.md).

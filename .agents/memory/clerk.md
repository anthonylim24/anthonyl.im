# Clerk agent memory

This repo uses **Core 2** `@clerk/clerk-react` ^5 in a Vite SPA (not Next.js, not `@clerk/react-router` SSR).

Relevant skills only: `clerk`, `clerk-react-patterns`, `clerk-testing`, `clerk-cli`. Catalog: [`.agents/skills/README.md`](../skills/README.md). Router banner: [`.agents/skills/clerk/SKILL.md`](../skills/clerk/SKILL.md).

Auth code:

- Frontend: `frontend/src/lib/clerk.ts`, `clerkProvider.tsx`, `safeAuth.ts` (`useGetToken`, `useAuthReady`)
- Gates: `KoreaAuthGate`, `TripsAuthGate`
- Server JWT: `server/src/middleware/clerkAuth.ts`

Preview screenshots (Clerk-gated `/korea` and `/trips`): `bun scripts/clerk-agent-login.ts --pr <n> --path /korea`. The helper applies the session in Chrome — do not paste Agent Task URLs. See [`docs/pr-previews.md`](../../docs/pr-previews.md).

Never bake `VITE_DEV_BEARER` / `IG_DEV_BEARER` into production or PR previews — local-only.

Clerk CLI: confirm with the user before any mutation or production-state change. `clerk deploy --mode agent` and `clerk deploy status --mode agent` are read-only.

---
name: clerk
description: Clerk authentication router. Use when user asks about Clerk CLI operations,
  adding authentication, setting up Clerk, custom sign-in flows, Swift or native iOS
  auth, native Android auth, Next.js patterns, React patterns, Vue patterns, Nuxt
  patterns, Astro patterns, TanStack Start patterns, Expo patterns, React Router
  patterns, Chrome Extension patterns, organizations, billing, subscriptions, payments,
  pricing, plans, seat-based pricing, feature entitlements, syncing users, testing,
  impersonating a user, or testing webhooks locally.
  Automatically routes to the specific skill based on their task.
license: MIT
metadata:
  version: 2.0.0
---

> This repo (anthonyl.im) is a Vite 8 SPA with `@clerk/clerk-react` ^5 (Core 2) and Hono JWT verification. Relevant skills: `clerk`, `clerk-react-patterns`, `clerk-testing`, `clerk-cli`. Do NOT apply Next.js, React Router SSR (`@clerk/react-router`), Expo, Vue, Nuxt, Astro, TanStack, Android, Swift, Chrome extension, billing, orgs, or webhook patterns. Auth code: `frontend/src/lib/clerk.ts`, `clerkProvider.tsx`, `safeAuth.ts`; `KoreaAuthGate` / `TripsAuthGate`; `server/src/middleware/clerkAuth.ts`. Preview screenshots: `bun scripts/clerk-agent-login.ts` (applies the session in Chrome; do not paste ticket URLs). Dev bearer (`VITE_DEV_BEARER` / `IG_DEV_BEARER`) is local-only — never bake into production or PR previews.

# Clerk Skills Router

## Version Detection

Check `package.json` to determine the Clerk SDK version. This determines which patterns to use:

| Package | Core 2 (LTS until Jan 2027) | Current |
|---------|----------------------------|---------|
| `@clerk/nextjs` | v5–v6 | v7+ |
| `@clerk/react` or `@clerk/clerk-react` | v5–v6 | v7+ |
| `@clerk/expo` or `@clerk/clerk-expo` | v1–v2 | v3+ |
| `@clerk/react-router` | v1–v2 | v3+ |
| `@clerk/tanstack-react-start` | < v0.26.0 | v0.26.0+ |

**Default to current** if the version is unclear or the project is new. Core 2 packages use `@clerk/clerk-react` and `@clerk/clerk-expo` (with `clerk-` prefix); current packages use `@clerk/react` and `@clerk/expo`.

All skills are written for the current SDK. When something differs in Core 2, it's noted inline with `> **Core 2 ONLY (skip if current SDK):**` callouts. The exception is `clerk-custom-ui`, which has separate `core-2/` and `core-3/` directories for custom flow hooks since those APIs are entirely different between versions.

---

## By Task

### By Task (this repo)

Use **only** these Clerk skills here:

- **Auth / gates / tokens** → `clerk-react-patterns` (`@clerk/clerk-react` Core 2). `KoreaAuthGate`, `TripsAuthGate`, `frontend/src/lib/safeAuth.ts`.
- **Playwright / test helpers** → `clerk-testing`
- **Dashboard / CLI ops** → `clerk-cli` (do not invent a new Clerk app)
- **Router / version detection** → this file (`clerk`)

Every other Clerk skill is **upstream vendor reference only**. Do not apply Next.js, React Router SSR (`@clerk/react-router`), Expo, Vue, Nuxt, Astro, TanStack, Android, Swift, Chrome extension, billing, orgs, or webhook patterns. See [`.agents/skills/README.md`](../README.md).

**Clerk CLI confirmation (this repo):** Get explicit user confirmation before any Clerk mutation or production-state change — impersonation, user/org/session writes, `clerk enable` / `disable`, `clerk api` POST/PATCH/PUT/DELETE, config patches, deletes. Preview with `--dry-run` when the command supports it. Agent mode skips interactive `y/n` prompts, so confirmation is external.

**Read-only (no confirmation):** `clerk deploy --mode agent` and `clerk deploy status --mode agent` are handoff / status only. They do not run the human deploy wizard and do not mutate production config. Do not run `clerk deploy --mode human` from an agent shell.

### Upstream catalog (do not apply in this repo)

Vendor router list, kept so the installed skill pack stays navigable. **Do not follow these routes here.**

**Adding Clerk to a greenfield project** → `clerk-setup` (upstream only)
**Custom sign-in/sign-up UI** → `clerk-custom-ui` (upstream only)
**Advanced Next.js patterns** → `clerk-nextjs-patterns` (upstream only)
**React Router SSR (`@clerk/react-router`)** → `clerk-react-router-patterns` (upstream only)
**Vue / Nuxt / Astro / TanStack** → `clerk-vue-patterns`, `clerk-nuxt-patterns`, `clerk-astro-patterns`, `clerk-tanstack-patterns` (upstream only)
**Expo / Chrome extension / Swift / Android** → `clerk-expo`, `clerk-chrome-extension-patterns`, `clerk-swift`, `clerk-android` (upstream only)
**B2B orgs / billing / webhooks** → `clerk-orgs`, `clerk-billing`, `clerk-webhooks` (upstream only)
**Backend REST API browser** → `clerk-backend-api` (upstream only)

## Quick Navigation

**This repo — use these:**
- `/clerk` — this router + version detection
- `/clerk-react-patterns` — Vite SPA hooks, gates, tokens
- `/clerk-testing` — Playwright helpers
- `/clerk-cli` — CLI (confirm mutations; `clerk deploy --mode agent` / `clerk deploy status --mode agent` are read-only)

**Upstream vendor catalog (do not apply here):**
- `/clerk-setup`, `/clerk-custom-ui`, `/clerk-nextjs-patterns`, `/clerk-react-router-patterns`
- `/clerk-vue-patterns`, `/clerk-nuxt-patterns`, `/clerk-astro-patterns`, `/clerk-tanstack-patterns`
- `/clerk-expo`, `/clerk-chrome-extension-patterns`, `/clerk-swift`, `/clerk-android`
- `/clerk-orgs`, `/clerk-billing`, `/clerk-webhooks`, `/clerk-backend-api`

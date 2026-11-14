# anthonyl.im

One Vite SPA + Hono/Bun server hosting six surfaces: Lim, a personal AI chatbot, at the root (`/`; `/chatbot` redirects), a static home page (`/home`), the **lab landing page** (`/lab`), **BreathFlow** (`/breathwork`), the **Korea** itinerary (`/trips/korea-2026`; `/korea` redirects), and a generic **trip planner** (`/trips`).

This file is the always-loaded agent guide (`CLAUDE.md` imports it). It holds the map and the rules. Reference detail lives in the files below: read the matching one before you touch that area.

| Working on | Read first |
|------------|-----------|
| Any UI (look, copy, motion, tokens) | [`design-craft`](.agents/skills/design-craft/SKILL.md) for the method, then [`PRODUCT.md`](PRODUCT.md), the section for that route. Trips also: [`DESIGN.md`](DESIGN.md) |
| Trips server or client, Instagram import, concierge, photoreal 3D | [`docs/trips.md`](docs/trips.md) |
| Lim chat, Lim's world, `server/src/lim/`, `/api/invoke` | [`docs/lim.md`](docs/lim.md) |
| Environment variables | [`docs/env.md`](docs/env.md) |
| Chunks, `vite.config.ts` `codeSplitting` | [`docs/bundles.md`](docs/bundles.md) |
| Health checks, request log, telemetry, stalled sign-in | [`docs/observability.md`](docs/observability.md) |
| Workflows, deploy, branch protection | [`docs/ci-cd.md`](docs/ci-cd.md), [`deploy/README.md`](deploy/README.md) |
| PR previews and screenshot login | [`docs/pr-previews.md`](docs/pr-previews.md) |
| Which skills apply here | [`.agents/skills/README.md`](.agents/skills/README.md) |

When behaviour changes, update the one file that owns that fact. Do not copy design context or reference tables back into this file.


---

## Codebase Structure

```
anthonyl.im/
├── frontend/                    # React 19 + TypeScript SPA (Vite 8)
│   ├── src/
│   │   ├── App.tsx              # Chatbot "Lim" at / (SSE via lib/apiService.ts)
│   │   ├── chat/                # Lim: useChat, LimStage (lazy 3D), LimArt, scene/limScene.ts
│   │   ├── AppRoutes.tsx        # React Router v7 tree — Guarded + lazy
│   │   ├── main.tsx             # Clerk provider + SW registration
│   │   ├── breathflow/          # Entire BreathFlow app
│   │   │   ├── pages/           # HomePage, SessionPage, ProgressPage, SettingsPage, BreathflowLayout
│   │   │   ├── engine/          # useSessionEngine (ephemeral session — not Zustand)
│   │   │   ├── protocols/       # Technique catalog + cadence
│   │   │   ├── gamify/          # XP, badges, levels, daily goal, practice patterns
│   │   │   ├── journeys/        # Multi-day programmes built from the catalog
│   │   │   ├── share/           # Shareable week card (canvas)
│   │   │   ├── components/      # PaintSplash, PhaseStrip, BadgeGrid, LiveAnnouncer, …
│   │   │   ├── scene/           # Watercolour breath cat: catScene (WebGPU/TSL), BloomCanvas, BloomAnchor, breathDrive
│   │   │   ├── motion/ platform/ safety/ session/ recommend/
│   │   ├── pages/
│   │   │   ├── Landing/         # `/lab` landing: content, StyleX, WebGPU hero scene
│   │   │   ├── Korea/           # Legacy Korea pages (unrouted) + concierge / theme helpers Trips imports
│   │   │   └── Trips/           # "The atlas": map-first trip planner + concierge
│   │   │       ├── TripsLayout, TripsIndex, TripCreate, TripWorkspace, TripJoin, TripChat
│   │   │       ├── workspace/   # OverviewPanel, DayPanel, ItemCard, AddStop, AiPanels, DetailsDialog
│   │   │       ├── components/  # kit (Menu, Modal), ShareDialog, CityField, DateRange, TripCover
│   │   │       ├── map/         # AtlasMap, engine (MapLibre, lazy), mapStyle, geo
│   │   │       ├── photoreal/   # "Fly the day": PhotorealOverlay, scene (Google 3D Tiles), camera / sun / stops maths
│   │   │       └── atlas/index/workspace/chat .stylex.ts, meta.ts, geocode.ts, useTripEditor.ts
│   │   ├── effect/              # Effect-TS HTTP/SSE/runtime
│   │   ├── styles/              # merge.ts (sx), common.stylex.ts, tokens.ts, route *.stylex.ts
│   │   ├── components/          # Shared: ui/*, CloudSync, RouteErrorBoundary
│   │   ├── three/               # Shared WebGPU toolkit: createStage, Jelly soft body, jellyMesh, bindJellyPointer
│   │   ├── hooks/               # useReducedMotion, useLatestCallback, useCloudSync
│   │   ├── lib/                 # apiBase, apiService, safeAuth, clerk, concierge*, externalMaps
│   │   ├── stores/              # Zustand: settingsStore, gamificationStore, historyStore, practiceStore
│   │   └── index.css            # Tokens (breathwork / korea / trips; chatbot in chat/chat.css)
│   ├── public/
│   │   ├── sw.js                # CACHE_VERSION = korea-offline-v*
│   │   ├── robots.txt           # Allow / ; Disallow /preview/
│   │   ├── site.webmanifest     # BreathFlow (start_url /breathwork)
│   │   └── korea.webmanifest    # Installable PWA (start_url /trips/korea-2026)
│   ├── vite.config.ts           # codeSplitting: three, tiles3d, effect, markdown, …
│   └── index.html               # Per-route OG / favicon / manifest swap
├── server/
│   ├── app.ts                   # Hono: static, SPA fallback, OG tags, preview mount
│   └── src/
│       ├── config.ts            # Env schema
│       ├── routes/
│       │   ├── invoke.ts        # POST /api/invoke — chatbot SSE
│       │   ├── korea.ts         # GET /api/korea/* snapshot
│       │   ├── koreaChat.ts     # POST /api/korea/chat — concierge SSE
│       │   ├── koreaPlaces.ts   # day places / dongs / entities
│       │   ├── entity.ts        # POST /api/entity/about
│       │   ├── trips.ts         # /api/trips/* (Clerk required)
│       │   ├── instagramPlaces.ts
│       │   └── agentSession.ts  # POST /api/agent/session
│       ├── trips/               # Domain, store, AI, chat, korea seed, place catalog
│       ├── igPlaces/            # Instagram pipeline: Apify fetch, Gemini extraction, worldwide geocoding
│       ├── gemini*.ts           # Shared Gemini stream/tools/grounding
│       ├── preview*.ts          # PR preview router + sidecar
│       └── middleware/          # clerkAuth, rateLimit, error
├── scripts/                     # wait-for-preview.ts, clerk-agent-login.ts (Trips screenshots: frontend/scripts/capture-trips.mjs)
├── docs/ci-cd.md
├── docs/pr-previews.md
├── .agents/skills/README.md     # Skill catalog for this repo
├── .codex/                      # Codex cloud setup/check/dev
├── .claude/cloud/               # Claude wrappers around .codex
├── index.ts
└── package.json
```

---

## Development Commands

```bash
# Backend only (hot-reload)
bun --watch server/app.ts

# Frontend dev server (proxies /api → localhost:3000)
cd frontend && bun run dev

# Full stack (builds frontend then watches backend)
bun run dev

# Build frontend
cd frontend && bun run build

# Run server tests (mocked, no external deps)
bun test --parallel --bail server/src

# Run frontend unit tests
cd frontend && bun run test:run

# Typecheck frontend
cd frontend && bun run typecheck

# Lint frontend
cd frontend && bun run lint

# Run IG places eval harness
bun run test:eval

# Integration tests (needs real env vars)
INTEGRATION=1 bun test --bail
```

**Dev server proxy:** `vite.config.ts` proxies `/api/*` → `http://localhost:3000` so you only need the Vite dev server in the browser. Start the Hono server separately when you need live API responses. `API_PROXY_TARGET=http://localhost:3099` points the proxy at an API on another port (a second checkout).

---

## Agent skills

Read the matching skill before writing code. Effect I/O rules win over generic React fetch / SWR examples; StyleX rules win over any skill that mentions Tailwind.

| Skill | When |
|-------|------|
| [`code-quality`](.agents/skills/code-quality/SKILL.md) | Any code change: state shape, boundaries, failure, async, performance, tests, review. |
| [`design-craft`](.agents/skills/design-craft/SKILL.md) | Any UI change: layout, type, colour, motion, 3D, states, copy. Then the route's section in `PRODUCT.md`. |
| [`effect-ts`](.agents/skills/effect-ts/SKILL.md) | Any frontend `/api`, SSE, or third-party HTTP. Required. |
| [`stylex`](.agents/skills/stylex/SKILL.md) | UI styling, layout, tokens, visual parity. Required for frontend UI. |
| `vercel-react-best-practices` | React 19 render / bundle. Translate Next.js examples to Vite `React.lazy` + Hono. |
| `clerk` + `clerk-react-patterns` | Clerk auth (`@clerk/clerk-react` ^5, Core 2). See [`.agents/memory/clerk.md`](.agents/memory/clerk.md). |

The other vendored Clerk skills (Next.js, React Router SSR, Vue, Expo, mobile, billing, orgs, webhooks) are the wrong stack. Catalog: [`.agents/skills/README.md`](.agents/skills/README.md).

---

## CI/CD Architecture

> Full agent memory: [`docs/ci-cd.md`](docs/ci-cd.md) (also `.agents/memory/ci-cd.md`).

```
PR opened ─────► .github/workflows/pr.yml ─┬─► pr-server-tests
                                           ├─► pr-frontend-typecheck
                                           ├─► pr-frontend-build
                                           ├─► pr-frontend-tests
                                           ├─► pr-cloud-setup
                                           └─► pr-gate (aggregate; starts immediately; required by branch protection)

PR opened ─────► .github/workflows/preview.yml ─► build + publish
                                              → https://anthonyl.im/preview/pr/<n>/
                                              (frontend + loopback API sidecar; not a merge gate)

merge to main ─► .github/workflows/deploy.yml ─► test → build → stage next → SCP dist
                                              → atomic swap → PM2 restart (rollback on fail)
                                              → smoke (/health + SPA shells)
```

Shared install/cache lives in `.github/actions/setup-ci`. Bun is pinned by `.bun-version` for CI and the droplet (the deploy installs that version when the droplet differs); bump it there. Docs-only merges (`*.md`, `docs/`, agent config) skip the deploy, and PRs that touch neither `frontend/` nor `server/` skip the preview. Dependabot minor/patch PRs auto-merge once `pr-gate` is green; majors wait for a human. Lockfiles are text `bun.lock` (Dependabot `package-ecosystem: bun`). Never reintroduce binary `bun.lockb`.

**Branch protection on `main` requires the `pr-gate` aggregate check.** This is enforced for admins too (`enforce_admins: true` in `.github/branch-protection.json`), so a red gate genuinely blocks merge — `gh pr merge --admin` will refuse. `pr-gate` starts immediately (it must not use `needs:`) so merge UIs wait instead of racing GitHub's required-check registration. To inspect or re-apply the protection:

```bash
gh api repos/anthonylim24/anthonyl.im/branches/main/protection
gh api --method PUT repos/anthonylim24/anthonyl.im/branches/main/protection \
  --input .github/branch-protection.json
```

If a check ever needs to be temporarily skipped (genuine emergency hotfix only), edit `.github/branch-protection.json`, re-apply, fix, then revert and re-apply. Never disable protection silently.

## Pre-merge Verification (every change touching shared types)

**Never merge without running the local equivalent of the cloud verify gate first.** A PR that merges red main means every other contributor's next build starts broken. (Branch protection now enforces this at the GitHub level, but running locally first saves a CI round-trip.)

The canonical **local/cloud** gate — `.codex/check.sh` / `.claude/cloud/verify.sh` — is:

```bash
# 1. Server tests (mocked, no env needed beyond stubs)
KLUSTER_API_KEY=ci-stub KLUSTER_API_BASE_URL=https://example.invalid IG_WORKER_ENABLED=false \
  bun test --parallel --bail server/src

# 2. Frontend typecheck
cd frontend && bun run typecheck
```

GitHub `pr-gate` is stricter (also build + vitest + cloud-setup smoke). If you touched anything in `frontend/`, also run:

```bash
cd frontend && bun run build && bun run test:run
```

### Type-fixture invariant

When you add a field to a TypeScript type that is used as `T | null` (not `T | null | undefined`), **every test fixture must declare the field explicitly** — `undefined` is not assignable to `T | null`. Search for fixtures with: `grep -rn "Partial<TypeName>\|: TypeName" frontend/src/**/__tests__/`.

### Frontend unit tests in CI

`pr-frontend-tests` (vitest) **is** part of `pr-gate` since PR #397 cleaned the stale BreathFlow-PWA assertions. It is still intentionally **not** part of `.codex/check.sh` (keeps cloud verify fast). If you see failing tests referencing `/site.webmanifest` or `breathflow-offline-v*`, update them to match the current Korea PWA — don't roll back behavior to match the tests.

### Playwright vs. vitest separation

Vitest runs in the `vmThreads` pool (one happy-dom per worker, about half the wall time). Tests that need platform objects in the same realm as the code under test (`instanceof DOMException`, abort signals) go in the `realmSensitive` list in `frontend/vitest.config.ts`, which runs them in `forks`.

`frontend/e2e/` is owned by Playwright. `frontend/vitest.config.ts` excludes `e2e/**` so vitest doesn't try to import `@playwright/test` and fail. **Do not remove that exclude** — leaving it in keeps `bun run test:run` green even on a fresh checkout without Playwright installed.

### Cloud-sandbox failure modes (Codex / Claude Code)

Two regressions surfaced in May 2026 that the verify gate now catches:

1. **TS resolution drift.** A cloud agent ran `bun run build` in `frontend/` before `frontend/node_modules` was installed; `tsc -b` resolved to root's TypeScript 5.x and rejected `ignoreDeprecations: "6.0"` plus missed `vite` / `@vitejs/plugin-react`. `.codex/check.sh` now runs a `verify_frontend_typescript` pre-flight that fails fast with an actionable message before `bun run typecheck`. Always run `bash .codex/setup.sh` (or `.claude/cloud/setup.sh`) before any build — it installs in **both** root AND `frontend/`.
2. **Missing-export PM2 crash.** A merged PR imported `GEMINI_BASE` from a module that didn't export it. Every server test mocked the IG dependency chain so the broken import was never evaluated. `server/src/appLoad.test.ts` is a module-load smoke test that imports `server/app.ts` and forces Bun to evaluate the full route/worker graph — the gate runs it via `bun test --parallel --bail server/src`. Do not delete it.

---

## Routing

Routes are lazy-loaded inside `Guarded` (`RouteErrorBoundary` + `Suspense`). All five apps share `index.html`; the server injects per-route OG tags / favicon / manifest. Link previews: `appPreviews` in `server/app.ts` (title, description, 1200×630 card `frontend/public/og-<app>.jpg`; bump `OG_VERSION` when a card changes). Keep `index.html`'s bootstrap scripts and `lib/routeMetadata.ts` in sync with it. `/` must stay routed to the SPA shell (Lim) ahead of `serveStatic` (`server/src/previewMeta.test.ts`). Basename comes from `lib/routerBasename.ts` (PR preview support).

| Path | App | Auth |
|------|-----|------|
| `/` | AI Chatbot (Lim). The SPA shell's `<noscript>` links privacy and terms | Public |
| `/lab` | anthonyl.im lab landing | Public |
| `/sign-in`, `/sign-up` | Clerk `SignIn` / `SignUp` (hash routing; finishes Google `#/sso-callback` on our origin) | Public |
| `/privacy`, `/terms` | Static legal pages | Public |
| `/home` | Static home (`frontend/public/home.html`, no scripts; links the apps, privacy, terms). The homepage URL for Google's OAuth branding review | Public |
| `/chatbot` | 301 to `/` (server), `Navigate` in the SPA | Public |
| `/breathwork` | BreathFlow home | Public |
| `/breathwork/session` | BreathFlow session | Public |
| `/breathwork/progress` | BreathFlow progress | Public |
| `/breathwork/settings` | BreathFlow settings | Public |
| `/breathwork/*` | BreathFlow `NotFoundPage` | Public |
| `/korea` | Redirect to `/trips/korea-2026` | Clerk-gated (via trips) |
| `/korea/day/:slug` | Redirect to `/trips/korea-2026/day/:slug` | Clerk-gated (via trips) |
| `/korea/places` | Redirect to `/trips/korea-2026` | Clerk-gated (via trips) |
| `/korea/ingest` | Redirect to `/trips/korea-2026?ingest=1` (opens the Instagram import) | Clerk-gated (via trips) |
| `/korea/*` | Redirect to `/trips/korea-2026` | Clerk-gated (via trips) |
| `/trips` | Atlas index — globe with a chip per trip, trip cards (bucketed Happening now / Upcoming / Past from four trips), search `/`, new trip `n` | Clerk-gated |
| `/trips/new` | Create — destinations, dates, optional name, optional AI draft | Clerk-gated |
| `/trips/join/:token` | Accept an invite link, then redirect to the trip | Clerk-gated |
| `/trips/:tripId` | `TripWorkspace`, overview tab (itinerary pane + sticky map). Korea seed is `korea-2026` | Clerk-gated |
| `/trips/:tripId/day/:dayId` | `TripWorkspace`, that day (compact header; left / right arrow keys change day) | Clerk-gated |
| `/trips/:tripId/edit` | Redirect to `/trips/:tripId` (hash + query kept) | Clerk-gated |
| `/trips/:tripId/places` | Redirect to `/trips/:tripId` (hash + query kept) | Clerk-gated |
| `/trips/*` | `TripsNotFound` | Clerk-gated |

Not separate routes: `TripChat` FAB, share dialog, trip details dialog, AI sheets, the photoreal 3D view (day "…" menu, "Fly the day in 3D"). Instagram import is a sheet, not a route (`instagram/InstagramSheet.tsx`): opened from the trip menu, the overview's "From Instagram" button, by pasting a post link into a day's composer, or by `?instagram=<link>` / `?ingest=1` (the PWA share target sends shared links to `/trips?url=…`, which forwards to the current or next trip). `KoreaChat` remains the `/api/korea/chat` client (trips concierge fallback). Do not add destination-specific routes.

---

## State Management

All stores use **Zustand v5**. Persisted stores write to `localStorage` under the keys in `frontend/src/lib/constants.ts`:

| Store | Key | Contents |
|-------|-----|----------|
| `settingsStore` | `breathwork-settings` | theme, sound, haptics |
| `gamificationStore` | `breathwork-gamification` | XP, badges, streaks |
| `historyStore` | `breathwork-session-history` | session log |
| `practiceStore` | `breathwork-practice` | daily goal, journey progress |

Active breath session is **not** Zustand — `frontend/src/breathflow/engine/useSessionEngine.ts` (React state).

Cloud sync (Supabase) is managed by `useCloudSync` + `CloudSync` — authenticated users sync settings, history (with mood ratings) and practice (daily goal, journeys). Keep those on Promise/Supabase, not Effect.

---

## Environment Variables

Full list: [`docs/env.md`](docs/env.md). Schema: `server/src/config.ts`; frontend: `frontend/.env.example`.

- The server refuses to boot without `KLUSTER_API_KEY` + `KLUSTER_API_BASE_URL`.
- `CLERK_SECRET_KEY` is required in production; without it every Clerk-gated route answers 401.
- `GEMINI_API_KEY` is the primary model everywhere (Gemini 4 Hydrogen); `GROQ_API_KEY` is the backup.
- `IG_DEV_BEARER` / `VITE_DEV_BEARER` are a local-only Clerk bypass. **Never** set them in production or PR previews.

---

## Deployment

**Trigger:** Push to `main` → GitHub Actions.

**Pipeline:**
1. Server tests run as gate (`bun test --parallel --bail server/src`) — all external calls are mocked — in parallel with step 2.
2. Frontend builds on CI (`bun run build` in `frontend/`) with secrets injected as `.env`.
3. Backend staged on Digital Ocean via SSH into `~/anthonyl.im.next` (shallow clone, `bun install --frozen-lockfile`), system tools checked (yt-dlp, ffmpeg, dev-browser).
4. Frontend `dist/` uploaded via SCP into the staged tree.
5. Atomic swap `next → live`, PM2 restart (`--max-memory-restart 700M`), wait for loopback `/health`; auto-rollback to `prev` if it does not come up.
6. Post-deploy smoke: `/health` JSON + `/home` and legal pages plus SPA shells on `/`, `/lab`, `/breathwork`, `/trips`, `/trips/korea-2026`.

**Server:** Digital Ocean droplet (1 GB RAM). PM2 manages the Bun process. Frontend is static files served by Hono.

**Never build the frontend on the droplet** — 1 GB RAM is not enough for Vite + StyleX production builds. CI always builds and SCPs the dist.

Full CI/CD agent memory: [`docs/ci-cd.md`](docs/ci-cd.md).

---

## Bundle Splitting

`frontend/vite.config.ts` `codeSplitting` names the chunks; table and reasons in [`docs/bundles.md`](docs/bundles.md). Rules: `maplibre`, `three`, `three-webgpu`, `tiles3d` and `photoreal` stay lazy (never imported by a route's entry module); the chunk size warning ceiling is 1100 kB on purpose (`maplibre` ≈ 1.07 MB).

---

## Shared Tech Stack

- React 19 + Vite 8 + React Router v7 (`react-router-dom` SPA, not SSR)
- TypeScript: frontend lint `~6.0`; frontend/root **build** `~7.0` via `typescript7`
- StyleX 0.19 + semantic classes in `index.css` + shadcn/ui (Radix primitives)
- Zustand v5 (BreathFlow persisted stores), Motion 13, Lucide
- Effect v3 (`effect`, `@effect/language-service`) for frontend I/O — see [Frontend Effect-TS](#frontend-effect-ts)
- Bun + Hono (server), Clerk (`@clerk/clerk-react` ^5), Supabase, PostHog
- MapLibre GL JS v6 + OpenFreeMap vector tiles for every Trips map (no API key)
- Three.js: WebGL for the photoreal 3D view (`pages/Trips/photoreal/`, any trip day, opened from the day menu); `three/webgpu` + TSL for the landing, Lim and BreathFlow scenes, all on the shared `frontend/src/three/` toolkit. Everyday Trips maps are MapLibre, not Three.js

## Frontend Effect-TS

All new frontend network I/O is Effect. Skill: [`.agents/skills/effect-ts/SKILL.md`](.agents/skills/effect-ts/SKILL.md). Stay on **stable Effect v3**, not v4 beta.

| Piece | Location |
|-------|----------|
| Tagged errors (`errorMessage`) | `frontend/src/effect/errors.ts` |
| HTTP (`fetchApi`, `fetchExternal`, `requestJson`, `readAuthToken`, `bearerHeaders`, `sleep`) | `frontend/src/effect/http.ts` |
| SSE | `frontend/src/effect/sse.ts` |
| `runPromise` unwrap | `frontend/src/effect/runtime.ts` |
| Chat error remap | `frontend/src/effect/chatErrors.ts` |
| Stable token reader | `frontend/src/hooks/useLatestCallback.ts` |

**Do**

- Write I/O as `Effect.fn("Service.method")(function* () { … })` and expose a Promise wrapper via `runPromise` from `frontend/src/effect/runtime.ts` (unwraps `FiberFailure`)
- Same-origin `/api/*` through `fetchApi` / `requestJson` so preview-base rewrite + `redirect: "manual"` stay in `apiBase.ts`
- Third-party absolute URLs through `fetchExternal`
- `Schema.TaggedError` for typed failures; `readErrorMessage(res, mode)` for per-endpoint error-body priority
- Pass `useLatestCallback(getToken)` (or `useAuthReady()` as an effect dep) into API helpers — never pass `useEffectEvent` as a function argument
- `useTransition` for non-urgent list/document commits; latest-request-wins sequence guards on overlapping refreshes
- `Effect.fail` / `Effect.catchTag` — never `throw` or `try/catch` around `yield*`

**Do not**

- Replace `apiFetch` with `@effect/platform` `FetchHttpClient`
- `Schema.decode` complex `Trip` / `ExtractedPlace` documents (`Schema.Struct` strips unknown keys)
- Introduce `Effect.Service` / `AppLayer` / effect-atom unless a module has real injectable dependencies
- Use React `Activity` to hide the photoreal 3D view / WebGL (must unmount)
- Move BreathFlow Zustand stores or `useCloudSync` Supabase calls onto Effect

Stay on Effect v3 (`effect@3`). Do not upgrade to Effect v4 beta.

## Frontend StyleX

All UI styling is StyleX + semantic CSS classes — Tailwind is removed. Skill: [`.agents/skills/stylex/SKILL.md`](.agents/skills/stylex/SKILL.md).

| Piece | Location |
|-------|----------|
| `sx(...)` merge | `frontend/src/styles/merge.ts` |
| Shared layout | `frontend/src/styles/common.stylex.ts` |
| Route StyleX | `*.stylex.ts`; Trips primitives in `pages/Trips/atlas.stylex.ts` (`a.btn`, `a.field`, …) |
| Tokens + semantic classes | `frontend/src/index.css` (`@layer reset` Preflight, route token blocks, `.atlas-pin*`, animations) |
| Vite plugin | `frontend/vite.config.ts` — `useCSSLayers` |

**Do:** `{...sx(styles.foo, 'semantic-class')}` when a rule lives in `index.css` (e.g. `sx(a.fieldBare, 'trips-title-input')`); set `borderWidth` + `borderStyle` with `borderColor`; use `layout.srOnly` for visually hidden labels; keep sibling/child combinators in `index.css` utilities.

**Do not:** reintroduce Tailwind; import plain tokens into `stylex.create()`; rely on layered StyleX when unlayered CSS sets the same property.

**Trips gotchas:** `.trips :focus-visible { outline: none }` disables the global outline, so every new control draws its own ring with `--brand-ring` (`a.focusable`). Chrome uses `--brand*`; `--ta*` is for trip identity only. Portaled UI must go through `components/kit.tsx` `Modal` (or wrap in `.trips.trips-portal`) or it loses the `--trips-*` / `--ta-*` token scope.

**Trips local testing (required for agents):** matching `VITE_DEV_BEARER` + `IG_DEV_BEARER`; `cd frontend && bun run e2e -- e2e/smoke.spec.ts -g "trips skips"`. Screenshots: `cd frontend && node scripts/capture-trips.mjs <out-dir> [tripSlug]` (desktop + phone, light + dark; `CAPTURE_ONLY=desktop-light,phone-light` limits the set, `PLAYWRIGHT_BASE_URL` overrides `:5173`). PR previews use `bun scripts/clerk-agent-login.ts` — never bake dev bearer.

---

## Design and per-app invariants

Design context (users, personality, look, tokens, anti-references) is in [`PRODUCT.md`](PRODUCT.md) only. Each app has its own visual world and one accent; never restyle one app as another. These rules hold without reading it:

- **Accessibility:** WCAG AA; 44 × 44 px targets; a visible focus ring on every control; every animation honours `prefers-reduced-motion`; live regions and labels on dynamic surfaces; layouts survive long Korean strings.
- **3D is progressive and lazy.** Every WebGPU / WebGL scene is a lazy chunk with a painted or SVG fallback (`LimArt`, `.bf-painted-bloom`, the painter still), runs only while visible, and freezes under reduced motion.
- **The photoreal 3D view must unmount** when closed (never React `Activity`) and disposes with `forceContextLoss()`.
- **No destination-specific routes or logic** (`/japan`). A destination is a trip document; extend `server/src/trips/` and `frontend/src/pages/Trips/`.
- **AI-added places carry a structured `TripLocation`**, never prose only.
- **Trips accents:** `--brand*` paints chrome (focus rings, AI actions, switches, links); `--ta*` is trip identity only.
- **Lim never trusts a spec:** everything from the model or `localStorage` passes `cleanItem` / `cleanPlace` / `cleanTweak` / `cleanOps`. After editing `worldPrompt()` or changing Lim's model, run `bun scripts/eval-lim-world.ts` (real API, not CI).
- **BreathFlow:** the cat tracks the engine phase exactly (`scene/breathDrive.ts`); session state is `useSessionEngine`, not Zustand.
- **`three-blocks` is PolyForm Noncommercial.** Keep the Required Notice in the landing footer.
- **Korea PWA auto-update:** bump `CACHE_VERSION` in `frontend/public/sw.js` on every service-worker behaviour change.

---

## Observability

`/health` answers from memory and must stay dependency-free (deploys, the uptime workflow and the droplet watchdog poll it). Every response carries `X-Request-Id`. Report browser failures with `reportClientEvent` (`frontend/src/lib/telemetry.ts`). Details, `/health/ready`, `/health/metrics`, the Clerk proxy and the stalled sign-in screen: [`docs/observability.md`](docs/observability.md).

## Service Worker / Caching Contract

The installable PWA is Korea-scoped (`korea.webmanifest`, `CACHE_VERSION = korea-offline-v*`). `robots.txt` exists. Every deploy must keep these invariants:

- **`/sw.js`** served with `Cache-Control: no-cache, no-store, must-revalidate` + `Service-Worker-Allowed: /`
- **SPA HTML** served with `no-cache, no-store, must-revalidate`
- **`/assets/*`** content-hashed bundles served with `public, max-age=31536000, immutable`
- **`CACHE_VERSION`** in `sw.js` MUST be bumped on every SW-behavior change
- **A missing `/assets/*` file is a 404**, never the SPA shell (`server/app.ts`; HTML served as JavaScript breaks lazy imports and gets cached by the SW)
- **Deploys keep earlier builds' hashed chunks for 14 days** (`deploy.yml` copies the live `dist/assets` into the staged build), so a tab left open across a deploy can still lazy-load
- **Lazy components go through `lazyRetry`** (`lib/lazyRetry.ts`: one retry). A route chunk that is gone reloads the page once (`RouteErrorBoundary`); an optional overlay (3D view, Instagram sheet, concierge) sits in an `OverlayBoundary`, so its failure closes only the overlay and offers Reload
- The client (`serviceWorker.ts`) posts `SKIP_WAITING` and reloads on `controllerchange` — gives users seamless updates without a manual hard refresh

---

## PR Workflow

### Frontend Screenshot Rule

When creating a pull request that includes frontend changes (any modifications to files in `frontend/src/` that affect UI — components, pages, CSS, layout, styles), you **must** attempt to capture screenshots of the affected pages using the Chrome MCP tools before creating the PR. Include these screenshots in the PR description under a `## Screenshots` section.

**Process:**
1. Prefer the remote PR preview (`https://anthonyl.im/preview/pr/<n>/`). Wait with `bun scripts/wait-for-preview.ts --pr <n> --sha <head-sha>` (see [`docs/pr-previews.md`](docs/pr-previews.md)). No local Vite server required.
2. For Clerk-gated preview routes (`/trips`, `/trips/korea-2026`), run `bun scripts/clerk-agent-login.ts --pr <n> --path /trips/korea-2026` once. The helper applies a screenshot-user session in the agent Chrome (Korea + Trips share cookies). **Do not paste the ticket URL** — that is how sign-in walls happen. The helper re-execs from `origin/main` before sending secrets. Cursor cloud `gh` tokens have no push — `CLERK_SECRET_KEY` is enough (screenshot-user default). Dedicated screenshot identity, not a personal production login — do not sign in to production `/trips` or `/trips/korea-2026`. Public routes only need `?hidePreviewChrome=1`.
3. **Local fallback for Trips:** when preview/Chrome MCP is unavailable, run backend + `cd frontend && bun run dev` with matching `VITE_DEV_BEARER` / `IG_DEV_BEARER` (see `deploy/README.md`), then `node scripts/capture-trips.mjs <out-dir>` from `frontend/` for the desktop / phone, light / dark set. Confirm bypass with `bun run e2e -- e2e/smoke.spec.ts -g "trips skips"`. Note local screenshots in the PR.
4. **Upload screenshots to GitHub** using `gh api` so they get permanent URLs visible in the PR. Local file paths and repo blob URLs do not render in PR descriptions. Use: `gh api --method POST repos/{owner}/{repo}/issues/{pr_number}/comments --field body="![screenshot](url)"` or upload via the GitHub upload endpoint.
5. Add the uploaded screenshot URLs to the PR description body

If the preview is not live yet (serving code not on production, droplet down) **or** Chrome MCP is unavailable, fall back to a local `cd frontend && bun run dev` with `VITE_DEV_BEARER` and note that in the PR. Do not block PR creation on screenshot availability.

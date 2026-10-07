# anthonyl.im

This repo hosts five experiences under one Vite SPA: the **anthonyl.im lab landing page** (`/`), a personal AI chatbot (`/chatbot`), **BreathFlow** (`/breathwork`), the **Korea** itinerary (`/trips/korea-2026`; `/korea` redirects), and a generic **trip planner** (`/trips`). Design principles live in [`AGENTS.md`](AGENTS.md) and [`PRODUCT.md`](PRODUCT.md). Skill catalog: [`.agents/skills/README.md`](.agents/skills/README.md).

---

## Codebase Structure

```
anthonyl.im/
├── frontend/                    # React 19 + TypeScript SPA (Vite 8)
│   ├── src/
│   │   ├── App.tsx              # Chatbot "Lim" at /chatbot (SSE via lib/apiService.ts)
│   │   ├── chat/                # Lim: useChat, LimStage (lazy 3D), LimArt, scene/limScene.ts
│   │   ├── AppRoutes.tsx        # React Router v7 tree — Guarded + lazy
│   │   ├── main.tsx             # Clerk provider + SW registration
│   │   ├── breathflow/          # Entire BreathFlow app
│   │   │   ├── pages/           # HomePage, SessionPage, ProgressPage, SettingsPage, BreathflowLayout
│   │   │   ├── engine/          # useSessionEngine (ephemeral session — not Zustand)
│   │   │   ├── protocols/       # Technique catalog + cadence
│   │   │   ├── gamify/          # XP, badges, levels
│   │   │   ├── components/      # PaintSplash, PhaseStrip, BadgeGrid, LiveAnnouncer, …
│   │   │   ├── scene/           # Watercolour bloom: bloomScene (WebGPU/TSL), BloomCanvas, BloomAnchor, breathDrive
│   │   │   ├── motion/ platform/ safety/ session/ recommend/
│   │   ├── pages/
│   │   │   ├── Landing/         # `/` lab landing: content, StyleX, WebGPU hero scene
│   │   │   ├── Korea/           # Legacy Korea dossier + shared Map Mode
│   │   │   └── Trips/           # Generic trip planner + concierge
│   │   ├── effect/              # Effect-TS HTTP/SSE/runtime
│   │   ├── styles/              # merge.ts (sx), common.stylex.ts, tokens.ts, route *.stylex.ts
│   │   ├── components/          # Shared: ui/*, CloudSync, RouteErrorBoundary
│   │   ├── hooks/               # useReducedMotion, useLatestCallback, useCloudSync
│   │   ├── lib/                 # apiBase, apiService, safeAuth, clerk, concierge*, externalMaps
│   │   ├── stores/              # Zustand: settingsStore, gamificationStore, historyStore
│   │   └── index.css            # Tokens (breathwork / korea / trips; chatbot in chat/chat.css)
│   ├── public/
│   │   ├── sw.js                # CACHE_VERSION = korea-offline-v*
│   │   ├── robots.txt           # Allow / ; Disallow /preview/
│   │   ├── site.webmanifest     # BreathFlow (start_url /breathwork)
│   │   └── korea.webmanifest    # Installable PWA (start_url /trips/korea-2026)
│   ├── vite.config.ts           # advancedChunks: three, tiles3d, effect, markdown, …
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
│       ├── igPlaces/            # Bright Data + Gemini Instagram pipeline
│       ├── gemini*.ts           # Shared Gemini stream/tools/grounding
│       ├── preview*.ts          # PR preview router + sidecar
│       └── middleware/          # clerkAuth, rateLimit, error
├── scripts/                     # wait-for-preview.ts, clerk-agent-login.ts, trips-parity-capture.mjs
├── docs/ci-cd.md
├── docs/pr-previews.md
├── .agents/skills/README.md     # Skill catalog for this repo
├── .codex/                      # Codex cloud setup/check/dev
├── .claude/cloud/               # Claude wrappers around .codex
├── index.ts
└── package.json
```

### Multi-Trip Travel Planner (`/trips`, `server/src/trips/`)

The Korea trip is one instance of a generic trip system. Trips are document-model
records (`Trip` = metadata + `days[].items[]`, each place item carrying a structured
`TripLocation` with lat/lng/category/source/confidence) stored in Supabase
(`trips` + `trip_enhancement_runs`, jsonb docs; in-memory fallback when Supabase
env is missing).

| Piece | Location | Notes |
|-------|----------|-------|
| Domain model + Zod schemas | `server/src/trips/types.ts` | Shared shape mirrored in `frontend/src/pages/Trips/types.ts` |
| Store | `server/src/trips/store.ts` | `getTripStore()`: Supabase or memory |
| Korea migration | `server/src/trips/koreaTrip.ts` | Pure `buildKoreaTrip()` from `koreaSnapshot`/`koreaPlaces`; seeded on first `/api/trips` request as trip `korea-2026` (shared with all signed-in users, not deletable) |
| AI generation/enhancement | `server/src/trips/ai.ts` | Gemini primary, Groq fallback; Google geocoding for AI places missing coords; Open-Meteo weather + travel-leg pre-pass; suggestions reviewable before apply (enhance can auto-apply places) |
| Concierge | `server/src/trips/chat.ts` | `POST /api/trips/:id/chat` SSE (Gemini Search + Maps grounding). Korea seed can fall back to `/api/korea/chat` |
| Place catalog | `server/src/trips/placeCatalog.ts` | `GET /api/trips/places-catalog` |
| Router | `server/src/routes/trips.ts` | `createTripsRouter(deps)` — Clerk required. CRUD, `/generate`, `/enhance`, `/enhancements/:runId/apply`, `/chat`, `/days/:dayId/places` |
| Frontend | `frontend/src/pages/Trips/` | `TripsIndex`, `TripCreate`, **`TripOverview`** (`/:tripId` living document), **`TripDetail`** (`/:tripId/edit` redirect to the living document), `TripDayPage` + Map Mode, `TripChat` FAB (overview + day), `TripIngest` (embedded on the living document), `ExtractedPlacesLibrary`, `tripEdits.ts` |

**Map Mode contract:** `GET /api/trips/:id/days/:dayId/places` emits the same
`PlacesResponse`/`RankedPlace` shape as the legacy Korea endpoint, so
`MapModeOverlay` (via its `placesUrl` prop) renders any trip's day without 3D
scene changes. AI-added places must always carry structured locations — never
prose only.

**Permissions:** owner > editor/viewer collaborators > `sharedWithAllUsers`
(legacy Korea behavior: all signed-in users can view/edit). Only owners delete
or change collaborators. Legacy `/api/korea/*` routes still serve snapshot
data (backward compat). Frontend `/korea*` redirects to `/trips/korea-2026`.
The snapshot is data, and the trips system is the path for all new
destination work. Do not add new destination-specific routes or logic.

### Korea Pages (`frontend/src/pages/Korea/`)

Shared Map Mode, places, and linkify implementation. Frontend `/korea*`
redirects to `/trips/korea-2026`. Keep these files; do not add `/japan`-style
routes.

| File | Purpose |
|------|---------|
| `KoreaLayout.tsx` | Shell with auth gate, theme toggle, KST clock; mounts `KoreaChat` |
| `KoreaIndex.tsx` | Trip hero, day list, Map Mode entry |
| `KoreaDay.tsx` | Day detail — reservations, places, timeline |
| `KoreaChat.tsx` | Concierge SSE (`POST /api/korea/chat`) |
| `Detailed3DScene.tsx` | Photorealistic 3D tiles Map Mode scene (replaced orbital `MapModeScene`) |
| `MapModeOverlay.tsx` | Shared overlay (Korea + Trips via `placesUrl`) |
| `PlaceDetailSheet.tsx` | Slide-up detail panel for a place |
| `Places.tsx` | Full places list with skeleton loaders |
| `Ingest.tsx` | Instagram URL ingestion UI |
| `LinkifiedText.tsx` | Auto-links flight #s, addresses, phones |
| `SmartEntity.tsx` | Entity cards with linked metadata |

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
bun test --bail server/src

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

**Dev server proxy:** `vite.config.ts` proxies `/api/*` → `http://localhost:3000` so you only need the Vite dev server in the browser. Start the Hono server separately when you need live API responses.

---

## Agent skills

Read the matching skill before writing code. Effect I/O rules win when they conflict with generic React fetch/SWR examples.

| Skill | When |
|-------|------|
| [`.agents/skills/effect-ts/SKILL.md`](.agents/skills/effect-ts/SKILL.md) | Any frontend `/api`, SSE, or third-party HTTP. Required. |
| [`.agents/skills/stylex/SKILL.md`](.agents/skills/stylex/SKILL.md) | UI styling, layout, tokens, visual parity. Required for frontend UI. |
| `vercel-react-best-practices` | React 19 render/bundle. Vite `React.lazy` + Hono, not Next.js. |
| `clerk` + `clerk-react-patterns` | Clerk auth (`@clerk/clerk-react` ^5). See `.agents/memory/clerk.md`. |

Catalog (what to ignore): [`.agents/skills/README.md`](.agents/skills/README.md). Short pointers: [`.agents/memory/effect-ts.md`](.agents/memory/effect-ts.md), [`.agents/memory/stylex.md`](.agents/memory/stylex.md), [`.agents/memory/clerk.md`](.agents/memory/clerk.md).

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

Shared install/cache lives in `.github/actions/setup-ci`. Lockfiles are text `bun.lock` (Dependabot `package-ecosystem: bun`). Never reintroduce binary `bun.lockb`.

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
  bun test --bail server/src

# 2. Frontend typecheck
cd frontend && bun run typecheck
```

GitHub `pr-gate` is stricter (also build + vitest + cloud-setup smoke). If you touched anything in `frontend/`, also run:

```bash
cd frontend && bun run build && bun run test:run
```

### Type-fixture invariant

When you add a field to a TypeScript type that is used as `T | null` (not `T | null | undefined`), **every test fixture must declare the field explicitly** — `undefined` is not assignable to `T | null`. Search for fixtures with: `grep -rn "Partial<TypeName>\|: TypeName" frontend/src/**/__tests__/`.

Recent recurrence: PR #396 added `busyness*` fields to `ExtractedPlace` but didn't update `Places.test.tsx`'s `makePlace()` fixture, which broke `tsc -b --noEmit` on main even though a vite-only path could look green.

### Frontend unit tests in CI

`pr-frontend-tests` (vitest) **is** part of `pr-gate` since PR #397 cleaned the stale BreathFlow-PWA assertions. It is still intentionally **not** part of `.codex/check.sh` (keeps cloud verify fast). If you see failing tests referencing `/site.webmanifest` or `breathflow-offline-v*`, update them to match the current Korea PWA — don't roll back behavior to match the tests.

### Playwright vs. vitest separation

`frontend/e2e/` is owned by Playwright. `frontend/vitest.config.ts` excludes `e2e/**` so vitest doesn't try to import `@playwright/test` and fail. **Do not remove that exclude** — leaving it in keeps `bun run test:run` green even on a fresh checkout without Playwright installed.

### Cloud-sandbox failure modes (Codex / Claude Code)

Two regressions surfaced in May 2026 that the verify gate now catches:

1. **TS resolution drift.** A cloud agent ran `bun run build` in `frontend/` before `frontend/node_modules` was installed; `tsc -b` resolved to root's TypeScript 5.x and rejected `ignoreDeprecations: "6.0"` plus missed `vite` / `@vitejs/plugin-react`. `.codex/check.sh` now runs a `verify_frontend_typescript` pre-flight that fails fast with an actionable message before `bun run typecheck`. Always run `bash .codex/setup.sh` (or `.claude/cloud/setup.sh`) before any build — it installs in **both** root AND `frontend/`.
2. **Missing-export PM2 crash.** A merged PR imported `GEMINI_BASE` from a module that didn't export it. Every server test mocked the IG dependency chain so the broken import was never evaluated. `server/src/appLoad.test.ts` is a module-load smoke test that imports `server/app.ts` and forces Bun to evaluate the full route/worker graph — the gate runs it via `bun test --bail server/src`. Do not delete it.

---

## Routing

Routes are lazy-loaded inside `Guarded` (`RouteErrorBoundary` + `Suspense`). All four apps share `index.html`; the server injects per-route OG tags / favicon / manifest. Basename comes from `lib/routerBasename.ts` (PR preview support).

| Path | App | Auth |
|------|-----|------|
| `/` | anthonyl.im lab landing | Public |
| `/chatbot` | AI Chatbot | Public |
| `/breathwork` | BreathFlow home | Public |
| `/breathwork/session` | BreathFlow session | Public |
| `/breathwork/progress` | BreathFlow progress | Public |
| `/breathwork/settings` | BreathFlow settings | Public |
| `/breathwork/*` | BreathFlow `NotFoundPage` | Public |
| `/korea` | Redirect to `/trips/korea-2026` | Clerk-gated (via trips) |
| `/korea/day/:slug` | Redirect to `/trips/korea-2026/day/:slug` | Clerk-gated (via trips) |
| `/korea/places` | Redirect to `/trips/korea-2026/places` | Clerk-gated (via trips) |
| `/korea/ingest` | Redirect to `/trips/korea-2026?ingest=1#trip-ingest` | Clerk-gated (via trips) |
| `/korea/*` | Redirect to `/trips/korea-2026` | Clerk-gated (via trips) |
| `/trips` | Trip planner — list | Clerk-gated |
| `/trips/new` | Trip planner — create (blank or AI starter) | Clerk-gated |
| `/trips/:tripId` | Living document (dossier + inline edit). Korea seed is `korea-2026` | Clerk-gated |
| `/trips/:tripId/places` | Trip places library | Clerk-gated |
| `/trips/:tripId/day/:dayId` | Dossier day page + Map Mode | Clerk-gated |
| `/trips/:tripId/edit` | Redirect to `/trips/:tripId` (hash + query kept) | Clerk-gated |

Not separate routes: `TripChat` FAB (trip + day), `TripIngest` (embedded on the living document). `KoreaChat` remains the `/api/korea/chat` client (trips concierge fallback). Do not add destination-specific routes.

---

## State Management

All stores use **Zustand v5**. Persisted stores write to `localStorage` under the keys in `frontend/src/lib/constants.ts`:

| Store | Key | Contents |
|-------|-----|----------|
| `settingsStore` | `breathwork-settings` | theme, sound, haptics |
| `gamificationStore` | `breathwork-gamification` | XP, badges, streaks |
| `historyStore` | `breathwork-session-history` | session log |

Active breath session is **not** Zustand — `frontend/src/breathflow/engine/useSessionEngine.ts` (React state).

Cloud sync (Supabase) is managed by `useCloudSync` + `CloudSync` — authenticated users sync settings and history. Keep those on Promise/Supabase, not Effect.

---

## Environment Variables

Always required at server boot (`config.ts` throws):
- `KLUSTER_API_KEY` + `KLUSTER_API_BASE_URL` — homepage chatbot LLM (Deepseek via Kluster)

Required for Clerk-gated **production** (`/trips`, `/trips/korea-2026`, IG ingest). Without it, JWT verification fails and `/api/trips` (and other gated routes) return 401:
- `CLERK_SECRET_KEY` — Clerk JWT verification (`server/src/middleware/clerkAuth.ts`)

Required when the IG worker is enabled (warns if missing):
- `BRIGHT_DATA_API_KEY` — Instagram post metadata
- `GOOGLE_MAPS_API_KEY` — geocoding
- `GROQ_API_KEY` — Whisper + extractor fallback
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`

Optional / feature-gated:
- `GEMINI_API_KEY` — optional. Primary for skip-video / caption-only IG extract; also Whisper 429 fallback, last-resort text extract, geocode-dispute resolve, and trip/Korea concierge grounding. Video/OCR path uses Groq + Vision when unset.
- `CEREBRAS_API_KEY` — Groq 429 fallback
- `GOOGLE_VISION_API_KEY` — defaults to Maps key
- `KAKAO_REST_API_KEY` — Korea geocode assist
- `NOTION_TOKEN` — optional live Korea snapshot fetch
- `AGENT_LOGIN_SECRET`, `CLERK_AGENT_USER_ID` / `CLERK_AGENT_USER_EMAIL`, `AGENT_GITHUB_REPO` — preview screenshot login
- `IG_WORKER_*` — worker knobs
- `IG_DEV_BEARER` / `VITE_DEV_BEARER` — **non-production** Clerk bypass only. Inert when `NODE_ENV=production`. **Never** set in production or PR previews.

Frontend (`frontend/.env` from CI secret `FRONTEND_ENV`):
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
- `VITE_POSTHOG_KEY`
- `VITE_GOOGLE_PLACES_API_KEY`, `VITE_GOOGLE_MAP_TILES_API_KEY` — Map Mode photos / 3D tiles
- `VITE_ENABLE_SERVICE_WORKER` — preview builds disable registration
- `VITE_API_BASE` / `VITE_BASE` — preview builds only

See `frontend/.env.example` and `server/src/config.ts`.

---

## Deployment

**Trigger:** Push to `main` → GitHub Actions.

**Pipeline:**
1. Server tests run as gate (`bun test --bail server/src`) — all external calls are mocked.
2. Frontend builds on CI (`bun run build` in `frontend/`) with secrets injected as `.env`.
3. Backend staged on Digital Ocean via SSH into `~/anthonyl.im.next` (shallow clone, `bun install --frozen-lockfile`), system tools checked (yt-dlp, ffmpeg, dev-browser).
4. Frontend `dist/` uploaded via SCP into the staged tree.
5. Atomic swap `next → live`, PM2 restart; auto-rollback to `prev` if PM2 is not online.
6. Post-deploy smoke: `/health` JSON + SPA shells on `/`, `/chatbot`, `/breathwork`, `/trips`, `/trips/korea-2026`.

**Server:** Digital Ocean droplet (1 GB RAM). PM2 manages the Bun process. Frontend is static files served by Hono.

**Never build the frontend on the droplet** — 1 GB RAM is not enough for Vite + StyleX production builds. CI always builds and SCPs the dist.

Full CI/CD agent memory: [`docs/ci-cd.md`](docs/ci-cd.md).

---

## Bundle Splitting Strategy

`vite.config.ts` uses `advancedChunks` (Rolldown) to keep initial load fast:

| Chunk | Contents | Why |
|-------|----------|-----|
| `three-core` | `three.core.js` | Shared by Map Mode and the landing hero |
| `three` | three.js WebGL build + loaders + OrbitControls | Only loaded in Map Mode |
| `three-webgpu` | `three/webgpu` + `three/tsl` + TSL addons + `three-blocks` | Only loaded by the landing hero |
| `tiles3d` | 3d-tiles-renderer | Only loaded in Detailed-3D debug mode |
| `react-vendor` | react + react-dom + scheduler | Stable cache |
| `motion` | motion/framer-motion | Used by Places and MapMode — split prevents Places from pulling in three.js |
| `effect` | effect + `@effect/*` | Frontend I/O runtime |
| `supabase` | @supabase/* | Auth + sync |
| `router` | react-router | Routing |
| `radix` | @radix-ui/* | UI primitives |
| `state` | zustand | State |
| `icons` | lucide-react | Icons |
| `markdown` | react-markdown + remark | Chatbot + trip concierge |
| `korea-map` | Korea MapMode source | 3D scene (also used by Trips via `MapModeOverlay`) |

Chunk size warning ceiling is 720 KB (intentional — the `three` chunk is large but lazily loaded and cached by SW).

---

## Shared Design Principles (apply to every route)

1. **Craft over convention.** Prefer custom, considered solutions over generic component-library defaults. Spacing, typography weight contrast, surface hierarchy, and motion should feel intentionally designed, not assembled.
2. **Motion with purpose.** Every animation should serve comprehension (orient, reveal, guide) or affect (calm, anticipation, delight). Decorative-only motion is rejected. Spring physics over linear tweens; respect `prefers-reduced-motion` everywhere.
3. **Depth through restraint.** No more than one vivid moment per viewport. Use neutral mass to make accents punch. Avoid glassmorphism stacking, gradient text on headings, and generic SaaS gradients.
4. **Typography as the design language.** Cormorant Garamond for display moments, Inter for body. Weight + size + tracking carry the hierarchy — let the type breathe.
5. **One accent, many neutrals.** Each app gets a single signature accent; the rest of the palette stays disciplined.

## Shared Accessibility Standards

- **Target:** WCAG AA (4.5:1 contrast, keyboard navigation, screen-reader support)
- **Reduced motion:** All transforms / pulses / orbital rotations must honor `prefers-reduced-motion`
- **Touch targets:** Minimum 44 × 44 px for all interactive elements
- **Focus indicators:** Visible focus rings on every interactive element (route-specific accent color)
- **ARIA:** Live regions, proper roles, and explicit labels on every dynamic surface (breathing orb, Map Mode bubbles, status banners)
- **i18n:** No layouts that break on long Korean / hangul strings; copy uses `break-words` + `overflow-wrap:anywhere` defensively

## Shared Tech Stack

- React 19 + Vite 8 + React Router v7 (`react-router-dom` SPA, not SSR)
- TypeScript: frontend lint `~6.0`; frontend/root **build** `~7.0` via `typescript7`
- StyleX 0.19 + semantic classes in `index.css` + shadcn/ui (Radix primitives)
- Zustand v5 (BreathFlow persisted stores), Motion 13, Lucide
- Effect v3 (`effect`, `@effect/language-service`) for frontend I/O — see [Frontend Effect-TS](#frontend-effect-ts)
- Bun + Hono (server), Clerk (`@clerk/clerk-react` ^5), Supabase, PostHog
- Three.js for Map Mode (Korea **and** Trips)

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
- Use React `Activity` to hide Map Mode / WebGL (must unmount)
- Move BreathFlow Zustand stores or `useCloudSync` Supabase calls onto Effect

Stay on Effect v3 (`effect@3`). Do not upgrade to Effect v4 beta.

## Frontend StyleX

All UI styling is StyleX + semantic CSS classes — Tailwind is removed. Skill: [`.agents/skills/stylex/SKILL.md`](.agents/skills/stylex/SKILL.md).

| Piece | Location |
|-------|----------|
| `sx(...)` merge | `frontend/src/styles/merge.ts` |
| Shared layout | `frontend/src/styles/common.stylex.ts` |
| Route StyleX | `*.stylex.ts`; Trips vocabulary in `pages/Trips/ui.ts` |
| Tokens + semantic classes | `frontend/src/index.css` (`@layer reset` Preflight, `.cover-band`, animations) |
| Vite plugin | `frontend/vite.config.ts` — `useCSSLayers` |

**Do:** `{...sx(styles.foo, 'semantic-class')}` when the old Tailwind bundle included semantic classes; set `borderWidth` + `borderStyle` with `borderColor`; use `layout.srOnly` for visually hidden labels; keep sibling/child combinators in `index.css` utilities.

**Do not:** reintroduce Tailwind; import plain tokens into `stylex.create()`; rely on layered StyleX when unlayered CSS sets the same property.

**Trips local testing (required for agents):** matching `VITE_DEV_BEARER` + `IG_DEV_BEARER`; `cd frontend && bun run e2e -- e2e/smoke.spec.ts -g "trips skips"`. PR previews use `bun scripts/clerk-agent-login.ts` — never bake dev bearer.

## Shared Tokens

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| Canvas | `#F5F2ED` | `#171613` | Page background |
| Surface | `#FFFEFA` | `hsl(40 6% 11%)` | Cards, panels |
| Ink Primary | `#1C1917` | `#E7E3DE` | Body text |
| Ink Secondary | `#78716C` | `#A8A29E` | Secondary text |
| Ink Tertiary | `#A8A29E` | `#78716C` | Hint / muted text |
| Destructive | `#EF4444` | `#EF4444` | Errors, delete |
| Border | `rgba(28,25,23,0.08)` | `rgba(255,252,245,0.06)` | Subtle edges |
| Body font | Inter (BreathFlow: Geist) | | Shared-site body; BreathFlow uses Geist |
| Display font | Cormorant Garamond (BreathFlow: Fraunces) | | Shared-site display; BreathFlow uses Fraunces |
| Border radius | `0.5rem` (default) / `1rem`+ in Korea orb cards | | Standard rounding |
| Spring easing | `cubic-bezier(0.16, 1, 0.3, 1)` | | Motion default |
| Decel easing | `cubic-bezier(0.33, 0, 0, 1)` | | Smooth stops |

Each app's *accent* color is its own (see per-app sections below).

---

## Design Context: `/` — anthonyl.im Lab Landing

Code: `frontend/src/pages/Landing/` (`Landing.tsx`, `parts.tsx`, `content.ts`, `landing.stylex.ts`, `HeroCanvas.tsx`, `scene/`). A fictional AI lab ("design study", disclosed in the footer). All copy and mock data live in `content.ts`. Product cards link to the real apps: Lim → `/chatbot`, Concierge → `/trips`, BreathFlow → `/breathwork`.

- **Palette:** bone `#EDE8DF` canvas, ink `#0E1024`, one ultramarine accent `#2433E0`. Tokens are `--lim-*` vars on `.landing` in `index.css`. Display type is Archivo (wdth axis), with Fragment Mono for data.
- **Hero:** WebGPU (WebGL2 fallback) soft-body glass droplet (`scene/heroScene.ts`). It's a three-blocks `MeshTransmissionNodeMaterial` with spring physics (drag, poke, stretch). Normals come from a procedurally hand-painted brush field (`scene/painter.ts`), which also serves as the static still and fallback. TSL post: bloom, scroll-driven ink dissolve, three-blocks `filmHD`. The scene runs only while on screen; reduced motion freezes the clock.
- **License:** `three-blocks` is PolyForm Noncommercial 1.0.0. The footer carries the Required Notice — keep it. Commercial use needs a three-blocks license.
- **Chunks:** the hero loads `three-core` + `three-webgpu` only; Map Mode loads `three-core` + `three`.

## Design Context: `/chatbot` — Lim, the jelly companion

Code: `frontend/src/App.tsx` (page shell), `frontend/src/chat/` (`useChat.ts` state + persistence, `LimStage.tsx` lazy 3D stage, `LimArt.tsx` SVG Lim, `caret.ts`, `chat.css` tokens + code theme, `scene/limScene.ts` WebGPU/TSL scene), `frontend/src/styles/chatbot.stylex.ts`, `messageContent.stylex.ts`, `components/message-content.tsx`.

### Users
Visitors who open `/chatbot` (from the landing page or a shared link). Recruiters, prospective collaborators, friends, curious engineers. They're trying to get a feel for who Anthony is — fast. They scan, they pivot, they leave if it doesn't earn attention.

### Brand Personality
**Playful, Warm, Crafted.** Lim is a Pixar-soft coral gumdrop of jelly who answers for Anthony. The craft shows in how Lim moves; the chat itself stays calm and readable.

**Emotional goal:** Delight in the first second (Lim pops in, bounces, looks at you), then a reassuring "this person ships" feeling. The mascot is the demo.

### Aesthetic Direction
- **Theme:** "Sorbet studio": cream day canvas `#FFF6EC`, night-indigo `#1E1833` (toggle in header, or `S`). Pastel blobs, doodles and confetti are set dressing only.
- **Mascot:** the toolkit `Jelly` soft body (shape matching, `upright` righting) with toon/wrap shading, rim fresnel, a smoothed rest-normal blend and an ink hull. Face paint (brows, mouth, blush) lives in the body shader; eyes are attached 3D spheres. A polka-dot floor, a scalloped mint rug, contact shadows and three jelly beans to bump.
- **Behaviours:** idle breathe + fidgets + blinks; typing leans in and eyes follow the caret; send = hop + squash landing; thinking = wobble + thought bubble; streaming = mouth flaps per chunk; done = happy squish + confetti (first reply); error = droop + "Try again"; poke = giggle + blush; drag/fling bounces off the walls and floor.
- **Layout:** desktop stage left, chat panel right; mobile stage on top (compact once chatting, so Lim stays visible while typing).
- **Accent:** Lim coral `#FF7E6B` (send button, Lim's name, list markers). Plum ink `#2B2140` carries the text.
- **Type:** Fredoka display (headings, chips, captions), Inter body.
- **Anti-references:** no purple "AI" gradients, no glowing borders, no rainbow typing indicators. Do not reuse the landing's ultramarine, BreathFlow's watercolour or the Trips toy-world.

### Per-route Tokens
- Theme classes: `chatbot-shadow` (day) / `chatbot-dark` (night), both defined in `frontend/src/chat/chat.css` (`--chat-*` vars), not `index.css`
- `html:has(.chatbot-*)` paints the canvas so iOS safe areas blend
- The 3D scene is lazy (`import('./scene/limScene')`); `LimArt` SVG is the first paint and the no-WebGPU/WebGL fallback
- Reduced motion freezes the jiggle and renders on demand; CSS beats are paused
- Chat history persists in `localStorage` under `lim-chat-v1`; night mode under `lim-chat-night`
- I/O stays `invokeDeepseek` (Effect SSE) in `lib/apiService.ts`; the optional `signal` param powers Stop (Esc)

---

## Design Context: `/breathwork/*` — BreathFlow ("Watercolor breath")

Code: `frontend/src/breathflow/`. Session state is `useSessionEngine` (React state, not Zustand). The centrepiece is a WebGPU soft-body watercolour **bloom**: `scene/bloomScene.ts` (three/webgpu + TSL, lazy-imported by `scene/BloomCanvas.tsx` so three stays out of the initial chunk), positioned by `scene/BloomAnchor.tsx` (painted CSS fallback + brush progress stroke) and driven by `scene/breathDrive.ts` (`useBreathReader` interpolates the 1 Hz engine tick into a smooth amplitude). Built on the shared toolkit in `frontend/src/three/` (`createStage`, `Jelly`, `bindJellyPointer`). Pigments live in `pigments.ts`; paper/wash/brush CSS + SVG filters in `styles/watercolor.css` + `components/WatercolorDefs.tsx`. Fonts: Fraunces display (`.bf-display`, SOFT/WONK axes) + Geist body.

### Users
Wellness enthusiasts and people seeking anxiety / stress relief. They open BreathFlow when they need to decompress, build a daily breathing habit, or access structured breathwork techniques backed by science. The context is often evening wind-down, pre-performance calm, or mid-day stress breaks — moments that demand a UI that feels immediately calming upon launch.

### Brand Personality
**Calm, Scientific, Hand-made.** A precision instrument painted by hand: evidence-based protocols, delivered as a living watercolour. Gamification (XP, levels, wax-seal badges) exists to sustain habit, not to entertain.

**Emotional goals:** Immediate calm (wet paint spreading slowly on paper) and quiet confidence (the bloom fills exactly as long as the breath).

### Aesthetic Direction
- **World:** a hand-painted watercolour on warm cotton cold-press paper (`#F7F1E6`); dark mode is deep ink-blue paper (`#15161C`). A fixed `.bf-paper` tooth overlay multiplies over everything.
- **Bloom:** a `Jelly` soft body that inflates on inhale (≈1.36×), jiggles subtly on holds, and eases down on exhale; physics carries the overshoot. TSL material: Beer–Lambert pigment glaze, edge pooling, wet edge, backruns and granulation on the `rest` attribute, hue drift. The paper sheet behind it has wet-in-wet fbm blooms that spread on inhale and recede on exhale, plus drifting flecks. Post: paper tooth, colour bleed, vignette, Three.js Blocks `filmHD` grain (credited on Settings).
- **Interaction:** poke + drag the bloom on Home and session setup; during a session, a gentle poke only. Space toggles pause/resume.
- **Chrome:** matte paper, pill buttons tinted by the active pigment (`--bf-ink`), painted swatches/dabs (`.bf-swatch`, `.bf-dab`), brush strokes (`.bf-brush`). Celebration is a paint-splash burst (`PaintSplash`), not confetti. Badges are wax seals.
- **Anti-references:** ultramarine/SaaS blue-purple, glossy glass chrome, cartoon wellness, cluttered dashboards.

### Per-route Tokens

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| Canvas (paper) | `#F7F1E6` | `#15161C` | Page + WebGL paper |
| Surface | `#FBF7EF` | `#1C1D24` | Cards, dock |
| Text | `#27231F` | `#EDE6DA` | Body |
| Accent (Payne's grey) | `#3A4A5C` | `#A9BDD2` | Focus rings, default ink |
| Destructive | `#A8322A` | `#F2877E` | Delete |

CSS vars: `--bf-mass` / `--bf-glaze` (current pigment), `--bf-ink` (primary-button tint), `--bf-amp` (breath amplitude, written per frame by `BloomAnchor`).

#### Technique Pigments (`pigments.ts`)

| Technique | Pigment | Mass | Glaze |
|-----------|---------|------|-------|
| Box Breathing | Indigo & Payne's grey | `#2B3A5E` | `#55657A` |
| CO2 Tolerance | Viridian | `#1F7A68` | `#5E9C7F` |
| Power Breathing | Quinacridone rose & cadmium orange | `#C23A64` | `#E5793A` |
| Cyclic Sighing | Cobalt violet | `#7D4FA3` | `#C08BC2` |
| Resonance | Cerulean | `#2F7FA6` | `#73B2B6` |
| Diaphragmatic | Sap green & raw sienna | `#5D8436` | `#C18F47` |
| Extended Exhale | Permanent rose | `#B9506F` | `#D99A9B` |
| 4-7-8 | Moonglow | `#45407A` | `#8A7FA8` |
| Pursed-lip Recovery | Burnt sienna | `#A4532F` | `#D19A55` |

Unlocked bloom pigments (Settings, by level) override the technique pigment with the theme's colours.

### BreathFlow-specific Principles

1. **Serenity first.** Every design decision should reduce visual noise. White space (paper) is a feature.
2. **Scientific credibility.** Protocols, evidence labels, and safety gating stay first-class; the paint never hides the instructions.
3. **The bloom is sacred.** Its scale must track the engine phase exactly (`breathDrive.ts`); surrounding UI fades during session. Under `prefers-reduced-motion` the jiggle freezes and the scene renders on demand per tick — pacing stays legible through the phase word, count, bloom scale, and the brush stroke.
4. **Habit > novelty.** Gamification exists to drive return visits. Never let the motivational layer overpower the breathwork itself.
5. **WebGPU is progressive.** No GPU → the painted CSS bloom (`.bf-painted-bloom`) carries the same breath via `--bf-amp`. The scene must stay a lazy chunk.

---

## Design Context: `/trips/korea-2026` — Korea Trip Itinerary

Clerk-gated dossier at `/trips/korea-2026`. Legacy `/korea*` frontend routes redirect here. Snapshot also seeds trip `korea-2026`. `/api/korea/*` remains. Do not add new destination-specific routes.

### Users
Anthony (primary) and his partner, while planning + executing a 12-day Seoul + Busan trip in late May / early June 2026. Used on phones for in-trip lookups (reservations, nearby places, directions) and on desktop for planning. Authenticated behind Clerk so it's a private dossier.

### Brand Personality
**Cinematic, Personal, Refined.** A private travel concierge dossier — every reservation accounted for, every neighborhood researched, every recommendation reasoned. Map Mode is the centerpiece: Google Photorealistic 3D Tiles with a glassy YOU pin on the terrain.

**Emotional goals:** Anticipation (the trip is coming, every piece feels considered) and confidence (no detail slips through). Should feel like a hand-bound itinerary booklet animated into the future.

### Aesthetic Direction
- **Visual tone:** Warm parchment base inherited from the shared palette, with a **rose / amber gradient bloom** as the signature. Korea's red-and-gold heritage referenced without literal kitsch — no taegukgi flag chrome, but the spirit of it.
- **Hero gradient:** soft rose top-left → amber bottom-right radial blobs (animated, slow drift). Dark mode swaps to a purple / indigo / mauve nightscape so in-trip evening lookups feel travel-time-of-day appropriate.
- **YOU pin:** glassy `MeshPhysicalMaterial` droplet + water puddle (`youPin.ts`), snapped to the photogrammetry mesh. Label is DOM-projected from world coords.
- **Place markers:** category-tinted `MeshStandardMaterial` spheres above terrain + ground beams — not glass orbs.
- **References:** Apple Maps' Look Around isometry combined with the small careful detail work of `flighty.app` and the editorial restraint of `monocle.com/travel`.
- **Anti-references:** Cluttered booking aggregators (Booking.com), generic "trip planner" SaaS dashboards, kitsch tourism brochures, OpenStreetMap defaults.
- **Theme:** Both light and dark are first-class — light during planning, dark for in-trip evening lookups.

### Per-route Tokens

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| Accent — primary | `#F43F5E` (rose-500) | `#FB7185` (rose-400) | Scheduled reservations, YOU pin, primary CTAs |
| Accent — secondary | `#F59E0B` (amber-500) | `#FBBF24` (amber-400) | Core itinerary items, hero gradient stop |
| Accent — supplemental | `#A8A29E` (stone-400) | `#78716C` (stone-500) | Supplemental / extras in Map Mode |
| Success | `#10B981` (emerald-500) | `#34D399` (emerald-400) | Confirmed booking status |
| Pending | `#F59E0B` (amber-500) | `#FBBF24` (amber-400) | Reservation pending |
| Place marker | per-place category color | same | Emissive sphere + ground beam |

### Korea-specific Principles

1. **YOU is world-anchored on the mesh.** Camera target can lerp toward a selected place; reset returns to a 45° birds-eye on YOU.
2. **Refraction is for the YOU pin only.** Place markers stay solid. BreathFlow chrome stays matte.
3. **Distance is information, not chrome.** Every place card / marker label surfaces distance + walking ETA prominently as a colored pill — it's the most-used piece of data, not a footnote.
4. **Smart links everywhere.** Flight numbers → carrier tracker, KTX → Korail timetable, addresses → Google Maps, phones → `tel:`, times → AM/PM tooltip. Free-form copy gets auto-linked by the `LinkifiedText` engine.
5. **PWA auto-update is mandatory.** Service worker + client must auto-swap to the latest version after each deploy — users should never see stale Map Mode. Bump `CACHE_VERSION` on every breaking SW change.

### Map Mode-specific Conventions

- Overlay: `MapModeOverlay.tsx` (`placesUrl`). Scene: `Detailed3DScene.tsx` (Google Photorealistic 3D Tiles). `MapModeScene.tsx` is gone.
- Trips reuse the overlay with `/api/trips/:id/days/:dayId/places`.
- Reset pitch ≈ `Math.PI / 4`. No auto-rotate. Adaptive tile quality / DPR (`adaptiveQuality.ts`, `deviceTier.ts`).
- Missing `VITE_GOOGLE_MAP_TILES_API_KEY` (or Places key fallback) or no WebGL → `MapModeFallbackList`.
- **Must unmount** when closed — do not hide with React `Activity`.
- Concierge chips may open Google/Apple Maps (`lib/externalMaps.ts`).

---

## Design Context: `/trips/*` — Generic Trip Planner

JR pocket timetable (not Korea parchment, not Linear/Notion zinc), parameterized by `data-trip-accent` (retints canvas + cover band). `/trips/:tripId` is the living document (`TripOverview`); `/edit` redirects there. Concierge FAB on the trip and day pages only. Do not add destination-specific routes. Do not restyle Trips back into the Korea dossier or a zinc CRUD workspace. Full design notes: [`DESIGN.md`](DESIGN.md) / [`AGENTS.md`](AGENTS.md) / [`PRODUCT.md`](PRODUCT.md).

---

## Service Worker / Caching Contract

The installable PWA is Korea-scoped (`korea.webmanifest`, `CACHE_VERSION = korea-offline-v*`). `robots.txt` exists. Every deploy must keep these invariants:

- **`/sw.js`** served with `Cache-Control: no-cache, no-store, must-revalidate` + `Service-Worker-Allowed: /`
- **SPA HTML** served with `no-cache, no-store, must-revalidate`
- **`/assets/*`** content-hashed bundles served with `public, max-age=31536000, immutable`
- **`CACHE_VERSION`** in `sw.js` MUST be bumped on every SW-behavior change
- The client (`serviceWorker.ts`) posts `SKIP_WAITING` and reloads on `controllerchange` — gives users seamless updates without a manual hard refresh

---

## Design Audit Status

The March 2025 BreathFlow audit is **historical**. BreathFlow was rebuilt in `frontend/src/breathflow/`. Do not "fix" closed items or search deleted files (`FluidOrb.tsx`, `BreathingSession.tsx`, `pages/Home.tsx`, `components/breathing/`, `sessionStore`).

### Resolved

- ✅ `user-scalable=no` removed — `width=device-width, initial-scale=1.0, viewport-fit=cover`
- ✅ Light + dark tokens — `color-scheme: light dark` in `index.css`
- ✅ `prefers-reduced-motion` — shared `hooks/useReducedMotion.ts`, BreathFlow `platform/useReducedMotion.ts`, CSS queries
- ✅ ARIA on the session path — `LiveAnnouncer`, session regions, cadence editor
- ✅ `robots.txt` + `sitemap.xml` — `Disallow: /preview/`
- ✅ Bloom reduced-motion — `scene/bloomScene.ts` freezes the jiggle and renders on demand

### Still worth watching

- Leftover inline hex on some settings / badge surfaces
- 44 px touch targets on compact toggles — verify after nav changes

### Preserve

- Zustand persisted stores + `lazy()` route splits + Effect I/O
- Token system + safe-area handling + GPU-friendly motion
- Map Mode unmount (never React `Activity`)

---

## PR Workflow

### Frontend Screenshot Rule

When creating a pull request that includes frontend changes (any modifications to files in `frontend/src/` that affect UI — components, pages, CSS, layout, styles), you **must** attempt to capture screenshots of the affected pages using the Chrome MCP tools before creating the PR. Include these screenshots in the PR description under a `## Screenshots` section.

**Process:**
1. Prefer the remote PR preview (`https://anthonyl.im/preview/pr/<n>/`). Wait with `bun scripts/wait-for-preview.ts --pr <n> --sha <head-sha>` (see [`docs/pr-previews.md`](docs/pr-previews.md)). No local Vite server required.
2. For Clerk-gated preview routes (`/trips`, `/trips/korea-2026`), run `bun scripts/clerk-agent-login.ts --pr <n> --path /trips/korea-2026` once. The helper applies a screenshot-user session in the agent Chrome (Korea + Trips share cookies). **Do not paste the ticket URL** — that is how sign-in walls happen. The helper re-execs from `origin/main` before sending secrets. Cursor cloud `gh` tokens have no push — `CLERK_SECRET_KEY` is enough (screenshot-user default). Dedicated screenshot identity, not a personal production login — do not sign in to production `/trips` or `/trips/korea-2026`. Public routes only need `?hidePreviewChrome=1`.
3. **Local fallback for Trips:** when preview/Chrome MCP is unavailable, run backend + `cd frontend && bun run dev` with matching `VITE_DEV_BEARER` / `IG_DEV_BEARER` (see `deploy/README.md`). Confirm bypass with `bun run e2e -- e2e/smoke.spec.ts -g "trips skips"`. Note local screenshots in the PR.
4. **Upload screenshots to GitHub** using `gh api` so they get permanent URLs visible in the PR. Local file paths and repo blob URLs do not render in PR descriptions. Use: `gh api --method POST repos/{owner}/{repo}/issues/{pr_number}/comments --field body="![screenshot](url)"` or upload via the GitHub upload endpoint.
5. Add the uploaded screenshot URLs to the PR description body

If the preview is not live yet (serving code not on production, droplet down) **or** Chrome MCP is unavailable, fall back to a local `cd frontend && bun run dev` with `VITE_DEV_BEARER` and note that in the PR. Do not block PR creation on screenshot availability.

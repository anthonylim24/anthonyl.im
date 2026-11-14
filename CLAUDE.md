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
│   │   │   ├── scene/           # Watercolour breath cat: catScene (WebGPU/TSL), BloomCanvas, BloomAnchor, breathDrive
│   │   │   ├── motion/ platform/ safety/ session/ recommend/
│   │   ├── pages/
│   │   │   ├── Landing/         # `/` lab landing: content, StyleX, WebGPU hero scene
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
│   │   ├── stores/              # Zustand: settingsStore, gamificationStore, historyStore
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
| AI generation/enhancement | `server/src/trips/ai.ts`, `prompts.ts`, `signals.ts`, `lodging.ts`, `jsonRepair.ts` | Drafts are built to finish: trips up to 4 days are one call; longer trips get a short outline (`OUTLINE_SYSTEM`) and are then drafted 3 days at a time in parallel, each chunk retried once, with repeat venues dropped across days and any day still thin reported as `incompleteDays` (never a failed request). Model output cut off mid-JSON is recovered by `repairTruncatedJson`. A redraft keeps what the traveller fixed (bookings, booked / completed stops, lodging; `isFixed`) and plans around it. `lodging.ts` works out the base for each day (`baseByDay`) and tells the planner and reviewer how far each day starts and ends from it; the review can also `move` a stop to another day or `swap_days`. Gemini 4 Hydrogen primary (`GEMINI_MODEL`; steps down to 3.8 Flash once if the key cannot use it), Groq as the backup on failure or when Gemini is missing; Maps grounding first, then Search (never both in one request); system prompts live in `prompts.ts`; `signals.ts` computes per-day facts (missing meals, gaps ≥ 2.5 h, hops ≥ 4 km, clock order) that the review and the concierge are given, offers a model-free shorter walking order, and inserts timed adds in clock order; AI places missing coords are geocoded with Google, or keyless Photon (`createPhotonGeocoder`) when there is no Google Maps key; Open-Meteo weather + travel-leg pre-pass; suggestions reviewable before apply (enhance auto-applies added places); single-day reviews keep suggestions that omit or invent a day id; the dropped-suggestion log line includes the zod field path |
| Concierge | `server/src/trips/chat.ts`, `conciergeTools.ts` | `POST /api/trips/:id/chat` SSE. A tool loop (up to 5 rounds) on Gemini 4 Hydrogen: Google Search grounding plus function calls `find_places` (Places API: hours for that weekday, rating, price, walk from the plan), `get_directions` (Routes API: transit lines and times) and `propose_changes` (add / set_time / move / remove / reorder as one validated batch). Nothing edits the trip server-side: the client applies a proposal on confirmation, with Undo. Events: text deltas, `{status}` (real tool activity), `{places}`, `{proposal}`, `{sources}`, `{followups}`, `{meta:{model}}`. Context carries the local clock and trip phase, item ids, computed legs and day facts, the live forecast, an opt-in one-message location, and earlier cards so "the second one" resolves. Korea seed can fall back to `/api/korea/chat` |
| Instagram import | `server/src/routes/instagramPlaces.ts`, `server/src/igPlaces/*`, `frontend/src/pages/Trips/instagram/*` | `/api/instagram/*` (same router as the legacy `/api/korea/places/from-instagram/*`): `POST /` queues posts (`skipVideo` = quick caption read), `GET /jobs?logs=0`, `POST /jobs/:id/retry|reextract`, `GET /extracted` (the user's saved places, searchable), `DELETE /extracted/:id`. Posts are fetched through Apify's Instagram scraper (`APIFY_TOKEN`; the free plan covers personal use, comments come with the post), then Bright Data if a key is set, then yt-dlp (works from a home IP, not from the droplet). Gemini with Maps grounding extracts the places; geocoding is worldwide (the Korea box and region bias apply only when the post points to Korea). Places belong to the user, not a trip; adding one copies it into the trip document with the post link in `links[]` |
| Place catalog | `server/src/trips/placeCatalog.ts` | `GET /api/trips/places-catalog` |
| Router | `server/src/routes/trips.ts` | `createTripsRouter(deps)` — Clerk required. CRUD, `/generate`, `/enhance`, `/enhancements/:runId/apply`, `/chat`, `/days/:dayId/places`, plus sharing (below). Summaries from `GET /api/trips` carry `center`, `points` (≤48 `[lng,lat]`) and `placeCount`; trips carry `center` |
| Sharing | `server/src/routes/trips.ts`, `components/ShareDialog.tsx`, `TripJoin.tsx` | Link-first. `POST /:id/invites` (owner; role viewer/editor), `POST /join/:token` (any signed-in user joins with that role), `DELETE /:id/invites/:token` (turn a link off), `POST /:id/leave` (collaborator). `invites` are stripped from trip payloads for non-owners. Collaborators carry an optional display `name` |
| Frontend geocoding | `frontend/src/pages/Trips/geocode.ts` | Keyless, via `fetchExternal` (Effect): Open-Meteo geocoding for cities (`searchCities`; supplies the IANA time zone for new trips) and Photon/OpenStreetMap for places (`searchPlaces`, biased to the day) |
| Frontend | `frontend/src/pages/Trips/` | `TripsLayout`, `TripsIndex`, `TripCreate`, **`TripWorkspace`** (`/:tripId` overview and `/:tripId/day/:dayId`; itinerary pane + sticky map), `TripJoin`, `TripChat` FAB, `workspace/*` (panels, item editor, AI sheets, details dialog + `resizeDays`), `components/*` (`kit`, `ShareDialog`, `CityField`, `DateRange`, `TripCover`), `map/*` (`AtlasMap`, lazy MapLibre `engine` incl. `renderStills` for card covers, `mapStyle`, `geo`), `useTripEditor.ts` (document state + debounced autosave + AI runs), `tripEdits.ts`, `meta.ts`, `geocode.ts` |

**Maps:** every Trips map is MapLibre GL JS v6 over OpenFreeMap vector tiles
(no API key; `map/mapStyle.ts`). The photoreal 3D view ("Fly the day",
`photoreal/`) is optional: a day's "…" menu shows "Fly the day in 3D" when
`photorealAvailable()` is true (a Google tiles / Places key plus WebGL2 in
production; always in a dev build, which falls back to a procedural ground).

**Photoreal 3D view:** `photoreal/PhotorealOverlay` (lazy, default export)
takes `trip`, `day`, `dayNumber`, `initialStopId?`, `onClose`, `onEditStop?`
and reads the day document directly — no fetch. `photoreal/scene.ts` is the
engine: created once per open, driven by methods (`select`, `fitAll`,
`setStops`, `setTheme`, `orientNorth`, `toggleTilt`, `setUser`, `dispose`),
renders on demand. `GET /api/trips/:id/days/:dayId/places` stays for
compatibility but the client no longer calls it. AI-added places must always
carry structured locations — never prose only.

**Permissions:** owner > editor/viewer collaborators > `sharedWithAllUsers`
(legacy Korea behavior: all signed-in users can view/edit). Only owners delete,
create or revoke invite links, and change collaborators; collaborators can leave. Legacy `/api/korea/*` routes still serve snapshot
data (backward compat). Frontend `/korea*` redirects to `/trips/korea-2026`.
The snapshot is data, and the trips system is the path for all new
destination work. Do not add new destination-specific routes or logic.

### Korea Pages (`frontend/src/pages/Korea/`)

Legacy Korea pages, places, and linkify implementation. Frontend `/korea*`
redirects to `/trips/korea-2026`; none of these pages is mounted by a route.
Trips imports only helpers from here (`ThemeToggle`, `koreaUtils`,
`koreaChatApi`, `ConciergeSources`, `ConciergeText*`, `types`). The old Map
Mode (overlay, scene, effects pipelines) is gone; its successor lives in
`pages/Trips/photoreal/`. Do not add `/japan`-style routes.

| File | Purpose |
|------|---------|
| `KoreaLayout.tsx` | Shell with auth gate, theme toggle, KST clock; mounts `KoreaChat` |
| `KoreaIndex.tsx` | Trip hero, day list |
| `KoreaDay.tsx` | Day detail — reservations, places, timeline |
| `KoreaChat.tsx` | Concierge SSE (`POST /api/korea/chat`) |
| `Places.tsx` | Full places list with skeleton loaders |
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

Recent recurrence: PR #396 added `busyness*` fields to `ExtractedPlace` but didn't update `Places.test.tsx`'s `makePlace()` fixture, which broke `tsc -b --noEmit` on main even though a vite-only path could look green.

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

Routes are lazy-loaded inside `Guarded` (`RouteErrorBoundary` + `Suspense`). All five apps share `index.html`; the server injects per-route OG tags / favicon / manifest. Link previews: `appPreviews` in `server/app.ts` (title, description, 1200×630 card `frontend/public/og-<app>.jpg`; bump `OG_VERSION` when a card changes). Keep `index.html`'s bootstrap scripts and `lib/routeMetadata.ts` in sync with it. `/` must stay routed to the SPA shell ahead of `serveStatic` (`server/src/previewMeta.test.ts`). Basename comes from `lib/routerBasename.ts` (PR preview support).

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

Active breath session is **not** Zustand — `frontend/src/breathflow/engine/useSessionEngine.ts` (React state).

Cloud sync (Supabase) is managed by `useCloudSync` + `CloudSync` — authenticated users sync settings and history. Keep those on Promise/Supabase, not Effect.

---

## Environment Variables

Always required at server boot (`config.ts` throws):
- `KLUSTER_API_KEY` + `KLUSTER_API_BASE_URL` — homepage chatbot LLM (Deepseek via Kluster)

Required for Clerk-gated **production** (`/trips`, `/trips/korea-2026`, IG ingest). Without it, JWT verification fails and `/api/trips` (and other gated routes) return 401:
- `CLERK_SECRET_KEY` — Clerk JWT verification (`server/src/middleware/clerkAuth.ts`)

Required when the IG worker is enabled (warns if missing):
- `APIFY_TOKEN` — Instagram post fetch (Apify's Instagram scraper; free plan is enough for personal use). `BRIGHT_DATA_API_KEY` is an optional paid fallback; yt-dlp is the last resort
- `GOOGLE_MAPS_API_KEY` — geocoding
- `GROQ_API_KEY` — backup models: `gpt-oss-120b` (extraction vote, trip AI, entity blurbs, chatbot) and Whisper
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`

Optional / feature-gated:
- `GEMINI_API_KEY` — the primary model everywhere (Gemini 4 Hydrogen): trip drafts and reviews, concierge, Instagram extraction and transcription, entity blurbs, chatbot. Without it the Groq backups run alone and the concierge is unavailable. The concierge's place search and directions use `GOOGLE_MAPS_API_KEY` (Places API (New) and Routes API)
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
- `VITE_GOOGLE_PLACES_API_KEY`, `VITE_GOOGLE_MAP_TILES_API_KEY` — the photoreal 3D view's tiles and place photos only. Trips maps (MapLibre + OpenFreeMap) and place/city search (Photon, Open-Meteo) need no key
- `VITE_ENABLE_SERVICE_WORKER` — preview builds disable registration
- `VITE_API_BASE` / `VITE_BASE` — preview builds only

See `frontend/.env.example` and `server/src/config.ts`.

---

## Deployment

**Trigger:** Push to `main` → GitHub Actions.

**Pipeline:**
1. Server tests run as gate (`bun test --parallel --bail server/src`) — all external calls are mocked — in parallel with step 2.
2. Frontend builds on CI (`bun run build` in `frontend/`) with secrets injected as `.env`.
3. Backend staged on Digital Ocean via SSH into `~/anthonyl.im.next` (shallow clone, `bun install --frozen-lockfile`), system tools checked (yt-dlp, ffmpeg, dev-browser).
4. Frontend `dist/` uploaded via SCP into the staged tree.
5. Atomic swap `next → live`, PM2 restart (`--max-memory-restart 700M`), wait for loopback `/health`; auto-rollback to `prev` if it does not come up.
6. Post-deploy smoke: `/health` JSON + SPA shells on `/`, `/chatbot`, `/breathwork`, `/trips`, `/trips/korea-2026`.

**Server:** Digital Ocean droplet (1 GB RAM). PM2 manages the Bun process. Frontend is static files served by Hono.

**Never build the frontend on the droplet** — 1 GB RAM is not enough for Vite + StyleX production builds. CI always builds and SCPs the dist.

Full CI/CD agent memory: [`docs/ci-cd.md`](docs/ci-cd.md).

---

## Bundle Splitting Strategy

`vite.config.ts` uses `codeSplitting` (Rolldown; formerly `advancedChunks`) to keep initial load fast:

| Chunk | Contents | Why |
|-------|----------|-----|
| `three-core` | `three.core.js` | Shared by the photoreal 3D view and every WebGPU scene |
| `three` | three.js WebGL build + loaders + OrbitControls | Only loaded by the photoreal 3D view |
| `three-webgpu` | `three/webgpu` + `three/tsl` + TSL addons + `three-blocks` | Lazy WebGPU scenes: landing hero, Lim, BreathFlow bloom |
| `tiles3d` | 3d-tiles-renderer | Only loaded by the photoreal 3D view |
| `maplibre` | maplibre-gl + `@maplibre/*` + `@mapbox/*` | Every Trips map. Lazy: loads with the first map (`map/engine.ts`), not with the route. ≈ 1.07 MB / 290 kB gzip |
| `react-vendor` | react + react-dom + scheduler | Stable cache |
| `motion` | motion/framer-motion | Shared; split so no route drags it in through a three.js chunk |
| `effect` | effect + `@effect/*` | Frontend I/O runtime |
| `supabase` | @supabase/* | Auth + sync |
| `router` | react-router | Routing |
| `radix` | @radix-ui/* | UI primitives |
| `state` | zustand | State |
| `icons` | lucide-react | Icons |
| `markdown` | react-markdown + remark | Chatbot + trip concierge |
| `photoreal` | `pages/Trips/photoreal/` except `available.ts` | Photoreal 3D view, opened from a Trips day menu. `tiles3d` loads behind it only when there is a tiles key |

Chunk size warning ceiling is 1100 kB (intentional — `maplibre` is the largest chunk at ≈ 1.07 MB; it and `three` are lazily loaded and cached by SW).

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
- **ARIA:** Live regions, proper roles, and explicit labels on every dynamic surface (breathing orb, 3D stop pins, status banners)
- **i18n:** No layouts that break on long Korean / hangul strings; copy uses `break-words` + `overflow-wrap:anywhere` defensively

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
- **Chunks:** the hero loads `three-core` + `three-webgpu` only; the photoreal 3D view loads `three-core` + `three`.

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
- **Anti-references:** no purple "AI" gradients, no glowing borders, no rainbow typing indicators. Do not reuse the landing's ultramarine, BreathFlow's watercolour or the Trips atlas.

### Per-route Tokens
- Theme classes: `chatbot-shadow` (day) / `chatbot-dark` (night), both defined in `frontend/src/chat/chat.css` (`--chat-*` vars), not `index.css`
- `html:has(.chatbot-*)` paints the canvas so iOS safe areas blend
- The 3D scene is lazy (`import('./scene/limScene')`); `LimArt` SVG is the first paint and the no-WebGPU/WebGL fallback
- Reduced motion freezes the jiggle and renders on demand; CSS beats are paused
- Chat history persists in `localStorage` under `lim-chat-v1`; night mode under `lim-chat-night`
- I/O stays `invokeDeepseek` (Effect SSE) in `lib/apiService.ts`; the optional `signal` param powers Stop (Esc)

---

## Design Context: `/breathwork/*` — BreathFlow ("Watercolor breath")

Code: `frontend/src/breathflow/`. Session state is `useSessionEngine` (React state, not Zustand). The centrepiece is a WebGPU soft-body watercolour **cat**: `scene/catScene.ts` (three/webgpu + TSL, lazy-imported by `scene/BloomCanvas.tsx` so three stays out of the initial chunk), positioned by `scene/BloomAnchor.tsx` (painted CSS fallback + brush progress stroke) and driven by `scene/breathDrive.ts` (`useBreathReader` interpolates the 1 Hz engine tick into a smooth amplitude). Built on the shared toolkit in `frontend/src/three/` (`createStage`, `Jelly`, `bindJellyPointer`). `syncJellyGeometry` computes normals + bounding sphere straight on the typed arrays (three's `computeVertexNormals` was half the frame), and `createStage` starts phones at DPR ≤ 1.5 and runs a frame-rate governor that steps the pixel ratio down 15% when the median frame falls behind the display's own rate (60, 120 Hz alike). Pigments live in `pigments.ts`; paper/wash/brush CSS + SVG filters in `styles/watercolor.css` + `components/WatercolorDefs.tsx`. Fonts: Fraunces display (`.bf-display`, SOFT/WONK axes) + Geist body.

### Users
Wellness enthusiasts and people seeking anxiety / stress relief. They open BreathFlow when they need to decompress, build a daily breathing habit, or access structured breathwork techniques backed by science. The context is often evening wind-down, pre-performance calm, or mid-day stress breaks — moments that demand a UI that feels immediately calming upon launch.

### Brand Personality
**Calm, Scientific, Hand-made.** A precision instrument painted by hand: evidence-based protocols, delivered as a living watercolour. Gamification (XP, levels, wax-seal badges) exists to sustain habit, not to entertain.

**Emotional goals:** Immediate calm (wet paint spreading slowly on paper) and quiet confidence (the bloom fills exactly as long as the breath).

### Aesthetic Direction
- **World:** a hand-painted watercolour on warm cotton cold-press paper (`#F7F1E6`); dark mode is deep ink-blue paper (`#15161C`). A fixed `.bf-paper` tooth overlay multiplies over everything.
- **Cat:** a pen-and-wash cat painted in the technique's pigments. Body and head are `Jelly` soft bodies (the head rides a neck point on the body); ears, paws and a swept-tube tail follow them via `attach`; the face (amber eyes with slit pupils, nose, ω mouth, whiskers, blush) is painted in rest space. It acts out the breath: inhale swells the chest, lifts the head, perks the ears and widens the eyes; a full hold puffs the cheeks and goes still apart from a shiver; the exhale is a "haa" sigh with soft eyes and dropped ears; an empty hold is a contented squint. Idle: blinks, ear twitches, tail swish. One shared light model drives every part: a warm key from the upper left (ragged shadow edge, core shadow, pooling at the turn), a Blinn glint that leaves the paper bare, warm floor bounce in the shadows, and a cool moonlight rim from behind. Day paints it as a Beer–Lambert glaze over the paper; night lays an opaque moonlit body colour over the ink-blue paper with moon-white glints and a dark ink hull (never bare paper, which is dark at night). **High tier** (WebGPU, unless the stage reports it struggling at the lowest pixel ratio; `?quality=base|high` forces a tier): GTAO contact occlusion pooled as pigment where parts meet, a soft bloom on moonlight at night, and pen hatching through the cat's shadow side. **Easter egg:** five taps within 2.5 s pop it (paint splash) into a glossy pink puffball homage (Kirby's face: tall navy eyes fading to blue under a big glint, rosy oval cheeks, a tiny mouth; squeezed "> <" eyes on the inhale and when held; painted over clean paper so the blooms don't show through) that puffs up hugely on the inhale with an open "O", floats with flapping arms on a full hold, and blows air clouds on the exhale; five more taps bring the cat back (the form survives Home → Session). The paper sheet keeps wet-in-wet blooms, a splatter ring that flies out on each inhale, and a shadow wash under the cat. Noise and splatter are baked once in `scene/paintTextures.ts`. Post: paper tooth, colour bleed, vignette, static Three.js Blocks `filmHD` grain (credited on Settings). The session count sits beside the phase word so it never covers the face.
- **Interaction:** poke (a giggle) + drag the cat on Home and session setup, by mouse or touch (a finger on the cat drags it; elsewhere the page scrolls). Grabbed, a body goes loose and stays upright, stretching toward the finger (the cat goes wide-eyed, the puffball squeals and flaps); let go, it boings home, wobbles and squashes on the paper. The contact shadow follows and fades as it lifts. During a session, a gentle poke only. Taps count toward the puffball easter egg everywhere. Space toggles pause/resume.
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
3. **The breath is sacred.** The cat's swell and expressions must track the engine phase exactly (`breathDrive.ts`); surrounding UI fades during session. Under `prefers-reduced-motion` the physics freezes (poses come straight from the rest shape) and the scene renders on demand per tick — pacing stays legible through the phase word, count, the cat's pose and face, and the brush stroke.
4. **Habit > novelty.** Gamification exists to drive return visits. Never let the motivational layer overpower the breathwork itself.
5. **WebGPU is progressive.** No GPU → the painted CSS bloom (`.bf-painted-bloom`) carries the same breath via `--bf-amp`. The scene must stay a lazy chunk.

---

## Design Context: `/trips/korea-2026` — Korea Trip Itinerary

The Korea trip is the seeded trip `korea-2026` (rose accent). It renders in the atlas workspace like any other trip; there is no separate rose / amber parchment dossier any more. Page design: the "Design Context: `/trips/*`" section below. Legacy `/korea*` frontend routes redirect here. `/api/korea/*` remains. Do not add new destination-specific routes.

What stays Korea-specific is data (snapshot seed, `/api/korea/chat` concierge fallback) and the Korea-scoped PWA.

### Users
Anthony (primary) and his partner, planning and executing a 12-day Seoul + Busan trip in late May / early June 2026. Phones for in-trip lookups, desktop for planning.

### Korea-specific Principles

1. **Smart links everywhere.** Flight numbers → carrier tracker, KTX → Korail timetable, addresses → Google Maps, phones → `tel:`, times → AM/PM tooltip. Free-form copy gets auto-linked by the `LinkifiedText` engine.
2. **PWA auto-update is mandatory.** Service worker + client must auto-swap to the latest version after each deploy. Bump `CACHE_VERSION` on every breaking SW change.

## Design Context: photoreal 3D view — "Fly the day"

Code: `frontend/src/pages/Trips/photoreal/`. Any trip day opens it from its "⋯" menu ("Fly the day in 3D"). The day's located stops stand on Google Photorealistic 3D Tiles; chrome is atlas paper plates (opaque `--trips-*` surfaces, no glass stacks).

- **Files:** `PhotorealOverlay.tsx` (chrome + state, `role="dialog"` with focus trap), `photoreal.stylex.ts`, `scene.ts` (engine), `tilesGround.ts` (Google tiles) / `devGround.ts` (DEV-only procedural model city, dynamic import), `camera.ts` + `sun.ts` + `stops.ts` (pure, tested), `terrainAnchor.ts`, `adaptiveQuality.ts`, `deviceTier.ts`, `youPin.ts`, `available.ts` (`photorealAvailable()`; the only file outside the `photoreal` chunk).
- **Stops:** the day map's `.atlas-pin` stop pins as DOM buttons (`.photoreal-pin*` in `index.css`), projected from terrain-snapped points, each with a 3D stem and ground ring. Crowded or occluded pins shrink to dots. Numbering comes from `dayStops` and matches `dayPins`.
- **Route:** one shallow 3D arc per leg in the trip accent on a paper casing; the selected stop's legs are emphasised.
- **Camera:** arrival fly-in once tiles exist (or after 2.5 s), fly-to on select (tilt 54°, 250–450 m), a slow idle orbit that any input stops, time-based tweens. Chrome insets shift the optical centre (`setInsets`). Reduced motion: jump cuts with a short canvas dip, no orbit, no tour.
- **Chrome:** desktop is a left panel (title, Play tour, stop list with legs; the selected stop unfolds into the card); phones get a title plate, a numbered rail and a swipeable bottom card. Top-right: compass, tilt, locate, fit all. Keys: ← / → step, Home / End, Space tour, F fit all, Esc close.
- **You:** no location prompt on open. Shown (brand-accent glass droplet) only when permission is already granted or the traveller taps locate, and only within 50 km of the stops.
- **Light:** sun from the trip's time zone, the day's date and the anchor latitude (the selected stop's time when it has one). Tiles stay unlit (pre-lit photogrammetry); the dark theme tints them to dusk. No bloom, god rays or clouds.
- **Rules:** renders on demand (no rAF at rest); disposes with `forceContextLoss()`; **must unmount** when closed (never React `Activity`); Google attribution stays visible; failure (no WebGL, tiles refused) shows a calm card with the stop list and Directions links.

---

## Design Context: `/trips/*` — Generic Trip Planner

Code: `frontend/src/pages/Trips/`. Full design notes: [`DESIGN.md`](DESIGN.md) / [`AGENTS.md`](AGENTS.md) / [`PRODUCT.md`](PRODUCT.md). Tokens: `.trips` block in `index.css` ("TRIPS — the atlas").

**"The atlas": a cartographer's desk.** Map-first planner. Cool chart-paper surfaces, hairline rules, soft layered shadows, serif names set like map labels, coordinates and data in mono, and one live 3D map per page. Two accents: a constant brand accent (signal orange, `--brand*`) for chrome, and the trip's own accent (`--ta*`) for trip identity; everything else is ink and paper.

- **Map:** MapLibre GL JS v6 + OpenFreeMap vector tiles (no key). Custom two-palette basemap in `map/mapStyle.ts`: globe projection with atmosphere at low zoom, extruded 3D buildings from zoom ~13.2.
- **Pins and route:** pins are DOM buttons styled by `.atlas-pin*` in `index.css`. Overview map: one numbered pin per day at that day's centroid (click opens the day) over small dots for every stop, no routes. Day map: numbered stop pins plus the route, one shallow arc per leg (deduplicated), a solid 3px trip-accent line on a paper casing with small direction chevrons. Index globe: trip chips, which flip side past the globe's midline. Arrival frames tilt (pitch 52) for city-scale spans. Hovering a list item lifts its pin; clicking a stop pin flies the camera to it and opens a place card ("Stop N of M", Directions, Edit stop, previous / next stepping that flies the camera).
- **Index:** hero + ambient globe (no basemap labels, CSS limb shade, faces the next trip at rest) with one chip per trip. With three or fewer trips the cards sit in one row with no headings; from four they are bucketed Happening now / Upcoming / Past. Search `/`, new trip `n`. Card covers are real map stills rendered by one off-screen MapLibre map (`renderStills` in `map/engine.ts`); the SVG chart of the trip's stops (`components/TripCover.tsx`) is the loading / no-WebGL fallback. No stock imagery. **Never "Inbox".**
- **Create:** destinations with city autocomplete, a custom date-range calendar (`components/DateRange.tsx`, also used in Trip details; no native date inputs), optional name, "Draft the itinerary with AI" switch with a pace / interest brief, sticky submit row, no step circles. The map flies to each destination; on phones it is a small non-interactive strip under the title.
- **Workspace:** `TripWorkspace` renders `/trips/:tripId` (overview) and `/trips/:tripId/day/:dayId` (that day): itinerary pane + sticky map. The full trip header shows on the overview only; day pages use a compact one-row header (trip name links to the overview, Share, ⋯ with "Improve whole trip with AI"). Left / right arrow keys change day. Phones get a docked bottom bar with an Itinerary | Map switch (`radiogroup`) and the concierge button inside it.
- **Editing:** inline trip / day titles. Stop cards have a time column on the left (above the title on phones); the drag grip (Motion `Reorder`) shows on hover / focus and is hidden on phones; Alt+↑ / ↓ reorders with a live announcement, and the item editor keeps Move up / Move down. The day menu offers "Sort stops by time" when times are out of order. Stop times use a typed `TimeField` (`parseClock` in `meta.ts`) with "Add end time". One "Add a place, note or booking…" composer per day with keyless place search (picking a result pins it on the map immediately); per-item editor (time, location search / pin, notes, status, booking type + confirmation, move to day, duplicate, delete with Undo toast); autosave with a Saved / Saving / Retry indicator; trip details dialog (name, destinations, dates, colour accent, description, status, time zone); duplicate trip, delete trip (owner), clear day.
- **Icons:** sparkle = AI generation, lightbulb = "Ideas for this day", chat glyph = concierge.
- **Instagram import:** "Places from Instagram" sheet. Paste a post or Reel link (pasting is the whole gesture; the day composer recognises links too). Posts are read quickly first (caption + comments) and re-read with the video on their own if that finds nothing; a hairline progress bar and plain step labels show the read. Each place found gets a row (name, address, the line from the post) and a pin on the sheet's own map; "+ Day N" adds it to the day in view or the nearest day, "Add all" adds a post's places at once, and places already on the trip show "On day N". Everything found is kept under Saved for every trip (search, remove). Never show pipeline logs or raw errors.
- **Sharing:** link-first. Owner picks "Can view" / "Can edit" and copies an invite link; anyone signed in who opens `/trips/join/:token` joins with that role. Owner changes roles, removes people, turns links off; collaborators can leave.
- **Concierge:** a chat that acts on the trip. Answers lead with the pick; a live status line shows real tool activity ("Checking Google Maps", "Searching the web"); place cards carry a photo, rating, hours for that day, the walk from the plan and "Add to Sat 14 Nov · 13:00"; changes arrive as one proposal card the traveller ticks, applies and can undo; 2 to 3 follow-up chips after each answer; the conversation is kept per trip (`trips-concierge-v1:<tripId>`) with New chat; location is shared for one message only, on request.
- **AI:** full-trip draft (`/generate`; from create, the empty overview, or "Start a fresh draft" with a replace confirmation), per-day "Ideas for this day" and whole-trip "Improve with AI" (`/enhance`; added places are auto-applied, flashed in the list and dropped onto the map; other suggestions are reviewed from a checklist, including moving a stop to another day and swapping two days), concierge chat FAB (`TripChat`, `chat.stylex.ts`). When a hotel is added or changed, the workspace offers "Staying at X. Rework the plan around it?" (never automatic); yes runs a whole-trip review briefed on the new base. A draft that could not fill every day says which days need another go.
- **Type:** Instrument Serif display (`--trips-display`, italic for the emphasised word), Inter body, Fragment Mono eyebrows / data (`--trips-mono`).
- **Accent (two, never mixed):** the **brand** accent is constant signal orange (`--brand` text, `--brand-fill`, `--brand-soft`, `--brand-ring`) and paints chrome: focus rings, AI actions, switches, links, the compass mark. The **trip** accent (`--ta`, `--ta-fill`, `--ta-on`, `--ta-soft`, `--ta-ring`; set by `data-trip-accent`, defaults to the brand) is reserved for trip identity: pins, route, date tiles, the status eyebrow, the pinned-location row, covers. Trip accents: rose "Poppy" `#e5484d`, amber "Saffron" `#f2a71b` (dark ink on fill), emerald "Jade" `#0f9b76`, sky "Cobalt" `#2f7bf0`, violet "Iris" `#7c5cff`. Primary buttons are ink.
- **Code:** `atlas.stylex.ts` (primitives `a`), `index.stylex.ts` (`shell`, `idx`, `cover`, `create`), `workspace.stylex.ts` (`share`, `ws`), `map/map.stylex.ts`, `chat.stylex.ts`, `components/kit.tsx` (`Menu`, `Modal`), `meta.ts`, `useTripEditor.ts`.
- **Motion:** spring on pins / buttons, fly-to camera, drop-in for new pins, staggered card rise. Reduced motion: map uses `jumpTo`, globe does not spin.
- **Anti-references:** the previous toy / sticker look, glassmorphism stacks, gradient text, stock travel photography, generic SaaS dashboards. Do not restyle Trips into the Korea dossier.

### Per-route Tokens

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| Canvas | `#f1f0eb` | `#0b0d10` | Page |
| Surface | `#faf9f6` | `#13161a` | Panes, cards |
| Raised | `#ffffff` | `#1a1e23` | Menus, dialogs, fields |
| Sunken | `#e8e7e1` | `#07090b` | Wells, rails |
| Ink | `#14171a` | `#eceae4` | Text, primary buttons |
| Ink secondary / tertiary | `#4d5259` / `#696e75` | `#b0b4ba` / `#8b9097` | Body / hints |
| Line | `rgb(20 23 26 / .1)` | `rgb(255 255 255 / .1)` | Hairline rules |
| Brand accent | `#f0582b` fill, `#b8400f` text | `#f0582b` fill, `#ff9166` text | `--brand-fill` / `--brand`: chrome. `--ta*` defaults to it |

Radius `0.875rem` (`-sm` `0.625rem`, `-lg` `1.375rem`); shadows `--trips-shadow-1/2/3`; spring `cubic-bezier(0.34, 1.4, 0.64, 1)`; ease-out `cubic-bezier(0.16, 1, 0.3, 1)`.

### Trips-specific Principles

1. **One map per viewport.** Keep the engine a lazy chunk (`maplibre`).
2. **AI-added places must carry structured locations**, never prose only.
3. **Never add destination-specific routes.**
4. **44px targets; draw your own focus ring.** Trips sets `.trips :focus-visible { outline: none }`, so every new control needs a `--brand-ring` ring (`a.focusable`).
5. **Editable titles** use the `trips-title-input` / `trips-day-title-input` classes to opt out of the 16px phone input pin.
6. **Portals** go through `kit.tsx` `Modal`, which re-declares the token scope (`.trips.trips-portal`).
7. **The photoreal 3D view must unmount** when closed (never React `Activity`).
8. **Brand for chrome, trip accent for identity.** Never tint focus rings, AI actions, switches or links with `--ta*`.

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
- ✅ Cat reduced-motion — `scene/catScene.ts` freezes the physics and renders on demand

### Still worth watching

- Leftover inline hex on some settings / badge surfaces
- 44 px touch targets on compact toggles — verify after nav changes

### Preserve

- Zustand persisted stores + `lazy()` route splits + Effect I/O
- Token system + safe-area handling + GPU-friendly motion
- Photoreal 3D view unmount (never React `Activity`)

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

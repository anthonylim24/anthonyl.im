# anthonyl.im

This repo hosts three distinct experiences under one shell: a personal AI chatbot, the **BreathFlow** wellness app, and the **Korea Trip** itinerary app. Each has its own visual identity; all share the underlying craft principles below.

---

## Codebase Structure

```
anthonyl.im/
├── frontend/          # React 19 + TypeScript SPA (Vite 8)
│   ├── src/
│   │   ├── App.tsx              # AI chatbot interface (SSE streaming)
│   │   ├── AppRoutes.tsx        # React Router v7 route tree
│   │   ├── main.tsx             # Entry point — Clerk provider + SW registration
│   │   ├── components/
│   │   │   ├── breathing/       # Session visualizations (orb, timer, phases)
│   │   │   ├── gamification/    # XP / badges / streaks UI
│   │   │   ├── layout/          # BreathworkLayout, Header, Navigation, CloudSync
│   │   │   ├── tracking/        # SessionHistory, ProgressChart, PersonalBests
│   │   │   └── ui/              # Radix primitives + custom shadcn/ui
│   │   ├── hooks/               # useBreathingCycle, useWebGLOrb, useReducedMotion, …
│   │   ├── lib/                 # breathingProtocols, gamification, apiService, …
│   │   ├── pages/
│   │   │   ├── Home.tsx         # BreathFlow home + protocol picker
│   │   │   ├── Session.tsx      # Active session controller
│   │   │   ├── Progress.tsx     # Charts + session history
│   │   │   ├── Settings.tsx     # Theme, sound, haptics, data export
│   │   │   └── Korea/           # Korea itinerary system (see below)
│   │   ├── stores/              # Zustand: sessionStore, settingsStore, gamificationStore, historyStore
│   │   └── index.css            # Global styles + design tokens (Tailwind v4)
│   ├── public/
│   │   ├── sw.js                # Service worker (cache-first + stale-while-revalidate)
│   │   ├── site.webmanifest     # Default PWA manifest
│   │   └── korea.webmanifest    # Korea PWA manifest
│   ├── index.html               # SPA shell — dynamic OG tags / favicon / manifest swap per route
│   ├── vite.config.ts           # Chunk splitting: three, tiles3d, react-vendor, motion, supabase, …
│   └── tailwind.config.js       # Custom bw-* tokens + shadcn/ui HSL variables
├── server/
│   ├── app.ts                   # Hono server: static serving, SPA fallback, OG-tag injection
│   └── src/
│       ├── config.ts            # Env-var schema (throws on missing required keys)
│       ├── routes/
│       │   ├── invoke.ts        # POST /api/invoke — LLM SSE streaming (Deepseek via Kluster)
│       │   ├── korea.ts         # GET /api/korea/* — itinerary endpoints
│       │   ├── koreaPlaces.ts   # GET /api/korea/places/*
│       │   ├── entity.ts        # GET /api/entity/:id
│       │   └── instagramPlaces.ts  # Instagram extraction worker queue API
│       ├── igPlaces/            # Instagram → place extraction pipeline
│       │   ├── worker.ts        # Job orchestration
│       │   ├── fetchPost.ts     # Bright Data API
│       │   ├── extractFrames.ts # ffmpeg frame extraction
│       │   ├── transcribe.ts    # Groq Whisper (Gemini fallback)
│       │   ├── extractPlaces.ts # Gemini Vision place detection
│       │   ├── geocode.ts       # Google Maps geocoding
│       │   └── savePlaces.ts    # Supabase write
│       ├── data/
│       │   ├── koreaPlaces.ts   # Hard-coded itinerary place data
│       │   └── koreaSnapshot.ts # Static data snapshot
│       └── middleware/
│           ├── clerkAuth.ts     # Clerk JWT verification
│           └── error.ts         # Error handler
├── supabase/
│   └── schema.sql               # Database schema
├── .github/workflows/deploy.yml # CI/CD pipeline (test → build → SSH deploy)
├── index.ts                     # Root Bun entry point (wraps server/app.ts)
└── package.json                 # Root workspace (Hono, Clerk, Groq, OpenAI, Zod)
```

### Korea Pages (`frontend/src/pages/Korea/`)

| File | Purpose |
|------|---------|
| `KoreaLayout.tsx` | Shell with auth gate, theme toggle, KST clock |
| `KoreaIndex.tsx` | Trip hero, day list, Map Mode entry |
| `KoreaDay.tsx` | Day detail — reservations, places, timeline |
| `MapModeScene.tsx` | Three.js 3D orbital scene |
| `MapModeOverlay.tsx` | Overlay UI: YOU pin, filter bar, compass |
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

## Pre-merge Verification (every change touching shared types)

**Never merge without running the local equivalent of the cloud verify gate first.** A PR that merges red main means every other contributor's next build starts broken.

The canonical gate — same as `.codex/check.sh` / `.claude/cloud/verify.sh` — is:

```bash
# 1. Server tests (mocked, no env needed beyond stubs)
KLUSTER_API_KEY=ci-stub KLUSTER_API_BASE_URL=https://example.invalid IG_WORKER_ENABLED=false \
  bun test --bail server/src

# 2. Frontend typecheck (catches type-level regressions that vite build alone misses)
cd frontend && bun run typecheck
```

If you touched anything in `frontend/`, also run:

```bash
cd frontend && bun run build && bun run test:run
```

### Type-fixture invariant

When you add a field to a TypeScript type that is used as `T | null` (not `T | null | undefined`), **every test fixture must declare the field explicitly** — `undefined` is not assignable to `T | null`. Search for fixtures with: `grep -rn "Partial<TypeName>\|: TypeName" frontend/src/**/__tests__/`.

Recent recurrence: PR #396 added `busyness*` fields to `ExtractedPlace` but didn't update `Places.test.tsx`'s `makePlace()` fixture, which broke `tsc -b --noEmit` on main even though `vite build` (which uses esbuild and skips strict checks) succeeded locally.

### Stale-test landmines

The frontend unit suite (`bun run test:run`) is intentionally NOT in the deploy gate — historically it has carried pre-existing failures from architecture rewrites (e.g., the BreathFlow-→-Korea PWA migration in PR #319). If you see failing tests in `src/lib/__tests__/metadataAssets.test.ts` or `serviceWorker.test.ts` that reference `/site.webmanifest` or `breathflow-offline-v*`, those are stale relics — update them to match the current Korea PWA, don't roll back behavior to match them.

### Playwright vs. vitest separation

`frontend/e2e/` is owned by Playwright. `frontend/vitest.config.ts` excludes `e2e/**` so vitest doesn't try to import `@playwright/test` and fail. **Do not remove that exclude** — leaving it in keeps `bun run test:run` green even on a fresh checkout without Playwright installed.

### Cloud-sandbox failure modes (Codex / Claude Code)

Two regressions surfaced in May 2026 that the verify gate now catches:

1. **TS resolution drift.** A cloud agent ran `bun run build` in `frontend/` before `frontend/node_modules` was installed; `tsc -b` resolved to root's TypeScript 5.x and rejected `ignoreDeprecations: "6.0"` plus missed `vite` / `@vitejs/plugin-react`. `.codex/check.sh` now runs a `verify_frontend_typescript` pre-flight that fails fast with an actionable message before `bun run typecheck`. Always run `bash .codex/setup.sh` (or `.claude/cloud/setup.sh`) before any build — it installs in **both** root AND `frontend/`.
2. **Missing-export PM2 crash.** A merged PR imported `GEMINI_BASE` from a module that didn't export it. Every server test mocked the IG dependency chain so the broken import was never evaluated. `server/src/appLoad.test.ts` is a module-load smoke test that imports `server/app.ts` and forces Bun to evaluate the full route/worker graph — the gate runs it via `bun test --bail server/src`. Do not delete it.

---

## Routing

Routes are lazy-loaded. All three apps share the same SPA entry point (`index.html`), with the server injecting per-route OG tags / favicon / manifest at request time.

| Path | App | Auth |
|------|-----|------|
| `/` | AI Chatbot | Public |
| `/chatbot` | AI Chatbot | Public |
| `/breathwork` | BreathFlow home | Public |
| `/breathwork/session` | BreathFlow session | Public |
| `/breathwork/progress` | BreathFlow progress | Public |
| `/breathwork/settings` | BreathFlow settings | Public |
| `/korea` | Korea index | Clerk-gated |
| `/korea/day/:slug` | Day detail | Clerk-gated |
| `/korea/places` | Places list | Clerk-gated |
| `/korea/ingest` | IG ingestion | Clerk-gated |

---

## State Management

All stores use **Zustand v5**. Persisted stores write to `localStorage` under the keys in `frontend/src/lib/constants.ts`:

| Store | Key | Contents |
|-------|-----|----------|
| `settingsStore` | `breathwork-settings` | theme, sound, haptics |
| `gamificationStore` | `breathwork-gamification` | XP, badges, streaks |
| `historyStore` | `breathwork-session-history` | session log |
| `sessionStore` | — (ephemeral) | active breath phase/round |

Cloud sync (Supabase) is managed by `useCloudSync` + `CloudSync` component — authenticated users sync settings and history.

---

## Environment Variables

Backend requires (server throws on startup if missing):
- `KLUSTER_API_KEY` + `KLUSTER_API_BASE_URL` — LLM provider (Deepseek)
- `CLERK_SECRET_KEY` — Clerk JWT verification
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — database
- `GOOGLE_MAPS_API_KEY` — geocoding
- `BRIGHT_DATA_*` — Instagram post fetching
- `GROQ_API_KEY` — Whisper transcription
- `GEMINI_API_KEY` — Vision extraction

Frontend (set in `frontend/.env` from CI secret `FRONTEND_ENV`):
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
- `VITE_POSTHOG_KEY`

See `frontend/.env.example` and `server/src/config.ts` for the full list.

---

## Deployment

**Trigger:** Push to `main` → GitHub Actions.

**Pipeline:**
1. Server tests run as gate (`bun test --bail server/src`) — all external calls are mocked.
2. Frontend builds on CI (`bun run build` in `frontend/`) with secrets injected as `.env`.
3. Backend deployed to Digital Ocean via SSH: repo re-cloned, `bun install`, system tools checked (yt-dlp, ffmpeg, dev-browser).
4. Frontend `dist/` uploaded via SCP.
5. PM2 restarted (`pm2 start bun --name anthonyl.im -- run index.ts`).

**Server:** Digital Ocean droplet (1 GB RAM). PM2 manages the Bun process. Frontend is static files served by Hono.

**Never build the frontend on the droplet** — 1 GB RAM is not enough for Vite + Tailwind. CI always builds and SCPs the dist.

---

## Bundle Splitting Strategy

`vite.config.ts` uses `advancedChunks` (Rolldown) to keep initial load fast:

| Chunk | Contents | Why |
|-------|----------|-----|
| `three` | three.js + loaders + OrbitControls | ~600 KB; only loaded in Map Mode |
| `tiles3d` | 3d-tiles-renderer | Only loaded in Detailed-3D debug mode |
| `react-vendor` | react + react-dom + scheduler | Stable cache |
| `motion` | motion/framer-motion | Used by both Places and MapMode — split prevents Places from pulling in three.js |
| `supabase` | @supabase/* | Auth + sync |
| `router` | react-router | Routing |
| `radix` | @radix-ui/* | UI primitives |
| `state` | zustand | State |
| `icons` | lucide-react | Icons |
| `korea-map` | Korea MapMode source | 3D scene code |

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

- React 19 + TypeScript 6 + Vite 8
- Tailwind CSS 4.2 + shadcn/ui (Radix primitives)
- Zustand v5 (state), Motion v12 (animation), Lucide v1 (icons)
- Bun + Hono (server), Clerk (auth), Supabase (sync), PostHog (analytics)
- Three.js (Korea Map Mode only)

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
| Body font | Inter | | All UI text |
| Display font | Cormorant Garamond | | Headings, brand moments |
| Border radius | `0.5rem` (default) / `1rem`+ in Korea orb cards | | Standard rounding |
| Spring easing | `cubic-bezier(0.16, 1, 0.3, 1)` | | Motion default |
| Decel easing | `cubic-bezier(0.33, 0, 0, 1)` | | Smooth stops |

Each app's *accent* color is its own (see per-app sections below).

---

## Design Context: `/` and `/chatbot` — Personal AI Chatbot

### Users
Visitors who land on `anthonyl.im` directly. Recruiters, prospective collaborators, friends, curious engineers. They're trying to get a feel for who Anthony is — fast. They scan, they pivot, they leave if it doesn't earn attention.

### Brand Personality
**Quiet, Confident, Crafted.** A staff-engineer's personal site — minimal but not lazy, technical but not cold. The interface should feel like meeting someone who answers questions thoughtfully rather than performing for an audience.

**Emotional goal:** A reassuring "this person ships" feeling. The chatbot is the demo.

### Aesthetic Direction
- **Theme:** Light-first warm parchment with a subtle grain overlay (SVG fractal noise). Dark mode inverts to the same `#171613` canvas.
- **Surface:** Two-tone — a warm canvas with a single column for chat content. No nested cards.
- **Accent:** Warm amber `#B8860B`, only on send action + suggested-question pills.
- **Anti-references:** No purple "AI" gradients. No glowing borders. No "AI typing" indicator with rainbow lights. Stay quiet.

### Per-route Tokens
- Theme class switch: `chatbot-shadow` (light) / `chatbot-dark`
- Grain texture is a *design feature* — keep it
- 100dvh container so iOS safe areas blend with `html { background: #F5F2ED }`

---

## Design Context: `/breathwork/*` — BreathFlow

### Users
Wellness enthusiasts and people seeking anxiety / stress relief. They open BreathFlow when they need to decompress, build a daily breathing habit, or access structured breathwork techniques backed by science. The context is often evening wind-down, pre-performance calm, or mid-day stress breaks — moments that demand a UI that feels immediately calming upon launch.

### Brand Personality
**Calm, Scientific, Premium.** Like a high-end wellness lab — trustworthy, refined, evidence-based. The interface should feel like a precision instrument for the body, not a toy. Gamification (XP, levels, achievements) exists to sustain habit, not to entertain — it's motivation architecture, not playfulness.

**Emotional goals:** Immediate calm (like stepping into a quiet room — tension drops instantly) and quiet confidence (like a deep breath before a big moment — grounded and capable).

### Aesthetic Direction
- **Visual tone:** Warm parchment + ink. Light-first warm beige canvas (`#F5F2ED`), ink typography (`#1C1917`), amber accent (`#B8860B`).
- **References:** Calm / Headspace's wellness credibility combined with Arc / Linear's craft. More technical than mainstream wellness, warmer than dev tools.
- **Anti-references:** No SaaS purple, no cartoon-illustrated wellness, no cluttered dashboards.

### Per-route Tokens

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| Accent | `#B8860B` | `#C9A227` | Primary interactive |
| Success | `#6B8F71` | `#8DAF92` | Personal bests |

#### Technique Colors (muted, calming)

| Technique | Primary | Secondary |
|-----------|---------|-----------|
| Box Breathing | `#8B7355` | `#A89278` |
| CO2 Tolerance | `#6B8F71` | `#8DAF92` |
| Power Breathing | `#A0654E` | `#BF826B` |
| Cyclic Sighing | `#7B8794` | `#99A5B2` |

### BreathFlow-specific Principles

1. **Serenity first.** Every design decision should reduce visual noise. White space is a feature.
2. **Scientific credibility.** Typography, data visualization, and content should convey authority — the app teaches real breathwork protocols.
3. **The orb is sacred.** The breathing orb is the product. Animation of the orb must be flawless and physics-accurate; surrounding UI fades out during session.
4. **Habit > novelty.** Gamification exists to drive return visits. Never let the motivational layer overpower the breathwork itself.

---

## Design Context: `/korea/*` — Korea Trip Itinerary

### Users
Anthony (primary) and his partner, while planning + executing a 12-day Seoul + Busan trip in late May / early June 2026. Used on phones for in-trip lookups (reservations, nearby places, directions) and on desktop for planning. Authenticated behind Clerk so it's a private dossier.

### Brand Personality
**Cinematic, Personal, Refined.** A private travel concierge dossier — every reservation accounted for, every neighborhood researched, every recommendation reasoned. Map Mode is the centerpiece moment: a 3D orbital view where YOU sit at the center of the trip universe.

**Emotional goals:** Anticipation (the trip is coming, every piece feels considered) and confidence (no detail slips through). Should feel like a hand-bound itinerary booklet animated into the future.

### Aesthetic Direction
- **Visual tone:** Warm parchment base inherited from the shared palette, with a **rose / amber gradient bloom** as the signature. Korea's red-and-gold heritage referenced without literal kitsch — no taegukgi flag chrome, but the spirit of it.
- **Hero gradient:** soft rose top-left → amber bottom-right radial blobs (animated, slow drift). Dark mode swaps to a purple / indigo / mauve nightscape so in-trip evening lookups feel travel-time-of-day appropriate.
- **Glass orbs (Map Mode):** `MeshPhysicalMaterial` with `transmission: 0.7`, frosted `roughness`, `clearcoat`, subtle `iridescence`. Inner billboard plane carries the place's Wikipedia photo so it appears refracted through the glass. Fresnel rim shell adds an additive edge glow.
- **YOU pin:** CSS-anchored to viewport center, independent of camera projection. The camera orbits *around* YOU.
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
| Glass orb base | per-place category color | same | `MeshPhysicalMaterial` color tint |

### Korea-specific Principles

1. **YOU is the geometric + visual center.** The Map Mode camera orbits the user — never drifts. The CSS-anchored YOU label is non-negotiable; perspective rotates *around* it.
2. **Refraction over flat fill.** Where reasonable, prefer materials that refract (glass orbs, frosted overlays) over solid shapes. The trip should feel three-dimensional, not pasted on.
3. **Distance is information, not chrome.** Every place card / orb label surfaces distance + walking ETA prominently as a colored pill — it's the most-used piece of data, not a footnote.
4. **Smart links everywhere.** Flight numbers → carrier tracker, KTX → Korail timetable, addresses → Google Maps, phones → `tel:`, times → AM/PM tooltip. Free-form copy gets auto-linked by the `LinkifiedText` engine.
5. **PWA auto-update is mandatory.** Service worker + client must auto-swap to the latest version after each deploy — users should never see stale Map Mode. Bump `CACHE_VERSION` on every breaking SW change.

### Map Mode-specific Conventions

- Camera target = world origin
- Default pitch ≈ 0.78 rad (top-down isometric)
- All bubbles on the same `y = 1.6` plane (depth comes from camera angle, not staggered elevations — the user wants YOU as the unambiguous center)
- No auto-rotate — scene stays still until dragged
- Camera radius adapts per viewport (62 → 30 from 320 px → 1440 px)
- Reset-view crosshair button restores yaw / pitch / radius
- WebGL fallback: styled list view with the same filter chip bar + photo thumbnails

---

## Service Worker / Caching Contract

The app is a PWA. Every deploy must keep these invariants:

- **`/sw.js`** served with `Cache-Control: no-cache, no-store, must-revalidate` + `Service-Worker-Allowed: /`
- **SPA HTML** served with `no-cache, no-store, must-revalidate`
- **`/assets/*`** content-hashed bundles served with `public, max-age=31536000, immutable`
- **`CACHE_VERSION`** in `sw.js` MUST be bumped on every SW-behavior change
- The client (`serviceWorker.ts`) posts `SKIP_WAITING` and reloads on `controllerchange` — gives users seamless updates without a manual hard refresh

---

## Design Audit Status (Originally March 2025)

### Resolved

- ✅ `user-scalable=no` removed — viewport meta now uses `width=device-width, initial-scale=1.0, viewport-fit=cover`
- ✅ Light theme built — `color-scheme: light dark` in `index.css`; both light and dark token sets exist
- ✅ `prefers-reduced-motion` hook added (`useReducedMotion.ts`); CSS media queries present in `index.css`
- ✅ ARIA partially added to `BreathingSession.tsx` (`role="region"`, keyboard focus management)

### Still Open

- ❌ `robots.txt` missing — `public/robots.txt` does not exist; requests fall through to SPA
- ❌ `ShaderOrb.tsx` / `LiquidGlassOrb.tsx` do not consume `useReducedMotion` — large continuous WebGL animation still runs for vestibular-sensitive users
- ❌ Some inline hex colors remain in `Settings.tsx`, `BadgeGrid.tsx` — not fully tokenized
- ❌ Touch targets on nav icons may still be below 44 px — verify after any nav changes

### Positive Findings (Preserve These)

- **Solid engineering:** Zustand stores, well-structured hooks, proper code-splitting with `lazy()`, clean TypeScript
- **Token system infrastructure exists:** shadcn/ui HSL CSS variables + Tailwind custom tokens
- **Safe area handling is thorough:** `env(safe-area-inset-*)`, visual viewport API for keyboard avoidance
- **Performance-conscious:** `content-visibility: auto` on session items, GPU-accelerated transforms, RAF-based pointer tracking
- **Good animation foundation:** Custom easing curves, spring physics, staggered reveals — technically solid

---

## PR Workflow

### Frontend Screenshot Rule

When creating a pull request that includes frontend changes (any modifications to files in `frontend/src/` that affect UI — components, pages, CSS, layout, styles), you **must** attempt to capture screenshots of the affected pages using the Chrome MCP tools before creating the PR. Include these screenshots in the PR description under a `## Screenshots` section.

**Process:**
1. Start the dev server (`bun run dev` in `frontend/`)
2. Use Chrome MCP to navigate to affected pages and capture screenshots
3. **Upload screenshots to GitHub** using `gh api` so they get permanent URLs visible in the PR. Local file paths and repo blob URLs do not render in PR descriptions. Use: `gh api --method POST repos/{owner}/{repo}/issues/{pr_number}/comments --field body="![screenshot](url)"` or upload via the GitHub upload endpoint.
4. Add the uploaded screenshot URLs to the PR description body

If the Chrome MCP is unavailable or the dev server cannot start (e.g., Node.js version incompatibility), note this in the PR description and skip screenshots. Do not block PR creation on screenshot availability.

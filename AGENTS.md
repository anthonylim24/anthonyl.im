# anthonyl.im

This repo hosts four experiences under one Vite SPA: a personal AI chatbot, **BreathFlow**, the **Korea** itinerary, and a generic **trip planner**. Each has its own visual identity; all share the craft principles below.

**Where to read what**

| Need | File |
|------|------|
| Engineering, routes, env, CI, tree | [`CLAUDE.md`](CLAUDE.md) |
| Design context for Impeccable / UI work | [`PRODUCT.md`](PRODUCT.md) |
| Skill catalog (what to use, what to ignore) | [`.agents/skills/README.md`](.agents/skills/README.md) |
| CI/CD | [`docs/ci-cd.md`](docs/ci-cd.md) |
| PR previews + Clerk screenshot login | [`docs/pr-previews.md`](docs/pr-previews.md) |

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

- React 19 + Vite 8 + React Router v7 (`react-router-dom`, Vite SPA — not the React Router SSR framework)
- TypeScript: frontend lint `~6.0`, frontend/root **build** `~7.0` via the `typescript7` alias
- Tailwind CSS 4.3 + shadcn/ui (Radix primitives)
- Zustand v5 (BreathFlow persisted stores), Motion 13, Lucide icons
- Effect v3 for frontend I/O — see [Frontend Effect-TS](#frontend-effect-ts)
- Bun + Hono (server), Clerk (`@clerk/clerk-react` ^5, Core 2), Supabase, PostHog
- Three.js for Map Mode (Korea **and** Trips via shared `MapModeOverlay`)

## Frontend Effect-TS

Write new frontend network I/O in Effect. Full methodology: [`.agents/skills/effect-ts/SKILL.md`](.agents/skills/effect-ts/SKILL.md) (symlinked at `.claude/skills/effect-ts/SKILL.md`). Stable **Effect v3** only — not v4 beta.

| Piece | Location |
|-------|----------|
| Tagged errors (`errorMessage`) | `frontend/src/effect/errors.ts` |
| HTTP (`fetchApi`, `fetchExternal`, `requestJson`, `readAuthToken`, `bearerHeaders`, `sleep`) | `frontend/src/effect/http.ts` |
| SSE | `frontend/src/effect/sse.ts` |
| `runPromise` unwrap | `frontend/src/effect/runtime.ts` |
| Chat error remap | `frontend/src/effect/chatErrors.ts` |
| Stable token reader | `frontend/src/hooks/useLatestCallback.ts` |

**Do:** `Effect.fn` + `runPromise` from `frontend/src/effect/runtime.ts`; same-origin `/api/*` via `fetchApi` / `requestJson`; third-party URLs via `fetchExternal`; `Schema.TaggedError` + `readErrorMessage` modes; `useLatestCallback(getToken)` (never pass `useEffectEvent` as an argument); `useTransition` + latest-request-wins on overlapping refreshes; `Effect.fail` instead of `throw` around `yield*`.

**Do not:** replace `apiFetch` with `@effect/platform` FetchHttpClient; `Schema.decode` `Trip` / `ExtractedPlace` documents; add `Effect.Service` / AppLayer / effect-atom without real injectable deps; hide Map Mode WebGL with React `Activity`; migrate BreathFlow Zustand or `useCloudSync` onto Effect.

Per-route clients: `frontend/src/pages/Trips/tripsApi.ts`, `tripChatApi.ts`, `frontend/src/pages/Korea/*Api.ts`, `frontend/src/lib/apiService.ts` (homepage chatbot).

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
| Display font | Cormorant Garamond (BreathFlow: Fragment Mono) | | Shared-site display; BreathFlow uses Fragment Mono |
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

Code lives in `frontend/src/breathflow/` (pages, engine, protocols, gamify, motion, platform). Session state is `useSessionEngine` — not a Zustand `sessionStore`. Implementation fonts: Geist + Fragment Mono (shared-site Inter + Cormorant do not apply here).

### Users
Wellness enthusiasts and people seeking anxiety / stress relief. They open BreathFlow when they need to decompress, build a daily breathing habit, or access structured breathwork techniques backed by science. The context is often evening wind-down, pre-performance calm, or mid-day stress breaks — moments that demand a UI that feels immediately calming upon launch.

### Brand Personality
**Calm, Scientific, Premium.** Like a high-end wellness lab — trustworthy, refined, evidence-based. The interface should feel like a precision instrument for the body, not a toy. Gamification (XP, levels, achievements) exists to sustain habit, not to entertain — it's motivation architecture, not playfulness.

**Emotional goals:** Immediate calm (like stepping into a quiet room — tension drops instantly) and quiet confidence (like a deep breath before a big moment — grounded and capable).

### Aesthetic Direction
- **Visual tone:** Warm parchment + ink. Light-first warm beige canvas (`#F5F2ED`), ink typography (`#1C1917`), amber accent (`#B8860B`).
- **References:** Calm / Headspace's wellness credibility combined with Arc / Linear's craft. More technical than mainstream wellness, warmer than dev tools.
- **Anti-references:** No SaaS purple, no cartoon-illustrated wellness, no cluttered dashboards. **No glassmorphism on BreathFlow chrome** (the session orb is a glass/WebGL visualization; surrounding UI stays ink-on-parchment).

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
3. **The orb is sacred.** The breathing orb (`OrbVisualization` / `useGlassOrb`) is the product. Animation must be flawless and physics-accurate; surrounding UI fades out during session. Honor `prefers-reduced-motion`.
4. **Habit > novelty.** Gamification exists to drive return visits. Never let the motivational layer overpower the breathwork itself.

---

## Design Context: `/korea/*` — Korea Trip Itinerary

Legacy Clerk-gated dossier for the May/June 2026 Seoul + Busan trip. Snapshot data also seeds trip `korea-2026` in the generic trips system. **Do not add new destination-specific routes** — new destinations go through `/trips`.

### Users
Anthony (primary) and his partner, while planning + executing a 12-day Seoul + Busan trip. Used on phones for in-trip lookups and on desktop for planning.

### Brand Personality
**Cinematic, Personal, Refined.** A private travel concierge dossier. Map Mode is the centerpiece: Google Photorealistic 3D Tiles of the city, with a glassy YOU pin on the terrain.

**Emotional goals:** Anticipation and confidence. Should feel like a hand-bound itinerary booklet animated into the future.

### Aesthetic Direction
- **Visual tone:** Warm parchment base with a **rose / amber gradient bloom**. Korea's red-and-gold heritage without kitsch — no taegukgi chrome.
- **Hero gradient:** soft rose top-left → amber bottom-right radial blobs. Dark mode swaps to a purple / indigo / mauve nightscape.
- **YOU pin:** glassy `MeshPhysicalMaterial` droplet + water puddle (`youPin.ts`), snapped to the photogrammetry mesh. Label is DOM-projected from world coords — not a fixed CSS viewport-center pin.
- **Place markers:** category-tinted `MeshStandardMaterial` spheres above terrain (not glass orbs). Glass/refraction is reserved for YOU.
- **References:** Apple Maps Look Around, `flighty.app`, `monocle.com/travel`.
- **Anti-references:** Booking.com clutter, generic trip-planner SaaS, tourism brochures, OSM defaults.

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
2. **Refraction is for the YOU pin only.** BreathFlow chrome stays matte.
3. **Distance is information, not chrome.** Distance + walking ETA as a colored pill.
4. **Smart links everywhere.** Flight #s, KTX, addresses, phones, times — `LinkifiedText`.
5. **PWA auto-update is mandatory.** Bump `CACHE_VERSION` in `frontend/public/sw.js` on every breaking SW change. Current version is Korea-primary (`korea-offline-v*`), not `breathflow-offline-v*`.

### Map Mode-specific Conventions

- Overlay: `MapModeOverlay.tsx` (`placesUrl`). Scene: `Detailed3DScene.tsx` (Google Photorealistic 3D Tiles via `3d-tiles-renderer`). `MapModeScene.tsx` is gone — do not recreate the orbital bubble plane.
- Trips pass `/api/trips/:id/days/:dayId/places` (same `PlacesResponse` / `RankedPlace` shape).
- Reset pitch ≈ `Math.PI / 4`. No auto-rotate. Adaptive tile quality / DPR by device tier.
- Missing tiles key or no WebGL → `MapModeFallbackList` (same filter chips).
- **Must unmount** when closed — do not hide with React `Activity`.
- Concierge chips may open Google/Apple Maps (`lib/externalMaps.ts`); in-app Map Mode stays for day/editor views.

---

## Design Context: `/trips/*` — Generic Trip Planner

Clerk-gated dossier planner. Korea is one seeded trip (`korea-2026`); every new destination is a trip document, not a new route tree.

### Users
The same travelers as Korea, plus future trips. Phone for in-trip lookups; desktop for planning, AI enhance, and concierge chat.

### Brand Personality
**Same cinematic dossier language as Korea**, parameterized by a per-trip accent (`data-trip-accent` → `--trips-accent` in `index.css`). Not a SaaS admin table.

### Aesthetic Direction
- Reuse Korea's parchment, bloom, photorealistic Map Mode, and editorial type.
- Accent is trip-owned (rose, amber, etc.) — do not invent a second chrome color.
- Overview (`/trips/:tripId`) is a read-only dossier. Editor is `/trips/:tripId/edit`. Concierge FAB (`TripChat`) lives on overview + day pages, not on create/edit.
- Instagram ingest is embedded in the editor (`TripIngest`), not a standalone route.

### Trips-specific Principles

1. **Do not add `/japan`-style destination routes.** Extend `server/src/trips/` + `frontend/src/pages/Trips/`.
2. AI-added places must carry structured `TripLocation` (lat/lng/category/source) — never prose only.
3. Map Mode contract is the Korea `PlacesResponse` / `RankedPlace` shape.
4. Frontend I/O is Effect (`tripsApi.ts`, `tripChatApi.ts`).

---

## Service Worker / Caching Contract

The installable PWA is Korea-scoped (`korea.webmanifest`, `CACHE_VERSION = korea-offline-v*`). BreathFlow has `site.webmanifest` but SW comments treat Korea as the install target. Every deploy must keep:

- **`/sw.js`** served with `Cache-Control: no-cache, no-store, must-revalidate` + `Service-Worker-Allowed: /`
- **SPA HTML** served with `no-cache, no-store, must-revalidate`
- **`/assets/*`** content-hashed bundles served with `public, max-age=31536000, immutable`
- **`CACHE_VERSION`** MUST be bumped on every SW-behavior change
- Client (`serviceWorker.ts`) posts `SKIP_WAITING` and reloads on `controllerchange`
- Preview paths (`/preview/`) must never be cached as production

`frontend/public/robots.txt` and `sitemap.xml` exist (`Disallow: /preview/`).

---

## Design Audit Status

The March 2025 BreathFlow audit is **historical**. Do not "fix" items that are already closed.

**Resolved:** light + dark tokens; `prefers-reduced-motion` (`useReducedMotion` + CSS); viewport pinch-zoom (`user-scalable=no` removed); `robots.txt`; BreathFlow rebuild in `frontend/src/breathflow/` with ARIA (`LiveAnnouncer`, session regions); orb reduced-motion in `OrbVisualization` / `useGlassOrb`.

**Still worth watching:** leftover inline hex in some settings/badge surfaces; 44 px touch targets on compact toggles; token completeness.

Do not search for deleted files (`FluidOrb.tsx`, `BreathingSession.tsx`, `pages/Home.tsx`, `components/breathing/`, `sessionStore`, `KirbyCharacter.tsx`).

---

## Agent skills

Read the matching skill before writing code. Catalog: [`.agents/skills/README.md`](.agents/skills/README.md). Effect I/O rules win when they conflict with generic React fetch/SWR examples.

| Skill | When |
|-------|------|
| [`effect-ts`](.agents/skills/effect-ts/SKILL.md) | Any frontend `/api`, SSE, or third-party HTTP. Required. |
| `vercel-react-best-practices` | React 19 render and bundle performance. Translate Next.js examples to Vite/`React.lazy` + Hono. |
| `impeccable` | Design, critique, polish. Reads `PRODUCT.md`. |
| `clerk` + `clerk-react-patterns` | Clerk auth. Core 2 `@clerk/clerk-react`. See [`.agents/memory/clerk.md`](.agents/memory/clerk.md). |
| `clerk-testing` / `clerk-cli` | Tests or dashboard/CLI only |

**Do not apply** Clerk Next.js / React Router SSR / Expo / Vue / mobile / billing / orgs / webhook skills — wrong stack. `design-taste-frontend` is landing-page only (not BreathFlow/Korea/Trips). Prefer impeccable over `redesign-existing-projects`.

Short pointers: [`.agents/memory/effect-ts.md`](.agents/memory/effect-ts.md), [`.agents/memory/ci-cd.md`](.agents/memory/ci-cd.md), [`.agents/memory/clerk.md`](.agents/memory/clerk.md).

---

## CI/CD (agent memory)

Canonical reference: [`docs/ci-cd.md`](docs/ci-cd.md).

- PR gate: `.github/workflows/pr.yml` → aggregate check `pr-gate` (branch-protection required context; starts immediately so merge UIs wait). Also runs on `merge_group`.
- PR preview (not a gate): `.github/workflows/preview.yml` → `https://anthonyl.im/preview/pr/<n>/` (frontend + loopback `/api` sidecar, cap 1). **No production `/api` fallback.** Agent guide: [`docs/pr-previews.md`](docs/pr-previews.md).
- Deploy on merge: `.github/workflows/deploy.yml` (atomic `anthonyl.im.next` swap + `/health` smoke).
- Shared setup: `.github/actions/setup-ci` (Bun + `node_modules` caches).
- Lockfiles: text `bun.lock` only; Dependabot uses `package-ecosystem: bun`. Never commit `bun.lockb`.
- Local verify: `bash .codex/check.sh` (or `bash .claude/cloud/verify.sh`) — server tests + frontend typecheck. Full `pr-gate` also runs build + vitest + both cloud-setup invariant scripts.

---

## PR Workflow

### Frontend Screenshot Rule

When creating a pull request that includes frontend changes (any modifications to files in `frontend/src/` that affect UI — components, pages, CSS, layout, styles), you **must** attempt to capture screenshots of the affected pages using the Chrome MCP tools before creating the PR. Include these screenshots in the PR description under a `## Screenshots` section.

**Process:**
1. Prefer the remote PR preview (`https://anthonyl.im/preview/pr/<n>/`). Wait with `bun scripts/wait-for-preview.ts --pr <n> --sha <head-sha>` (see [`docs/pr-previews.md`](docs/pr-previews.md)). No local Vite server required.
2. For Clerk-gated preview routes (`/korea`, `/trips`), run `bun scripts/clerk-agent-login.ts --pr <n> --path /korea` once. The helper applies a screenshot-user session in the agent Chrome (Korea + Trips share cookies). **Do not paste the ticket URL** — that is how sign-in walls happen. The helper re-execs from `origin/main` before sending secrets. Cursor cloud `gh` tokens have no push — `CLERK_SECRET_KEY` is enough (screenshot-user default). Dedicated screenshot identity, not a personal production login — do not sign in to production `/korea` or `/trips`. Public routes only need `?hidePreviewChrome=1`.
3. **Upload screenshots to GitHub** using `gh api` so they get permanent URLs visible in the PR. Local file paths and repo blob URLs do not render in PR descriptions. Use: `gh api --method POST repos/{owner}/{repo}/issues/{pr_number}/comments --field body="![screenshot](url)"` or upload via the GitHub upload endpoint.
4. Add the uploaded screenshot URLs to the PR description body

If the preview is not live yet (serving code not on production, droplet down) **or** Chrome MCP is unavailable, fall back to `bun run dev` in `frontend/` and note that in the PR. Do not block PR creation on screenshot availability.

This PR is docs/skills only — screenshots are not applicable.

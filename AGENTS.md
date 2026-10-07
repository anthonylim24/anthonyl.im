# anthonyl.im

This repo hosts five experiences under one Vite SPA: the anthonyl.im lab landing page (`/`), a personal AI chatbot (`/chatbot`), **BreathFlow**, the **Korea** itinerary, and a generic **trip planner**. Each has its own visual identity; all share the craft principles below.

**Where to read what**

| Need | File |
|------|------|
| Engineering, routes, env, CI, tree | [`CLAUDE.md`](CLAUDE.md) |
| Design context for UI work | [`PRODUCT.md`](PRODUCT.md) |
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
- StyleX 0.19 (`@stylexjs/stylex`) + semantic classes in `index.css` + shadcn/ui (Radix primitives)
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

## Frontend StyleX

All UI styling is StyleX + semantic CSS classes — Tailwind is removed. Skill: [`.agents/skills/stylex/SKILL.md`](.agents/skills/stylex/SKILL.md) (symlinked at `.claude/skills/stylex/SKILL.md`).

| Piece | Location |
|-------|----------|
| Merge helper | `frontend/src/styles/merge.ts` — `sx(...)` |
| Shared layout | `frontend/src/styles/common.stylex.ts` — `layout.srOnly`, etc. |
| Route modules | `*.stylex.ts` (Trips `ui.ts` + `toy.stylex.ts` + `trips.stylex.ts`, BreathFlow, Korea, chatbot) |
| Tokens + semantic classes | `frontend/src/index.css` (`@layer reset` Preflight, `.cover-band`, animations, Map Mode `.map-*`) |
| Vite plugin | `frontend/vite.config.ts` — `useCSSLayers` |

**Do:** `{...sx(styles.foo, 'cover-band')}` when the old Tailwind string included a semantic class; `borderWidth` + `borderStyle` with `borderColor`; `layout.srOnly` for hidden labels; child-combinator spacing as `index.css` utilities; `:is(.group:hover) &` + `'group'` instead of `group-hover:*`.

**Do not:** reintroduce Tailwind; import plain token maps into `stylex.create()`; set only `borderColor` after Preflight; rely on StyleX `@layer` rules when unlayered CSS sets the same property (e.g. leaves overlay opacity).

**Trips parity (required):** local dev with matching `VITE_DEV_BEARER` + `IG_DEV_BEARER`; `cd frontend && bun run e2e -- e2e/smoke.spec.ts -g "trips skips"`. PR previews: `bun scripts/clerk-agent-login.ts` — never bake dev bearer into previews.

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
- **Bloom:** a `Jelly` soft body shaped as a flat, lobed puddle of paint (never a lit sphere — it read as a moon). It inflates on inhale (≈1.36×), jiggles subtly on holds, and eases down on exhale; physics carries the overshoot. TSL material: Beer–Lambert pigment glaze, a ragged dry edge with a tide line (`edgeT` attribute + noise), pooling where the wall turns, settling toward the bottom, backrun blossoms from the edge, wet-in-wet bleeding between the two pigments, granulation. The paper sheet has wet-in-wet blooms plus a splatter ring (droplets, tapered flicks, satellite splats) that flies out a touch on each inhale. All noise and splatter are baked once in `scene/paintTextures.ts` and sampled as textures — no per-pixel procedural noise — so the scene runs at DPR 2. Post: paper tooth, colour bleed, vignette, static Three.js Blocks `filmHD` grain (credited on Settings).
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

Clerk-gated dossier at `/trips/korea-2026` for the May/June 2026 Seoul + Busan trip. Legacy `/korea*` frontend routes redirect here. Snapshot data also seeds trip `korea-2026`. `/api/korea/*` remains. **Do not add new destination-specific routes** — new destinations go through `/trips`.

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

Clerk-gated planner. Korea is the seeded trip at `/trips/korea-2026` (`/korea` redirects). Every new destination is a trip document, not a new route tree. Chatbot, BreathFlow, and the Korea seed keep their own visual worlds; do not restyle them as Trips.

Canonical visual spec: [`DESIGN.md`](DESIGN.md). Token source of truth: `frontend/src/index.css` `.trips`. Shared-site Cormorant / parchment does **not** apply on `/trips`.

### Users
The same travelers as Korea, plus future trips. Phone for in-trip lookups; desktop for planning, AI enhance, and concierge chat.

### Brand Personality
**Toy-world travel diorama.** Pastel papercraft and clay: stickers with an ink outline and a hard offset shadow, luggage tags, ticket stubs, postage stamps, boarding passes, and a squishy clay planet (shared `Jelly` soft body) you can poke. Playful, tactile, still a precise planner. Not a hand-bound Korea dossier. Not Linear, Notion, or Airbnb.

**Emotional goal:** Delight on open, then know what happens next. At night, tonight's reservation is first.

### Aesthetic Direction
- **Material:** every surface is a sticker — 2px `--trips-line` outline + hard offset `--trips-shadow`, spring hover tilt. Light is a sky-washed desk (`#edf5fb`); dark is navy felt (`#151933`) with the same pastel stickers and cream ink.
- **Palette:** sky / mint / peach / butter / lilac / rose fills (`--toy-*`) on deep ink `#1f2440`. Fills are decoration; text on a fill always uses `--trips-fill-ink`.
- **Type:** Bricolage Grotesque (display, 750–800, condensed stretch); Fragment Mono for times, codes, stamps, kbd hints; Inter body. No Cormorant on `/trips`.
- **Three.js:** one squishy moment per viewport. Index hero = clay world globe with trip pins (click → trip; focus follows search). Overview cover = region diorama (mint island, trees, clouds, per-day gumdrop pins → day). Create generating overlay = planet collecting pins. All lazy (`scene/TripsGlobe.tsx` → `scene/globeScene.ts`) with a static SVG planet fallback when WebGL is unavailable.
- **Index:** luggage tags (stub + eyelet + 3-letter code + day count) grouped Now / Upcoming / Past; search with `/` and `n` shortcuts. Heading is "Trips" or "Where to next?". **Never "Inbox".**
- **Create:** "Pack your bag" — destinations pop onto a suitcase as stickers.
- **Day page:** postcard header with date stamp + postmark, boarding-pass reservations, stops on a gumdrop rail with dashed route segments.
- **Accent:** `data-trip-accent` (rose / amber / emerald / sky / violet) sets `--ta-fill` (cover band, tag stub, stamp, active date) and `--ta` (ink accent).
- **Code:** `pages/Trips/toy.stylex.ts` (`globe` / `index` / `overview` / `pack` / `day`), `trips.stylex.ts` (shared editor/chat/day vocabulary), `ui.ts` helpers, `index.css` `.trips` tokens.
- **IA (locked):** `/trips/:tripId` is the living document. Day pages stay. `/trips/:tripId/edit` redirects there. Concierge FAB (`TripChat`) on trip + day only. Instagram ingest is embedded on the living document.
- **Map Mode:** photorealistic 3D tiles stay. Glass/refraction is for the YOU pin only. **Must unmount** when closed; never hide with React `Activity`. Touch targets 44px.

### Trips-specific Principles

1. **Do not add `/japan`-style destination routes.** Extend `server/src/trips/` + `frontend/src/pages/Trips/`.
2. AI-added places must carry structured `TripLocation` (lat/lng/category/source), never prose only.
3. Map Mode contract is the Korea `PlacesResponse` / `RankedPlace` shape and **must unmount** when closed.
4. Frontend I/O is Effect v3 (`tripsApi.ts`, `tripChatApi.ts`).
5. Keep the toy-world sticker system on `/trips`; do not restyle it into Korea parchment/bloom/Cormorant or Linear/Notion zinc, and do not restyle chatbot or BreathFlow as Trips.

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

**Resolved:** light + dark tokens; `prefers-reduced-motion` (`useReducedMotion` + CSS); viewport pinch-zoom (`user-scalable=no` removed); `robots.txt`; BreathFlow rebuild in `frontend/src/breathflow/` with ARIA (`LiveAnnouncer`, session regions); bloom reduced-motion in `scene/bloomScene.ts` (orb files were replaced by the watercolour bloom).

**Still worth watching:** leftover inline hex in some settings/badge surfaces; 44 px touch targets on compact toggles; token completeness.

Do not search for deleted files (`FluidOrb.tsx`, `BreathingSession.tsx`, `pages/Home.tsx`, `components/breathing/`, `sessionStore`, `KirbyCharacter.tsx`).

---

## Agent skills

Read the matching skill before writing code. Catalog: [`.agents/skills/README.md`](.agents/skills/README.md). Effect I/O rules win when they conflict with generic React fetch/SWR examples.

| Skill | When |
|-------|------|
| [`effect-ts`](.agents/skills/effect-ts/SKILL.md) | Any frontend `/api`, SSE, or third-party HTTP. Required. |
| [`stylex`](.agents/skills/stylex/SKILL.md) | UI styling, layout, tokens, visual parity, `*.stylex.ts`, `index.css` semantic classes. Required for frontend UI. |
| `vercel-react-best-practices` | React 19 render and bundle performance. Translate Next.js examples to Vite/`React.lazy` + Hono. |
| `clerk` + `clerk-react-patterns` | Clerk auth. Core 2 `@clerk/clerk-react`. See [`.agents/memory/clerk.md`](.agents/memory/clerk.md). |
| `clerk-testing` / `clerk-cli` | Tests or dashboard/CLI only |

**Do not apply** Clerk Next.js / React Router SSR / Expo / Vue / mobile / billing / orgs / webhook skills — wrong stack. `design-taste-frontend` is landing-page only (not BreathFlow/Korea/Trips).

Short pointers: [`.agents/memory/effect-ts.md`](.agents/memory/effect-ts.md), [`.agents/memory/stylex.md`](.agents/memory/stylex.md), [`.agents/memory/ci-cd.md`](.agents/memory/ci-cd.md), [`.agents/memory/clerk.md`](.agents/memory/clerk.md).

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
2. For Clerk-gated preview routes (`/trips`, `/trips/korea-2026`), run `bun scripts/clerk-agent-login.ts --pr <n> --path /trips/korea-2026` once. The helper applies a screenshot-user session in the agent Chrome (Korea + Trips share cookies). **Do not paste the ticket URL** — that is how sign-in walls happen. The helper re-execs from `origin/main` before sending secrets. Cursor cloud `gh` tokens have no push — `CLERK_SECRET_KEY` is enough (screenshot-user default). Dedicated screenshot identity, not a personal production login — do not sign in to production `/trips` or `/trips/korea-2026`. Public routes only need `?hidePreviewChrome=1`.
3. **Local fallback for Trips:** when preview/Chrome MCP is unavailable, run backend + `cd frontend && bun run dev` with matching `VITE_DEV_BEARER` / `IG_DEV_BEARER` (see `deploy/README.md`). Confirm bypass with `bun run e2e -- e2e/smoke.spec.ts -g "trips skips"`. Note local screenshots in the PR.
4. **Upload screenshots to GitHub** using `gh api` so they get permanent URLs visible in the PR. Local file paths and repo blob URLs do not render in PR descriptions. Use: `gh api --method POST repos/{owner}/{repo}/issues/{pr_number}/comments --field body="![screenshot](url)"` or upload via the GitHub upload endpoint.
5. Add the uploaded screenshot URLs to the PR description body

If the preview is not live yet (serving code not on production, droplet down) **or** Chrome MCP is unavailable, fall back to a local `cd frontend && bun run dev` with `VITE_DEV_BEARER` and note that in the PR. Do not block PR creation on screenshot availability.

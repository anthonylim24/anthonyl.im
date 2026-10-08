# anthonyl.im — Design Context

This repo hosts five experiences under one Vite SPA: the **anthonyl.im lab landing page** (`/`), a personal AI chatbot (`/chatbot`), **BreathFlow** (`/breathwork`), the **Korea** itinerary (`/trips/korea-2026`; `/korea` redirects), and a generic **trip planner** (`/trips`). Each has its own visual identity; all share the craft principles below.

Frontend network I/O uses **Effect v3** — do not add raw `fetch` for `/api`. UI styling uses **StyleX** — do not add Tailwind. Engineering: [`CLAUDE.md`](CLAUDE.md). Skills: [`.agents/skills/README.md`](.agents/skills/README.md).

**Register:** landing + chatbot = brand surfaces; BreathFlow / Korea / Trips = product UIs. Infer the register from the route before applying craft rules.

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

- React 19 + TypeScript + Vite 8
- StyleX 0.19 + semantic classes in `index.css` + shadcn/ui (Radix primitives)
- Zustand (BreathFlow persisted state), Motion 13, Lucide (intentional — keep)
- Effect v3 for frontend I/O
- Bun + Hono (server), Clerk (`@clerk/clerk-react`), Supabase, PostHog
- Three.js for Map Mode (Korea **and** Trips)

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

Each app's *accent* color is its own (see per-app sections).

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

Live dossier is `/trips/korea-2026`. Legacy `/korea*` frontend routes redirect there. `/api/korea/*` remains. Do not add destination-specific routes.

### Users
Anthony (primary) and his partner, while planning + executing a 12-day Seoul + Busan trip in late May / early June 2026. Used on phones for in-trip lookups (reservations, places nearby, directions) and on desktop for planning. Authenticated behind Clerk so it's a private dossier.

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

- Overlay: `MapModeOverlay.tsx`. Scene: `Detailed3DScene.tsx` (Google Photorealistic 3D Tiles). `MapModeScene.tsx` is gone.
- Reset pitch ≈ `Math.PI / 4`. No auto-rotate. Adaptive tile quality by device tier.
- Missing tiles key or no WebGL → styled fallback list with the same filter chips.
- **Must unmount** when closed — do not hide with React `Activity`.

---

## Cross-app Components Worth Knowing

- **`<LinkifiedText>`** (Korea) — universal smart-linker. Detects flight numbers (UA / KE / OZ / AA / DL / AS / BA / JL / NH), KTX trains, Korean phones (+82), emails, URLs, Korean street addresses (`-daero` / `-ro` + `-gil`), subway exit references, and 24-hour times (which become hover-tooltip AM/PM via `<Time>`).
- **`<ReservationCard>`** (Korea) — status pill (✅ / 🟡 / 🔴), category icon, time with AM/PM tooltip, chip row for Maps / Call / Book.
- **`<DayCard>`** + **`<DayTreeNav>`** (Korea) — city-tinted gradients, spring entry, today-detection ring.
- **`<Detailed3DScene>`** (Korea) — photorealistic 3D tiles Map Mode scene (`MapModeOverlay` consumer). YOU pin is 3D `YouPin` on terrain, not a fixed viewport-center CSS pin.
- **`<KstClock>`** (Korea) — live Asia/Seoul time pill in the tree nav.

---

## Design Context: `/trips/*` — Generic Trip Planner

Korea is the seeded trip at `/trips/korea-2026` (`/korea` redirects). Every new destination is a trip document, not a new route tree. Chatbot, BreathFlow, and the Korea seed keep their own visual worlds; do not restyle them as Trips.

Canonical visual spec: [`DESIGN.md`](DESIGN.md). Token source of truth: `frontend/src/index.css` `.trips`. Shared-site Cormorant / parchment does **not** apply here.

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

### Per-route Tokens (`index.css` `.trips` is canonical)

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| Canvas | `#edf5fb` | `#151933` | Sky-washed page |
| Surface | `#fffdf6` | `#1f2448` | Stickers, panels, fields |
| Ink / line | `#1f2440` | `#f6f0de` / `#070918` | Body text / sticker outline + shadow |
| Fills | sky `#a9d8f5`, mint `#a6e5c8`, peach `#ffc3a6`, butter `#ffdd7f`, lilac `#cdc1f7`, rose `#ffb3c4` | same | Decoration; `--ta-fill` per trip |
| Accent | `#1d5f91` | `#9fd3f5` | Default ink accent; `--ta` per trip |

### Trips-specific Principles

1. **Do not add `/japan`-style destination routes.** Extend `server/src/trips/` + `frontend/src/pages/Trips/`.
2. AI-added places must carry structured `TripLocation` (lat/lng/category/source), never prose only.
3. Map Mode uses the Korea `PlacesResponse` / `RankedPlace` shape and **must unmount** when closed.
4. Frontend I/O is Effect v3 (`tripsApi.ts`, `tripChatApi.ts`).
5. Keep the toy-world sticker system on `/trips`; do not restyle it into Korea parchment/bloom/Cormorant or Linear/Notion zinc, and do not restyle chatbot or BreathFlow as Trips.

## Service Worker / Caching Contract

The app is a PWA. Every deploy must keep these invariants:

- **`/sw.js`** served with `Cache-Control: no-cache, no-store, must-revalidate` + `Service-Worker-Allowed: /`
- **SPA HTML** served with `no-cache, no-store, must-revalidate`
- **`/assets/*`** content-hashed bundles served with `public, max-age=31536000, immutable`
- **`CACHE_VERSION`** in `sw.js` MUST be bumped on every SW-behavior change
- The client (`serviceWorker.ts`) posts `SKIP_WAITING` and reloads on `controllerchange` — gives users seamless updates without a manual hard refresh

# anthonyl.im — Impeccable Design Context

This repo hosts four experiences under one Vite SPA: a personal AI chatbot (`/`), **BreathFlow** (`/breathwork`), the **Korea** itinerary (`/trips/korea-2026`; `/korea` redirects), and a generic **trip planner** (`/trips`). Each has its own visual identity; all share the craft principles below.

Frontend network I/O uses **Effect v3** — do not add raw `fetch` for `/api`. Engineering: [`CLAUDE.md`](CLAUDE.md). Skills: [`.agents/skills/README.md`](.agents/skills/README.md).

**Register (Impeccable):** chatbot = personal brand surface; BreathFlow / Korea / Trips = product UIs. Infer the register from the route before applying craft rules.

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
- Tailwind CSS 4.3 + shadcn/ui (Radix primitives)
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
| Display font | Cormorant Garamond (BreathFlow: Fragment Mono) | | Shared-site display; BreathFlow uses Fragment Mono |
| Border radius | `0.5rem` (default) / `1rem`+ in Korea orb cards | | Standard rounding |
| Spring easing | `cubic-bezier(0.16, 1, 0.3, 1)` | | Motion default |
| Decel easing | `cubic-bezier(0.33, 0, 0, 1)` | | Smooth stops |

Each app's *accent* color is its own (see per-app sections).

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
- Theme class switch: `chatbot-shadow` for light, `chatbot-dark` for dark
- Grain texture is a *design feature* — keep it
- 100dvh container so iOS safe areas blend with `html { background: #F5F2ED }`

---

## Design Context: `/breathwork/*` — BreathFlow

Code: `frontend/src/breathflow/`. Session orb is `OrbVisualization` / `useGlassOrb`. Surrounding chrome stays matte — no glassmorphism stacking. Lucide is intentional. Shared-site type is Inter + Cormorant; BreathFlow implementation uses Geist + Fragment Mono (`frontend/src/index.css`, loaded in `frontend/index.html`).

### Users
Wellness enthusiasts and people seeking anxiety / stress relief. They open BreathFlow when they need to decompress, build a daily breathing habit, or access structured breathwork techniques backed by science. The context is often evening wind-down, pre-performance calm, or mid-day stress breaks — moments that demand a UI that feels immediately calming upon launch.

### Brand Personality
**Calm, Scientific, Premium.** Like a high-end wellness lab — trustworthy, refined, evidence-based. The interface should feel like a precision instrument for the body, not a toy. Gamification (XP, levels, achievements) exists to sustain habit, not to entertain — it's motivation architecture, not playfulness.

**Emotional goals:** Immediate calm (like stepping into a quiet room — tension drops instantly) and quiet confidence (like a deep breath before a big moment — grounded and capable).

### Aesthetic Direction
- **Visual tone:** Warm parchment + ink. Light-first with a warm beige canvas (`#F5F2ED`), ink typography (`#1C1917`), amber accent (`#B8860B`).
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

Korea is the seeded trip at `/trips/korea-2026` (`/korea` redirects). Every new destination is a trip document, not a new route tree. Chatbot, BreathFlow, and the Korea seed keep their own visual worlds; do not restyle them as this timetable.

Canonical visual spec: [`DESIGN.md`](DESIGN.md). Token source of truth: `frontend/src/index.css` `.trips` (oklch). Shared-site Cormorant / parchment does **not** apply here.

### Users
The same travelers as Korea, plus future trips. Phone for in-trip lookups; desktop for planning, AI enhance, and concierge chat.

### Brand Personality
**JR pocket timetable** (Impeccable 4.1.1 new-work, seed `871b774e`, assigned index 3). The trip is a pocket timetable. Days are stations; bookings are trains. Kitchen-table afternoon planning; hotel-lamp evening lookup. Not a hand-bound Korea dossier. Not Linear, Notion, or Airbnb.

**Emotional goal:** Open and know what happens next. At night, tonight’s reservation is first.

### Aesthetic Direction
- **Material:** green-gray print stock + a deep JR-green cover band. Dark is lamp-lit tinted stock, not a zinc IDE.
- **Type:** Archivo Narrow (`font-display`, 600, `-0.02em`) for times and titles; Inter for UI body. **No Cormorant on `/trips`.** Banned display faces: Fraunces, Playfair, Cormorant, Lora, Crimson, Newsreader, Syne, Space Grotesk, Space Mono, IBM Plex, Inter-as-display, DM Sans, DM Serif, Outfit, Plus Jakarta, Instrument Sans.
- **First viewport:** committed cover band (30–40% of the first viewport) + condensed title + next time; snap rail (station ticks); schedule rows. Chrome and cover compactify on scroll so the itinerary keeps the viewport.
- **Fields / dialogs:** inset rail wells, one `--trips-radius` (0.25rem), opaque surface panels. Enhance opens a heavy-scrim dialog with a recessed action bar and filled **Run enhance**.
- **Index:** end-label timetable rows grouped Now / Upcoming / Past. Heading is “Trips” or “No trips yet”. **Never “Inbox”.**
- **Day page:** the first reservation is the hero (huge condensed time). Status is a geometric mark + label, not hue-only.
- **Accent:** `data-trip-accent` retints canvas + cover band (rose / amber / emerald / sky / violet). No Korea bloom, grain, or parchment.
- **Chrome:** slim sticky header. No left workspace rail. No Notion property-table hero. No Airbnb listing cards. Document column is `max-w-5xl`. Radius `0.25rem` (tighter than Korea orbs). Touch targets 44px.
- **IA (locked):** `/trips/:tripId` is the living document. Day pages stay. `/trips/:tripId/edit` redirects there. Concierge FAB (`TripChat`) on trip + day only (not index, create, or places). Instagram ingest is embedded on the living document.
- **Map Mode:** photorealistic 3D tiles stay. Glass/refraction is for the YOU pin only. **Must unmount** when closed; never hide with React `Activity`.

### Per-route Tokens (oklch is canonical)

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| Canvas | `oklch(94.8% 0.018 128)` | `oklch(16.4% 0.024 148)` | Print-stock page |
| Surface | `oklch(97.4% 0.01 128)` | `oklch(20.2% 0.022 148)` | Panels, fields |
| Ink | `oklch(22% 0.028 140)` | `oklch(93.4% 0.02 128)` | Body |
| Band | `oklch(31% 0.058 148)` | `oklch(26% 0.05 148)` | Cover band |
| Band ink | `oklch(96.2% 0.018 128)` | `oklch(94.8% 0.02 128)` | Type on the band |
| Accent | `oklch(36% 0.07 148)` | `oklch(78% 0.06 148)` | Default JR-green; retinted per trip |

### Trips-specific Principles

1. **Do not add `/japan`-style destination routes.** Extend `server/src/trips/` + `frontend/src/pages/Trips/`.
2. AI-added places must carry structured `TripLocation` (lat/lng/category/source), never prose only.
3. Map Mode uses the Korea `PlacesResponse` / `RankedPlace` shape and **must unmount** when closed.
4. Frontend I/O is Effect v3 (`tripsApi.ts`, `tripChatApi.ts`).
5. Do not restyle `/trips` into Korea parchment/bloom/Cormorant, and do not restyle it into Linear/Notion zinc. Do not restyle chatbot or BreathFlow as a timetable.

## Service Worker / Caching Contract

The app is a PWA. Every deploy must keep these invariants:

- **`/sw.js`** served with `Cache-Control: no-cache, no-store, must-revalidate` + `Service-Worker-Allowed: /`
- **SPA HTML** served with `no-cache, no-store, must-revalidate`
- **`/assets/*`** content-hashed bundles served with `public, max-age=31536000, immutable`
- **`CACHE_VERSION`** in `sw.js` MUST be bumped on every SW-behavior change
- The client (`serviceWorker.ts`) posts `SKIP_WAITING` and reloads on `controllerchange` — gives users seamless updates without a manual hard refresh

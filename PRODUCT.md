# anthonyl.im — Impeccable Design Context

This repo hosts four experiences under one shell: a personal AI chatbot at the root, the **BreathFlow** wellness app, the **Korea Trip** dossier, and the generic **Trips** planner. Each has its own visual identity; all share the underlying craft principles below. The chat app and Trips were redesigned in August 2026 under Taste Skills V2 and carry their own design records in [`docs/design/`](docs/design/).

## Shared Design Principles (apply to every route)

1. **Craft over convention.** Prefer custom, considered solutions over generic component-library defaults. Spacing, typography weight contrast, surface hierarchy, and motion should feel intentionally designed, not assembled.
2. **Motion with purpose.** Every animation should serve comprehension (orient, reveal, guide) or affect (calm, anticipation, delight). Decorative-only motion is rejected. Spring physics over linear tweens; respect `prefers-reduced-motion` everywhere.
3. **Depth through restraint.** No more than one vivid moment per viewport. Use neutral mass to make accents punch. Avoid glassmorphism stacking, gradient text on headings, and generic SaaS gradients.
4. **Typography as the design language.** Weight, size, and tracking carry the hierarchy; let the type breathe. The family is per app, not global: Bricolage Grotesque over Geist in Trips, Geist in the chat app, Cormorant Garamond over Inter in Korea, Geist over Fragment Mono in BreathFlow. All of them are self-hosted through Fontsource (`frontend/src/fonts.ts`); never add a Google Fonts `<link>`.
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
- Tailwind CSS 4.2 + shadcn/ui (Radix primitives)
- Zustand (state), Motion (animation), Lucide (icons)
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

Each app's *accent* color is its own (see per-app sections).

---

## Design Context: `/` and `/chatbot` — Personal AI Chatbot

> Redesigned August 2026 under Taste Skills V2. The commitments live in
> [`docs/design/chat.md`](docs/design/chat.md); that file wins over any older
> prose here. What follows is the short version.

### Users
Visitors who land on `anthonyl.im` directly. Recruiters, prospective collaborators, friends, curious engineers. They scan, they pivot, they leave if it doesn't earn attention.

### Brand Personality
**Quiet, Confident, Crafted.** A staff engineer's personal site. The assistant is the product, so the page is a single viewport with the conversation as the only scrollport, never a scrolling marketing page.

### Aesthetic Direction
- **Shell:** asymmetric split. Identity rail plus conversation at `lg` and up, condensing to a header once a transcript exists.
- **Field:** cool neutral zinc (`#f3f3f4` light, `#0c0c0d` dark), one electric-blue accent (`#1d4ed8` light, `#93b4ff` dark).
- **Type:** self-hosted Geist Variable, Geist Mono for labels and counts. No 10px primary UI text.
- **Real visual:** leaf-shadow footage served from our own origin, multiplied on light and screened on dark, behind a labelled `Ambience` control that pauses under reduced motion.
- **Motion:** CSS only. Importing `motion/react` on this route would drag the motion chunk into the LCP bundle.
- **Anti-references:** purple AI gradients, glowing borders, rainbow typing indicators, 10px mono chrome, cryptic single-letter toggles.

### Per-route Tokens
- Theme class switch: `chat chat-light` / `chat chat-dark`, defaulting to `prefers-color-scheme` with a stored override
- Tokens: the `.chat` block in `frontend/src/index.css` (`--ch-*`)
- Radius: `--ch-r-panel` 12px, `--ch-r-control` 8px, `rounded-full` only for scroll-to-latest

---

## Design Context: `/breathwork/*` — BreathFlow

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

## Design Context: `/trips/*` — Trip planner

> Redesigned August 2026 under Taste Skills V2. The commitments live in
> [`docs/design/trips.md`](docs/design/trips.md); that file wins over any older
> prose here. What follows is the short version.

### Users
Anthony and whoever he is travelling with, planning on a laptop and executing on a phone. Clerk-gated, so it is a private workspace rather than a public product.

### Brand Personality
**Cool, precise, editorial.** A field notebook for a trip: the data is the point, the chrome stays out of the way, and each trip wears its own accent.

### Aesthetic Direction
- **Field:** cool slate (`#eff1f3` light, `#0d1013` dark). The previous warm parchment plus brass palette is the exact family Taste Skills V2 bans as the premium-consumer default, so it was rotated out.
- **Accent:** five server-validated keys (`rose amber emerald sky violet`) re-solved in OKLCH against the cool field, swapped per trip through `data-trip-accent`. Ember is the chrome default. One accent per page; the semantic ok/warn/danger tokens appear only as small badges.
- **Type:** Bricolage Grotesque Variable display, Geist Variable body, Geist Mono for dates, times, and counts.
- **Imagery:** a generated contour plate tinted by the accent behind trip heroes, and a desk photograph for the empty, create, and signed-out states.
- **Layout families, one use each:** editorial rows (index), quiet card grid (past trips), split hero plus day card grid (overview), timeline (day), two-pane rail and canvas (editor).
- **Anti-references:** numbered section eyebrows, mono labels above every heading, middle-dot chains, decorative status dots, three consecutive hairline row lists.

### Per-route Tokens
- Tokens: the `.trips` block in `frontend/src/index.css` (`--tr-*` neutral field, `--ta*` accent)
- Vocabulary: `frontend/src/pages/Trips/ui.ts` is the only source of colour, radius, focus, and button classes
- Radius: `--tr-r-panel` 12px, `--tr-r-control` 8px, `rounded-full` only for the save pill, toggle thumbs, and genuine status dots

---

## Design Context: `/korea/*` — Korea Trip Itinerary

### Users
Anthony (primary) and his partner, while planning + executing a 12-day Seoul + Busan trip in late May / early June 2026. Used on phones for in-trip lookups (reservations, places nearby, directions) and on desktop for planning. Authenticated behind Clerk so it's a private dossier.

### Brand Personality
**Cinematic, Personal, Refined.** A private travel concierge dossier — every reservation accounted for, every neighborhood researched, every recommendation reasoned. Map Mode is the centerpiece: a 3D orbital view where YOU sit at the center of the trip universe.

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

## Cross-app Components Worth Knowing

- **`<LinkifiedText>`** (Korea) — universal smart-linker. Detects flight numbers (UA / KE / OZ / AA / DL / AS / BA / JL / NH), KTX trains, Korean phones (+82), emails, URLs, Korean street addresses (`-daero` / `-ro` + `-gil`), subway exit references, and 24-hour times (which become hover-tooltip AM/PM via `<Time>`).
- **`<ReservationCard>`** (Korea) — status pill (✅ / 🟡 / 🔴), category icon, time with AM/PM tooltip, chip row for Maps / Call / Book.
- **`<DayCard>`** + **`<DayTreeNav>`** (Korea) — city-tinted gradients, spring entry, today-detection ring.
- **`<MapModeScene>`** (Korea) — Three.js orbital scene with the conventions above. CSS YOU pin anchors center.
- **`<KstClock>`** (Korea) — live Asia/Seoul time pill in the tree nav.

## Service Worker / Caching Contract

The app is a PWA. Every deploy must keep these invariants:

- **`/sw.js`** served with `Cache-Control: no-cache, no-store, must-revalidate` + `Service-Worker-Allowed: /`
- **SPA HTML** served with `no-cache, no-store, must-revalidate`
- **`/assets/*`** content-hashed bundles served with `public, max-age=31536000, immutable`
- **`CACHE_VERSION`** in `sw.js` MUST be bumped on every SW-behavior change
- The client (`serviceWorker.ts`) posts `SKIP_WAITING` and reloads on `controllerchange` — gives users seamless updates without a manual hard refresh

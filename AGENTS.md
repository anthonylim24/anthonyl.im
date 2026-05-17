# anthonyl.im

This repo hosts three distinct experiences under one shell: a personal AI chatbot, the **BreathFlow** wellness app, and the **Korea Trip** itinerary app. Each has its own visual identity; all share the underlying craft principles below.

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

## Design Audit (March 2025) — BreathFlow

Comprehensive audit of the BreathFlow frontend. Use these findings to guide any design or accessibility work.

### Anti-Pattern Verdict: FAIL (8/10 AI slop tells)

The current UI reads as AI-generated. Specific tells:
- Indigo-on-navy gradient palette (the "AI color palette")
- Dark mode with glowing accents as the only theme
- Glassmorphism everywhere (38 occurrences across 8 files, 8 redundant glass CSS classes)
- Gradient text on headings (`App.tsx:258,353`, `Header.tsx:56`)
- Hero metric layout on dashboard (big number + small label, repeated 4x)
- Identical technique card grid (4 same-sized cards, same layout)
- Cards nested inside cards throughout
- `--spring-bounce` easing used (`KirbyCharacter.tsx:40,69,79`)

### Critical Issues (Fix First)

1. **No light theme exists.** Only dark tokens in `:root` and `.breathwork` (index.css:325-370). Only 2 files use `dark:` variants. `color-scheme: dark` hardcoded (index.css:29). Must build entire light token system from scratch.

2. **Zero `prefers-reduced-motion` support.** 0 occurrences in entire codebase. 15+ CSS animations and spring-based Framer Motion animations. The breathing orb is large, continuous, and central — dangerous for vestibular disorders.

3. **Zero ARIA in breathing components.** No `aria-live`, `aria-label`, or `role` attributes in BreathingSession.tsx, Timer.tsx, PhaseIndicator.tsx, or FluidOrb.tsx. Phase transitions and countdown are invisible to screen readers. This is the core product feature.

4. **`user-scalable=no` in viewport meta** (index.html:5). Blocks pinch-to-zoom. WCAG 1.4.4 violation. Remove `maximum-scale=1.0, user-scalable=no`.

### High-Severity Issues

5. **Hard-coded colors bypass tokens.** Inline styles with hex/rgba throughout: Settings.tsx (7), App.tsx (15+), FluidOrb.tsx phase colors, BadgeGrid.tsx gradients. These won't respond to theme changes.

6. **Invalid hex opacity syntax.** PhaseIndicator.tsx and BreathingSession.tsx append opacity hex digits to strings (`${color}1A`). Fragile and non-standard.

7. **FluidOrb is a div with onClick, not a button.** Not keyboard-accessible (no tabIndex, no keyboard handler, no ARIA role). WCAG 2.1.1 violation.

8. **Session controls auto-hide risks keyboard trap.** Controls fade to 20% opacity but remain in DOM. Users tabbing can't see focused element. WCAG 2.1.2 risk.

9. **Touch targets below 44px.** Nav icons: 38x38px. Settings toggle thumbs: 20x20px.

10. **No `robots.txt`.** Returns HTML page (SPA fallback). Lighthouse Best Practices: 77.

11. **Font becoming generic.** DM Sans increasingly common in AI outputs. Display font (Anybody) is distinctive but underused.

### Medium Issues

12. Gradient text on headings (anti-pattern)
13. Hero metric layout pattern repeated on dashboard
14. Center-aligned everything (should use asymmetric left-aligned layouts)
15. No container queries (`@container`) — all responsive via viewport breakpoints
16. Monotonous spacing (same `gap-4`, `p-6` everywhere, no rhythm)
17. No fluid typography (fixed Tailwind classes, no `clamp()`)
18. `background-position` animation on breath gradient — non-GPU property, CPU repaints every frame for 15s
19. Excessive `will-change` (12+ elements) — remove and let browser auto-optimize

### Low Issues

20. Pure `#fff` in LevelRing (Home.tsx:138) — should tint
21. Orphaned `App.css` with unused `--text-color` variable
22. Dead code: `frontend/src/lib/colors.ts` exports unused color object
23. PostHog API key hardcoded in App.tsx:100 (move to env var)
24. Profile image in Settings missing `loading="lazy"`

### Lighthouse Scores

| Metric | Desktop | Mobile |
|--------|---------|--------|
| Accessibility | 89 | 82 |
| Best Practices | 77 | 77 |
| SEO | 91 | 91 |

### Positive Findings (Preserve These)

- **Solid engineering:** Zustand stores, well-structured hooks, proper code-splitting with `lazy()`, clean TypeScript
- **Token system infrastructure exists:** shadcn/ui HSL CSS variables in tailwind.config.js — just needs light values added
- **Safe area handling is thorough:** `env(safe-area-inset-*)`, visual viewport API for keyboard avoidance
- **Performance-conscious:** `content-visibility: auto` on session items, GPU-accelerated transforms, RAF-based pointer tracking
- **Good animation foundation:** Custom easing curves, spring physics, staggered reveals — technically solid

### Remediation Priority

1. **Immediate:** Remove `user-scalable=no`, add `prefers-reduced-motion`, add ARIA to breathing components, add `robots.txt`
2. **Short-term (design overhaul):** Build light-mode token set, strip glassmorphism/glow excess, normalize all colors to tokens, rebuild visual identity with distinctive typography and asymmetric layouts
3. **Medium-term:** Container queries, fluid typography, redesign technique cards with hierarchy, rethink stats away from hero metric pattern
4. **Long-term:** Full WCAG AA audit post-overhaul, evaluate Clerk cookies, consider body font replacement

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

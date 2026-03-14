# BreathFlow (anthonyl.im)

## Design Context

### Users
Primary user is the developer themselves, along with wellness enthusiasts and people seeking anxiety/stress relief. Users open BreathFlow when they need to decompress, build a daily breathing habit, or access structured breathwork techniques backed by science. The context is often evening wind-down, pre-performance calm, or mid-day stress breaks — moments that demand a UI that feels immediately calming upon launch.

### Brand Personality
**Calm, Scientific, Premium.** Like a high-end wellness lab — trustworthy, refined, and evidence-based. The interface should feel like a precision instrument for the body, not a toy. Gamification (XP, levels, achievements) exists to sustain habit, not to entertain — it's motivation architecture, not playfulness.

### Aesthetic Direction
- **Visual tone:** Dark-first, immersive, atmospheric. Deep space navy (#050816) as the canvas, with indigo (#6366F1) as the single defining accent color.
- **References:** The approachability and wellness credibility of Calm/Headspace, combined with the obsessive craft and minimal UI of Arc/Linear. The result should feel more technical and refined than mainstream wellness apps, but warmer and more human than pure developer tools.
- **Anti-references:** Avoid generic "SaaS purple" aesthetics. Avoid overly illustrated or cartoon-like wellness imagery. Avoid cluttered dashboards — every element should earn its space.
- **Theme:** Dark mode is the primary (and currently only) experience. Glassmorphism with layered depth creates the sense of looking into a calm, deep space.

### Design Principles

1. **Serenity first.** Every design decision should reduce visual noise. If an element doesn't contribute to calm or clarity, remove it. White space is a feature.

2. **Scientific credibility.** Typography, data visualization, and content should convey authority. The app teaches real breathwork protocols — the design must feel trustworthy enough to match.

3. **Depth through restraint.** Use the indigo palette's full range (indigo-800 through indigo-300) to create depth and hierarchy, but never more than one vivid moment per viewport. One accent, many neutrals.

4. **Motion with purpose.** Animations serve the breathing experience (orb expansion, phase transitions) or guide attention (staggered reveals, spring easing). Never decorative-only motion.

5. **Craft over convention.** Prefer custom, considered solutions over generic component library defaults. Spacing, typography weight contrast, and surface hierarchy should feel intentionally designed, not assembled.

### Design Tokens (Quick Reference)

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#050816` | Page canvas |
| Surface | `rgba(15, 18, 40, 0.75)` | Cards, panels (glass) |
| Surface border | `rgba(255, 255, 255, 0.06)` | Subtle glass edges |
| Text primary | `#e8eaf0` | Body text |
| Text muted | `rgba(200, 210, 230, 0.5)` | Secondary/hint text |
| Accent | `#6366F1` | Primary interactive color |
| Accent bright | `#818CF8` | Hover, highlights |
| Accent subtle | `#4F46E5` | Depth, pressed states |
| Destructive | `#EF4444` | Errors, delete actions |
| Body font | DM Sans | All UI text |
| Display font | Anybody | Logo, brand headings |
| Border radius | `0.75rem` | Standard rounding |
| Spring easing | `cubic-bezier(0.16, 1, 0.3, 1)` | Smooth motion default |

### Tech Stack
- React 19 + TypeScript + Vite 8
- Tailwind CSS 4.2 + shadcn/ui (Radix primitives)
- Zustand (state), Motion (animation), Lucide (icons)
- Clerk (auth), Supabase (backend), PostHog (analytics)

---

## Design Audit (March 2025)

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
3. Add the screenshots to the PR description body

If the Chrome MCP is unavailable or the dev server cannot start (e.g., Node.js version incompatibility), note this in the PR description and skip screenshots. Do not block PR creation on screenshot availability.

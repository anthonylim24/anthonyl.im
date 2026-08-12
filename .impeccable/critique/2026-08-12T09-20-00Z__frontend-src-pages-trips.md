---
score: 34
maxScore: 40
auditScore: 18
auditMax: 20
p0: 0
p1: 0
register: product
target: frontend/src/pages/Trips
timestamp: 2026-08-12T09-20-00Z
slug: frontend-src-pages-trips
previous: 2026-08-12T05-14-52Z
---
# Critique — Trips app (`frontend/src/pages/Trips`), post-implementation

Re-score after WS1–WS9 of `docs/plans/trips-ui-redesign.md`. Reviewed live (dev-bearer bypass, freshly reseeded `korea-2026` trip), light + dark, 1440×980 + 390px, 24 screenshots, plus headless-Chrome measurement of tap targets, 390px overflow, keyboard traversal, reduced motion, and render counts.

## Scores

| | Before | After |
|---|---|---|
| Nielsen heuristics | 24/40 | **34/40** |
| Technical audit | 13/20 | **18/20** |
| P0 issues | 4 | **0** |
| P1 issues | 9 | **0** |

| Heuristic | Before | After |
|---|---|---|
| Visibility of system status | 3 | 4 |
| Match system / real world | 3 | 4 |
| User control and freedom | 2 | 4 |
| Consistency and standards | 2 | 4 |
| Error prevention | 3 | 3 |
| Recognition rather than recall | 2 | 4 |
| Flexibility and efficiency | 2 | 3 |
| Aesthetic and minimalist design | 3 | 4 |
| Error recovery | 2 | 3 |
| Help and documentation | 2 | 1 |

| Audit dimension | Before | After |
|---|---|---|
| Accessibility | 3 | 4 |
| Performance | 3 | 4 |
| Responsive design | 2 | 4 |
| Theming | 2 | 3 |
| Anti-patterns | 3 | 3 |

## P0 resolution

1. Hero title — the `ch` cap moved onto the clamp-sized span; long names wrap at word boundaries.
2. Hero bloom — `<main>` unconstrained, pages own their gutters; the bloom bleeds to the viewport edge at every width.
3. Editor accent — one `ACCENT` record over CSS variables; a rose trip stays rose from index through editor.
4. Mobile day navigation — a sticky snap chip rail sharing one scroll-spy with the desktop rail.

## What still holds the remaining points

- **Help and documentation dropped to 1** and is now the weakest dimension: WS4's copy pass removed explanatory prose (correctly, it was restating the product), but nothing replaced it for genuinely non-obvious mechanics — what "Enhance" will change before you run it, what the confidence levels mean, what sharing with all signed-in users implies. Empty states carry the load alone.
- **Error prevention (3)**: destructive actions are now recoverable rather than prevented. Trip delete still has no undo, only a confirm; item delete has the six-second window.
- **Flexibility and efficiency (3)**: no keyboard shortcuts, no multi-select on items, no drag-reorder (arrange is button-based).
- **Theming (3)**: `--radius` was zero inside `.trips` until WS9 set it, which suggests token coverage is still assumed rather than asserted; nothing tests that the five accents each resolve.
- **Anti-patterns (3)**: unchanged. The dossier language is genuinely distinctive, but the editor is a conventional form-and-list surface — appropriate to its job, not remarkable.

## Verified, not asserted

- Reduced motion: 0 animating transforms, opacities, or CSS animations on all five pages, measured in both motion modes so the probe proves it can see motion before reporting none.
- Entry choreography: 247–352ms per page, ceiling 370ms, clamped so it cannot grow with content.
- 390px: 0 document overflow on every page, including a stress trip with 40-character unbroken hangul; 109 overflowing inputs all ellipsize.
- Keyboard: create → edit → delete-with-undo → enhance-apply completes with no focus traps and no focus lost to `<body>`.
- Re-render: one keystroke went from 179 rows to 0 (day title) or 1 (item title).
- Detector: `npx impeccable detect` clean. ESLint clean (was 4 `react-hooks/static-components` errors).

## Preserved

Dossier language, first-class dark mode, custom DateRangeField/TimezoneField, debounced autosave + save pill + beforeunload flush, reduced-motion discipline, the `placesUrl` Map Mode contract.

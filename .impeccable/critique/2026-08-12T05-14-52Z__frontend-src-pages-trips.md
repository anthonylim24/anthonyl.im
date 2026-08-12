---
score: 24
maxScore: 40
auditScore: 13
auditMax: 20
p0: 4
p1: 9
register: product
target: frontend/src/pages/Trips
timestamp: 2026-08-12T05-14-52Z
slug: frontend-src-pages-trips
---
# Critique — Trips app (`frontend/src/pages/Trips`)

Register: product. Reviewed live (dev-bearer bypass, seeded `korea-2026` trip, in-memory store), light + dark, desktop + 390px mobile, 20 screenshots, plus full code read of all 11 in-scope files and a deterministic detector run.

Full handoff plan: `docs/plans/trips-ui-redesign.md`.

## Scores

- Nielsen heuristics: **24/40** (Acceptable: significant improvements needed)
- Technical audit: **13/20** (Acceptable: significant work needed)

| Heuristic | Score |
|---|---|
| Visibility of system status | 3 |
| Match system / real world | 3 |
| User control and freedom | 2 |
| Consistency and standards | 2 |
| Error prevention | 3 |
| Recognition rather than recall | 2 |
| Flexibility and efficiency | 2 |
| Aesthetic and minimalist design | 3 |
| Error recovery | 2 |
| Help and documentation | 2 |

| Audit dimension | Score |
|---|---|
| Accessibility | 3 |
| Performance | 3 |
| Responsive design | 2 |
| Theming | 2 |
| Anti-patterns | 3 |

## P0 issues

1. Hero title wraps one word per line (`TripOverview.tsx:137`): `max-w-[18ch]` computed against 16px base, not the clamp() display size.
2. Hero bloom has a hard rectangular edge at >1152px: `-mx-4` breakout inside a `max-w-6xl` main.
3. Editor hardcodes amber accent, ignoring the trip's chosen accent — the product changes personality between overview and editor.
4. Mobile editor has no day navigation at all (rail is `hidden lg:block`, 12 days of scrolling).

## P1 issues

1. Item delete is instant, no confirm/undo.
2. Error recovery via `window.alert` (`TripsIndex.tsx:103`) and `window.location.reload()` (`TripOverview.tsx:64`, `TripDayPage.tsx:91`).
3. Dead `sr-only` cancel button (`TripsIndex.tsx:292-301`).
4. Two component vocabularies: `ui.ts` rounded-xl amber-800 vs editor-local rounded-full amber-700.
5. Emoji icon system (`reservationTypeIcon`, `placeCategoryIcon`) clashing with Lucide everywhere else.
6. Six-hue suggestion badge rainbow (`SUGGESTION_BADGE`) + violet "AI" pill.
7. Unlabeled timeline dot semantics (filled = has coordinates; unguessable).
8. Editor re-renders full 12-day tree per keystroke (no memoized rows).
9. Duplicate status in overview hero; day-title input truncates silently; `aria-pressed` misuse on calendar days; editor icon buttons ~30px.

## Detector

`npx impeccable detect` (v3.5.0 via npx): 6 `gray-on-color` warnings; 2 true positives (`TripDetail.tsx:1396`, `TripsIndex.tsx:269` — stone-400 resting text over red-50 hover), 4 false positives (light/dark class pairs).

## Preserve

Dossier language (Cormorant display + Fragment Mono eyebrows + hairline rules + numbered sections), first-class dark mode, custom DateRangeField/TimezoneField, debounced autosave + save pill + beforeunload flush, thorough reduced-motion discipline.

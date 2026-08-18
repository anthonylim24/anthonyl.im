---
target: frontend/src/pages/Trips
total_score: 22
p0_count: 1
p1_count: 2
maxScore: 40
timestamp: 2026-08-18T06-53-00Z
slug: frontend-src-pages-trips
---
# Critique — Trips (`frontend/src/pages/Trips`)

Method: dual-agent (A: bc-c34216c8-f360-50c7-a0f9-4825cd1b5ca1 · B: bc-cd664a38-6a03-5f8b-aba7-672d65cb8836)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Saves and skeletons are solid; hover-only delete and IANA clock hide traveler state |
| 2 | Match System / Real World | 1 | Speaks Linear, not travel (Inbox, Workspace, COMPLETED, Enhance) |
| 3 | User Control and Freedom | 3 | Cancel, unmount, undo exist; trip delete has no undo after confirm |
| 4 | Consistency and Standards | 2 | Zinc is consistent; create is a form column, other pages are a Notion sheet |
| 5 | Error Prevention | 3 | Delete confirm and enhance review; timezone defaults to device IANA |
| 6 | Recognition Rather Than Recall | 2 | Tonight's booking is not first-class; Enhance / Generate / ingest are unnamed machines |
| 7 | Flexibility and Efficiency | 2 | No jump-to-today or reservation filter; 192 stops is one scroll |
| 8 | Aesthetic and Minimalist Design | 1 | Sparse Inter-on-zinc CRUD; the chat FAB is the only vivid moment |
| 9 | Error Recovery | 3 | Clear retries; raw `({message})` still leaks |
| 10 | Help and Documentation | 2 | Create hints exist; Inbox / Map Mode / Enhance are undefined on first sight |
| **Total** | | **22/40** | **Acceptable** |

## Design Specificity Verdict

**Fails. Category-interchangeable second-order clone.**

**LLM assessment**: First-order travel parchment/rose was avoided. Second-order (not-Korea → Linear/Notion zinc) is the product. Comments name the clone: Linear rail, Notion sheet, Airbnb date cells. An issue tracker could reuse this unchanged.

**Deterministic scan**: `detect.mjs --json frontend/src/pages/Trips` exit 0, 0 findings across 71 files. The detector is clean because the slop is structural (zinc workspace grammar), not a banned CSS tell.

**Visual overlays**: skipped; no mutable injection surface.

## Overall Impression

Operate hygiene is grown-up. Character is absent. korea-2026, the only trip that matters, reads like a closed ticket.

## What's Working

1. Living-document IA (`/trips/:id`, day pages, Map Mode unmount) is right.
2. Delete confirm, enhance-before-apply, 44px targets, hangul wrap, reduced motion.
3. Now / Upcoming / Past and Day N of M are the one traveler-native idea.

## Priority Issues

- **[P0] Second-order Linear/Notion zinc clone is the brand.** Replace the visual world. Keep the IA. Do not revert to Korea parchment.
- **[P1] Living document is an editor dump.** Open on what is true now (next reservation, today).
- **[P1] Evening lookup fails the job.** The reservation must be the hero of the day.
- **[P2] Voice is ops software.** Inbox / Workspace / COMPLETED / IANA.
- **[P2] New trip is a CRM record.** Creating should feel like choosing a place and a when.

## Persona Red Flags

**Alex**: Rail with two links, no jump-to-day, 192-stop scroll.
**Jordan**: Five names for one list; title is already an input; Enhance is unlabeled.
**Evening in-trip lookup**: Booking is below a property table; dark theme is an IDE.

## Minor Observations

- `SERIF` and `MONO` both resolve to Inter.
- Em dash in empty times.
- Create footer uses backdrop blur.
- Bloom CSS remains, forced transparent.

## Questions to Consider

- If you deleted the word trip from every label, would anyone still know this is for travel?
- What is the third material, since Korea dossier is banned and zinc already failed?

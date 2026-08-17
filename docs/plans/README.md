# Plans and design history

This folder keeps historical implementation plans in place so existing links stay stable. **Do not execute these plans.** Current behavior lives in [`CLAUDE.md`](../../CLAUDE.md), [`PRODUCT.md`](../../PRODUCT.md), and the live code.

## Living docs (not plans)

| Doc | Role |
|-----|------|
| [`CLAUDE.md`](../../CLAUDE.md) | Engineering, routing, stack |
| [`PRODUCT.md`](../../PRODUCT.md) | Design context |
| [`docs/ci-cd.md`](../ci-cd.md) | CI/CD agent memory |
| [`docs/pr-previews.md`](../pr-previews.md) | Remote PR preview URLs + agent screenshot flow |
| [`docs/codex-cloud.md`](../codex-cloud.md) | Codex / Claude Code cloud setup |
| [`.agents/skills/README.md`](../../.agents/skills/README.md) | Agent skills index |

## Historical plans (`docs/plans/`)

| File | Status |
|------|--------|
| [`trips-ui-redesign.md`](trips-ui-redesign.md) | COMPLETED 2026-08-12 (WS1–WS9). Editor split into `frontend/src/pages/Trips/editor/`. Also see TripChat, TripIngest. |
| [`2026-02-22-oauth-profiles-plan.md`](2026-02-22-oauth-profiles-plan.md) | COMPLETED (`useCloudSync` + `CloudSync`) |
| [`2026-02-22-oauth-profiles-design.md`](2026-02-22-oauth-profiles-design.md) | COMPLETED (`useCloudSync` + `CloudSync`) |
| [`2026-02-05-breathwork-redesign.md`](2026-02-05-breathwork-redesign.md) | SUPERSEDED by `frontend/src/breathflow/` rebuild |
| [`2026-03-16-sufi-math-redesign.md`](2026-03-16-sufi-math-redesign.md) | SUPERSEDED by `frontend/src/breathflow/` rebuild |
| [`2026-03-14-mobile-adaptation.md`](2026-03-14-mobile-adaptation.md) | SUPERSEDED by `frontend/src/breathflow/` rebuild |
| [`2026-02-22-kirby-easter-egg.md`](2026-02-22-kirby-easter-egg.md) | CANCELLED. Never implemented. No `KirbyCharacter.tsx`. |
| [`2026-02-22-kirby-easter-egg-design.md`](2026-02-22-kirby-easter-egg-design.md) | CANCELLED. Never implemented. No `KirbyCharacter.tsx`. |

## Archived design history (`docs/superpowers/`)

[`docs/superpowers/`](../superpowers/) is archived design history (plans + specs). Same rule: do not execute.

| File | Status |
|------|--------|
| [`plans/2026-06-11-multi-trip-travel-planner.md`](../superpowers/plans/2026-06-11-multi-trip-travel-planner.md) | COMPLETED. Live at `server/src/trips/` + `frontend/src/pages/Trips/`. |
| [`specs/2026-05-18-instagram-place-extractor-design.md`](../superpowers/specs/2026-05-18-instagram-place-extractor-design.md) | IMPLEMENTED. Pipeline shipped at `server/src/igPlaces/` (Bright Data + Gemini, not Apify). |
| [`plans/2026-05-18-instagram-place-extractor.md`](../superpowers/plans/2026-05-18-instagram-place-extractor.md) | IMPLEMENTED (same note). |

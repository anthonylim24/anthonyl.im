# CI/CD system (agent memory)

> Canonical reference for future agents touching workflows, gates, deploy, or Dependabot.
> Last upgraded: 2026-08-12 (remote PR previews + text `bun.lock` + atomic deploy).

## Architecture (one glance)

```
PR → .github/workflows/pr.yml
        ├─ pr-server-tests          bun test --bail server/src  (incl. appLoad smoke)
        ├─ pr-frontend-typecheck    tsc -b --noEmit
        ├─ pr-frontend-build        tsc -b && vite build (stub .env)
        ├─ pr-frontend-tests        vitest run
        ├─ pr-cloud-setup           .codex/setup.sh → check.sh + invariant lints
        └─ pr-gate (aggregate)      ← ONLY context required by branch protection

PR → .github/workflows/preview.yml   (NOT a merge gate)
        ├─ vite build with VITE_BASE=/preview/pr/<n>/ (FRONTEND_ENV, SW off)
        ├─ stamp preview.json + HTML chrome
        ├─ SCP tarball → droplet ~/previews/<n>/
        └─ sticky PR comment + GitHub deployment `pr-preview-<n>`
           live URL: https://anthonyl.im/preview/pr/<n>/

merge to main → .github/workflows/deploy.yml
        ├─ server tests (frozen lockfile)
        ├─ frontend build (FRONTEND_ENV secret)
        ├─ SSH: stage ~/anthonyl.im.next (shallow clone + bun install)
        ├─ SCP dist → anthonyl.im.next/frontend/dist
        ├─ SSH: atomic swap next→live, PM2 restart, rollback on failure
        └─ smoke: /health JSON + SPA shells (/ /chatbot /breathwork /korea /trips)
```

Branch protection config: `.github/branch-protection.json` (`contexts: ["pr-gate"]`, `enforce_admins: true`).

## Shared setup action

`.github/actions/setup-ci` — Bun install + caches for:

- `~/.bun/install/cache` (package tarballs)
- `node_modules` / `frontend/node_modules` (keyed on the matching `bun.lock`)

Inputs: `install-root`, `install-frontend` (`"true"` / `"false"`).

Always use `--frozen-lockfile` in CI. Never `bun install` without it on the runner or droplet.

## Lockfiles (critical)

| Format | Status |
|--------|--------|
| `bun.lock` (text) | **Required.** Committed at repo root and `frontend/`. |
| `bun.lockb` (binary) | **Forbidden.** Dependabot cannot update it; caused mass CI reds. |

`bunfig.toml` + `frontend/bunfig.toml` set `install.saveTextLockfile = true` so local installs keep the text format.

Dependabot uses `package-ecosystem: "bun"` (not `npm`) for `/` and `/frontend`.

## Local / cloud verify gate

| Entry | What it runs |
|-------|----------------|
| `.codex/check.sh` / `bun run codex:check` | ensure deps → TS pre-flight → server tests → frontend typecheck |
| `.claude/cloud/verify.sh` | exec wrapper around `.codex/check.sh` |

This is the **minimum** agents must pass before merging. The full GitHub `pr-gate` is stricter (also build + vitest + cloud setup smoke). After frontend edits also run:

```bash
cd frontend && bun run build && bun run test:run
```

## Deploy invariants (do not break)

1. **Never build the frontend on the droplet** — 1 GB RAM OOMs Vite. CI builds; SCP ships `frontend/dist`.
2. **Atomic swap** — prepare `~/anthonyl.im.next`, verify `frontend/dist/index.html`, then `mv live→prev`, `mv next→live`, PM2 restart. On PM2 failure, roll back `prev→live`.
3. **PATH for PM2 children** — export `$HOME/.bun/bin:/usr/local/bin:...` and `pm2 start --update-env` so yt-dlp / ffmpeg / dev-browser resolve.
4. **Smoke is mandatory** — `/health` must return `"status":"ok"`; SPA routes must contain `<div id="root">`.
5. **No `VITE_DEV_BEARER` in `FRONTEND_ENV`** — production must not bypass Clerk.
6. **PR previews are not a merge gate** — `.github/workflows/preview.yml` must stay out of `pr-gate`. Same-repo only; never bake `VITE_DEV_BEARER` into a preview. Details: [`docs/pr-previews.md`](pr-previews.md).

Secrets: `SSH_HOST`, `SSH_USERNAME`, `SSH_KEY`, `FRONTEND_ENV`. Droplet runtime secrets live in `~/.env` (copied into the staged tree each deploy). Details: `deploy/README.md`.

## Known failure modes (and where they are caught)

| Failure | Catch |
|---------|--------|
| Missing/renamed server export (PM2 crash) | `server/src/appLoad.test.ts` via `bun test server/src` |
| Frontend types green in vite/esbuild but red in `tsc` | `pr-frontend-typecheck` + `bun run typecheck` |
| Cloud agent builds before `frontend/node_modules` exists → TS 5.x fallback | `.codex/lib.sh` `verify_frontend_typescript` |
| Dependabot bumps `package.json` without lockfile | Fixed by `package-ecosystem: bun` + text `bun.lock` |
| PM2 online but app dead on first request | Post-deploy `/health` + SPA smoke |
| Stale service worker after deploy | `sw.js` no-cache headers in `server/app.ts`; bump `CACHE_VERSION` on SW behavior changes |
| Preview HTML served as production SPA | Preview router is mounted **before** the SPA fallback; missing trees 404 |
| Production SW caching `/preview/` | `sw.js` bypasses `/preview/`; bump `CACHE_VERSION` when changing that |
| `oven-sh/setup-bun` 503 / socket hang up | `.github/actions/setup-ci` retries Bun setup twice with pauses |

## What is intentionally NOT in the cloud verify gate

- ESLint (`bun run lint`) — still has debt; not a merge blocker via check.sh
- Playwright e2e — opt-in via `.claude/cloud/e2e.sh`
- Remote PR preview publish — droplet SSH; tracked in `preview.yml`, not check.sh

Frontend **unit** tests ARE in GitHub `pr-gate` (`pr-frontend-tests`). Older docs saying they are excluded are stale.

## Editing checklist

When changing CI/CD:

1. Keep `pr-gate` as the sole required status check name (or update `.github/branch-protection.json` + re-apply via `gh api`).
2. Update this file + the CI/CD sections in `AGENTS.md` / `CLAUDE.md` + `deploy/README.md`.
3. Prefer extending `.github/actions/setup-ci` over copy-pasting cache/install steps.
4. Never remove `appLoad.test.ts` or `verify_frontend_typescript` without a replacement.
5. Bump nothing on the droplet that assumes apt works — tool installs must stay non-fatal with static-binary fallbacks.
6. Keep PR previews out of `pr-gate`. Update `docs/pr-previews.md` when changing preview URLs or trust rules.

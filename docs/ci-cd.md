# CI/CD system (agent memory)

> Canonical reference for future agents touching workflows, gates, deploy, or Dependabot.
> Last upgraded: 2026-08-12 (remote PR previews + pr-gate registers immediately so merge UIs wait).

## Architecture (one glance)

```
PR → .github/workflows/pr.yml
        ├─ pr-server-tests          bun run typecheck:server, then bun test --parallel --bail server/src  (incl. appLoad smoke)
        ├─ pr-frontend-typecheck    tsc -b --noEmit
        ├─ pr-frontend-lint         eslint . (zero errors; warnings allowed)
        ├─ pr-frontend-build        tsc -b && vite build (stub .env)
        ├─ pr-frontend-tests        vitest run
        ├─ pr-cloud-setup           .codex/setup.sh → check.sh + invariant lints
        └─ pr-gate (aggregate)      ← starts immediately; ONLY required context

PR → .github/workflows/preview.yml   (NOT a merge gate)
        ├─ vite build with VITE_BASE + VITE_API_BASE=/preview/pr/<n>/ (production Clerk + Supabase values, SW off)
        ├─ fail if the bundle holds a pk_test_ key or lacks the production one
        ├─ stamp preview.json + HTML chrome
        ├─ SCP frontend + server/src tarballs → droplet ~/previews/<n>/
        ├─ optional loopback preview API (cap 1) proxied at /preview/pr/<n>/api/*
        └─ sticky PR comment + GitHub deployment `pr-preview-<n>`
           live URL: https://anthonyl.im/preview/pr/<n>/

merge to main → .github/workflows/deploy.yml
        ├─ server tests (frozen lockfile)
        ├─ frontend build (FRONTEND_ENV + deploy/write-frontend-env.sh)
        ├─ SSH: stage ~/anthonyl.im.next (shallow clone + bun install)
        ├─ SCP dist → anthonyl.im.next/frontend/dist
        ├─ SSH: atomic swap next→live, install unit, systemctl restart, rollback on failure
        └─ smoke: /health JSON + SPA shells (/ /lab /breathwork /trips /trips/korea-2026)
```

`pr.yml` also triggers on `merge_group` (merge queue).

`pr-cloud-setup` runs both `.codex/cloud-setup.test.sh` and `.claude/cloud/cloud-setup.test.sh`. It restores only the Bun package tarball cache (restore-only, same key `setup-ci` saves); `node_modules` stays uncached so `.codex/setup.sh` still links both trees from scratch.

Branch protection config: `.github/branch-protection.json` (`contexts` + GitHub Actions `checks`: `pr-gate`, `enforce_admins: true`).

`pr-gate` **must not** use `needs:`. A `needs:` aggregate is not registered as a check-run until every sibling finishes, so Cursor / `gh pr checks` see a green rollup and squash-merge fails with "required status checks have not completed yet". The job polls siblings instead, and also posts a commit status on the PR head SHA so the combined Statuses API is not stuck `pending` with zero contexts.

## Shared setup action

`.github/actions/setup-ci` — Bun install + caches for:

- `~/.bun/install/cache` (package tarballs)
- `node_modules` / `frontend/node_modules` (keyed on the matching `bun.lock`)

Inputs: `install-root`, `install-frontend` (`"true"` / `"false"`).

Always use `--frozen-lockfile` in CI. Never `bun install` without it on the runner or droplet.

## Workflow hygiene

- **Every `uses:` is pinned to a full commit SHA** with the release as a trailing comment (`actions/checkout@<sha> # v7.0.1`). The appleboy SSH/SCP actions receive the droplet key, so a moved tag must not change what runs. Dependabot's `github-actions` entry bumps the SHA and the comment together; pin new actions the same way (`gh api repos/<owner>/<repo>/git/ref/tags/<tag>`, then `git/tags/<sha>` for an annotated tag).
- **No `${{ secrets.* }}` / `${{ vars.* }}` inside `run:` text.** Pass them through the step's `env:` and quote the shell variable. Give them names without the `VITE_` prefix in a step that runs Vite: Vite lets process env override `.env`, so an empty `VITE_*` would blank the value from `FRONTEND_ENV`.
- **Dependabot auto-merge** keys on the PR author (`pull_request.user.login == 'dependabot[bot]'`) and a same-repo head, not `github.actor`, and only approves when `fetch-metadata` reports a non-empty, non-major `update-type`.

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
| `.codex/check.sh` / `bun run codex:check` | ensure deps → TS pre-flight → server typecheck → server tests → frontend typecheck |
| `.claude/cloud/verify.sh` | exec wrapper around `.codex/check.sh` |

This is the **minimum** agents must pass before merging. The full GitHub `pr-gate` is stricter (also lint + build + vitest + cloud setup smoke). After frontend edits also run:

```bash
cd frontend && bun run lint && bun run build && bun run test:run
```

**Server typecheck.** `tsconfig.server.json` (root) extends `tsconfig.json`, adds `types: ["bun"]`, includes `server/**/*.ts` + `index.ts` and excludes tests. Bun runs TypeScript without checking it, so before this a call to a removed variable shipped (`dayPlacesCache` in `igPlaces/wire.ts`). Run it with `bun run typecheck:server`.

**Lint.** `pr-frontend-lint` fails on any ESLint error (warnings pass). Fix the code; where a rule is genuinely wrong for one spot, a single-line `// eslint-disable-next-line <rule> -- <reason>`. No file- or config-wide disables.

## Deploy invariants (do not break)

1. **Never build the frontend on the droplet** — 1 GB RAM OOMs Vite. CI builds; SCP ships `frontend/dist`.
2. **Atomic swap** — prepare `~/anthonyl.im.next`, verify `frontend/dist/index.html`, then `mv live→prev`, `mv next→live`, `deploy/install-service.sh` from the new release, `systemctl restart anthonyl.im`. If `/health` does not come up, roll back `prev→live` (its unit too) and check that it answers.
3. **The server is a systemd unit** — `deploy/systemd/anthonyl.im.service` sets what PM2 used to take from the deploy's SSH session: `NODE_ENV=production` (which disables the dev-bearer bridge in `server/src/config.ts`), `HOME`, `LANG` and the `PATH` that finds yt-dlp and ffmpeg. `.env` still comes from Bun reading the release's copy of `~/.env` in its working directory; never switch that to `EnvironmentFile=`, which parses quotes and `$` differently. `Restart=always`, `MemoryMax=700M` (the whole unit: server, children, page cache), logs in journald. Unit changes ship with the deploy that carries them.
4. **Smoke is mandatory** — `/health` must return `"status":"ok"`; SPA routes must contain `<div id="root">`.
5. **No `VITE_DEV_BEARER` in `FRONTEND_ENV`** — production must not bypass Clerk.
6. **PR previews are not a merge gate** — `.github/workflows/preview.yml` must stay out of `pr-gate`. Same-repo only; never bake `VITE_DEV_BEARER` into a preview. Agents screenshot Clerk-gated preview routes via `bun scripts/clerk-agent-login.ts` (applies a Clerk Agent Task + Testing Token in Chrome; do not paste tickets; helper re-execs from `origin/main`; Cursor cloud `gh` tokens are installation tokens, not push collaborators). Details: [`docs/pr-previews.md`](pr-previews.md).

**Disk preflight.** The stage step prints free space on the droplet, clears only re-creatable caches (the previous `~/anthonyl.im.next`, Bun's install cache, day-old temp archives) when under 800 MB, and fails early with a `du` breakdown when under 300 MB. A full disk otherwise shows up as `No space left on device` in the clone or an scp `exit status 1`. It never deletes logs or live data: if the breakdown points at old PM2 logs (`~/.pm2/logs`, unused since the move to systemd) or worker files, clear those on the droplet by hand. journald caps its own size (`/etc/systemd/journald.conf.d/size.conf`, 100 MB).

Secrets: `SSH_HOST`, `SSH_USERNAME`, `SSH_KEY`, `FRONTEND_ENV`, `VITE_CLERK_PUBLISHABLE_KEY` (production Clerk key; `deploy/write-frontend-env.sh` drops any copy in `FRONTEND_ENV` and appends this one, with the `VITE_CLERK_PROXY_URL` and `VITE_SUPABASE_ANON_KEY` variables. Deploys and previews both use it: the preview API sidecar verifies tokens with the production `CLERK_SECRET_KEY`, so a preview on another Clerk instance cannot sign in). Droplet runtime secrets live in `~/.env` (copied into the staged tree each deploy). Details: `deploy/README.md`.

## Known failure modes (and where they are caught)

| Failure | Catch |
|---------|--------|
| Missing/renamed server export (crash at start-up) | `server/src/appLoad.test.ts` via `bun test server/src` |
| Frontend types green in vite/esbuild but red in `tsc` | `pr-frontend-typecheck` + `bun run typecheck` |
| Server code that Bun runs but `tsc` rejects (a removed name, a wrong call) | `bun run typecheck:server` in `pr-server-tests` and `.codex/check.sh` |
| React hook misuse (`set-state-in-effect`, refs read in render) | `pr-frontend-lint` |
| Cloud agent builds before `frontend/node_modules` exists → TS 5.x fallback | `.codex/lib.sh` `verify_frontend_typescript` |
| Dependabot bumps `package.json` without lockfile | Fixed by `package-ecosystem: bun` + text `bun.lock` |
| Unit active but app dead on first request | Post-deploy `/health` + SPA smoke |
| Stale service worker after deploy | `sw.js` no-cache headers in `server/app.ts`; bump `CACHE_VERSION` on SW behavior changes |
| Preview HTML served as production SPA | Preview router is mounted **before** the SPA fallback; missing trees 404 |
| Stale `api.pid` naming an unrelated process (root `kill`) | `publish-preview.sh` and the cleanup job only signal a pid whose `/proc/<pid>/cmdline` contains `previewApi`; otherwise they drop the pid file |
| Sidecar never healthy, proxy routes to a dead port | `publish-preview.sh` stops it and removes `api.json`, so `/api/*` answers 404 `preview_api_not_published` |
| Preview API OOM on 1 GB droplet | One sidecar (`PREVIEW_API_MAX=1`), `bun --smol`, IG worker off, loopback only |
| Preview publish stuck on `could not acquire preview lock` | Sidecar must not inherit flock (`9>&-`); lock released before API boot; lock file is `publish.lock` |
| Production SW caching `/preview/` | `sw.js` bypasses `/preview/`; bump `CACHE_VERSION` when changing that |
| `oven-sh/setup-bun` 503 / socket hang up | `.github/actions/setup-ci` retries Bun setup twice with pauses |
| Merge UI green but squash blocked ("status checks have not completed") | `pr-gate` must start with no `needs:` so the required check is in_progress immediately; also posts a `pr-gate` commit status on the PR head SHA |

## What is intentionally NOT in the cloud verify gate

- ESLint (`bun run lint`) — kept out of check.sh for speed; it is a merge blocker through `pr-frontend-lint` in `pr-gate`
- Playwright e2e — opt-in via `.claude/cloud/e2e.sh`
- Remote PR preview publish — droplet SSH; tracked in `preview.yml`, not check.sh

Frontend **unit** tests ARE in GitHub `pr-gate` (`pr-frontend-tests`). Older docs saying they are excluded are stale.

## Editing checklist

When changing CI/CD:

1. Keep `pr-gate` as the sole required status check name (or update `.github/branch-protection.json` + re-apply via `gh api`). Do not give `pr-gate` a `needs:` list.
2. Update this file + the CI/CD sections in `AGENTS.md` + `deploy/README.md`.
3. Prefer extending `.github/actions/setup-ci` over copy-pasting cache/install steps.
4. Never remove `appLoad.test.ts` or `verify_frontend_typescript` without a replacement.
5. Bump nothing on the droplet that assumes apt works — tool installs must stay non-fatal with static-binary fallbacks.
6. Keep PR previews out of `pr-gate`. Update `docs/pr-previews.md` when changing preview URLs or trust rules.

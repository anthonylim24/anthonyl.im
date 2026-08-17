# Remote PR previews

Every same-repo pull request gets a **public frontend preview** so a phone +
browser (or a cloud agent) can review UI without merging and without running
a laptop dev server.

```
https://anthonyl.im/preview/pr/<n>/
```

| App | Path |
| --- | --- |
| Chatbot | `/preview/pr/<n>/` |
| BreathFlow | `/preview/pr/<n>/breathwork` |
| Korea | `/preview/pr/<n>/trips/korea-2026` (`/korea` redirects) |
| Trips | `/preview/pr/<n>/trips` |

The sticky PR comment (`<!-- pr-preview -->`) and the GitHub deployment
`pr-preview-<n>` both point at the same URL.

## What it is (and is not)

- **Is:** the PR's Vite production build, with `base=/preview/pr/<n>/`,
  service worker **off**, Clerk/Supabase keys from `FRONTEND_ENV`.
- **Is:** a loopback copy of the PR's `/api/*` server (IG worker off),
  proxied by production Hono at `/preview/pr/<n>/api/*`. The preview
  frontend sets `VITE_API_BASE=/preview/pr/<n>` and calls that mount
  **only** — it does not fall back to production `/api` (a same-origin
  Clerk cookie must not reach live data from PR-controlled JS).
- **Is not** a merge gate. `.github/workflows/preview.yml` is independent of
  `pr-gate`. A droplet blip must not block merge.
- **Is not** a second public port. The sidecar binds `127.0.0.1` only.
  Cap is **1** live preview API (`PREVIEW_API_MAX`) so the 1 GB droplet
  does not run a stack of Hono processes. Older PRs keep their frontend;
  API calls 404 until that PR's sidecar is the live one.

Korea and Trips still require a Clerk session on this origin. Previews
never bake `VITE_DEV_BEARER`. Agents mint a session for a **dedicated
screenshot identity** via
[Clerk Agent Tasks](https://clerk.com/docs/guides/development/testing/agent-tasks)
— see below. That user is not a personal production login. It can view
and edit the shared `korea-2026` seed trip (`sharedWithAllUsers`). Do
not sign in to production `/trips` or `/trips/korea-2026` for screenshots.

## Agent workflow (screenshots)

1. After opening/pushing the PR, wait for the preview:

   ```bash
   bun scripts/wait-for-preview.ts --pr <n> --sha <head-sha>
   ```

   Default timeout is **12 minutes** (preview CI includes a Vite production
   build). Override with `--timeout <seconds>` if needed.

   Or poll `GET https://anthonyl.im/preview/pr/<n>/preview.json` until
   `sha` matches (prefix match is OK).

2. For Clerk-gated preview routes, apply a screenshot-user session
   **before** screenshotting. One command signs Chrome into both
   `/trips` and `/trips/korea-2026` (same-origin cookies; `/korea` redirects):

   ```bash
   bun scripts/clerk-agent-login.ts --pr <n> --path /trips/korea-2026
   ```

   The helper mints a Clerk Agent Task + Testing Token and applies them
   in the running Chrome. **Do not paste a ticket URL** into Chrome MCP
   / Playwright — one-time JWTs get corrupted when retyped, and browsers
   without `__clerk_testing_token` hit Clerk bot detection.

   It prints the signed-in preview URL on success (never the ticket).
   Re-execs from a fetched `origin/main` worktree before sending
   `CLERK_SECRET_KEY` / `AGENT_LOGIN_SECRET` / `gh auth token`.
   Do not skip that (no `--skip-main-check`) on a PR worktree.
   Do not pass `--redirect https://anthonyl.im/trips` (production).

   Auth (first match):

   1. `CLERK_SECRET_KEY` + `CLERK_AGENT_USER_ID` / `_EMAIL`, or the
      helper's dedicated screenshot-user default → Clerk API directly.
   2. `AGENT_LOGIN_SECRET` → production `POST /api/agent/session`.
   3. `gh auth token` with **push/admin** *or* a GitHub App installation
      that includes `AGENT_GITHUB_REPO` (default `anthonylim24/anthonyl.im`).
      Cursor cloud `ghs_` tokens have no `permissions.push` and cannot
      `GET /user`; production accepts them when
      `GET /installation/repositories` lists this repo.

   `--api` / `AGENT_SESSION_API` is allowlisted to `anthonyl.im` and
   loopback so the bearer is not sent to an arbitrary origin.

   **Cursor Cloud:** `gh` tokens fail the old push-only check. Prefer
   path 1 (`CLERK_SECRET_KEY` is enough; the helper defaults the
   screenshot user). Path 3 works after this installation-token check
   is on production. Do not bake `VITE_DEV_BEARER` into previews.

3. Screenshot remaining public routes (`/`, `/breathwork`) with
   `?hidePreviewChrome=1` so the PR badge is not in the frame.

4. Upload images via `gh api` and link them from the PR body. Local file
   paths do not render in GitHub.

5. If the preview is not live yet (serving code not on production, droplet
   down, or this is a fork/Dependabot PR), fall back to a local
   `cd frontend && bun run dev` with `VITE_DEV_BEARER` (see
   `deploy/README.md`) and note that in the PR.

Index of published previews: `https://anthonyl.im/preview/`.

## How it is published

```
PR opened/sync
  → GitHub Actions (.github/workflows/preview.yml)
      ├─ bun install (root + frontend) via setup-ci
      ├─ FRONTEND_ENV → frontend/.env  (VITE_DEV_BEARER stripped)
      ├─ VITE_BASE=/preview/pr/<n>/  VITE_API_BASE=/preview/pr/<n>
      ├─ VITE_ENABLE_SERVICE_WORKER=false
      ├─ vite build on the runner (never on the 1 GB droplet)
      ├─ bun server/src/previewStamp.ts  → preview.json + HTML chrome
      ├─ tar dist + server/src → SCP → droplet
      └─ deploy/publish-preview.sh publish <n> <frontend.tgz> <api.tgz>
         atomic mv ~/previews/.staging/<n> → ~/previews/<n>
         bun --smol server/src/previewApi.ts on 127.0.0.1:41xx
         (lock released before the sidecar starts; bun must not inherit flock)
```

Production Hono (`server/src/preview.ts`) serves `~/previews/<n>/` at
`/preview/pr/<n>/` **before** the SPA fallback, so a missing preview is a
404, not production `index.html`. `/preview/pr/<n>/api/*` is reverse-proxied
to the sidecar when `api.json` is present (`X-Preview-API: 1`).

New npm dependencies in a PR are **not** installed on the droplet for the
sidecar — it uses production `~/anthonyl.im/node_modules`. A PR that adds
a server package will not preview that import until the package is on main.

On PR close the cleanup job deletes `~/previews/<n>/`. A prune pass also
drops trees older than 14 days and caps the droplet at 20 previews.

## Security / trust

Same-origin untrusted HTML can read production cookies. Mitigations:

- Same-repo PRs only (`head.repo.full_name == github.repository`)
- Dependabot skipped
- No `VITE_DEV_BEARER` in the preview bundle
- Preview JS never falls back to production `/api`
- Agent login uses a dedicated Clerk screenshot user — never a personal
  production session. That user can edit the shared `korea-2026` seed
  (`sharedWithAllUsers`); do not treat it as write-isolated.
- Login helper re-execs from `origin/main` before sending credentials.
  Do not run a PR-controlled copy with `--skip-main-check`.
- `X-Robots-Tag: noindex, nofollow` + `robots.txt` `Disallow: /preview/`
- Production service worker **bypasses** `/preview/` (and `CACHE_VERSION`
  was bumped when that bypass landed). Preview builds set
  `VITE_ENABLE_SERVICE_WORKER=false` but **do not unregister** the
  production worker — they share this origin.

Do not add fork-PR previews without moving them off `anthonyl.im`.

## Local / droplet knobs

| Knob | Default | Where |
| --- | --- | --- |
| `PREVIEW_ROOT` | `~/previews` | droplet `.env` (optional) |
| `SITE_URL` | `https://anthonyl.im` | droplet `.env` |
| `PREVIEW_MAX_AGE_DAYS` | `14` | `publish-preview.sh` |
| `PREVIEW_MAX_COUNT` | `20` | `publish-preview.sh` |
| `PREVIEW_API_MAX` | `1` | `publish-preview.sh` |
| `PROD_ROOT` | `~/anthonyl.im` | `publish-preview.sh` (node_modules) |
| `CLERK_AGENT_USER_ID` | unset (endpoint 404s unless `CLERK_AGENT_USER_EMAIL` is set) | droplet `.env` |
| `AGENT_LOGIN_SECRET` | unset (`gh` push/admin **or** installation token still works when `AGENT_GITHUB_REPO` is set; default `anthonylim24/anthonyl.im`) | droplet `.env` |

## Files

| Path | Role |
| --- | --- |
| `.github/workflows/preview.yml` | CI publish + cleanup |
| `deploy/publish-preview.sh` | atomic extract / remove / prune |
| `server/src/preview.ts` | path guard, stamp, Hono router, API proxy, wait helper |
| `server/src/previewApi.ts` | loopback API sidecar entry |
| `server/src/previewApiApp.ts` | API-only Hono app (no SPA, no IG worker) |
| `server/src/previewStamp.ts` | CLI used by CI after `vite build` |
| `scripts/wait-for-preview.ts` | agent poller |
| `scripts/clerk-agent-login.ts` | apply a Clerk screenshot-user session for `/trips` + `/trips/korea-2026` (do not paste tickets) |
| `server/src/routes/agentSession.ts` | `POST /api/agent/session` (secret, collaborator push/admin, or installation token for this repo) |
| `frontend/src/lib/routerBasename.ts` | React Router `basename` from Vite `base` |
| `frontend/src/lib/apiBase.ts` | `VITE_API_BASE` rewrite (no production `/api` fallback) |

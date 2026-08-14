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
| Korea | `/preview/pr/<n>/korea` |
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
screenshot identity** (no production trip data, no write access) via
[Clerk Agent Tasks](https://clerk.com/docs/guides/development/testing/agent-tasks)
— see below. Do not sign in to production `/korea` or `/trips` for
screenshots.

## Agent workflow (screenshots)

1. After opening/pushing the PR, wait for the preview:

   ```bash
   bun scripts/wait-for-preview.ts --pr <n> --sha <head-sha>
   ```

   Default timeout is **12 minutes** (preview CI includes a Vite production
   build). Override with `--timeout <seconds>` if needed.

   Or poll `GET https://anthonyl.im/preview/pr/<n>/preview.json` until
   `sha` matches (prefix match is OK).

2. For Clerk-gated preview routes, mint a one-time sign-in URL from a
   **trusted `origin/main` checkout** (not the PR worktree — the helper
   can send `CLERK_SECRET_KEY` / `AGENT_LOGIN_SECRET` / `gh auth token`)
   and open it in the agent browser **before** screenshotting. Use the
   matching path; `--path /korea` will not land on Trips:

   ```bash
   git fetch origin main
   # run from a main checkout / worktree, not this PR's tree
   bun scripts/clerk-agent-login.ts --pr <n> --path /korea
   bun scripts/clerk-agent-login.ts --pr <n> --path /trips
   ```

   The script prints a Clerk URL. Navigate Chrome MCP / Playwright there;
   Clerk sets a cookie for the **dedicated screenshot user** and redirects
   to `/preview/pr/<n>/korea` or `/trips` with `?hidePreviewChrome=1`.
   Do not pass `--redirect https://anthonyl.im/korea` (production).

   Auth is `CLERK_SECRET_KEY` + `CLERK_AGENT_USER_ID` or
   `CLERK_AGENT_USER_EMAIL` locally, or `AGENT_LOGIN_SECRET` /
   `gh auth token` (token path requires `AGENT_GITHUB_REPO`, default
   `anthonylim24/anthonyl.im`) against production `POST /api/agent/session`.
   `--api` / `AGENT_SESSION_API` is allowlisted to `anthonyl.im` and
   loopback so the bearer is not sent to an arbitrary origin.

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
- Agent login uses a dedicated Clerk screenshot user (empty / non-production
  data, no itinerary writes) — never a personal production session
- Login helper must run from `origin/main`, not PR-controlled code
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
| `AGENT_LOGIN_SECRET` | unset (`gh` collaborator token still works when `AGENT_GITHUB_REPO` is set; default `anthonylim24/anthonyl.im`) | droplet `.env` |

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
| `scripts/clerk-agent-login.ts` | mint a Clerk Agent Task URL for `/korea` + `/trips` screenshots |
| `server/src/routes/agentSession.ts` | `POST /api/agent/session` (secret or GitHub collaborator token) |
| `frontend/src/lib/routerBasename.ts` | React Router `basename` from Vite `base` |
| `frontend/src/lib/apiBase.ts` | `VITE_API_BASE` rewrite (no production `/api` fallback) |

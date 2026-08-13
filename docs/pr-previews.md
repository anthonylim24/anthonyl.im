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
- **Is not:** a copy of the PR's server. `/api/*` still hits **production**
  Hono. API-only PRs will not look different in the preview.
- **Is not** a merge gate. `.github/workflows/preview.yml` is independent of
  `pr-gate`. A droplet blip must not block merge.

Korea and Trips still require a **Clerk session** on `anthonyl.im` (same
origin, so a phone already signed in to production is enough). Previews
never bake `VITE_DEV_BEARER`. Agents mint a real session with
[Clerk Agent Tasks](https://clerk.com/docs/guides/development/testing/agent-tasks)
instead — see below.

## Agent workflow (screenshots)

1. After opening/pushing the PR, wait for the preview:

   ```bash
   bun scripts/wait-for-preview.ts --pr <n> --sha <head-sha>
   ```

   Default timeout is **12 minutes** (preview CI includes a Vite production
   build). Override with `--timeout <seconds>` if needed.

   Or poll `GET https://anthonyl.im/preview/pr/<n>/preview.json` until
   `sha` matches (prefix match is OK).

2. For Clerk-gated routes (`/korea`, `/trips`), mint a one-time sign-in URL
   and open it in the agent browser **before** screenshotting:

   ```bash
   bun scripts/clerk-agent-login.ts --pr <n> --path /korea
   bun scripts/clerk-agent-login.ts --pr <n> --path /trips
   ```

   The script prints a Clerk URL. Navigate Chrome MCP / Playwright there;
   Clerk sets a session cookie on `anthonyl.im` (shared with the preview)
   and redirects to the page with `?hidePreviewChrome=1`. Auth is
   `CLERK_SECRET_KEY` + `CLERK_AGENT_USER_ID` locally, or
   `AGENT_LOGIN_SECRET` / `gh auth token` against production
   `POST /api/agent/session`.

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
      ├─ VITE_BASE=/preview/pr/<n>/  VITE_ENABLE_SERVICE_WORKER=false
      ├─ vite build on the runner (never on the 1 GB droplet)
      ├─ bun server/src/previewStamp.ts  → preview.json + HTML chrome
      ├─ tar dist → SCP → droplet
      └─ deploy/publish-preview.sh publish <n> <tarball>
         atomic mv ~/previews/.staging/<n> → ~/previews/<n>
```

Production Hono (`server/src/preview.ts`) serves `~/previews/<n>/` at
`/preview/pr/<n>/` **before** the SPA fallback, so a missing preview is a
404, not production `index.html`.

On PR close the cleanup job deletes `~/previews/<n>/`. A prune pass also
drops trees older than 14 days and caps the droplet at 20 previews.

## Security / trust

Same-origin untrusted HTML can read production cookies. Mitigations:

- Same-repo PRs only (`head.repo.full_name == github.repository`)
- Dependabot skipped
- No `VITE_DEV_BEARER` in the preview bundle
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
| `CLERK_AGENT_USER_ID` | unset (endpoint 404s) | droplet `.env` |
| `AGENT_LOGIN_SECRET` | unset (`gh` collaborator token still works) | droplet `.env` |

## Files

| Path | Role |
| --- | --- |
| `.github/workflows/preview.yml` | CI publish + cleanup |
| `deploy/publish-preview.sh` | atomic extract / remove / prune |
| `server/src/preview.ts` | path guard, stamp, Hono router, wait helper |
| `server/src/previewStamp.ts` | CLI used by CI after `vite build` |
| `scripts/wait-for-preview.ts` | agent poller |
| `scripts/clerk-agent-login.ts` | mint a Clerk Agent Task URL for `/korea` + `/trips` screenshots |
| `server/src/routes/agentSession.ts` | `POST /api/agent/session` (secret or GitHub collaborator token) |
| `frontend/src/lib/routerBasename.ts` | React Router `basename` from Vite `base` |

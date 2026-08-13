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
  frontend sets `VITE_API_BASE=/preview/pr/<n>` and falls back to
  production `/api` if that proxy is not on this origin yet (the first
  deploy of the proxy itself).
- **Is not** a merge gate. `.github/workflows/preview.yml` is independent of
  `pr-gate`. A droplet blip must not block merge.
- **Is not** a second public port. The sidecar binds `127.0.0.1` only.
  Cap is **1** live preview API (`PREVIEW_API_MAX`) so the 1 GB droplet
  does not run a stack of Hono processes. Older PRs keep their frontend
  and fall back to production `/api`.

Korea and Trips still require a **Clerk session** on `anthonyl.im` (same
origin, so a phone already signed in to production is enough). Previews
never bake `VITE_DEV_BEARER`.

## Agent workflow (screenshots)

1. After opening/pushing the PR, wait for the preview:

   ```bash
   bun scripts/wait-for-preview.ts --pr <n> --sha <head-sha>
   ```

   Default timeout is **12 minutes** (preview CI includes a Vite production
   build). Override with `--timeout <seconds>` if needed.

   Or poll `GET https://anthonyl.im/preview/pr/<n>/preview.json` until
   `sha` matches (prefix match is OK).

2. Screenshot with Chrome MCP against the preview origin. Append
   `?hidePreviewChrome=1` so the PR badge is not in the frame.

3. Upload images via `gh api` and link them from the PR body. Local file
   paths do not render in GitHub.

4. If the preview is not live yet (serving code not on production, droplet
   down, or this is a fork/Dependabot PR), fall back to a local
   `cd frontend && bun run dev` and note that in the PR.

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
| `frontend/src/lib/routerBasename.ts` | React Router `basename` from Vite `base` |
| `frontend/src/lib/apiBase.ts` | `VITE_API_BASE` rewrite + production fallback |

# Deploy

How `anthonyl.im` ships from this repo to the DigitalOcean droplet.

## Architecture

```
git push → GitHub Actions (.github/workflows/deploy.yml)
              ├─ bun test server/src         # red tests block the deploy
              ├─ frontend build              # uses FRONTEND_ENV GH secret
              │  → frontend/dist             # CI-built artifact
              ├─ SSH to droplet:
              │  ├─ rm -rf ~/anthonyl.im, git clone fresh
              │  ├─ copy ~/.env  →  repo root + frontend (runtime secrets)
              │  ├─ bun install
              │  └─ apt install / curl ↓ yt-dlp + ffmpeg (idempotent)
              ├─ scp frontend/dist → ~/anthonyl.im/frontend/dist
              └─ SSH again: pm2 delete + pm2 start
```

CI builds the frontend on a 7 GB GH Actions runner (zero OOM risk vs. building on the 512 MB droplet) and ships the pre-built `dist` directory. The droplet never runs `vite build`.

## GitHub Secrets

Set these under **repo → Settings → Secrets and variables → Actions**:

| Secret | What it contains |
|---|---|
| `SSH_HOST` | droplet's public IP or `anthonyl.im` |
| `SSH_USERNAME` | linux user the bun process runs as (e.g. `root`) |
| `SSH_KEY` | passphrase-free private SSH key authorized on the droplet |
| `FRONTEND_ENV` | the entire body of what Vite expects in `frontend/.env`. **All build-time `VITE_*` vars live here**, one per line. The workflow `echo "${{ secrets.FRONTEND_ENV }}" > .env` writes this verbatim. |

### What `FRONTEND_ENV` must include

These are all "publishable" / public-facing keys baked into the JS bundle. Apply HTTP-referrer / IP restrictions in their respective dashboards as the security boundary, not file-level secrecy.

```
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_SUPABASE_URL=https://....supabase.co
VITE_SUPABASE_ANON_KEY=eyJh...
VITE_POSTHOG_KEY=phc_...
VITE_POSTHOG_HOST=https://us.i.posthog.com
VITE_GOOGLE_PLACES_API_KEY=...                # referrer-restricted to *.anthonyl.im
VITE_GOOGLE_MAP_TILES_API_KEY=...             # referrer-restricted to *.anthonyl.im
VITE_ENABLE_SERVICE_WORKER=true
```

If `VITE_CLERK_PUBLISHABLE_KEY` isn't in `FRONTEND_ENV`, `/korea/ingest` will show the **"Frontend build is missing Clerk configuration"** banner and polling won't work. (Verified by `grep -c 'pk_live_' frontend/dist/assets/*.js` — expect ≥1 after a good build.)

## On the droplet — one-time setup

Things the workflow doesn't provision (it assumes they're already there):

### 1. The runtime `.env`

Lives at `~/.env` on the droplet. The workflow copies it to the repo root + frontend dir on every deploy. **Server-side secrets only** — Clerk publishable key etc. don't belong here (they're build-time, not runtime).

```
# server runtime — required
CLERK_SECRET_KEY=sk_live_...
GROQ_API_KEY=gsk_...
APIFY_TOKEN=apify_api_...
GOOGLE_MAPS_API_KEY=...                # IP-restricted to the droplet IP (NOT referrer-restricted)
SUPABASE_URL=https://....supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJh...

# server runtime — optional
KAKAO_REST_API_KEY=KakaoAK ...
CEREBRAS_API_KEY=csk_...
IG_DEV_BEARER=...                       # alt auth path for curl testing
KLUSTER_API_KEY=...
KLUSTER_API_BASE_URL=...
```

Permissions: `chmod 600 ~/.env`.

### 2. SSH access

```bash
# from the droplet's authorized_keys, allow the GH Actions deploy key
ssh-copy-id <your-gh-actions-key>@<droplet>

# verify the workflow user can run sudo without password for apt-get + curl
# (or run the workflow as root if that matches your setup)
```

### 3. pm2 + bun

Both are auto-installed by the workflow on first run (`bun add -g pm2`, `curl bun.sh/install`), but it doesn't hurt to pre-install:

```bash
curl -fsSL https://bun.sh/install | bash
~/.bun/bin/bun add -g pm2
```

### 4. yt-dlp + ffmpeg

Auto-installed by the deploy step. Each installer is idempotent + **non-fatal** — if apt sources are broken or a mirror is down, the workflow falls back to a static binary, and if everything fails it logs a WARN but continues so the site still goes live (the worker degrades to caption-only extraction).

If you want to pre-install or repair manually:

```bash
sudo apt-get install -y ffmpeg
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

If `apt-get` itself is broken with messages like `The repository 'http://ubuntu.com plucky Release' does not have a Release file`, your `/etc/apt/sources.list` is pointing at a non-existent mirror (the hostname `ubuntu.com` is a website, not an APT mirror). Fix:

```bash
# Inspect what's there
cat /etc/apt/sources.list

# Replace ubuntu.com with the canonical archive mirror
sudo sed -i 's|http://ubuntu.com|http://archive.ubuntu.com/ubuntu|g' /etc/apt/sources.list

# Or use the DigitalOcean mirror (faster):
sudo sed -i 's|http://ubuntu.com|http://mirrors.digitalocean.com/ubuntu|g' /etc/apt/sources.list

# Then refresh
sudo apt-get update
```

For Ubuntu 24.04+ the apt sources may live in `/etc/apt/sources.list.d/ubuntu.sources` instead. Use the equivalent edit there.

### 5. Reverse proxy / TLS

Out of scope for this README — the droplet should already have nginx or caddy fronting `https://anthonyl.im` and forwarding to `localhost:3000` where the bun server listens.

## Verify a deploy

After a successful workflow run:

```bash
# Health
curl -s https://anthonyl.im/health | head -c 200

# IG places route mounted (no Clerk JWT → 401, NOT HTML — the route exists)
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" \
  https://anthonyl.im/api/korea/places/from-instagram/_stats
# Expect: 401 application/json

# Clerk pub-key baked into the frontend (≥1 hit after a good build)
curl -s https://anthonyl.im/ -o /tmp/i.html
grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' /tmp/i.html | head -1 \
  | xargs -I {} sh -c 'curl -s https://anthonyl.im{} | grep -c "pk_live_"'
# Expect: 1
```

## One-time SQL: enable 'comment' signal source

Run in the Supabase SQL editor BEFORE deploying the matching code:

```sql
alter type ig_signal_source add value if not exists 'comment';
```

This cannot be wrapped in a transaction alongside data DML, which is why
it lives outside the regular schema.sql append. Safe to re-apply.

## Rollback

The workflow does a `rm -rf ~/anthonyl.im` + `git clone` — there's no kept-around previous version. To roll back: revert the bad commit on `main`, push, and the workflow re-runs with the prior code. The build-and-deploy takes ~2-3 minutes from `git push`.

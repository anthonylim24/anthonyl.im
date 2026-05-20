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

## Local dev / automated testing without Clerk

The IG-places routes and the Korea auth gate normally require a Clerk session. For local development + browser automation, set a matching pair of dev bearers and the entire Clerk path is bypassed:

1. **Server side** — already supported by `server/src/middleware/clerkAuth.ts`. Set in repo-root `.env`:
   ```
   IG_DEV_BEARER=<random-48-char-token>
   IG_DEV_USER_ID=dev-user        # optional; defaults to "dev-user"
   ```
   Requests bearing `Authorization: Bearer <IG_DEV_BEARER>` are accepted as if they were authed with `userId = IG_DEV_USER_ID`.

2. **Frontend side** — set at build time (shell env or `frontend/.env.local`):
   ```
   VITE_DEV_BEARER=<same value as IG_DEV_BEARER>
   ```
   When set, `useGetToken()` returns the dev bearer and `KoreaAuthGate` is a pass-through. Dev bearer takes precedence over Clerk — leave `VITE_CLERK_PUBLISHABLE_KEY` untouched.

3. Build the frontend and run the server:
   ```bash
   cd frontend && VITE_DEV_BEARER=$IG_DEV_BEARER bun run build
   cd .. && bun run server/app.ts
   # Open http://localhost:3000/korea/places — no sign-in required
   ```

**Production safety:** the deploy workflow's `FRONTEND_ENV` secret must NOT include `VITE_DEV_BEARER`. The droplet's `.env` SHOULD NOT include `IG_DEV_BEARER` in production deploys — or if it does, the value must be cryptographically random and treated as a master credential.

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

## One-time SQL: skip_video column + updated ig_enqueue_job

Run in the Supabase SQL editor after deploying the matching server code
(the `ALTER TABLE … IF NOT EXISTS` and `CREATE OR REPLACE FUNCTION` are
both idempotent — safe to re-apply):

```sql
-- Add the skip_video flag to instagram_jobs.
alter table public.instagram_jobs
  add column if not exists skip_video boolean not null default false;

-- Replace ig_enqueue_job to accept the new p_skip_video parameter.
create or replace function public.ig_enqueue_job(
  p_user_id text, p_url text, p_dedupe_key text, p_skip_video boolean default false
) returns table (id bigint, status ig_job_status, inserted boolean)
language sql security definer as $$
  insert into public.instagram_jobs (user_id, url, dedupe_key, skip_video)
  values (p_user_id, p_url, p_dedupe_key, p_skip_video)
  on conflict (user_id, dedupe_key) do update set
    updated_at = now(),
    skip_video = excluded.skip_video
  returning instagram_jobs.id, instagram_jobs.status, (xmax = 0) as inserted;
$$;
```

Effect: when a user submits a URL with "Skip video download" checked, the
worker skips the entire download → transcribe → frame extraction → OCR
pipeline. Job runtime drops from ~90 s to ~10 s. Only caption, location tag,
and comments are available as extraction signals. Existing jobs with no
`skip_video` column get `false` via the column default.

## One-time SQL: IG place day assignment

Run in the Supabase SQL editor after deploying the matching server code
(all statements use `IF NOT EXISTS` / `CREATE OR REPLACE` — safe to re-apply):

```sql
create table if not exists public.instagram_place_day_assignments (
  id          bigserial primary key,
  place_id    bigint not null references public.instagram_places(id) on delete cascade,
  user_id     text   not null,
  day_n       smallint not null check (day_n between 1 and 12),
  created_at  timestamptz not null default now()
);

create unique index if not exists instagram_place_day_assignments_uq
  on public.instagram_place_day_assignments (place_id, user_id, day_n);

create index if not exists instagram_place_day_assignments_user_day_idx
  on public.instagram_place_day_assignments (user_id, day_n);

alter table public.instagram_place_day_assignments enable row level security;

create policy "Users read own ig day assignments"
  on public.instagram_place_day_assignments for select to authenticated
  using ((select auth.jwt()->>'sub') = user_id);

create or replace function public.ig_set_place_days(
  p_user_id text, p_place_id bigint, p_days smallint[]
) returns void language plpgsql security definer as $$
begin
  if not exists (
    select 1 from public.instagram_places
     where id = p_place_id and user_id = p_user_id
  ) then
    raise exception 'place not found or not owned by user';
  end if;
  delete from public.instagram_place_day_assignments
   where user_id = p_user_id and place_id = p_place_id;
  if array_length(p_days, 1) is not null then
    insert into public.instagram_place_day_assignments (place_id, user_id, day_n)
    select p_place_id, p_user_id, unnest(p_days);
  end if;
end $$;
```

Effect: users can pin their IG-extracted places to specific Korea trip days.
Assigned places appear in the day page's "From your Instagram saves" section
and in Map Mode as `priority: 'scheduled'` markers.

## Rollback

The workflow does a `rm -rf ~/anthonyl.im` + `git clone` — there's no kept-around previous version. To roll back: revert the bad commit on `main`, push, and the workflow re-runs with the prior code. The build-and-deploy takes ~2-3 minutes from `git push`.

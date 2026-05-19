# Instagram → Korea Trip Place Extractor — Design

**Date:** 2026-05-18
**Status:** Approved (verbal), ready for implementation plan
**Owner:** Anthony Lim
**Repo:** `anthonyl.im_`

---

## Problem

When traveling, recommendations land in DMs and feeds as Instagram links. Reading each post, extracting the place name, geocoding it, categorizing it, and pasting it into the Korea trip dossier is manual, slow, and lossy — captions are skimmed, audio is ignored, burned-in overlay text never gets transcribed.

We want a backend API: paste one or many Instagram URLs in; get structured place rows (name, address, lat/lng, category, supporting quote) saved to Supabase, surfaced into the existing Korea Map Mode dossier later.

## Goals

1. Submit one URL or an array of URLs to a single Clerk-authenticated endpoint.
2. Process them asynchronously in a durable queue that survives server restarts.
3. Extract **all** places mentioned (not just the primary one), with a `is_subject` flag for "main topic vs passing mention."
4. Use caption + audio transcript + (when needed) burned-in overlay text — the three signals real travel reels rely on.
5. Geocode to canonical address + lat/lng + business category.
6. Stay inside free tiers at trip-planning scale (≤ 500 posts/month).
7. Unit + integration tests; pluggable third-party clients.

## Non-goals (for this PR)

- Frontend UI for the place list or queue dashboard.
- Human "verified / rejected" review flow (schema supports it, no UI yet).
- Cross-user sharing (each user's places are private).
- Historical IG bookmark backfill.

---

## Architecture

```
POST /api/korea/places/from-instagram   (Clerk JWT)
   │  body: { url } | { urls: string[] }
   ▼
instagram_jobs (Postgres queue, SKIP LOCKED, dedupe by normalized URL)
   │
   ▼  worker loop (in-process, concurrency=3, polls every 3s)
process(job):
   1. fetchPost          — yt-dlp local → Apify fallback
   2. upsertPost         — cache caption/media/location tag in instagram_posts
   3. buildExtractionBundle — caption + (adaptive) Whisper transcript + (adaptive) Google Vision OCR
   4. extractPlaces      — Groq gpt-oss-120b, strict JSON schema, substring-quote filter
   5. enrichPlace        — Apify location tag → Google Places (Text Search + Details) → Kakao fallback
   6. savePlaces         — N rows in instagram_places, FK to post
   7. complete / fail    — job state transitions, exponential + jittered backoff
```

Single Bun/Hono process. Worker is `import './igPlaces/worker'`-on-boot, gated by `IG_WORKER_ENABLED`. Supabase via REST (no `@supabase/supabase-js` dep — matches existing `/api/entity/about` pattern).

### Modules (each independently testable, DI-friendly)

| File | Responsibility |
|---|---|
| `server/src/routes/instagramPlaces.ts` | HTTP endpoint, Zod validation, enqueue |
| `server/src/igPlaces/queue.ts` | enqueue, claim, complete, fail, reapStale |
| `server/src/igPlaces/worker.ts` | Tick loop, concurrency pool, SIGTERM drain |
| `server/src/igPlaces/normalizeUrl.ts` | URL → dedupe_key |
| `server/src/igPlaces/fetchPost.ts` | yt-dlp + Apify fallback → `PostPayload` |
| `server/src/igPlaces/transcribe.ts` | ffmpeg + Groq Whisper |
| `server/src/igPlaces/extractFrames.ts` | ffmpeg → JPEGs |
| `server/src/igPlaces/ocr.ts` | Google Vision Document Text Detection |
| `server/src/igPlaces/extractPlaces.ts` | Groq gpt-oss-120b, strict JSON, hallucination filter |
| `server/src/igPlaces/geocode.ts` | Google Places + Kakao fallback |
| `server/src/igPlaces/process.ts` | One job, top-to-bottom |

---

## Database Schema

Appended to `supabase/schema.sql`:

```sql
create type ig_job_status   as enum ('pending','running','done','failed','dead');
create type ig_place_category as enum (
  'restaurant','cafe','bar','shopping','activity',
  'hotel','landmark','other'
);

create table if not exists public.instagram_jobs (
  id            bigserial primary key,
  user_id       text not null,
  url           text not null,
  dedupe_key    text not null unique,
  status        ig_job_status not null default 'pending',
  attempts      int not null default 0,
  max_attempts  int not null default 5,
  last_error    text,
  scheduled_for timestamptz not null default now(),
  locked_at     timestamptz,
  locked_by     text,
  post_id       bigint,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists instagram_jobs_ready_idx
  on public.instagram_jobs (scheduled_for) where status = 'pending';
create index if not exists instagram_jobs_watchdog_idx
  on public.instagram_jobs (locked_at) where status = 'running';

create table if not exists public.instagram_posts (
  id             bigserial primary key,
  dedupe_key     text not null unique,
  url            text not null,
  shortcode      text,
  owner_username text,
  caption        text,
  transcript     text,
  ocr_text       text,
  media_urls     jsonb not null default '[]'::jsonb,
  location_tag   jsonb,
  raw            jsonb,
  source         text not null,                 -- 'yt-dlp' | 'apify'
  fetched_at     timestamptz not null default now()
);
create index if not exists instagram_posts_owner_idx
  on public.instagram_posts (owner_username);

create table if not exists public.instagram_places (
  id                bigserial primary key,
  post_id           bigint not null references public.instagram_posts(id) on delete cascade,
  user_id           text not null,
  name              text not null,
  name_romanized    text,
  city              text,
  category          ig_place_category not null default 'other',
  address           text,
  lat               double precision,
  lng               double precision,
  google_place_id   text,
  phone             text,
  rating            real,
  business_types    jsonb default '[]'::jsonb,
  is_subject        boolean not null default false,
  confidence        real not null default 0,
  supporting_quote  text,
  geocode_source    text,
  status            text not null default 'extracted',
  created_at        timestamptz not null default now()
);
create index if not exists instagram_places_post_idx
  on public.instagram_places (post_id);
create index if not exists instagram_places_user_idx
  on public.instagram_places (user_id, created_at desc);
create unique index if not exists instagram_places_user_google_uq
  on public.instagram_places (user_id, google_place_id)
  where google_place_id is not null;

alter table public.instagram_jobs   enable row level security;
alter table public.instagram_posts  enable row level security;
alter table public.instagram_places enable row level security;

create policy "Users read own jobs"
  on public.instagram_jobs for select to authenticated
  using ((select auth.jwt()->>'sub') = user_id);
create policy "Users read own places"
  on public.instagram_places for select to authenticated
  using ((select auth.jwt()->>'sub') = user_id);
create policy "Any authed read posts"
  on public.instagram_posts for select to authenticated
  using (true);
```

### Decisions

- **Three tables, not one.** `instagram_posts` is a shared cache keyed by URL — if two users submit the same reel, the LLM/Whisper work happens once. Per-user `instagram_places` keeps human-edited state private.
- **Cross-post dedupe on `google_place_id`** via partial unique index — collapses "어니언 성수" appearing in three reels into one place row per user.
- **`is_subject`** is the LLM-emitted distinction between main topic vs passing mention. Lets the UI dim passing ones.
- **`status='extracted' | 'verified' | 'rejected'`** plumbing for a future review UI.

---

## Queue Contract

`SELECT … FOR UPDATE SKIP LOCKED` over the partial index `where status='pending'`.

### Enqueue (idempotent)

```sql
insert into instagram_jobs (user_id, url, dedupe_key)
values ($1, $2, $3)
on conflict (dedupe_key) do update set updated_at = now()
returning id, status, (xmax = 0) as inserted;
```

### Claim (atomic)

```sql
with claimed as (
  select id from instagram_jobs
   where status='pending' and scheduled_for <= now()
   order by scheduled_for
   for update skip locked
   limit 1
)
update instagram_jobs j
   set status='running', attempts=attempts+1,
       locked_at=now(), locked_by=$1, updated_at=now()
  from claimed
 where j.id = claimed.id
returning j.*;
```

### Fail (exponential + full jitter)

```sql
update instagram_jobs
   set status        = case when attempts >= max_attempts then 'dead'
                            when $3 = false then 'dead'
                            else 'pending' end,
       scheduled_for = now() + (interval '1 second'
                                * power(2, attempts) * 30 * (0.5 + random())),
       last_error    = $2,
       locked_at     = null, locked_by = null,
       updated_at    = now()
 where id = $1;
```

### Worker loop

- Single Bun process; `import './igPlaces/worker'` once on boot.
- `setInterval(tick, 3_000)` keeps `CONCURRENCY=3` slots full.
- Each tick begins with `reapStale(600)` — re-pends any `running` row whose `locked_at < now() - 10min`.
- SIGTERM: stop polling, await slots with 30 s cap, force-unlock survivors so the next process can pick them up.

### Failure taxonomy

| Failure | Retryable? | Backoff base |
|---|---|---|
| yt-dlp + Apify both fail with 4xx/empty | no | — |
| Apify 429 | yes | 5 min |
| Whisper 429 / Groq 429 / Google Places quota | yes | 30 s – 1 h |
| ffmpeg crash | yes (once) | 30 s |
| LLM strict-JSON validation fail | yes (once) | 30 s |
| Network timeout / unknown | yes | 30 s |

---

## Extraction Pipeline

### `fetchPost`

1. Cache hit on `instagram_posts.dedupe_key` → return immediately.
2. `Bun.spawn(['yt-dlp', '--dump-single-json', '--no-download', '--no-warnings', '--quiet', url], { timeout: 20_000 })`. Exit 0 + non-empty media URLs → done.
3. Else fallback `POST https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=…` with `{ directUrls: [url], resultsLimit: 1 }`. 429 → retryable with 5 min backoff. Empty result → non-retryable.

### `buildExtractionBundle`

- **Always:** extract hashtags + `@mentions` from caption.
- **If video present:**
  - Download to `/tmp` (cap at 50 MB; if larger, skip transcription).
  - If file > 25 MB → `ffmpeg -i in.mp4 -vn -ac 1 -ar 16000 -b:a 32k out.m4a` to fit Groq free tier.
  - `groq.audio.transcriptions.create({ model: 'whisper-large-v3-turbo', language: 'ko', prompt: <bias prompt>, response_format: 'verbose_json' })`.
  - Bias prompt (constant): `"Seoul, Busan, Gangnam, Hongdae, Myeongdong, Itaewon, Insadong, Haeundae, Jagalchi, KTX, jjajangmyeon, bibimbap, Anguk, Hannam, Seongsu, Yongsan, Itaewon, Cheongdam, BTS, hanok."` Whisper's prompt is limited to the last ~224 tokens; these terms bias the decoder toward proper-noun spellings.
- **If `(caption + transcript).length < 300`:**
  - For video: `ffmpeg -vf 'fps=1/3,scale=640:-2' -frames:v 3 frame-%02d.jpg`.
  - For each frame/image, Google Vision `DOCUMENT_TEXT_DETECTION`; concatenate `fullTextAnnotation.text`.
- **Always:** include Apify's `locationName` (when present) in the bundle as a seed hint.

### `extractPlaces`

`openai/gpt-oss-120b` on Groq with strict `response_format: { type: 'json_schema', json_schema: { strict: true, … } }`. `reasoning_effort: 'low'`, `reasoning_format: 'hidden'`, `max_completion_tokens: 2048`, `temperature: 0.2`.

Schema (abridged): `{ places: [{ name, name_romanized, city, category, confidence, is_subject, supporting_quote }] }`.

**Hallucination guard:** drop any place whose `supporting_quote` is not a verbatim substring of `caption + transcript + ocr`. Drop `confidence < 0.3`.

System-prompt rules: keep Korean names in Hangul (don't romanize), `is_subject=true` only if the place is the main topic, return `{"places": []}` when none mentioned (don't invent).

### `enrichPlace`

1. If Apify `locationTag` exists, has `lat`/`lng`, and fuzzy-matches the place name → use it (`geocode_source='apify-tag'`). **Fuzzy-match rule:** normalize both strings (NFC, lowercase, strip whitespace/punctuation), then accept if either is a substring of the other OR their normalized Levenshtein distance is ≤ 2. Conservative — biases toward calling Google when in doubt, which is cheap at our scale.
2. Google Places **Text Search (Pro)** with `${name} ${city ?? 'Seoul'}`, then **Place Details (Pro)** for the top hit. `languageCode=en, regionCode=KR`. Request only `id, displayName, formattedAddress, location, types, internationalPhoneNumber, rating`. → `geocode_source='google'`.
3. Else Kakao `/v2/local/search/keyword.json` biased to Seoul/Busan. → `geocode_source='kakao'`.
4. Else save ungeocoded (`geocode_source=null`) — better than dropping the row.

LLM-emitted `category` wins for the DB enum; Google's `types[]` is stored verbatim in `business_types` for later filtering.

---

## Cost ceiling (200 posts / month)

| Stage | Provider | Per call | 200 posts | Notes |
|---|---|---|---|---|
| IG fetch | yt-dlp | $0 | $0 | local |
| IG fetch fallback | Apify | $0.0015 | ≤ $0.30 | inside $5/mo platform credit |
| Transcription | Groq Whisper-turbo | $0 free tier | $0 | 7,200 audio-sec/hr, 25 MB max file |
| OCR | Google Vision | $0 free 1k/mo | $0 | only adaptive subset triggers |
| LLM extraction | Groq gpt-oss-120b | $0 free tier | $0 | 30 RPM, 1k RPD |
| Geocoding | Google Places New | $0 free 5k Pro/mo | $0 | Text Search + Place Details |
| Geocoding fallback | Kakao Local | $0 (300k/day free) | $0 | account-level free |
| **Total** | | | **~$0** | |

---

## Testing

- `bun test` (built-in, zero-config). Tests next to source: `*.test.ts` for unit, `*.int.test.ts` for integration (gated by `INTEGRATION=1`).
- **Unit** — DI for all external clients (`fetch`, `groq`, `supabase`, `spawn`). Fixtures in `server/src/igPlaces/__fixtures__/` (one real-but-sanitized capture per provider).
- **Integration** — full pipeline with stubbed providers, real Supabase test DB (`SUPABASE_TEST_URL` env). Endpoint test signs a Clerk JWT and asserts 202 + DB rows.
- **Manual E2E** — `bun run server/src/igPlaces/cli.ts <url>` runs the pipeline with real APIs, prints structured output, doesn't touch the DB. Use for prompt iteration.

### Test coverage targets

| Module | What asserts |
|---|---|
| `normalizeUrl` | Canonicalizes UTM, lowercases host, collapses `/reel/`↔`/p/`, rejects non-IG hosts |
| `queue` | Dedupe (second enqueue returns same id), claim atomicity, backoff math, `retryable=false → 'dead'` |
| `fetchPost` | yt-dlp success normalize; exit≠0 falls through to Apify; Apify 429 → `RetryableError(5min)`; empty Apify → `NonRetryableError` |
| `buildExtractionBundle` | Hashtag/mention regex; no transcription on image-only posts; OCR only when text < 300 chars |
| `extractPlaces` | Strict JSON parses; substring filter drops hallucinated quotes; `confidence < 0.3` filtered |
| `geocode` | Apify-tag wins when matching; Google → Kakao ordering; ungeocoded still saved |
| `worker.int` | 3 URLs enqueued → 5 ticks → all `done` with correct row counts |
| `endpoint.int` | POST with Clerk JWT → 202 + job_ids + DB row |

No frontend UI in this scope, so the CLAUDE.md Chrome MCP screenshot rule does not apply.

---

## Env vars (added to `server/src/config.ts`)

| Var | Required when | Used for |
|---|---|---|
| `APIFY_TOKEN` | worker enabled | IG fallback fetch |
| `GOOGLE_MAPS_API_KEY` | worker enabled | Places New Text Search + Details |
| `GOOGLE_VISION_API_KEY` | worker enabled | Vision OCR (can equal Maps key if project has both enabled) |
| `KAKAO_REST_API_KEY` | optional | Kakao Local fallback |
| `GROQ_API_KEY` | worker enabled | Whisper + gpt-oss-120b (already exists) |
| `IG_WORKER_ENABLED` | — | Default `true`; set to `'false'` to disable worker in tests |
| `IG_WORKER_CONCURRENCY` | — | Default `3` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | — | Already exist |

Required-env validation only enforces the worker keys when `IG_WORKER_ENABLED` is truthy — keeps the rest of the server bootable in environments where this feature is off.

`brew install yt-dlp ffmpeg` (documented in module README).

---

## Observability

- `[ig-worker]` structured logs per step: `claim`, `fetch source=…`, `transcribe ms=… bytes=…`, `ocr frames=N`, `extract places=N`, `geocode source=…`, `complete` / `fail attempt=N reason=…`.
- DB itself is the dashboard: `attempts`, `last_error`, `updated_at` all live on the row.
- `GET /api/korea/places/from-instagram/_stats` (Clerk-gated) returns queue depth, running count, dead count, recent failure reasons. Mirrors `/api/entity/about/_stats`.

---

## Risks & open questions

| Risk | Mitigation |
|---|---|
| yt-dlp fails frequently from cloud IPs (per falsified GitHub issue #13551) | Apify fallback is the real workhorse; yt-dlp is best-effort local hint |
| Apify's `latitude/longitude` field not verified from actor page — only `locationName` confirmed | Pipeline doesn't depend on Apify lat/lng; Google Places call covers it |
| Korean side-street POIs missing from Google | Kakao fallback specifically for this |
| LLM hallucination | Substring-quote filter + `confidence ≥ 0.3` |
| Worker stuck mid-job after crash | 10-min watchdog reaps stale locks |
| Duplicate submissions | Unique index on `dedupe_key` collapses to one row; API returns existing job id |

---

## Out of scope (future PRs)

1. Korea Map Mode UI surface for the extracted places.
2. Human review UI (`status='verified' | 'rejected'`).
3. Cross-user place sharing.
4. Historical IG bookmark backfill.
5. Notifications when a job finishes (the user polls `_stats` or refreshes the Map Mode page).

---

## Sources consulted (research + falsification)

- yt-dlp Instagram extractor and 2025 failure issues: <https://github.com/yt-dlp/yt-dlp/issues/13551>, <https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/instagram.py>
- Apify Instagram Scraper (actor + pricing): <https://apify.com/apify/instagram-scraper>, <https://apify.com/pricing>
- Meta v. Bright Data ruling (Jan 2024): <https://techcrunch.com/2024/02/26/meta-drops-lawsuit-against-web-scraping-firm-bright-data-that-sold-millions-of-instagram-records/>
- Groq Speech-to-Text, Rate Limits, Structured Outputs, Reasoning, Deprecations: <https://console.groq.com/docs/speech-to-text>, <https://console.groq.com/docs/rate-limits>, <https://console.groq.com/docs/structured-outputs>, <https://console.groq.com/docs/reasoning>, <https://console.groq.com/docs/deprecations>
- Google Places (New) pricing (March 2025 changes): <https://developers.google.com/maps/billing-and-pricing/overview>, <https://developers.google.com/maps/billing-and-pricing/march-2025>, <https://developers.google.com/maps/billing-and-pricing/pricing>
- Kakao Local: <https://developers.kakao.com/docs/latest/en/local/dev-guide>
- Postgres SKIP LOCKED queue pattern (Brandur Leach): <https://brandur.org/postgres-queues>, <https://brandur.org/job-drain>
- pgmq on Supabase (considered, rejected as overkill): <https://supabase.com/docs/guides/queues/quickstart>

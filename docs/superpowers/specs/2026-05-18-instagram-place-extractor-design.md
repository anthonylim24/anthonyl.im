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
7. **Optimize for extraction accuracy over latency or cost.** At our volume the free tiers can absorb extra calls — spend them on self-consistency voting, dual-source geocoding cross-check, and a labeled eval harness rather than skipping work.
8. Unit + integration tests; pluggable third-party clients; an evaluation harness that produces measurable precision/recall per stage.

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
   3. buildExtractionBundle — caption + Whisper transcript (dual-pass, always) + Google Vision OCR (always when frames/images present)
   4. extractPlaces      — Groq gpt-oss-120b ×3 self-consistency vote, strict JSON schema, substring-quote filter, signal_source attribution
   5. enrichPlace        — Apify location tag seed → Google Places + Kakao called in parallel → reconcile (agree → high confidence, disagree → flag for review)
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
| `server/src/igPlaces/extractPlaces.ts` | Groq gpt-oss-120b ×3 parallel, strict JSON, vote-reconcile, hallucination filter |
| `server/src/igPlaces/geocode.ts` | Google Places + Kakao called in parallel, reconciliation |
| `server/src/igPlaces/process.ts` | One job, top-to-bottom |
| `server/src/igPlaces/eval/run.ts` | Eval harness — runs full pipeline against labeled fixtures, prints precision/recall |

---

## Database Schema

Appended to `supabase/schema.sql`:

```sql
create type ig_job_status   as enum ('pending','running','done','failed','dead');
create type ig_place_category as enum (
  'restaurant','cafe','bar','shopping','activity',
  'hotel','landmark','other'
);
create type ig_signal_source  as enum ('caption','transcript','ocr','location_tag','multiple');
create type ig_confidence_band as enum ('high','medium','low');

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
  confidence        real not null default 0,            -- raw LLM-vote confidence in [0,1]
  confidence_band   ig_confidence_band not null default 'low',
  supporting_quote  text,
  signal_source     ig_signal_source,                   -- where supporting_quote came from
  vote_count        smallint not null default 1,        -- 1..N from self-consistency voting
  geocode_source    text,                               -- 'apify-tag' | 'google' | 'kakao' | 'google+kakao' | null
  geocode_kakao_id  text,                               -- kakao place id when present
  geocode_disagree  boolean not null default false,     -- true if Google/Kakao disagreed
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
- **`vote_count`, `confidence_band`, `geocode_disagree`** make accuracy debuggable in SQL — `select * from instagram_places where confidence_band='low' or geocode_disagree` is the review queue.

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

Accuracy-first: every available signal is always collected when the media is present (no adaptive cutoff). The extractor decides what's relevant.

- **Always:** extract hashtags + `@mentions` from caption.
- **If video present (always run, in parallel):**
  - **Transcription** — download to `/tmp` (cap at 50 MB; if larger, skip with logged warning). If file > 25 MB → `ffmpeg -i in.mp4 -vn -ac 1 -ar 16000 -b:a 32k out.m4a` to fit Groq free tier.
    - **Dual-pass Whisper.** Run twice in parallel: once with `language: 'ko'`, once with auto-detect (omit `language`). Pick the per-segment text from whichever pass has higher `avg_logprob`. This catches code-switching reels that auto-detect locks onto the wrong language for.
    - Both calls use the same bias prompt: `"Seoul, Busan, Gangnam, Hongdae, Myeongdong, Itaewon, Insadong, Haeundae, Jagalchi, KTX, jjajangmyeon, bibimbap, Anguk, Hannam, Seongsu, Yongsan, Cheongdam, hanok."` Whisper's prompt is limited to the last ~224 tokens; these bias the decoder toward proper-noun spellings.
    - `response_format: 'verbose_json'` so we get the per-segment `avg_logprob` needed for the merge.
  - **Frame OCR** — `ffmpeg -vf 'fps=1/5,scale=720:-2' -frames:v 5 frame-%02d.jpg`. Five frames, well-spaced. For each frame call Google Vision `DOCUMENT_TEXT_DETECTION`; concatenate `fullTextAnnotation.text` with the frame index annotated (`[frame 1] …`).
- **If carousel photos present:** OCR every image (same Vision call). Carousels rarely exceed 10 images, all inside the free Vision tier.
- **Always:** include Apify's `locationName` (when present) in the bundle as a seed hint, tagged so the LLM can distinguish "told to us by the platform" from "extracted from text."

### `extractPlaces` — self-consistency vote

`openai/gpt-oss-120b` on Groq with strict `response_format: { type: 'json_schema', json_schema: { strict: true, … } }`. `reasoning_effort: 'low'`, `reasoning_format: 'hidden'`, `max_completion_tokens: 2048`.

**Self-consistency: run 3 calls in parallel** with `temperature: 0.5` (high enough to surface alternative phrasings, low enough to stay grounded). Each call produces its own `places[]` list.

Schema per place (abridged): `{ name, name_romanized, city, category, confidence, is_subject, supporting_quote, signal_source }` where `signal_source ∈ {caption, transcript, ocr, location_tag, multiple}`.

**Reconciliation:**

1. Concatenate the source text bundle: `caption + transcript + ocr + location_tag.name`.
2. For each of the 3 runs, filter places where `supporting_quote` is not a verbatim substring of the source bundle (substring-quote hallucination filter).
3. Canonicalize names across runs: NFC + lowercase + strip whitespace/punctuation + run a fuzzy bucket on normalized Levenshtein distance ≤ 2.
4. Merge places that bucket together; `vote_count = number of runs that surfaced this place`.
5. Drop places with `vote_count = 1` AND `max(confidence) < 0.6` (low-vote AND low-confidence = filter).
6. Compute `confidence_band`:
   - `high` — `vote_count = 3` OR (`vote_count ≥ 2` AND `min(confidence) ≥ 0.7`)
   - `medium` — `vote_count = 2`
   - `low` — `vote_count = 1` (i.e. single-run with `confidence ≥ 0.6` — kept but flagged)
7. For merged places, pick the entry with the longest `supporting_quote` for storage (most contextual). `signal_source` follows that entry; if entries from different signals merged, set `signal_source='multiple'`.

System-prompt rules: keep Korean names in Hangul (don't romanize into `name`; romanization goes in `name_romanized`); `is_subject=true` only if the place is the main topic; emit `signal_source` to attribute where the quote came from; return `{"places": []}` when none mentioned (don't invent).

### `enrichPlace` — dual-source cross-check

Google and Kakao are called **in parallel** (not fallback chain) and reconciled. Apify's `locationTag` seeds the search query when present.

```ts
const [google, kakao] = await Promise.all([
  googlePlacesLookup(name, city),   // Text Search → Place Details (Pro tier)
  kakaoKeywordLookup(name, city),   // /v2/local/search/keyword.json
]);
```

**Fuzzy-match rule (shared by all reconciliation paths):** normalize both strings (NFC, lowercase, strip whitespace/punctuation), accept if either is a substring of the other OR their normalized Levenshtein distance is ≤ 2.

**Reconciliation:**

1. **Both succeed AND agree** — names fuzzy-match AND coordinates within 200 m haversine: high-trust hit. Save Google's metadata (richer fields), store Kakao's `place_url` in `geocode_kakao_id`. `geocode_source='google+kakao'`, `geocode_disagree=false`. Bump `confidence_band` up one notch (low→medium, medium→high).
2. **Both succeed but disagree** (name OR > 200 m apart): save Google's lat/lng + address, store Kakao result alongside in `geocode_kakao_id`, `geocode_disagree=true`, force `confidence_band='low'`, `status='extracted'` (not auto-verified). Review queue: `select * from instagram_places where geocode_disagree`.
3. **Only Google succeeds:** save Google. `geocode_source='google'`.
4. **Only Kakao succeeds:** save Kakao. `geocode_source='kakao'` — common for Korean side-street POIs Google misses.
5. **Both fail:** save ungeocoded; `geocode_source=null`. Better than dropping the row — the LLM signals are still useful.

**Apify `locationTag` short-circuit** still applies before the parallel call: if `locationTag` exists with `lat`/`lng` AND fuzzy-matches the place name, skip both APIs (`geocode_source='apify-tag'`, treat as high-trust). The platform already told us.

**Google-result quality bar** (reject obviously-wrong matches):

- For `category ∈ {restaurant, cafe, bar}`: reject Google hits where `userRatingCount < 10` AND name-distance > 1 char. These are usually phantom matches to obscure venues.
- For all categories: reject if Google's lat/lng falls outside the Korea bounding box (`33 ≤ lat ≤ 39, 124 ≤ lng ≤ 132`).
- A rejected Google result is treated as "Google failed" in the reconciliation above, so the flow continues to Kakao-only / ungeocoded.

LLM-emitted `category` wins for the DB enum; Google's `types[]` is stored verbatim in `business_types` for richer filtering later.

---

## Cost ceiling (200 posts / month, accuracy-tuned)

Cost rises modestly with self-consistency × 3, dual-pass Whisper, always-on OCR @ 5 frames, dual geocode. All stages stay well inside free tiers.

| Stage | Provider | Calls / post | 200 posts | Notes |
|---|---|---|---|---|
| IG fetch | yt-dlp | 0–1 | $0 | local |
| IG fetch fallback | Apify | 0–1 | ≤ $0.30 | inside $5/mo platform credit |
| Transcription (dual-pass) | Groq Whisper-turbo | 2 | $0 | 7,200 audio-sec/hr free tier; 2× ~60s = 240s/post × 200 = ~13 hours of audio total |
| OCR | Google Vision | 5 (video) / N (carousel) | $0 | 1,000 free units/mo; 200 posts × 5 = 1,000 — at the boundary, fall through to Tesseract.js if exceeded |
| LLM extraction (self-consistency ×3) | Groq gpt-oss-120b | 3 | $0 | 30 RPM, 1k RPD — 600 calls fits |
| Geocoding (parallel Google + Kakao) | Google Places New + Kakao | 2 of each per place | $0 | ~400 Google Pro calls inside 5k free; Kakao free at 300k/day |
| **Total** | | | **~$0.30/mo** | |

---

## Accuracy evaluation harness

A first-class, runnable eval set lives at `server/src/igPlaces/eval/`. This is what makes accuracy claims falsifiable — without it, "more accurate" is vibes.

### Layout

```
server/src/igPlaces/eval/
  fixtures/
    01-geotagged-cafe-seongsu/
      input.json          # captured PostPayload (caption, media, locationTag)
      expected.json       # hand-labeled places + addresses
    02-multi-place-listicle/...
    03-silent-reel-overlay-only/...
    04-audio-only-mention/...
    05-busan-side-street-kakao-wins/...
    06-mixed-korean-english-codeswitch/...
    07-passing-mention-not-subject/...
    08-no-place-at-all/...
    09-untagged-restaurant-hangul/...
    10-carousel-ten-images/...
  run.ts                 # pipeline runner against fixtures
  score.ts               # precision/recall/F1 computation
  README.md              # how to add a fixture
```

### Scoring

Per fixture, compare extracted `places[]` to expected:
- **Extraction precision** = correctly identified places / total emitted.
- **Extraction recall** = correctly identified places / total expected.
- A "match" = fuzzy-match (same rule as in `enrichPlace`) on `name` AND same `is_subject` flag.
- **Category accuracy** = matching `category` enum on matched places.
- **Geocode accuracy** = matched lat/lng within 100 m of expected.

`bun run server/src/igPlaces/eval/run.ts` prints a table:

```
fixture                                ext-P  ext-R  cat-acc  geo-acc  band
01-geotagged-cafe-seongsu              1.00   1.00   1.00     1.00     high
02-multi-place-listicle                0.83   1.00   0.80     0.67     medium
03-silent-reel-overlay-only            1.00   0.50   1.00     1.00     low
...
TOTAL                                  0.91   0.84   0.93     0.88
```

Eval is run manually before merging changes to prompts, models, or the reconciliation logic. A simple regression contract: **TOTAL precision and recall must not drop > 5 percentage points** vs the baseline captured the first time the harness runs.

### Fixture generation

`bun run server/src/igPlaces/eval/capture.ts <url>` runs the pipeline once, dumps `input.json`, and opens `expected.json` in `$EDITOR` for hand-labeling. Captured fixtures get committed (with sensitive media URLs stripped — only metadata + caption + thumbnail).

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
| `buildExtractionBundle` | Hashtag/mention regex; no transcription on image-only posts; dual-pass Whisper merges by `avg_logprob`; 5 frames extracted at 1/5 fps; OCR runs on all carousel images |
| `extractPlaces` | 3 parallel calls; substring filter drops hallucinated quotes; vote-merge buckets fuzzy-matched names; `vote_count` set correctly; `confidence_band` thresholds; `signal_source='multiple'` when entries merge across signals |
| `geocode` | Apify-tag short-circuit wins when matching; parallel Google+Kakao agree → bump band; disagree → `geocode_disagree=true`, force band='low'; Korea bbox reject; restaurant low-rating reject; both-fail still saves row |
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
| Apify's `latitude/longitude` field not verified from actor page — only `locationName` confirmed | Pipeline doesn't depend on Apify lat/lng; parallel Google+Kakao geocode covers it |
| Korean side-street POIs missing from Google | Kakao called in parallel, not as fallback — surfaces side-street POIs as primary when Google whiffs |
| LLM hallucination | Substring-quote filter + self-consistency 3-vote + `vote_count=1 ∧ confidence<0.6` filter |
| LLM stochasticity / single-run misses | Self-consistency 3-vote with `temperature: 0.5` |
| Whisper picks wrong language on code-switch | Dual-pass: `language: 'ko'` + auto-detect, merge per-segment by `avg_logprob` |
| Google returns phantom match to obscure venue | Quality bar: `userRatingCount ≥ 10` for restaurants/cafes/bars, Korea bbox check on lat/lng |
| Wrong geocode silently accepted | Parallel Google+Kakao reconciliation — disagreements set `geocode_disagree=true`, force `confidence_band='low'`, surface in review queue |
| Regression from prompt/model swap | Eval harness with 10 labeled fixtures; precision/recall guard ≤ 5pp drop |
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

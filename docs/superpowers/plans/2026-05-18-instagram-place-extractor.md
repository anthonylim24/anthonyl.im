# Instagram Place Extractor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Clerk-authenticated Hono endpoint that takes one or many Instagram URLs, processes them through a durable Postgres queue, and writes extracted places (name, address, lat/lng, category, supporting quote) into Supabase with accuracy-first guards (self-consistency voting + dual-source geocoding + an eval harness).

**Architecture:** In-process worker pool inside the existing Bun/Hono server. SKIP-LOCKED Postgres queue (`instagram_jobs`), cached IG payloads (`instagram_posts`), per-user extracted places (`instagram_places`). Pipeline per job: fetch (yt-dlp → Apify) → transcribe (Groq Whisper dual-pass) → OCR frames (Google Vision) → extract places (Groq gpt-oss-120b self-consistency 3-vote) → geocode (Google Places + Kakao in parallel, reconcile).

**Tech Stack:** Bun, Hono, TypeScript, Zod, `groq-sdk`, Supabase REST (no client SDK), Clerk (`@clerk/backend` for JWT), `bun test`, `bun:sqlite` for in-memory integration substrate (or real Supabase test project), local `yt-dlp` + `ffmpeg` CLIs, Apify `instagram-scraper` actor, Google Places New API, Google Vision OCR, Kakao Local API.

**Design source:** `docs/superpowers/specs/2026-05-18-instagram-place-extractor-design.md` — read this first.

---

## File map (locked in before tasks)

```
supabase/schema.sql                                      MODIFY (append migration)

server/src/config.ts                                     MODIFY (env vars)
server/src/middleware/clerkAuth.ts                       CREATE
server/src/igPlaces/types.ts                             CREATE
server/src/igPlaces/normalizeUrl.ts                      CREATE
server/src/igPlaces/supabase.ts                          CREATE  (narrow REST helper)
server/src/igPlaces/queue.ts                             CREATE
server/src/igPlaces/fetchPost.ts                         CREATE
server/src/igPlaces/transcribe.ts                        CREATE
server/src/igPlaces/extractFrames.ts                     CREATE
server/src/igPlaces/ocr.ts                               CREATE
server/src/igPlaces/buildBundle.ts                       CREATE
server/src/igPlaces/extractPlaces.ts                     CREATE
server/src/igPlaces/geocode.ts                           CREATE
server/src/igPlaces/savePlaces.ts                        CREATE
server/src/igPlaces/process.ts                           CREATE
server/src/igPlaces/worker.ts                            CREATE
server/src/igPlaces/cli.ts                               CREATE  (manual E2E)
server/src/igPlaces/README.md                            CREATE

server/src/igPlaces/__fixtures__/                        CREATE (test fixtures dir)
server/src/igPlaces/eval/run.ts                          CREATE
server/src/igPlaces/eval/score.ts                        CREATE
server/src/igPlaces/eval/capture.ts                      CREATE
server/src/igPlaces/eval/README.md                       CREATE
server/src/igPlaces/eval/fixtures/                       CREATE

server/src/routes/instagramPlaces.ts                     CREATE
server/app.ts                                            MODIFY (route mount + worker boot)

package.json                                             MODIFY (devDeps: @clerk/backend)
```

Each `igPlaces/*.ts` module exports both a factory taking injected deps and a default instance using real deps, so unit tests can inject mocks.

---

## Conventions

- **TDD:** test first, watch it fail, implement, watch it pass, commit.
- **Test runner:** Bun's built-in. Files end `.test.ts`. Integration files end `.int.test.ts` and are gated by `INTEGRATION=1` (skipped in `bun test`).
- **Commit cadence:** one commit per task. Conventional commits (`feat`, `test`, `chore`, `docs`).
- **No `any`.** Use `unknown` + narrow.
- **No global mutable state.** Modules export factories.

---

### Task 1: Database migration

**Files:**
- Modify: `supabase/schema.sql` (append; existing file ends after the `korea_entity_about` block)

- [ ] **Step 1: Append schema for instagram_jobs, instagram_posts, instagram_places + enums**

Add to the end of `supabase/schema.sql`:

```sql
-- ============================================================
-- Instagram → Korea trip place extractor
-- See docs/superpowers/specs/2026-05-18-instagram-place-extractor-design.md
-- ============================================================

create type ig_job_status        as enum ('pending','running','done','failed','dead');
create type ig_place_category    as enum (
  'restaurant','cafe','bar','shopping','activity',
  'hotel','landmark','other'
);
create type ig_signal_source     as enum ('caption','transcript','ocr','location_tag','multiple');
create type ig_confidence_band   as enum ('high','medium','low');

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
  source         text not null,
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
  confidence_band   ig_confidence_band not null default 'low',
  supporting_quote  text,
  signal_source     ig_signal_source,
  vote_count        smallint not null default 1,
  geocode_source    text,
  geocode_kakao_id  text,
  geocode_disagree  boolean not null default false,
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

- [ ] **Step 2: Apply migration**

Paste the appended block into the Supabase Dashboard SQL editor and run. Verify no errors. Confirm tables exist:

```sql
select table_name from information_schema.tables
 where table_schema = 'public' and table_name like 'instagram_%';
```

Expected: three rows (`instagram_jobs`, `instagram_places`, `instagram_posts`).

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(igPlaces): add instagram_jobs/posts/places tables + RLS"
```

---

### Task 2: Server config & env vars

**Files:**
- Modify: `server/src/config.ts`

- [ ] **Step 1: Replace config.ts with the extended version**

```ts
const isTruthy = (v: string | undefined) => v !== undefined && v !== 'false' && v !== '0';

export const config = {
  port: process.env.PORT || 3000,
  deepseekApiKey: process.env.KLUSTER_API_KEY,
  deepseekApiBaseUrl: process.env.KLUSTER_API_BASE_URL,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,

  groqApiKey: process.env.GROQ_API_KEY,
  apifyToken: process.env.APIFY_TOKEN,
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
  googleVisionApiKey: process.env.GOOGLE_VISION_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY,
  kakaoRestApiKey: process.env.KAKAO_REST_API_KEY,

  clerkSecretKey: process.env.CLERK_SECRET_KEY,
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY,

  igWorkerEnabled: isTruthy(process.env.IG_WORKER_ENABLED ?? 'true'),
  igWorkerConcurrency: Number(process.env.IG_WORKER_CONCURRENCY ?? 3),
  igWorkerPollMs: Number(process.env.IG_WORKER_POLL_MS ?? 3_000),
  igWorkerStaleSec: Number(process.env.IG_WORKER_STALE_SEC ?? 600),
} as const;

// Validate required env vars — only enforce keys for features that are enabled.
const requiredAlways = ['KLUSTER_API_KEY', 'KLUSTER_API_BASE_URL'] as const;
for (const v of requiredAlways) {
  if (!process.env[v]) throw new Error(`Missing required environment variable: ${v}`);
}

if (config.igWorkerEnabled) {
  const required = ['APIFY_TOKEN', 'GOOGLE_MAPS_API_KEY', 'GROQ_API_KEY', 'CLERK_SECRET_KEY',
                    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
  for (const v of required) {
    if (!process.env[v] && !(v === 'SUPABASE_URL' && process.env.VITE_SUPABASE_URL)) {
      console.warn(`[ig-worker] env missing: ${v} — worker will fail on first job`);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/config.ts
git commit -m "feat(igPlaces): add worker + clerk + apify env config"
```

---

### Task 3: Bun test setup + Clerk backend dep

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add @clerk/backend dependency**

```bash
cd /Users/anthony.lim/Projects/anthonyl.im_
bun add @clerk/backend
```

- [ ] **Step 2: Add test scripts to package.json**

In `package.json`, extend `"scripts"`:

```json
"scripts": {
  "start": "bun run server/app.ts",
  "dev": "pushd frontend && bun run build && popd && bun --watch server/app.ts",
  "test": "bun test --bail",
  "test:int": "INTEGRATION=1 bun test --bail",
  "test:eval": "bun run server/src/igPlaces/eval/run.ts"
}
```

- [ ] **Step 3: Verify Bun test works**

```bash
mkdir -p server/src/igPlaces
echo 'import { test, expect } from "bun:test"; test("sanity", () => expect(1+1).toBe(2));' > server/src/igPlaces/__sanity__.test.ts
bun test server/src/igPlaces/__sanity__.test.ts
```

Expected: 1 test passes.

Remove the sanity file:

```bash
rm server/src/igPlaces/__sanity__.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore(igPlaces): add @clerk/backend, bun test scripts"
```

---

### Task 4: URL normalization (pure, TDD)

**Files:**
- Create: `server/src/igPlaces/normalizeUrl.ts`
- Test: `server/src/igPlaces/normalizeUrl.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// server/src/igPlaces/normalizeUrl.test.ts
import { test, expect, describe } from 'bun:test';
import { normalizeInstagramUrl, isInstagramUrl } from './normalizeUrl';

describe('normalizeInstagramUrl', () => {
  test('lowercases host and strips trailing slash', () => {
    expect(normalizeInstagramUrl('https://WWW.Instagram.com/p/ABC123/'))
      .toBe('https://www.instagram.com/p/ABC123');
  });
  test('strips utm_* and igsh query params, keeps the rest', () => {
    expect(normalizeInstagramUrl('https://instagram.com/reel/XYZ?utm_source=ig&igsh=abc&foo=bar'))
      .toBe('https://www.instagram.com/reel/XYZ?foo=bar');
  });
  test('canonicalizes bare instagram.com to www.instagram.com', () => {
    expect(normalizeInstagramUrl('https://instagram.com/p/A'))
      .toBe('https://www.instagram.com/p/A');
  });
  test('rejects non-instagram hosts', () => {
    expect(() => normalizeInstagramUrl('https://twitter.com/x/y')).toThrow();
  });
  test('isInstagramUrl returns false for non-IG and true for IG', () => {
    expect(isInstagramUrl('https://foo.com/p/abc')).toBe(false);
    expect(isInstagramUrl('https://www.instagram.com/p/abc')).toBe(true);
    expect(isInstagramUrl('https://m.instagram.com/reel/abc')).toBe(true);
  });
  test('strips share/ redirect prefix', () => {
    expect(normalizeInstagramUrl('https://instagram.com/share/p/ABC'))
      .toBe('https://www.instagram.com/p/ABC');
  });
});
```

- [ ] **Step 2: Run tests, watch them fail**

```bash
bun test server/src/igPlaces/normalizeUrl.test.ts
```

Expected: fails because module doesn't exist.

- [ ] **Step 3: Implement the module**

```ts
// server/src/igPlaces/normalizeUrl.ts
const IG_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);
const TRACKING_PARAMS = /^(utm_|igsh$|igshid$|fbclid$|si$)/;

export function isInstagramUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return IG_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function normalizeInstagramUrl(input: string): string {
  const u = new URL(input);
  const host = u.hostname.toLowerCase();
  if (!IG_HOSTS.has(host)) {
    throw new Error(`not an instagram url: ${input}`);
  }

  // Strip /share/ redirect prefix: /share/p/ABC → /p/ABC
  let pathname = u.pathname.replace(/^\/share\//, '/');
  // Trim trailing slash
  pathname = pathname.replace(/\/+$/, '');

  // Filter query
  const params = new URLSearchParams();
  for (const [k, v] of u.searchParams) {
    if (!TRACKING_PARAMS.test(k)) params.append(k, v);
  }
  const qs = params.toString();
  return `https://www.instagram.com${pathname}${qs ? '?' + qs : ''}`;
}
```

- [ ] **Step 4: Run tests, watch them pass**

```bash
bun test server/src/igPlaces/normalizeUrl.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/igPlaces/normalizeUrl.ts server/src/igPlaces/normalizeUrl.test.ts
git commit -m "feat(igPlaces): normalize instagram urls for dedupe"
```

---

### Task 5: Shared types module

**Files:**
- Create: `server/src/igPlaces/types.ts`

- [ ] **Step 1: Write the types file**

```ts
// server/src/igPlaces/types.ts
export type IgJobStatus = 'pending' | 'running' | 'done' | 'failed' | 'dead';
export type IgPlaceCategory = 'restaurant'|'cafe'|'bar'|'shopping'|'activity'
                            | 'hotel'|'landmark'|'other';
export type IgSignalSource = 'caption'|'transcript'|'ocr'|'location_tag'|'multiple';
export type IgConfidenceBand = 'high'|'medium'|'low';

export interface IgJob {
  id: number;
  userId: string;
  url: string;
  dedupeKey: string;
  status: IgJobStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  scheduledFor: string;
  lockedAt: string | null;
  lockedBy: string | null;
  postId: number | null;
}

export interface MediaItem {
  type: 'image' | 'video';
  url: string;
  thumbnail?: string;
}

export interface LocationTag {
  name: string;
  lat?: number;
  lng?: number;
}

export interface PostPayload {
  shortcode: string;
  ownerUsername?: string;
  caption: string;
  mediaItems: MediaItem[];
  locationTag?: LocationTag;
  source: 'yt-dlp' | 'apify';
  raw: unknown;
}

export interface ExtractionBundle {
  caption: string;
  transcript?: string;
  ocr?: string;
  locationTagName?: string;
  hashtags: string[];
  mentions: string[];
}

export interface RawExtractedPlace {
  name: string;
  name_romanized: string | null;
  city: string | null;
  category: IgPlaceCategory;
  confidence: number;          // 0..1
  is_subject: boolean;
  supporting_quote: string;
  signal_source: IgSignalSource;
}

export interface VotedPlace extends RawExtractedPlace {
  vote_count: number;          // 1..N
  confidence_band: IgConfidenceBand;
}

export interface EnrichedPlace extends VotedPlace {
  address: string | null;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  phone: string | null;
  rating: number | null;
  business_types: string[];
  geocode_source: 'apify-tag'|'google'|'kakao'|'google+kakao'|null;
  geocode_kakao_id: string | null;
  geocode_disagree: boolean;
}

export class RetryableError extends Error {
  constructor(message: string, public retryAfterMs?: number) { super(message); }
}
export class NonRetryableError extends Error {
  constructor(message: string) { super(message); }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
bun build server/src/igPlaces/types.ts --target=bun --outfile=/dev/null
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/igPlaces/types.ts
git commit -m "feat(igPlaces): shared TS types for the pipeline"
```

---

### Task 6: Supabase narrow REST helper

**Files:**
- Create: `server/src/igPlaces/supabase.ts`
- Test: `server/src/igPlaces/supabase.test.ts`

The helper is a thin wrapper over `fetch` for PostgREST. It supports `select`, `insert`, `update`, and `rpc`. Tests use a mocked `fetch`.

- [ ] **Step 1: Write the failing tests**

```ts
// server/src/igPlaces/supabase.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createSupabaseClient } from './supabase';

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  return mock(async (url: string, init?: RequestInit) =>
    handler(url, init ?? {}));
}

describe('createSupabaseClient', () => {
  test('select with eq filter builds correct url + headers', async () => {
    const fetch = mockFetch((url, init) => {
      expect(url).toContain('/rest/v1/foo?id=eq.42&select=id,name');
      const headers = init.headers as Record<string, string>;
      expect(headers['apikey']).toBe('SVC');
      expect(headers['Authorization']).toBe('Bearer SVC');
      return new Response(JSON.stringify([{ id: 42, name: 'x' }]), { status: 200 });
    });
    const sb = createSupabaseClient({ url: 'https://h.supabase.co', serviceKey: 'SVC', fetch });
    const rows = await sb.select<{id:number; name:string}>('foo', { eq: { id: 42 }, select: 'id,name' });
    expect(rows).toEqual([{ id: 42, name: 'x' }]);
  });

  test('insert with on_conflict + returning', async () => {
    const fetch = mockFetch((url, init) => {
      expect(url).toContain('/rest/v1/jobs?on_conflict=dedupe_key');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['Prefer']).toContain('resolution=merge-duplicates');
      expect(headers['Prefer']).toContain('return=representation');
      return new Response(JSON.stringify([{ id: 1 }]), { status: 201 });
    });
    const sb = createSupabaseClient({ url: 'https://h.supabase.co', serviceKey: 'SVC', fetch });
    const r = await sb.insert('jobs', { x: 1 }, { onConflict: 'dedupe_key', returning: 'representation' });
    expect(r).toEqual([{ id: 1 }]);
  });

  test('rpc calls /rpc/<fn> with body', async () => {
    const fetch = mockFetch((url, init) => {
      expect(url).toContain('/rest/v1/rpc/claim_job');
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify({ worker: 'w1' }));
      return new Response(JSON.stringify({ id: 7 }), { status: 200 });
    });
    const sb = createSupabaseClient({ url: 'https://h.supabase.co', serviceKey: 'SVC', fetch });
    const r = await sb.rpc<{id:number}>('claim_job', { worker: 'w1' });
    expect(r).toEqual({ id: 7 });
  });

  test('non-2xx throws with status + body', async () => {
    const fetch = mockFetch(() => new Response('boom', { status: 500 }));
    const sb = createSupabaseClient({ url: 'https://h.supabase.co', serviceKey: 'SVC', fetch });
    await expect(sb.select('foo')).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 2: Run tests, watch them fail**

```bash
bun test server/src/igPlaces/supabase.test.ts
```

Expected: fails — no module.

- [ ] **Step 3: Implement the helper**

```ts
// server/src/igPlaces/supabase.ts
export interface SupabaseConfig {
  url: string;
  serviceKey: string;
  fetch?: typeof fetch;
}

export interface SelectOptions {
  select?: string;
  eq?: Record<string, string | number | boolean>;
  order?: string;
  limit?: number;
}

export interface InsertOptions {
  onConflict?: string;
  returning?: 'minimal' | 'representation';
}

export interface SupabaseClient {
  select<T>(table: string, opts?: SelectOptions): Promise<T[]>;
  insert<T = unknown>(table: string, row: object, opts?: InsertOptions): Promise<T[]>;
  update<T = unknown>(table: string, patch: object, eq: Record<string, unknown>): Promise<T[]>;
  rpc<T = unknown>(fn: string, args?: object): Promise<T>;
}

export function createSupabaseClient(cfg: SupabaseConfig): SupabaseClient {
  const f = cfg.fetch ?? fetch;
  const baseHeaders = {
    apikey: cfg.serviceKey,
    Authorization: `Bearer ${cfg.serviceKey}`,
    'Content-Type': 'application/json',
  };

  async function call(path: string, init: RequestInit): Promise<Response> {
    const r = await f(`${cfg.url}/rest/v1${path}`, init);
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`supabase ${init.method ?? 'GET'} ${path} → ${r.status}: ${body.slice(0, 200)}`);
    }
    return r;
  }

  function eqParams(eq: Record<string, unknown> | undefined): string {
    if (!eq) return '';
    return Object.entries(eq)
      .map(([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(String(v))}`)
      .join('&');
  }

  return {
    async select<T>(table, opts = {}) {
      const parts: string[] = [];
      const eq = eqParams(opts.eq);
      if (eq) parts.push(eq);
      if (opts.select) parts.push(`select=${encodeURIComponent(opts.select)}`);
      if (opts.order) parts.push(`order=${encodeURIComponent(opts.order)}`);
      if (opts.limit) parts.push(`limit=${opts.limit}`);
      const qs = parts.length ? `?${parts.join('&')}` : '';
      const r = await call(`/${table}${qs}`, { headers: { ...baseHeaders, Accept: 'application/json' } });
      return (await r.json()) as T[];
    },

    async insert(table, row, opts = {}) {
      const parts: string[] = [];
      if (opts.onConflict) parts.push(`on_conflict=${encodeURIComponent(opts.onConflict)}`);
      const qs = parts.length ? `?${parts.join('&')}` : '';
      const prefer: string[] = [];
      if (opts.onConflict) prefer.push('resolution=merge-duplicates');
      prefer.push(opts.returning === 'representation' ? 'return=representation' : 'return=minimal');
      const r = await call(`/${table}${qs}`, {
        method: 'POST',
        headers: { ...baseHeaders, Prefer: prefer.join(',') },
        body: JSON.stringify(row),
      });
      const txt = await r.text();
      return txt ? JSON.parse(txt) : [];
    },

    async update(table, patch, eq) {
      const qs = eqParams(eq);
      const r = await call(`/${table}?${qs}`, {
        method: 'PATCH',
        headers: { ...baseHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      });
      const txt = await r.text();
      return txt ? JSON.parse(txt) : [];
    },

    async rpc(fn, args = {}) {
      const r = await call(`/rpc/${fn}`, {
        method: 'POST',
        headers: { ...baseHeaders },
        body: JSON.stringify(args),
      });
      const txt = await r.text();
      return (txt ? JSON.parse(txt) : null) as never;
    },
  };
}
```

- [ ] **Step 4: Run tests, watch them pass**

```bash
bun test server/src/igPlaces/supabase.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/igPlaces/supabase.ts server/src/igPlaces/supabase.test.ts
git commit -m "feat(igPlaces): narrow supabase REST helper"
```

---

### Task 7: Queue module (enqueue / claim / complete / fail / reapStale)

Claim and fail need raw SQL with `SKIP LOCKED` and `xmax` semantics; PostgREST doesn't expose `FOR UPDATE` directly. We expose them as Postgres functions (RPC).

**Files:**
- Modify: `supabase/schema.sql` (add three functions)
- Create: `server/src/igPlaces/queue.ts`
- Test: `server/src/igPlaces/queue.test.ts`

- [ ] **Step 1: Add SQL functions in schema.sql**

Append:

```sql
-- ============================================================
-- IG worker queue helpers (server uses these via PostgREST /rpc/)
-- ============================================================

create or replace function public.ig_enqueue_job(
  p_user_id text, p_url text, p_dedupe_key text
) returns table (id bigint, status ig_job_status, inserted boolean)
language sql security definer as $$
  insert into public.instagram_jobs (user_id, url, dedupe_key)
  values (p_user_id, p_url, p_dedupe_key)
  on conflict (dedupe_key) do update set updated_at = now()
  returning instagram_jobs.id, instagram_jobs.status, (xmax = 0) as inserted;
$$;

create or replace function public.ig_claim_job(p_worker text)
returns setof public.instagram_jobs
language sql security definer as $$
  with claimed as (
    select id from public.instagram_jobs
     where status = 'pending' and scheduled_for <= now()
     order by scheduled_for
     for update skip locked
     limit 1
  )
  update public.instagram_jobs j
     set status='running', attempts=attempts+1,
         locked_at=now(), locked_by=p_worker, updated_at=now()
    from claimed
   where j.id = claimed.id
  returning j.*;
$$;

create or replace function public.ig_fail_job(
  p_job_id bigint, p_error text, p_retryable boolean
) returns void language sql security definer as $$
  update public.instagram_jobs
     set status = case
                    when attempts >= max_attempts then 'dead'::ig_job_status
                    when p_retryable = false      then 'dead'::ig_job_status
                    else 'pending'::ig_job_status
                  end,
         scheduled_for = now() + (interval '1 second'
                                  * power(2, attempts) * 30 * (0.5 + random())),
         last_error = p_error,
         locked_at = null, locked_by = null,
         updated_at = now()
   where id = p_job_id;
$$;

create or replace function public.ig_reap_stale(p_threshold_sec int)
returns int language plpgsql security definer as $$
declare n int;
begin
  update public.instagram_jobs
     set status='pending', locked_at=null, locked_by=null,
         last_error='reaped: stale lock', updated_at=now()
   where status='running' and locked_at < now() - (p_threshold_sec * interval '1 second');
  get diagnostics n = row_count;
  return n;
end $$;
```

Apply via Supabase SQL editor.

- [ ] **Step 2: Write failing tests**

```ts
// server/src/igPlaces/queue.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createQueue } from './queue';
import type { SupabaseClient } from './supabase';

function stubSupabase(impl: Partial<SupabaseClient>): SupabaseClient {
  return {
    select: mock(() => Promise.resolve([])),
    insert: mock(() => Promise.resolve([])),
    update: mock(() => Promise.resolve([])),
    rpc:    mock(() => Promise.resolve(null)),
    ...impl,
  } as SupabaseClient;
}

describe('queue.enqueue', () => {
  test('returns reused: false when inserted=true', async () => {
    const sb = stubSupabase({
      rpc: mock(async () => [{ id: 7, status: 'pending', inserted: true }]),
    });
    const q = createQueue(sb, { normalize: (u) => u });
    const r = await q.enqueue('user-1', 'https://www.instagram.com/p/A');
    expect(r.jobId).toBe(7);
    expect(r.reused).toBe(false);
  });
  test('returns reused: true when inserted=false', async () => {
    const sb = stubSupabase({
      rpc: mock(async () => [{ id: 7, status: 'running', inserted: false }]),
    });
    const q = createQueue(sb, { normalize: (u) => u });
    const r = await q.enqueue('user-1', 'https://www.instagram.com/p/A');
    expect(r.reused).toBe(true);
    expect(r.status).toBe('running');
  });
});

describe('queue.claim', () => {
  test('returns null when no job available', async () => {
    const sb = stubSupabase({ rpc: mock(async () => []) });
    const q = createQueue(sb, { normalize: (u) => u });
    expect(await q.claim('w1')).toBeNull();
  });
  test('returns a job when one is claimable', async () => {
    const sb = stubSupabase({
      rpc: mock(async () => [{
        id: 1, user_id: 'u', url: 'https://i', dedupe_key: 'd',
        status: 'running', attempts: 1, max_attempts: 5, last_error: null,
        scheduled_for: 'x', locked_at: 'y', locked_by: 'w1', post_id: null,
      }]),
    });
    const q = createQueue(sb, { normalize: (u) => u });
    const j = await q.claim('w1');
    expect(j?.id).toBe(1);
    expect(j?.lockedBy).toBe('w1');
  });
});

describe('queue.fail', () => {
  test('passes retryable=false through to rpc', async () => {
    const rpc = mock(async () => null);
    const sb = stubSupabase({ rpc });
    const q = createQueue(sb, { normalize: (u) => u });
    await q.fail(42, new Error('bad'), false);
    expect(rpc).toHaveBeenCalledWith('ig_fail_job',
      { p_job_id: 42, p_error: 'bad', p_retryable: false });
  });
});
```

- [ ] **Step 3: Run tests, watch them fail**

```bash
bun test server/src/igPlaces/queue.test.ts
```

Expected: fails — no module.

- [ ] **Step 4: Implement the queue module**

```ts
// server/src/igPlaces/queue.ts
import type { IgJob } from './types';
import type { SupabaseClient } from './supabase';
import { normalizeInstagramUrl } from './normalizeUrl';

export interface EnqueueResult {
  jobId: number;
  dedupeKey: string;
  status: IgJob['status'];
  reused: boolean;
}

export interface Queue {
  enqueue(userId: string, url: string): Promise<EnqueueResult>;
  claim(workerId: string): Promise<IgJob | null>;
  complete(jobId: number, postId: number): Promise<void>;
  fail(jobId: number, error: Error, retryable: boolean): Promise<void>;
  reapStale(thresholdSec: number): Promise<number>;
}

export interface QueueDeps {
  normalize?: (url: string) => string;
}

interface JobRow {
  id: number; user_id: string; url: string; dedupe_key: string;
  status: IgJob['status']; attempts: number; max_attempts: number;
  last_error: string | null; scheduled_for: string;
  locked_at: string | null; locked_by: string | null; post_id: number | null;
}

function fromRow(r: JobRow): IgJob {
  return {
    id: r.id, userId: r.user_id, url: r.url, dedupeKey: r.dedupe_key,
    status: r.status, attempts: r.attempts, maxAttempts: r.max_attempts,
    lastError: r.last_error, scheduledFor: r.scheduled_for,
    lockedAt: r.locked_at, lockedBy: r.locked_by, postId: r.post_id,
  };
}

export function createQueue(sb: SupabaseClient, deps: QueueDeps = {}): Queue {
  const normalize = deps.normalize ?? normalizeInstagramUrl;

  return {
    async enqueue(userId, url) {
      const dedupeKey = normalize(url);
      const rows = await sb.rpc<Array<{ id: number; status: IgJob['status']; inserted: boolean }>>(
        'ig_enqueue_job', { p_user_id: userId, p_url: url, p_dedupe_key: dedupeKey });
      const row = rows[0];
      return { jobId: row.id, dedupeKey, status: row.status, reused: !row.inserted };
    },

    async claim(workerId) {
      const rows = await sb.rpc<JobRow[]>('ig_claim_job', { p_worker: workerId });
      return rows.length ? fromRow(rows[0]) : null;
    },

    async complete(jobId, postId) {
      await sb.update('instagram_jobs',
        { status: 'done', post_id: postId, locked_at: null, locked_by: null,
          last_error: null, updated_at: new Date().toISOString() },
        { id: jobId });
    },

    async fail(jobId, error, retryable) {
      await sb.rpc('ig_fail_job', {
        p_job_id: jobId,
        p_error: error.message.slice(0, 500),
        p_retryable: retryable,
      });
    },

    async reapStale(thresholdSec) {
      const n = await sb.rpc<number>('ig_reap_stale', { p_threshold_sec: thresholdSec });
      return typeof n === 'number' ? n : 0;
    },
  };
}
```

- [ ] **Step 5: Run tests, watch them pass**

```bash
bun test server/src/igPlaces/queue.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/schema.sql server/src/igPlaces/queue.ts server/src/igPlaces/queue.test.ts
git commit -m "feat(igPlaces): queue module + SKIP LOCKED postgres functions"
```

---

### Task 8: fetchPost (yt-dlp → Apify fallback)

**Files:**
- Create: `server/src/igPlaces/fetchPost.ts`
- Test: `server/src/igPlaces/fetchPost.test.ts`
- Create: `server/src/igPlaces/__fixtures__/yt-dlp-cafe.json`
- Create: `server/src/igPlaces/__fixtures__/apify-cafe.json`

- [ ] **Step 1: Create fixture files**

Create `server/src/igPlaces/__fixtures__/yt-dlp-cafe.json`:

```json
{
  "id": "ABC123",
  "title": "Cafe Onion Anguk",
  "description": "성수동에서 가장 좋아하는 카페! Onion 어니언",
  "uploader": "anonfoodie",
  "uploader_id": "anonfoodie",
  "url": "https://scontent.cdninstagram.com/video.mp4",
  "thumbnails": [{ "url": "https://scontent.cdninstagram.com/thumb.jpg" }],
  "duration": 30
}
```

Create `server/src/igPlaces/__fixtures__/apify-cafe.json`:

```json
[{
  "shortCode": "ABC123",
  "ownerUsername": "anonfoodie",
  "caption": "성수동에서 가장 좋아하는 카페! Onion 어니언",
  "videoUrl": "https://scontent.cdninstagram.com/video.mp4",
  "displayUrl": "https://scontent.cdninstagram.com/thumb.jpg",
  "type": "Video",
  "locationName": "Cafe Onion Seongsu",
  "latitude": 37.5447,
  "longitude": 127.0556
}]
```

- [ ] **Step 2: Write failing tests**

```ts
// server/src/igPlaces/fetchPost.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createFetchPost } from './fetchPost';
import ytDlpFixture from './__fixtures__/yt-dlp-cafe.json';
import apifyFixture from './__fixtures__/apify-cafe.json';
import { RetryableError, NonRetryableError } from './types';

function stubSpawn(stdoutJson: object | null, exit: number) {
  return mock((_args: string[], _opts?: object) => {
    const proc: any = {
      stdout: stdoutJson !== null
        ? new Response(JSON.stringify(stdoutJson)).body
        : new Response('').body,
      exited: Promise.resolve(exit),
      stderr: new Response('').body,
    };
    return proc;
  });
}

describe('fetchPost (yt-dlp path)', () => {
  test('yt-dlp succeeds → returns PostPayload with source=yt-dlp', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(ytDlpFixture, 0),
      fetch: mock(async () => new Response('should not be called', { status: 500 })),
      apifyToken: 'TOKEN',
    });
    const r = await fetchPost('https://www.instagram.com/reel/ABC123', null);
    expect(r.source).toBe('yt-dlp');
    expect(r.caption).toContain('성수동');
    expect(r.mediaItems.length).toBeGreaterThan(0);
  });
});

describe('fetchPost (Apify fallback)', () => {
  test('yt-dlp exit≠0 → falls through to Apify', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(null, 1),
      fetch: mock(async (url: string) => {
        expect(url).toContain('apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items');
        return new Response(JSON.stringify(apifyFixture), { status: 200 });
      }),
      apifyToken: 'TOKEN',
    });
    const r = await fetchPost('https://www.instagram.com/reel/ABC123', null);
    expect(r.source).toBe('apify');
    expect(r.locationTag?.name).toBe('Cafe Onion Seongsu');
    expect(r.locationTag?.lat).toBe(37.5447);
  });
  test('Apify 429 throws RetryableError with 5min backoff', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(null, 1),
      fetch: mock(async () => new Response('rate limited', { status: 429 })),
      apifyToken: 'TOKEN',
    });
    await expect(fetchPost('https://www.instagram.com/reel/ABC123', null))
      .rejects.toThrow(RetryableError);
  });
  test('Apify empty array throws NonRetryableError', async () => {
    const fetchPost = createFetchPost({
      spawn: stubSpawn(null, 1),
      fetch: mock(async () => new Response('[]', { status: 200 })),
      apifyToken: 'TOKEN',
    });
    await expect(fetchPost('https://www.instagram.com/reel/ABC123', null))
      .rejects.toThrow(NonRetryableError);
  });
});
```

- [ ] **Step 3: Run tests, watch them fail**

```bash
bun test server/src/igPlaces/fetchPost.test.ts
```

Expected: fails.

- [ ] **Step 4: Implement fetchPost**

```ts
// server/src/igPlaces/fetchPost.ts
import { type PostPayload, type MediaItem, type LocationTag,
         RetryableError, NonRetryableError } from './types';

export interface FetchPostDeps {
  spawn?: (cmd: string[], opts?: { timeout?: number }) => {
    stdout: ReadableStream<Uint8Array> | null;
    stderr: ReadableStream<Uint8Array> | null;
    exited: Promise<number>;
  };
  fetch?: typeof fetch;
  apifyToken: string | undefined;
}

export type FetchPost = (url: string, cached: PostPayload | null) => Promise<PostPayload>;

export function createFetchPost(deps: FetchPostDeps): FetchPost {
  const spawn = deps.spawn ?? ((cmd, opts) => Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe', ...opts }) as any);
  const f = deps.fetch ?? fetch;

  return async function fetchPost(url, cached) {
    if (cached) return cached;
    const local = await tryYtDlp(url, spawn);
    if (local) return local;
    return tryApify(url, f, deps.apifyToken);
  };
}

async function tryYtDlp(url: string, spawn: NonNullable<FetchPostDeps['spawn']>): Promise<PostPayload | null> {
  try {
    const proc = spawn(
      ['yt-dlp', '--dump-single-json', '--no-download', '--no-warnings', '--quiet', url],
      { timeout: 20_000 });
    const code = await proc.exited;
    if (code !== 0) return null;
    if (!proc.stdout) return null;
    const text = await new Response(proc.stdout).text();
    if (!text.trim()) return null;
    const json = JSON.parse(text) as Record<string, unknown>;
    return normalizeYtDlp(json);
  } catch { return null; }
}

function normalizeYtDlp(j: Record<string, unknown>): PostPayload | null {
  const id = String(j.id ?? j.display_id ?? '');
  if (!id) return null;
  const caption = String(j.description ?? j.title ?? '');
  const videoUrl = typeof j.url === 'string' ? j.url : undefined;
  const thumbs = Array.isArray(j.thumbnails) ? j.thumbnails as Array<{url:string}> : [];
  const items: MediaItem[] = [];
  if (videoUrl) items.push({ type: 'video', url: videoUrl, thumbnail: thumbs[0]?.url });
  else if (thumbs[0]?.url) items.push({ type: 'image', url: thumbs[0].url });
  if (!items.length) return null;
  return {
    shortcode: id,
    ownerUsername: typeof j.uploader_id === 'string' ? j.uploader_id : undefined,
    caption,
    mediaItems: items,
    source: 'yt-dlp',
    raw: j,
  };
}

interface ApifyItem {
  shortCode?: string; ownerUsername?: string; caption?: string;
  videoUrl?: string; displayUrl?: string; images?: string[];
  locationName?: string; latitude?: number; longitude?: number; type?: string;
}

async function tryApify(url: string, f: typeof fetch, token: string | undefined): Promise<PostPayload> {
  if (!token) throw new NonRetryableError('APIFY_TOKEN missing');
  const r = await f(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directUrls: [url], resultsLimit: 1 }),
    });
  if (r.status === 429) throw new RetryableError('apify rate-limited', 300_000);
  if (!r.ok) throw new Error(`apify ${r.status}`);
  const items = (await r.json()) as ApifyItem[];
  if (!items.length) throw new NonRetryableError('apify returned empty');
  return normalizeApify(items[0], url);
}

function normalizeApify(it: ApifyItem, url: string): PostPayload {
  const items: MediaItem[] = [];
  if (it.videoUrl) items.push({ type: 'video', url: it.videoUrl, thumbnail: it.displayUrl });
  if (it.images?.length) for (const img of it.images) items.push({ type: 'image', url: img });
  if (!items.length && it.displayUrl) items.push({ type: 'image', url: it.displayUrl });
  const locationTag: LocationTag | undefined = it.locationName
    ? { name: it.locationName, lat: it.latitude, lng: it.longitude }
    : undefined;
  return {
    shortcode: it.shortCode ?? url.split('/').filter(Boolean).pop() ?? '',
    ownerUsername: it.ownerUsername,
    caption: it.caption ?? '',
    mediaItems: items,
    locationTag,
    source: 'apify',
    raw: it,
  };
}
```

- [ ] **Step 5: Run tests, watch them pass**

```bash
bun test server/src/igPlaces/fetchPost.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/igPlaces/fetchPost.ts server/src/igPlaces/fetchPost.test.ts server/src/igPlaces/__fixtures__/
git commit -m "feat(igPlaces): fetchPost with yt-dlp + Apify fallback"
```

---

### Task 9: Transcription (Groq Whisper dual-pass)

**Files:**
- Create: `server/src/igPlaces/transcribe.ts`
- Test: `server/src/igPlaces/transcribe.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// server/src/igPlaces/transcribe.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createTranscriber, mergeSegments } from './transcribe';

describe('mergeSegments', () => {
  test('picks higher avg_logprob per overlapping span', () => {
    const ko = { segments: [{ start: 0, end: 5, text: 'A', avg_logprob: -0.6 }] };
    const auto = { segments: [{ start: 0, end: 5, text: 'B', avg_logprob: -0.3 }] };
    expect(mergeSegments(ko, auto)).toBe('B');
  });
  test('orders by start time when non-overlapping', () => {
    const ko = { segments: [{ start: 5, end: 10, text: 'second', avg_logprob: -0.5 }] };
    const auto = { segments: [{ start: 0, end: 5, text: 'first', avg_logprob: -0.4 }] };
    expect(mergeSegments(ko, auto)).toBe('first second');
  });
});

describe('createTranscriber', () => {
  test('runs both passes in parallel and merges', async () => {
    let calls = 0;
    const groq = {
      audio: { transcriptions: { create: mock(async (opts: any) => {
        calls++;
        return {
          text: opts.language === 'ko' ? 'KO' : 'AUTO',
          segments: [{ start: 0, end: 5, text: opts.language === 'ko' ? 'KO' : 'AUTO',
                       avg_logprob: opts.language === 'ko' ? -0.6 : -0.3 }],
        };
      })}}
    } as any;
    const t = createTranscriber({ groq });
    const out = await t({ filePath: '/tmp/x.m4a', biasPrompt: 'BIAS' });
    expect(calls).toBe(2);
    expect(out).toBe('AUTO');
  });
});
```

- [ ] **Step 2: Run tests, watch them fail**

```bash
bun test server/src/igPlaces/transcribe.test.ts
```

Expected: fails.

- [ ] **Step 3: Implement transcribe**

```ts
// server/src/igPlaces/transcribe.ts
import type Groq from 'groq-sdk';
import { createReadStream } from 'node:fs';

interface VerboseSegment { start: number; end: number; text: string; avg_logprob: number; }
interface VerboseTranscription { segments?: VerboseSegment[]; text?: string; }

export interface TranscriberDeps {
  groq: Pick<Groq, 'audio'>;
}

export interface TranscribeInput {
  filePath: string;
  biasPrompt: string;
}

export type Transcriber = (input: TranscribeInput) => Promise<string>;

export const BIAS_PROMPT =
  'Seoul, Busan, Gangnam, Hongdae, Myeongdong, Itaewon, Insadong, Haeundae, Jagalchi, ' +
  'KTX, jjajangmyeon, bibimbap, Anguk, Hannam, Seongsu, Yongsan, Cheongdam, hanok.';

export function createTranscriber(deps: TranscriberDeps): Transcriber {
  return async function transcribe({ filePath, biasPrompt }) {
    const baseParams = {
      model: 'whisper-large-v3-turbo',
      response_format: 'verbose_json',
      prompt: biasPrompt,
      temperature: 0,
    } as const;
    const [koRes, autoRes] = await Promise.all([
      deps.groq.audio.transcriptions.create({
        ...baseParams, file: createReadStream(filePath) as any, language: 'ko',
      } as any),
      deps.groq.audio.transcriptions.create({
        ...baseParams, file: createReadStream(filePath) as any,
      } as any),
    ]);
    return mergeSegments(koRes as VerboseTranscription, autoRes as VerboseTranscription);
  };
}

export function mergeSegments(a: VerboseTranscription, b: VerboseTranscription): string {
  const segs: VerboseSegment[] = [...(a.segments ?? []), ...(b.segments ?? [])]
    .sort((x, y) => x.start - y.start);
  if (!segs.length) return (a.text ?? b.text ?? '').trim();
  const picked: VerboseSegment[] = [];
  for (const seg of segs) {
    const overlap = picked.findIndex(p => !(p.end <= seg.start || p.start >= seg.end));
    if (overlap === -1) picked.push(seg);
    else if (seg.avg_logprob > picked[overlap].avg_logprob) picked[overlap] = seg;
  }
  return picked.map(s => s.text.trim()).filter(Boolean).join(' ').trim();
}
```

- [ ] **Step 4: Run tests, watch them pass**

```bash
bun test server/src/igPlaces/transcribe.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/igPlaces/transcribe.ts server/src/igPlaces/transcribe.test.ts
git commit -m "feat(igPlaces): dual-pass Whisper transcription with logprob merge"
```

---

### Task 10: Frame extraction + OCR

**Files:**
- Create: `server/src/igPlaces/extractFrames.ts`
- Create: `server/src/igPlaces/ocr.ts`
- Test: `server/src/igPlaces/ocr.test.ts`

- [ ] **Step 1: Implement extractFrames (no unit test — shells out to ffmpeg; covered by integration test)**

```ts
// server/src/igPlaces/extractFrames.ts
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface ExtractFramesDeps {
  spawn?: (cmd: string[]) => { exited: Promise<number> };
}

export type FrameExtractor = (videoPath: string, count?: number) => Promise<string[]>;

export function createFrameExtractor(deps: ExtractFramesDeps = {}): FrameExtractor {
  const spawn = deps.spawn ?? ((cmd) => Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' }) as any);

  return async function extractFrames(videoPath, count = 5) {
    const outDir = await mkdtemp(join(tmpdir(), 'ig-frames-'));
    const proc = spawn([
      'ffmpeg', '-y',
      '-i', videoPath,
      '-vf', `fps=1/5,scale=720:-2`,
      '-frames:v', String(count),
      '-q:v', '3',
      join(outDir, 'frame-%02d.jpg'),
    ]);
    const code = await proc.exited;
    if (code !== 0) throw new Error(`ffmpeg exit ${code}`);
    const files = (await readdir(outDir))
      .filter(f => f.startsWith('frame-') && f.endsWith('.jpg'))
      .sort();
    return files.map(f => join(outDir, f));
  };
}
```

- [ ] **Step 2: Write failing tests for OCR**

```ts
// server/src/igPlaces/ocr.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createOcr } from './ocr';

const RESP = {
  responses: [{
    fullTextAnnotation: { text: '어니언 ONION\n성수동' },
  }],
};

describe('createOcr', () => {
  test('reads a JPEG, base64-encodes, posts to Vision, returns text', async () => {
    const readFile = mock(async () => new Uint8Array([0xff, 0xd8, 0xff]));
    const fetch = mock(async (url: string, init?: RequestInit) => {
      expect(url).toContain('https://vision.googleapis.com/v1/images:annotate');
      expect(url).toContain('key=K');
      const body = JSON.parse(String(init?.body));
      expect(body.requests[0].features[0].type).toBe('DOCUMENT_TEXT_DETECTION');
      return new Response(JSON.stringify(RESP), { status: 200 });
    });
    const ocr = createOcr({ apiKey: 'K', fetch, readFile });
    const text = await ocr('/tmp/frame.jpg');
    expect(text).toContain('어니언');
  });
  test('returns empty string when no text detected', async () => {
    const ocr = createOcr({
      apiKey: 'K',
      fetch: mock(async () => new Response(JSON.stringify({ responses: [{}] }), { status: 200 })),
      readFile: mock(async () => new Uint8Array()),
    });
    expect(await ocr('/tmp/f.jpg')).toBe('');
  });
});
```

- [ ] **Step 3: Run tests, watch them fail**

```bash
bun test server/src/igPlaces/ocr.test.ts
```

Expected: fails.

- [ ] **Step 4: Implement OCR**

```ts
// server/src/igPlaces/ocr.ts
import { readFile as readFileNode } from 'node:fs/promises';

export interface OcrDeps {
  apiKey: string;
  fetch?: typeof fetch;
  readFile?: (path: string) => Promise<Uint8Array>;
}

export type Ocr = (imagePath: string) => Promise<string>;

export function createOcr(deps: OcrDeps): Ocr {
  const f = deps.fetch ?? fetch;
  const rf = deps.readFile ?? readFileNode;

  return async function ocr(imagePath) {
    const bytes = await rf(imagePath);
    const b64 = Buffer.from(bytes).toString('base64');
    const r = await f(`https://vision.googleapis.com/v1/images:annotate?key=${deps.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: b64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: { languageHints: ['ko', 'en'] },
        }],
      }),
    });
    if (!r.ok) throw new Error(`vision ${r.status}`);
    const data = (await r.json()) as { responses?: Array<{ fullTextAnnotation?: { text?: string } }> };
    return data.responses?.[0]?.fullTextAnnotation?.text?.trim() ?? '';
  };
}
```

- [ ] **Step 5: Run tests, watch them pass**

```bash
bun test server/src/igPlaces/ocr.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/igPlaces/extractFrames.ts server/src/igPlaces/ocr.ts server/src/igPlaces/ocr.test.ts
git commit -m "feat(igPlaces): ffmpeg frame extraction + Google Vision OCR"
```

---

### Task 11: Bundle builder

**Files:**
- Create: `server/src/igPlaces/buildBundle.ts`
- Test: `server/src/igPlaces/buildBundle.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// server/src/igPlaces/buildBundle.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createBundleBuilder } from './buildBundle';
import type { PostPayload } from './types';

const imagePost: PostPayload = {
  shortcode: 'A', caption: 'No video here', mediaItems: [{ type: 'image', url: 'i.jpg' }],
  source: 'apify', raw: {},
};

const videoPost: PostPayload = {
  shortcode: 'A', caption: 'Caption with #tag and @owner',
  mediaItems: [{ type: 'video', url: 'v.mp4', thumbnail: 't.jpg' }],
  source: 'apify', raw: {},
};

describe('buildBundle', () => {
  test('image-only post: no transcript, no frames', async () => {
    const transcribe = mock(async () => 'should not be called');
    const ocr = mock(async () => 'should not be called');
    const downloadVideo = mock(async () => 'unused');
    const extractFrames = mock(async () => []);
    const build = createBundleBuilder({ transcribe, ocr, downloadVideo, extractFrames });
    const b = await build(imagePost);
    expect(b.transcript).toBeUndefined();
    expect(b.ocr).toBeUndefined();
    expect(b.caption).toBe('No video here');
    expect(transcribe).not.toHaveBeenCalled();
  });
  test('parses hashtags and @mentions', async () => {
    const build = createBundleBuilder({
      transcribe: mock(async () => ''),
      ocr: mock(async () => ''),
      downloadVideo: mock(async () => '/tmp/v.mp4'),
      extractFrames: mock(async () => ['/tmp/f1.jpg']),
    });
    const b = await build(videoPost);
    expect(b.hashtags).toEqual(['tag']);
    expect(b.mentions).toEqual(['owner']);
  });
  test('video post: transcribes + ocr on all extracted frames', async () => {
    const transcribe = mock(async () => 'TRANSCRIPT');
    const ocr = mock(async (p: string) => `OCR(${p.split('/').pop()})`);
    const downloadVideo = mock(async () => '/tmp/v.mp4');
    const extractFrames = mock(async () => ['/tmp/f1.jpg', '/tmp/f2.jpg', '/tmp/f3.jpg']);
    const build = createBundleBuilder({ transcribe, ocr, downloadVideo, extractFrames });
    const b = await build(videoPost);
    expect(b.transcript).toBe('TRANSCRIPT');
    expect(b.ocr).toContain('OCR(f1.jpg)');
    expect(b.ocr).toContain('OCR(f3.jpg)');
    expect(ocr).toHaveBeenCalledTimes(3);
  });
  test('includes locationTagName when present', async () => {
    const build = createBundleBuilder({
      transcribe: mock(async () => ''),
      ocr: mock(async () => ''),
      downloadVideo: mock(async () => '/tmp/v.mp4'),
      extractFrames: mock(async () => []),
    });
    const b = await build({ ...videoPost, locationTag: { name: 'Cafe Onion' } });
    expect(b.locationTagName).toBe('Cafe Onion');
  });
});
```

- [ ] **Step 2: Run tests, watch them fail**

```bash
bun test server/src/igPlaces/buildBundle.test.ts
```

Expected: fails.

- [ ] **Step 3: Implement bundle builder**

```ts
// server/src/igPlaces/buildBundle.ts
import type { ExtractionBundle, PostPayload } from './types';

export interface BundleDeps {
  transcribe: (input: { filePath: string; biasPrompt: string }) => Promise<string>;
  ocr: (imagePath: string) => Promise<string>;
  downloadVideo: (url: string) => Promise<string>;        // returns local path
  extractFrames: (videoPath: string, count?: number) => Promise<string[]>;
  biasPrompt?: string;
}

export type BundleBuilder = (post: PostPayload) => Promise<ExtractionBundle>;

const HASHTAG_RE = /#([\p{L}\p{N}_]+)/gu;
const MENTION_RE = /@([a-zA-Z0-9_.]+)/g;

export function createBundleBuilder(deps: BundleDeps): BundleBuilder {
  return async function build(post) {
    const hashtags = [...post.caption.matchAll(HASHTAG_RE)].map(m => m[1]);
    const mentions = [...post.caption.matchAll(MENTION_RE)].map(m => m[1]);
    const video = post.mediaItems.find(m => m.type === 'video');
    const images = post.mediaItems.filter(m => m.type === 'image');

    let transcript: string | undefined;
    let ocr: string | undefined;

    if (video) {
      const localPath = await deps.downloadVideo(video.url);
      const [maybeTranscript, frames] = await Promise.all([
        deps.transcribe({ filePath: localPath,
                          biasPrompt: deps.biasPrompt ?? '' }).catch(() => ''),
        deps.extractFrames(localPath, 5).catch(() => [] as string[]),
      ]);
      transcript = maybeTranscript || undefined;
      if (frames.length) {
        const texts = await Promise.all(frames.map((f, i) =>
          deps.ocr(f).then(t => t ? `[frame ${i+1}] ${t}` : '').catch(() => '')));
        const joined = texts.filter(Boolean).join('\n');
        if (joined) ocr = joined;
      }
    } else if (images.length) {
      const texts = await Promise.all(images.map((img, i) =>
        deps.ocr(img.url).then(t => t ? `[image ${i+1}] ${t}` : '').catch(() => '')));
      const joined = texts.filter(Boolean).join('\n');
      if (joined) ocr = joined;
    }

    return {
      caption: post.caption,
      transcript,
      ocr,
      locationTagName: post.locationTag?.name,
      hashtags,
      mentions,
    };
  };
}
```

- [ ] **Step 4: Run tests, watch them pass**

```bash
bun test server/src/igPlaces/buildBundle.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/igPlaces/buildBundle.ts server/src/igPlaces/buildBundle.test.ts
git commit -m "feat(igPlaces): bundle builder composes caption + transcript + ocr"
```

---

### Task 12: Place extraction with self-consistency 3-vote

**Files:**
- Create: `server/src/igPlaces/extractPlaces.ts`
- Test: `server/src/igPlaces/extractPlaces.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// server/src/igPlaces/extractPlaces.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createExtractor, levenshteinNormalized, canonicalize, voteMerge } from './extractPlaces';
import type { RawExtractedPlace, ExtractionBundle } from './types';

const placeFactory = (over: Partial<RawExtractedPlace> = {}): RawExtractedPlace => ({
  name: 'Cafe Onion', name_romanized: 'Cafe Onion', city: 'Seoul',
  category: 'cafe', confidence: 0.9, is_subject: true,
  supporting_quote: 'Cafe Onion in Seongsu', signal_source: 'caption',
  ...over,
});

describe('canonicalize', () => {
  test('NFC, lowercase, strip punctuation/whitespace', () => {
    expect(canonicalize('Café  Onion-1!')).toBe('cafeonion1');
  });
});

describe('levenshteinNormalized', () => {
  test('exact match → 0', () => {
    expect(levenshteinNormalized('abc', 'abc')).toBe(0);
  });
  test('off by one', () => {
    expect(levenshteinNormalized('abc', 'abd')).toBe(1);
  });
});

describe('voteMerge', () => {
  test('all 3 runs surface same place → vote_count=3, band=high', () => {
    const runs = [[placeFactory()], [placeFactory()], [placeFactory()]];
    const out = voteMerge(runs, 'Cafe Onion in Seongsu');
    expect(out.length).toBe(1);
    expect(out[0].vote_count).toBe(3);
    expect(out[0].confidence_band).toBe('high');
  });
  test('2 runs surface, 1 doesnt → vote_count=2, band=medium', () => {
    const runs = [[placeFactory()], [placeFactory()], []];
    const out = voteMerge(runs, 'Cafe Onion in Seongsu');
    expect(out[0].vote_count).toBe(2);
    expect(out[0].confidence_band).toBe('medium');
  });
  test('vote_count=1 AND confidence<0.6 → dropped', () => {
    const runs = [[placeFactory({ confidence: 0.4 })], [], []];
    const out = voteMerge(runs, 'Cafe Onion in Seongsu');
    expect(out).toEqual([]);
  });
  test('substring-quote hallucination filter drops phantom places', () => {
    const runs = [[placeFactory({ supporting_quote: 'Never said this' })]];
    const out = voteMerge(runs, 'Cafe Onion in Seongsu');
    expect(out).toEqual([]);
  });
  test('different signals → signal_source=multiple', () => {
    const runs = [
      [placeFactory({ signal_source: 'caption' })],
      [placeFactory({ signal_source: 'transcript' })],
      [placeFactory({ signal_source: 'ocr' })],
    ];
    const out = voteMerge(runs, 'Cafe Onion in Seongsu');
    expect(out[0].signal_source).toBe('multiple');
  });
});

describe('createExtractor', () => {
  test('issues 3 parallel groq calls with temperature 0.5', async () => {
    const calls: object[] = [];
    const groq = { chat: { completions: { create: mock(async (params: any) => {
      calls.push(params);
      return { choices: [{ message: { content: JSON.stringify({ places: [placeFactory()] }) } }] };
    })}}} as any;
    const extract = createExtractor({ groq });
    const bundle: ExtractionBundle = { caption: 'Cafe Onion in Seongsu', hashtags: [], mentions: [] };
    const out = await extract(bundle);
    expect(calls).toHaveLength(3);
    expect((calls[0] as any).temperature).toBe(0.5);
    expect((calls[0] as any).response_format.type).toBe('json_schema');
    expect(out[0].vote_count).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests, watch them fail**

```bash
bun test server/src/igPlaces/extractPlaces.test.ts
```

Expected: fails.

- [ ] **Step 3: Implement extractor**

```ts
// server/src/igPlaces/extractPlaces.ts
import type Groq from 'groq-sdk';
import type { ExtractionBundle, RawExtractedPlace, VotedPlace, IgSignalSource } from './types';

export const SYSTEM_PROMPT = `You extract real-world places from a social-media post about Korea.

Rules:
1. Only include places a human reader would recognize as a specific venue or landmark.
   If the source mentions no specific place, return {"places": []}. Never invent.
2. For each place, copy a verbatim supporting_quote (≤120 chars) from the source.
   Korean stays in Hangul, English stays in English. Do not translate or romanize the
   name field; if the source writes "광장시장", name="광장시장" — put any romanization in name_romanized.
3. is_subject=true only if the place is the main topic of the post. Passing mentions
   ("near 강남", "on the way to Busan") are is_subject=false.
4. confidence ∈ [0,1] reflects how sure you are this is a real, resolvable venue.
5. category is one of: restaurant, cafe, bar, shopping, activity, hotel, landmark, other.
6. signal_source is which input the supporting_quote came from:
   caption | transcript | ocr | location_tag.
Output JSON only, matching the provided schema.`;

const SCHEMA = {
  name: 'place_extraction',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false, required: ['places'],
    properties: {
      places: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['name','name_romanized','city','category','confidence',
                     'is_subject','supporting_quote','signal_source'],
          properties: {
            name:             { type: 'string' },
            name_romanized:   { type: ['string','null'] },
            city:             { type: ['string','null'] },
            category:         { enum: ['restaurant','cafe','bar','shopping',
                                       'activity','hotel','landmark','other'] },
            confidence:       { type: 'number', minimum: 0, maximum: 1 },
            is_subject:       { type: 'boolean' },
            supporting_quote: { type: 'string', maxLength: 160 },
            signal_source:    { enum: ['caption','transcript','ocr','location_tag'] },
          },
        },
      },
    },
  },
} as const;

export interface ExtractorDeps {
  groq: Pick<Groq, 'chat'>;
  runs?: number;
  temperature?: number;
}

export type Extractor = (bundle: ExtractionBundle) => Promise<VotedPlace[]>;

export function createExtractor(deps: ExtractorDeps): Extractor {
  const runs = deps.runs ?? 3;
  const temperature = deps.temperature ?? 0.5;
  return async function extract(bundle) {
    const userMsg = renderBundle(bundle);
    const calls = await Promise.all(Array.from({ length: runs }, () =>
      deps.groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMsg },
        ],
        response_format: { type: 'json_schema', json_schema: SCHEMA } as any,
        temperature,
        max_completion_tokens: 2048,
        reasoning_effort: 'low',
        reasoning_format: 'hidden',
      } as any).then(parseRun).catch(() => [] as RawExtractedPlace[])));
    const source = sourceText(bundle);
    return voteMerge(calls, source);
  };
}

function parseRun(c: any): RawExtractedPlace[] {
  const txt = c.choices?.[0]?.message?.content ?? '{"places":[]}';
  try { return (JSON.parse(txt).places ?? []) as RawExtractedPlace[]; } catch { return []; }
}

function renderBundle(b: ExtractionBundle): string {
  const parts: string[] = [];
  parts.push(`[caption]\n${b.caption || '(none)'}`);
  if (b.transcript) parts.push(`[transcript]\n${b.transcript}`);
  if (b.ocr)        parts.push(`[ocr]\n${b.ocr}`);
  if (b.locationTagName) parts.push(`[location_tag]\n${b.locationTagName}`);
  if (b.hashtags.length) parts.push(`[hashtags]\n${b.hashtags.join(' ')}`);
  if (b.mentions.length) parts.push(`[mentions]\n${b.mentions.join(' ')}`);
  return parts.join('\n\n');
}

function sourceText(b: ExtractionBundle): string {
  return [b.caption, b.transcript ?? '', b.ocr ?? '', b.locationTagName ?? '']
    .filter(Boolean).join('\n');
}

export function canonicalize(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

export function levenshteinNormalized(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const cost = a[i-1] === b[j-1] ? 0 : 1;
    dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost);
  }
  return dp[m][n];
}

function fuzzyEq(a: string, b: string): boolean {
  const ca = canonicalize(a), cb = canonicalize(b);
  if (ca === cb) return true;
  if (ca.includes(cb) || cb.includes(ca)) return true;
  return levenshteinNormalized(ca, cb) <= 2;
}

interface Bucket { reps: RawExtractedPlace[]; signals: Set<IgSignalSource>; }

export function voteMerge(runs: RawExtractedPlace[][], source: string): VotedPlace[] {
  // 1. filter by substring-quote
  const filtered: RawExtractedPlace[][] = runs.map(r =>
    r.filter(p => p.supporting_quote && source.includes(p.supporting_quote)));

  // 2. bucket fuzzy-matched places across runs (one entry per run per bucket)
  const buckets: Bucket[] = [];
  for (const run of filtered) {
    const seenInRun = new Set<Bucket>();
    for (const p of run) {
      const bucket = buckets.find(b => b.reps.some(r => fuzzyEq(r.name, p.name)));
      if (bucket && !seenInRun.has(bucket)) {
        bucket.reps.push(p); bucket.signals.add(p.signal_source); seenInRun.add(bucket);
      } else if (!bucket) {
        const nb: Bucket = { reps: [p], signals: new Set([p.signal_source]) };
        buckets.push(nb); seenInRun.add(nb);
      }
    }
  }

  // 3. score + filter + band
  const total = runs.length;
  const out: VotedPlace[] = [];
  for (const b of buckets) {
    const voteCount = b.reps.length;
    const maxConf = Math.max(...b.reps.map(r => r.confidence));
    const minConf = Math.min(...b.reps.map(r => r.confidence));
    if (voteCount === 1 && maxConf < 0.6) continue;

    let band: VotedPlace['confidence_band'];
    if (voteCount === total) band = 'high';
    else if (voteCount >= 2 && minConf >= 0.7) band = 'high';
    else if (voteCount === 2) band = 'medium';
    else band = 'low';

    const longest = [...b.reps].sort((a, c) =>
      c.supporting_quote.length - a.supporting_quote.length)[0];
    const signal_source: IgSignalSource = b.signals.size > 1 ? 'multiple' : longest.signal_source;

    out.push({
      ...longest,
      signal_source,
      vote_count: voteCount,
      confidence_band: band,
      confidence: maxConf,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests, watch them pass**

```bash
bun test server/src/igPlaces/extractPlaces.test.ts
```

Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/igPlaces/extractPlaces.ts server/src/igPlaces/extractPlaces.test.ts
git commit -m "feat(igPlaces): self-consistency 3-vote place extraction"
```

---

### Task 13: Geocoding (Google + Kakao parallel, reconciliation)

**Files:**
- Create: `server/src/igPlaces/geocode.ts`
- Test: `server/src/igPlaces/geocode.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// server/src/igPlaces/geocode.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createGeocoder, haversineMeters, withinKoreaBbox } from './geocode';
import type { VotedPlace, LocationTag } from './types';

const base: VotedPlace = {
  name: '어니언 성수', name_romanized: 'Onion Seongsu', city: 'Seoul', category: 'cafe',
  confidence: 0.9, is_subject: true, supporting_quote: '어니언 성수',
  signal_source: 'caption', vote_count: 3, confidence_band: 'high',
};

describe('helpers', () => {
  test('haversineMeters near zero for same point', () => {
    expect(haversineMeters(37.5, 127, 37.5, 127)).toBeLessThan(0.001);
  });
  test('haversineMeters ~111km for 1° lat', () => {
    expect(haversineMeters(37, 127, 38, 127)).toBeGreaterThan(110_000);
    expect(haversineMeters(37, 127, 38, 127)).toBeLessThan(112_000);
  });
  test('Korea bbox accepts Seoul, rejects Tokyo', () => {
    expect(withinKoreaBbox(37.5, 127)).toBe(true);
    expect(withinKoreaBbox(35.7, 139.7)).toBe(false);
  });
});

describe('createGeocoder', () => {
  test('apify-tag short-circuit: fuzzy-match + has lat/lng → skip APIs', async () => {
    const tag: LocationTag = { name: '어니언 성수', lat: 37.5447, lng: 127.0556 };
    const google = mock(async () => null);
    const kakao = mock(async () => null);
    const g = createGeocoder({ googleLookup: google, kakaoLookup: kakao });
    const out = await g(base, tag);
    expect(out.geocode_source).toBe('apify-tag');
    expect(out.lat).toBe(37.5447);
    expect(google).not.toHaveBeenCalled();
  });

  test('both succeed and agree → google+kakao, band bumped low→medium', async () => {
    const lowConf: VotedPlace = { ...base, confidence_band: 'low' };
    const g = createGeocoder({
      googleLookup: mock(async () => ({
        place_id: 'GP', name: '어니언 성수', address: '...', lat: 37.5447, lng: 127.0556,
        types: ['cafe'], rating: 4.6, userRatingCount: 1200, phone: '02-...',
      })),
      kakaoLookup: mock(async () => ({
        id: 'K1', name: '어니언 성수', address: '...', lat: 37.5448, lng: 127.0557, url: 'https://...',
      })),
    });
    const out = await g(lowConf, undefined);
    expect(out.geocode_source).toBe('google+kakao');
    expect(out.geocode_disagree).toBe(false);
    expect(out.confidence_band).toBe('medium');
  });

  test('disagree → google saved, geocode_disagree=true, band forced low', async () => {
    const high: VotedPlace = { ...base, confidence_band: 'high' };
    const g = createGeocoder({
      googleLookup: mock(async () => ({
        place_id: 'GP', name: '어니언 성수', address: 'X', lat: 37.5447, lng: 127.0556,
        types: ['cafe'], rating: 4.6, userRatingCount: 1200, phone: null,
      })),
      kakaoLookup: mock(async () => ({
        id: 'K2', name: '엉뚱한 카페', address: 'Y', lat: 37.5000, lng: 127.1000, url: 'u',
      })),
    });
    const out = await g(high, undefined);
    expect(out.geocode_disagree).toBe(true);
    expect(out.confidence_band).toBe('low');
  });

  test('google fails quality bar (rating<10) → falls to kakao', async () => {
    const g = createGeocoder({
      googleLookup: mock(async () => ({
        place_id: 'GP', name: 'Totally Different Name', address: 'X',
        lat: 37.5, lng: 127, types: ['cafe'], rating: 4, userRatingCount: 2, phone: null,
      })),
      kakaoLookup: mock(async () => ({
        id: 'K', name: '어니언 성수', address: 'KA', lat: 37.5, lng: 127.05, url: 'u',
      })),
    });
    const out = await g(base, undefined);
    expect(out.geocode_source).toBe('kakao');
  });

  test('both fail → ungeocoded, geocode_source=null', async () => {
    const g = createGeocoder({
      googleLookup: mock(async () => null), kakaoLookup: mock(async () => null),
    });
    const out = await g(base, undefined);
    expect(out.geocode_source).toBeNull();
    expect(out.lat).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, watch them fail**

```bash
bun test server/src/igPlaces/geocode.test.ts
```

Expected: fails.

- [ ] **Step 3: Implement geocoder**

```ts
// server/src/igPlaces/geocode.ts
import type { EnrichedPlace, LocationTag, VotedPlace, IgConfidenceBand } from './types';
import { canonicalize, levenshteinNormalized } from './extractPlaces';

export interface GoogleResult {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  types: string[];
  rating: number | null;
  userRatingCount: number;
  phone: string | null;
}

export interface KakaoResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  url: string;
}

export interface GeocoderDeps {
  googleLookup: (name: string, city: string | null) => Promise<GoogleResult | null>;
  kakaoLookup:  (name: string, city: string | null) => Promise<KakaoResult | null>;
}

export type Geocoder = (place: VotedPlace, tag: LocationTag | undefined) => Promise<EnrichedPlace>;

export function withinKoreaBbox(lat: number, lng: number): boolean {
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

function fuzzyEq(a: string, b: string): boolean {
  const ca = canonicalize(a), cb = canonicalize(b);
  if (ca === cb || ca.includes(cb) || cb.includes(ca)) return true;
  return levenshteinNormalized(ca, cb) <= 2;
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
  const dφ = (lat2 - lat1) * Math.PI/180, dλ = (lng2 - lng1) * Math.PI/180;
  const a = Math.sin(dφ/2)**2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function bumpBand(b: IgConfidenceBand): IgConfidenceBand {
  return b === 'low' ? 'medium' : b === 'medium' ? 'high' : 'high';
}

function googlePassesQualityBar(p: VotedPlace, g: GoogleResult): boolean {
  if (!withinKoreaBbox(g.lat, g.lng)) return false;
  if (p.category === 'restaurant' || p.category === 'cafe' || p.category === 'bar') {
    if (g.userRatingCount < 10 && levenshteinNormalized(canonicalize(p.name), canonicalize(g.name)) > 1) {
      return false;
    }
  }
  return true;
}

export function createGeocoder(deps: GeocoderDeps): Geocoder {
  return async function geocode(place, tag) {
    if (tag && tag.lat != null && tag.lng != null && fuzzyEq(place.name, tag.name)) {
      return {
        ...place,
        address: tag.name, lat: tag.lat, lng: tag.lng,
        google_place_id: null, phone: null, rating: null, business_types: [],
        geocode_source: 'apify-tag', geocode_kakao_id: null, geocode_disagree: false,
        confidence_band: bumpBand(place.confidence_band),
      };
    }

    const [googleRaw, kakao] = await Promise.all([
      deps.googleLookup(place.name, place.city).catch(() => null),
      deps.kakaoLookup(place.name, place.city).catch(() => null),
    ]);
    const google = googleRaw && googlePassesQualityBar(place, googleRaw) ? googleRaw : null;

    if (google && kakao) {
      const sameName = fuzzyEq(google.name, kakao.name);
      const close = haversineMeters(google.lat, google.lng, kakao.lat, kakao.lng) <= 200;
      const agree = sameName && close;
      return {
        ...place,
        address: google.address, lat: google.lat, lng: google.lng,
        google_place_id: google.place_id, phone: google.phone, rating: google.rating,
        business_types: google.types,
        geocode_source: agree ? 'google+kakao' : 'google',
        geocode_kakao_id: kakao.id,
        geocode_disagree: !agree,
        confidence_band: agree ? bumpBand(place.confidence_band) : 'low',
      };
    }
    if (google) {
      return {
        ...place,
        address: google.address, lat: google.lat, lng: google.lng,
        google_place_id: google.place_id, phone: google.phone, rating: google.rating,
        business_types: google.types,
        geocode_source: 'google', geocode_kakao_id: null, geocode_disagree: false,
      };
    }
    if (kakao) {
      return {
        ...place,
        address: kakao.address, lat: kakao.lat, lng: kakao.lng,
        google_place_id: null, phone: null, rating: null, business_types: [],
        geocode_source: 'kakao', geocode_kakao_id: kakao.id, geocode_disagree: false,
      };
    }
    return {
      ...place,
      address: null, lat: null, lng: null,
      google_place_id: null, phone: null, rating: null, business_types: [],
      geocode_source: null, geocode_kakao_id: null, geocode_disagree: false,
    };
  };
}
```

- [ ] **Step 4: Add real Google + Kakao lookup adapters at bottom of `geocode.ts`**

Append:

```ts
// Real adapters — used in production. Tests inject mocks.
export function realGoogleLookup(apiKey: string, f = fetch) {
  return async (name: string, city: string | null): Promise<GoogleResult | null> => {
    const query = `${name}${city ? ', ' + city : ''}`;
    const searchUrl = 'https://places.googleapis.com/v1/places:searchText';
    const r1 = await f(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.types,' +
          'places.rating,places.userRatingCount,places.internationalPhoneNumber',
      },
      body: JSON.stringify({ textQuery: query, regionCode: 'KR', languageCode: 'en' }),
    });
    if (!r1.ok) return null;
    const data = (await r1.json()) as { places?: any[] };
    const top = data.places?.[0];
    if (!top) return null;
    return {
      place_id: String(top.id),
      name: top.displayName?.text ?? '',
      address: top.formattedAddress ?? '',
      lat: top.location?.latitude ?? 0,
      lng: top.location?.longitude ?? 0,
      types: top.types ?? [],
      rating: top.rating ?? null,
      userRatingCount: top.userRatingCount ?? 0,
      phone: top.internationalPhoneNumber ?? null,
    };
  };
}

export function realKakaoLookup(apiKey: string, f = fetch) {
  return async (name: string, city: string | null): Promise<KakaoResult | null> => {
    const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
    url.searchParams.set('query', `${name}${city ? ' ' + city : ''}`);
    const r = await f(url.toString(), { headers: { Authorization: `KakaoAK ${apiKey}` } });
    if (!r.ok) return null;
    const data = (await r.json()) as { documents?: Array<{
      id: string; place_name: string; road_address_name?: string; address_name: string;
      x: string; y: string; place_url: string;
    }>; };
    const d = data.documents?.[0];
    if (!d) return null;
    return {
      id: d.id,
      name: d.place_name,
      address: d.road_address_name || d.address_name,
      lat: Number(d.y),
      lng: Number(d.x),
      url: d.place_url,
    };
  };
}
```

- [ ] **Step 5: Run tests, watch them pass**

```bash
bun test server/src/igPlaces/geocode.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/igPlaces/geocode.ts server/src/igPlaces/geocode.test.ts
git commit -m "feat(igPlaces): dual-source geocoding with reconciliation"
```

---

### Task 14: Save places to Supabase

**Files:**
- Create: `server/src/igPlaces/savePlaces.ts`
- Test: `server/src/igPlaces/savePlaces.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// server/src/igPlaces/savePlaces.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createSavePlaces, upsertPostFactory } from './savePlaces';
import type { EnrichedPlace, PostPayload } from './types';

const payload: PostPayload = {
  shortcode: 'A', caption: 'C', mediaItems: [{ type: 'image', url: 'i.jpg' }],
  source: 'apify', raw: { x: 1 },
};
const place = (over: Partial<EnrichedPlace> = {}): EnrichedPlace => ({
  name: '어니언', name_romanized: 'Onion', city: 'Seoul', category: 'cafe',
  confidence: 0.9, is_subject: true, supporting_quote: 'q',
  signal_source: 'caption', vote_count: 3, confidence_band: 'high',
  address: 'A', lat: 37.5, lng: 127, google_place_id: 'GP',
  phone: null, rating: 4.6, business_types: ['cafe'],
  geocode_source: 'google', geocode_kakao_id: null, geocode_disagree: false,
  ...over,
});

describe('upsertPost', () => {
  test('inserts a new post row, returns id', async () => {
    const insert = mock(async () => [{ id: 42 }]);
    const sb: any = { insert };
    const upsert = upsertPostFactory(sb);
    const id = await upsert('dedupe-A', 'https://i', payload, undefined, undefined);
    expect(id).toBe(42);
    expect(insert).toHaveBeenCalledWith('instagram_posts', expect.anything(),
      { onConflict: 'dedupe_key', returning: 'representation' });
  });
});

describe('savePlaces', () => {
  test('inserts each place row scoped to user_id + post_id', async () => {
    const insert = mock(async () => [{ id: 1 }]);
    const sb: any = { insert };
    const save = createSavePlaces(sb);
    await save(99, 'user-1', [place(), place({ name: '광장시장', category: 'market' as any })]);
    expect(insert).toHaveBeenCalledTimes(2);
    const firstArgs = (insert.mock.calls[0] as any[])[1];
    expect(firstArgs.user_id).toBe('user-1');
    expect(firstArgs.post_id).toBe(99);
  });
});
```

- [ ] **Step 2: Run tests, watch them fail**

```bash
bun test server/src/igPlaces/savePlaces.test.ts
```

Expected: fails.

- [ ] **Step 3: Implement save module**

```ts
// server/src/igPlaces/savePlaces.ts
import type { EnrichedPlace, PostPayload } from './types';
import type { SupabaseClient } from './supabase';

export function upsertPostFactory(sb: SupabaseClient) {
  return async function upsertPost(
    dedupeKey: string,
    url: string,
    payload: PostPayload,
    transcript: string | undefined,
    ocrText: string | undefined,
  ): Promise<number> {
    const rows = await sb.insert<{ id: number }>(
      'instagram_posts',
      {
        dedupe_key: dedupeKey,
        url,
        shortcode: payload.shortcode,
        owner_username: payload.ownerUsername ?? null,
        caption: payload.caption,
        transcript: transcript ?? null,
        ocr_text: ocrText ?? null,
        media_urls: payload.mediaItems,
        location_tag: payload.locationTag ?? null,
        raw: payload.raw,
        source: payload.source,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'dedupe_key', returning: 'representation' },
    );
    return rows[0].id;
  };
}

export function createSavePlaces(sb: SupabaseClient) {
  return async function savePlaces(postId: number, userId: string, places: EnrichedPlace[]): Promise<void> {
    for (const p of places) {
      await sb.insert('instagram_places', {
        post_id: postId,
        user_id: userId,
        name: p.name,
        name_romanized: p.name_romanized,
        city: p.city,
        category: p.category,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        google_place_id: p.google_place_id,
        phone: p.phone,
        rating: p.rating,
        business_types: p.business_types,
        is_subject: p.is_subject,
        confidence: p.confidence,
        confidence_band: p.confidence_band,
        supporting_quote: p.supporting_quote,
        signal_source: p.signal_source,
        vote_count: p.vote_count,
        geocode_source: p.geocode_source,
        geocode_kakao_id: p.geocode_kakao_id,
        geocode_disagree: p.geocode_disagree,
      }, { onConflict: 'user_id,google_place_id' });
    }
  };
}
```

- [ ] **Step 4: Run tests, watch them pass**

```bash
bun test server/src/igPlaces/savePlaces.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/igPlaces/savePlaces.ts server/src/igPlaces/savePlaces.test.ts
git commit -m "feat(igPlaces): upsert post + insert places"
```

---

### Task 15: process(job) composer

**Files:**
- Create: `server/src/igPlaces/process.ts`
- Test: `server/src/igPlaces/process.test.ts`

- [ ] **Step 1: Write failing test (one full happy-path through the composer with all deps mocked)**

```ts
// server/src/igPlaces/process.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createProcessor } from './process';
import type { PostPayload, VotedPlace, EnrichedPlace } from './types';

const payload: PostPayload = {
  shortcode: 'A', caption: 'cap', mediaItems: [{ type: 'image', url: 'i.jpg' }],
  source: 'apify', raw: {},
};
const voted: VotedPlace = {
  name: '어니언', name_romanized: 'Onion', city: 'Seoul', category: 'cafe',
  confidence: 0.9, is_subject: true, supporting_quote: 'cap', signal_source: 'caption',
  vote_count: 3, confidence_band: 'high',
};
const enriched: EnrichedPlace = {
  ...voted, address: 'A', lat: 37.5, lng: 127, google_place_id: null, phone: null,
  rating: null, business_types: [], geocode_source: 'google', geocode_kakao_id: null,
  geocode_disagree: false,
};

describe('process', () => {
  test('happy path: fetch → bundle → extract → enrich → save → complete', async () => {
    const fetchPost = mock(async () => payload);
    const upsertPost = mock(async () => 99);
    const buildBundle = mock(async () => ({ caption: 'cap', hashtags: [], mentions: [] }));
    const extract = mock(async () => [voted]);
    const geocode = mock(async () => enriched);
    const savePlaces = mock(async () => undefined);
    const complete = mock(async () => undefined);
    const fail = mock(async () => undefined);

    const proc = createProcessor({
      fetchPost, upsertPost, buildBundle, extract, geocode, savePlaces, complete, fail,
    });
    await proc({ id: 1, userId: 'u', url: 'https://i', dedupeKey: 'd' } as any);

    expect(fetchPost).toHaveBeenCalled();
    expect(upsertPost).toHaveBeenCalled();
    expect(savePlaces).toHaveBeenCalledWith(99, 'u', [enriched]);
    expect(complete).toHaveBeenCalledWith(1, 99);
    expect(fail).not.toHaveBeenCalled();
  });

  test('error path: fail invoked with retryable=true on generic error', async () => {
    const fail = mock(async () => undefined);
    const proc = createProcessor({
      fetchPost: mock(async () => { throw new Error('network'); }),
      upsertPost: mock(async () => 0),
      buildBundle: mock(async () => ({} as any)),
      extract: mock(async () => []),
      geocode: mock(async () => ({} as any)),
      savePlaces: mock(async () => undefined),
      complete: mock(async () => undefined),
      fail,
    });
    await proc({ id: 1, userId: 'u', url: 'x', dedupeKey: 'd' } as any);
    expect(fail).toHaveBeenCalledWith(1, expect.anything(), true);
  });
});
```

- [ ] **Step 2: Run tests, watch them fail**

```bash
bun test server/src/igPlaces/process.test.ts
```

Expected: fails.

- [ ] **Step 3: Implement processor**

```ts
// server/src/igPlaces/process.ts
import type { IgJob, PostPayload, ExtractionBundle, VotedPlace, EnrichedPlace, LocationTag } from './types';
import { NonRetryableError, RetryableError } from './types';

export interface ProcessorDeps {
  fetchPost:   (url: string, cached: PostPayload | null) => Promise<PostPayload>;
  upsertPost:  (dedupeKey: string, url: string, p: PostPayload, transcript: string | undefined, ocr: string | undefined) => Promise<number>;
  buildBundle: (p: PostPayload) => Promise<ExtractionBundle>;
  extract:     (b: ExtractionBundle) => Promise<VotedPlace[]>;
  geocode:     (p: VotedPlace, tag: LocationTag | undefined) => Promise<EnrichedPlace>;
  savePlaces:  (postId: number, userId: string, places: EnrichedPlace[]) => Promise<void>;
  complete:    (jobId: number, postId: number) => Promise<void>;
  fail:        (jobId: number, error: Error, retryable: boolean) => Promise<void>;
}

export function createProcessor(deps: ProcessorDeps) {
  return async function process(job: IgJob): Promise<void> {
    try {
      const payload  = await deps.fetchPost(job.url, null);
      const bundle   = await deps.buildBundle(payload);
      const postId   = await deps.upsertPost(job.dedupeKey, job.url, payload, bundle.transcript, bundle.ocr);
      const voted    = await deps.extract(bundle);
      const enriched = await Promise.all(voted.map(v => deps.geocode(v, payload.locationTag)));
      await deps.savePlaces(postId, job.userId, enriched);
      await deps.complete(job.id, postId);
      console.log(`[ig-worker] complete id=${job.id} places=${enriched.length} source=${payload.source}`);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      const retryable = !(err instanceof NonRetryableError);
      console.warn(`[ig-worker] fail id=${job.id} retryable=${retryable} err=${e.message}`);
      await deps.fail(job.id, e, retryable);
    }
  };
}
```

- [ ] **Step 4: Run tests, watch them pass**

```bash
bun test server/src/igPlaces/process.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/igPlaces/process.ts server/src/igPlaces/process.test.ts
git commit -m "feat(igPlaces): pipeline composer process(job)"
```

---

### Task 16: Worker loop + graceful shutdown

**Files:**
- Create: `server/src/igPlaces/worker.ts`
- Test: `server/src/igPlaces/worker.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// server/src/igPlaces/worker.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createWorkerLoop } from './worker';

describe('createWorkerLoop', () => {
  test('claims up to concurrency jobs per tick', async () => {
    let claimed = 0;
    const claim = mock(async () => claimed++ < 3 ? ({ id: claimed } as any) : null);
    const process = mock(async () => { await new Promise(r => setTimeout(r, 5)); });
    const reapStale = mock(async () => 0);
    const wl = createWorkerLoop({ claim, process, reapStale, concurrency: 3, workerId: 'w' });
    await wl.tick();
    expect(claim).toHaveBeenCalledTimes(4); // 3 successful + 1 null
    expect(process).toHaveBeenCalledTimes(3);
  });

  test('reapStale called once per tick', async () => {
    const claim = mock(async () => null);
    const reapStale = mock(async () => 0);
    const wl = createWorkerLoop({
      claim, process: mock(async () => {}), reapStale, concurrency: 3, workerId: 'w',
    });
    await wl.tick();
    expect(reapStale).toHaveBeenCalledTimes(1);
  });

  test('stops claiming after stop() called', async () => {
    const claim = mock(async () => ({ id: 1 } as any));
    const wl = createWorkerLoop({
      claim, process: mock(async () => {}), reapStale: mock(async () => 0),
      concurrency: 3, workerId: 'w',
    });
    wl.stop();
    await wl.tick();
    expect(claim).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests, watch them fail**

```bash
bun test server/src/igPlaces/worker.test.ts
```

Expected: fails.

- [ ] **Step 3: Implement worker loop**

```ts
// server/src/igPlaces/worker.ts
import type { IgJob } from './types';

export interface WorkerDeps {
  claim:     (workerId: string) => Promise<IgJob | null>;
  process:   (job: IgJob) => Promise<void>;
  reapStale: (thresholdSec: number) => Promise<number>;
  concurrency: number;
  workerId: string;
  staleThresholdSec?: number;
}

export interface WorkerLoop {
  tick(): Promise<void>;
  stop(): void;
  inflight(): number;
}

export function createWorkerLoop(deps: WorkerDeps): WorkerLoop {
  const slots = new Set<Promise<unknown>>();
  let stopped = false;

  return {
    async tick() {
      if (stopped) return;
      await deps.reapStale(deps.staleThresholdSec ?? 600).catch(err =>
        console.warn('[ig-worker] reap error', err));
      while (!stopped && slots.size < deps.concurrency) {
        const job = await deps.claim(deps.workerId).catch(() => null);
        if (!job) break;
        const p = deps.process(job).finally(() => { slots.delete(p); });
        slots.add(p);
      }
    },
    stop() { stopped = true; },
    inflight() { return slots.size; },
  };
}
```

- [ ] **Step 4: Run tests, watch them pass**

```bash
bun test server/src/igPlaces/worker.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/igPlaces/worker.ts server/src/igPlaces/worker.test.ts
git commit -m "feat(igPlaces): worker loop with concurrency + stale reap"
```

---

### Task 17: Clerk auth middleware

**Files:**
- Create: `server/src/middleware/clerkAuth.ts`
- Test: `server/src/middleware/clerkAuth.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// server/src/middleware/clerkAuth.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { createClerkAuth } from './clerkAuth';
import { Hono } from 'hono';

describe('createClerkAuth', () => {
  test('rejects requests without Authorization header (401)', async () => {
    const auth = createClerkAuth({ verifyToken: mock(async () => ({ sub: 'u' })) });
    const app = new Hono().use('*', auth).get('/x', (c) => c.text('ok'));
    const res = await app.request('/x');
    expect(res.status).toBe(401);
  });
  test('rejects malformed Authorization (no Bearer) (401)', async () => {
    const auth = createClerkAuth({ verifyToken: mock(async () => ({ sub: 'u' })) });
    const app = new Hono().use('*', auth).get('/x', (c) => c.text('ok'));
    const res = await app.request('/x', { headers: { Authorization: 'NotBearer X' } });
    expect(res.status).toBe(401);
  });
  test('accepts a valid token, sets userId in context', async () => {
    const verifyToken = mock(async () => ({ sub: 'user-42' }));
    const auth = createClerkAuth({ verifyToken });
    const app = new Hono().use('*', auth).get('/x', (c) => c.text((c.get('userId') as string)));
    const res = await app.request('/x', { headers: { Authorization: 'Bearer TOK' } });
    expect(await res.text()).toBe('user-42');
  });
  test('rejects when verifyToken throws (401)', async () => {
    const verifyToken = mock(async () => { throw new Error('bad'); });
    const auth = createClerkAuth({ verifyToken });
    const app = new Hono().use('*', auth).get('/x', (c) => c.text('ok'));
    const res = await app.request('/x', { headers: { Authorization: 'Bearer X' } });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests, watch them fail**

```bash
bun test server/src/middleware/clerkAuth.test.ts
```

Expected: fails.

- [ ] **Step 3: Implement Clerk middleware**

```ts
// server/src/middleware/clerkAuth.ts
import type { MiddlewareHandler } from 'hono';
import { verifyToken as clerkVerify } from '@clerk/backend';

export interface ClerkAuthDeps {
  verifyToken?: (token: string) => Promise<{ sub: string }>;
  secretKey?: string;
}

export function createClerkAuth(deps: ClerkAuthDeps = {}): MiddlewareHandler {
  const verify = deps.verifyToken ?? (async (token: string) => {
    const payload = await clerkVerify(token, { secretKey: deps.secretKey });
    return { sub: payload.sub };
  });
  return async (c, next) => {
    const header = c.req.header('Authorization');
    if (!header?.startsWith('Bearer ')) {
      return c.json({ error: 'missing or malformed Authorization header' }, 401);
    }
    const token = header.slice('Bearer '.length).trim();
    try {
      const { sub } = await verify(token);
      c.set('userId', sub);
      await next();
    } catch (err) {
      return c.json({ error: 'invalid token' }, 401);
    }
  };
}
```

- [ ] **Step 4: Run tests, watch them pass**

```bash
bun test server/src/middleware/clerkAuth.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/middleware/clerkAuth.ts server/src/middleware/clerkAuth.test.ts
git commit -m "feat(server): Clerk JWT verification middleware"
```

---

### Task 18: Route — POST /api/korea/places/from-instagram + _stats

**Files:**
- Create: `server/src/routes/instagramPlaces.ts`
- Test: `server/src/routes/instagramPlaces.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// server/src/routes/instagramPlaces.test.ts
import { test, expect, describe, mock } from 'bun:test';
import { Hono } from 'hono';
import { createInstagramPlacesRouter } from './instagramPlaces';

function withAuth(userId: string) {
  return async (c: any, next: any) => { c.set('userId', userId); await next(); };
}

describe('POST /api/korea/places/from-instagram', () => {
  test('400 on non-instagram url', async () => {
    const enqueue = mock(async () => ({ jobId: 1, dedupeKey: 'd', status: 'pending', reused: false }));
    const router = createInstagramPlacesRouter({ enqueue, statsHandler: () => ({}) as any });
    const app = new Hono().use('*', withAuth('u')).route('/', router);
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://twitter.com/x' }),
    });
    expect(res.status).toBe(400);
  });

  test('202 single url returns one job', async () => {
    const enqueue = mock(async () => ({ jobId: 7, dedupeKey: 'd', status: 'pending', reused: false }));
    const router = createInstagramPlacesRouter({ enqueue, statsHandler: () => ({}) as any });
    const app = new Hono().use('*', withAuth('u')).route('/', router);
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.instagram.com/p/ABC' }),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].jobId).toBe(7);
  });

  test('202 urls[] enqueues each', async () => {
    let counter = 0;
    const enqueue = mock(async () => ({ jobId: ++counter, dedupeKey: `d${counter}`, status: 'pending', reused: false }));
    const router = createInstagramPlacesRouter({ enqueue, statsHandler: () => ({}) as any });
    const app = new Hono().use('*', withAuth('u')).route('/', router);
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [
        'https://www.instagram.com/p/A',
        'https://www.instagram.com/reel/B',
      ] }),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobs).toHaveLength(2);
  });
});

describe('GET /_stats', () => {
  test('returns stats payload from handler', async () => {
    const router = createInstagramPlacesRouter({
      enqueue: mock(async () => ({} as any)),
      statsHandler: mock(async () => ({ pending: 3, running: 1, dead: 0 })),
    });
    const app = new Hono().use('*', withAuth('u')).route('/', router);
    const res = await app.request('/_stats');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pending).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests, watch them fail**

```bash
bun test server/src/routes/instagramPlaces.test.ts
```

Expected: fails.

- [ ] **Step 3: Implement the route**

```ts
// server/src/routes/instagramPlaces.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { isInstagramUrl } from '../igPlaces/normalizeUrl';
import type { Queue } from '../igPlaces/queue';

export interface InstagramPlacesDeps {
  enqueue: Queue['enqueue'];
  statsHandler: () => Promise<unknown> | unknown;
}

const igUrl = z.string().refine(isInstagramUrl, 'not an instagram url');

const submitSchema = z.union([
  z.object({ url: igUrl }),
  z.object({ urls: z.array(igUrl).min(1).max(50) }),
]);

export function createInstagramPlacesRouter(deps: InstagramPlacesDeps) {
  const r = new Hono();

  r.post('/', zValidator('json', submitSchema), async (c) => {
    const userId = c.get('userId') as string;
    const body = (await c.req.json()) as z.infer<typeof submitSchema>;
    const urls = 'url' in body ? [body.url] : body.urls;
    const jobs = [];
    for (const url of urls) {
      const r = await deps.enqueue(userId, url);
      jobs.push(r);
    }
    return c.json({ jobs }, 202);
  });

  r.get('/_stats', async (c) => {
    const stats = await deps.statsHandler();
    return c.json(stats);
  });

  return r;
}
```

- [ ] **Step 4: Run tests, watch them pass**

```bash
bun test server/src/routes/instagramPlaces.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/instagramPlaces.ts server/src/routes/instagramPlaces.test.ts
git commit -m "feat(igPlaces): POST /api/korea/places/from-instagram + _stats"
```

---

### Task 19: Wire route + worker into `server/app.ts`

**Files:**
- Modify: `server/app.ts`
- Create: `server/src/igPlaces/wire.ts` (composition root, real deps)

- [ ] **Step 1: Create the composition root**

```ts
// server/src/igPlaces/wire.ts
import Groq from 'groq-sdk';
import { config } from '../config';
import { createSupabaseClient } from './supabase';
import { createQueue } from './queue';
import { createFetchPost } from './fetchPost';
import { createTranscriber, BIAS_PROMPT } from './transcribe';
import { createFrameExtractor } from './extractFrames';
import { createOcr } from './ocr';
import { createBundleBuilder } from './buildBundle';
import { createExtractor } from './extractPlaces';
import { createGeocoder, realGoogleLookup, realKakaoLookup } from './geocode';
import { upsertPostFactory, createSavePlaces } from './savePlaces';
import { createProcessor } from './process';
import { createWorkerLoop } from './worker';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function downloadVideo(url: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ig-video-'));
  const out = join(dir, 'video.mp4');
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`video download ${r.status}`);
  await Bun.write(out, r);
  return out;
}

export function buildWorld() {
  if (!config.supabaseUrl || !config.supabaseServiceKey || !config.groqApiKey) {
    throw new Error('ig-worker: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GROQ_API_KEY');
  }
  const supabase = createSupabaseClient({ url: config.supabaseUrl, serviceKey: config.supabaseServiceKey });
  const groq = new Groq({ apiKey: config.groqApiKey });

  const queue = createQueue(supabase);
  const fetchPost = createFetchPost({ apifyToken: config.apifyToken });
  const transcribe = createTranscriber({ groq });
  const extractFrames = createFrameExtractor();
  const ocr = createOcr({ apiKey: config.googleVisionApiKey ?? '' });
  const buildBundle = createBundleBuilder({
    transcribe: (input) => transcribe({ ...input, biasPrompt: BIAS_PROMPT }),
    ocr, downloadVideo, extractFrames, biasPrompt: BIAS_PROMPT,
  });
  const extract = createExtractor({ groq });
  const geocode = createGeocoder({
    googleLookup: realGoogleLookup(config.googleMapsApiKey ?? ''),
    kakaoLookup:  config.kakaoRestApiKey ? realKakaoLookup(config.kakaoRestApiKey) : async () => null,
  });
  const upsertPost = upsertPostFactory(supabase);
  const savePlaces = createSavePlaces(supabase);

  const process = createProcessor({
    fetchPost, upsertPost, buildBundle, extract, geocode, savePlaces,
    complete: queue.complete, fail: queue.fail,
  });

  const workerId = `${process.toString().slice(0, 6)}@local`;
  const loop = createWorkerLoop({
    claim: queue.claim, process, reapStale: queue.reapStale,
    concurrency: config.igWorkerConcurrency,
    workerId,
    staleThresholdSec: config.igWorkerStaleSec,
  });

  return { queue, loop, supabase };
}

let booted: ReturnType<typeof buildWorld> | null = null;

export function bootIgWorker() {
  if (!config.igWorkerEnabled) {
    console.log('[ig-worker] disabled by IG_WORKER_ENABLED=false');
    return null;
  }
  if (booted) return booted;
  try {
    booted = buildWorld();
    setInterval(() => { void booted!.loop.tick(); }, config.igWorkerPollMs);
    console.log(`[ig-worker] started concurrency=${config.igWorkerConcurrency} poll=${config.igWorkerPollMs}ms`);

    const shutdown = async () => {
      if (!booted) return;
      booted.loop.stop();
      const start = Date.now();
      while (booted.loop.inflight() > 0 && Date.now() - start < 30_000) {
        await new Promise(r => setTimeout(r, 250));
      }
      console.log('[ig-worker] shutdown complete');
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    return booted;
  } catch (err) {
    console.warn('[ig-worker] failed to boot:', err);
    return null;
  }
}

export function getQueue() {
  return booted?.queue ?? buildWorld().queue;
}
```

- [ ] **Step 2: Wire route + worker boot into `server/app.ts`**

In `server/app.ts`, near the top imports, add:

```ts
import { createInstagramPlacesRouter } from "./src/routes/instagramPlaces";
import { createClerkAuth } from "./src/middleware/clerkAuth";
import { bootIgWorker, getQueue } from "./src/igPlaces/wire";
import { config as serverConfig } from "./src/config";
```

After `app.route("/api/entity", entityRouter);`, append:

```ts
// IG place extractor — Clerk-gated route + in-process worker
const clerkAuth = serverConfig.clerkSecretKey
  ? createClerkAuth({ secretKey: serverConfig.clerkSecretKey })
  : null;

if (clerkAuth) {
  const igPlacesRouter = createInstagramPlacesRouter({
    enqueue: (userId, url) => getQueue().enqueue(userId, url),
    statsHandler: async () => ({ enabled: serverConfig.igWorkerEnabled }),
  });
  app.use('/api/korea/places/from-instagram/*', clerkAuth);
  app.route('/api/korea/places/from-instagram', igPlacesRouter);
} else {
  console.warn('[ig-places] CLERK_SECRET_KEY missing; endpoint not mounted');
}

bootIgWorker();
```

- [ ] **Step 3: Verify the server still boots**

```bash
IG_WORKER_ENABLED=false bun run server/app.ts &
sleep 2
curl -s http://localhost:3000/health | grep '"status":"ok"'
kill %1
```

Expected: health endpoint returns ok and server boots without throwing.

- [ ] **Step 4: Commit**

```bash
git add server/src/igPlaces/wire.ts server/app.ts
git commit -m "feat(igPlaces): wire route + worker boot into hono app"
```

---

### Task 20: CLI for manual E2E

**Files:**
- Create: `server/src/igPlaces/cli.ts`
- Create: `server/src/igPlaces/README.md`

- [ ] **Step 1: Write the CLI**

```ts
// server/src/igPlaces/cli.ts
//
// Manual E2E: run the full pipeline against an IG URL with real APIs,
// print structured output, don't write to DB.
//
// Usage: bun run server/src/igPlaces/cli.ts <instagram-url>

import Groq from 'groq-sdk';
import { config } from '../config';
import { createFetchPost } from './fetchPost';
import { createTranscriber, BIAS_PROMPT } from './transcribe';
import { createFrameExtractor } from './extractFrames';
import { createOcr } from './ocr';
import { createBundleBuilder } from './buildBundle';
import { createExtractor } from './extractPlaces';
import { createGeocoder, realGoogleLookup, realKakaoLookup } from './geocode';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function downloadVideo(url: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ig-cli-'));
  const out = join(dir, 'video.mp4');
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`download ${r.status}`);
  await Bun.write(out, r);
  return out;
}

async function main() {
  const url = process.argv[2];
  if (!url) { console.error('usage: bun run cli.ts <instagram-url>'); process.exit(1); }
  if (!config.groqApiKey) throw new Error('GROQ_API_KEY required');

  const groq = new Groq({ apiKey: config.groqApiKey });
  const fetchPost = createFetchPost({ apifyToken: config.apifyToken });
  const transcribe = createTranscriber({ groq });
  const extractFrames = createFrameExtractor();
  const ocr = createOcr({ apiKey: config.googleVisionApiKey ?? '' });
  const buildBundle = createBundleBuilder({
    transcribe: (i) => transcribe({ ...i, biasPrompt: BIAS_PROMPT }),
    ocr, downloadVideo, extractFrames, biasPrompt: BIAS_PROMPT,
  });
  const extract = createExtractor({ groq });
  const geocode = createGeocoder({
    googleLookup: realGoogleLookup(config.googleMapsApiKey ?? ''),
    kakaoLookup:  config.kakaoRestApiKey ? realKakaoLookup(config.kakaoRestApiKey) : async () => null,
  });

  console.log('[cli] fetching post …');
  const payload = await fetchPost(url, null);
  console.log('[cli] fetched via', payload.source, '— caption:', payload.caption.slice(0, 80));

  console.log('[cli] building bundle …');
  const bundle = await buildBundle(payload);
  if (bundle.transcript) console.log('[cli] transcript:', bundle.transcript.slice(0, 200));
  if (bundle.ocr) console.log('[cli] ocr:', bundle.ocr.slice(0, 200));

  console.log('[cli] extracting places (3-vote self-consistency) …');
  const voted = await extract(bundle);
  console.log('[cli] voted places:', voted.length);

  console.log('[cli] geocoding …');
  const enriched = await Promise.all(voted.map(v => geocode(v, payload.locationTag)));

  console.log('\n=== RESULTS ===');
  for (const p of enriched) {
    console.log(JSON.stringify({
      name: p.name, name_romanized: p.name_romanized, city: p.city, category: p.category,
      confidence_band: p.confidence_band, vote_count: p.vote_count,
      is_subject: p.is_subject, supporting_quote: p.supporting_quote,
      signal_source: p.signal_source, address: p.address, lat: p.lat, lng: p.lng,
      geocode_source: p.geocode_source, geocode_disagree: p.geocode_disagree,
    }, null, 2));
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Write the module README**

```markdown
# `igPlaces` — Instagram → Korea trip place extractor

## Prerequisites

- `brew install yt-dlp ffmpeg`
- Env vars in `.env`:
  - `APIFY_TOKEN`
  - `GOOGLE_MAPS_API_KEY` (Places New API enabled)
  - `GOOGLE_VISION_API_KEY` (or reuse Maps key if Vision is enabled on the same project)
  - `KAKAO_REST_API_KEY` (optional)
  - `GROQ_API_KEY`
  - `CLERK_SECRET_KEY`
  - `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- `IG_WORKER_ENABLED=true` (default) to run the worker
- `IG_WORKER_ENABLED=false` to skip the worker (useful in tests, CI)

## Architecture

See `docs/superpowers/specs/2026-05-18-instagram-place-extractor-design.md`.

## Manual dry-run

```bash
bun run server/src/igPlaces/cli.ts https://www.instagram.com/p/ABC123
```

Runs the full pipeline against a real URL with real APIs. Prints structured
output. Does NOT touch Supabase.

## Tests

```bash
bun test                         # unit tests only
INTEGRATION=1 bun test           # unit + integration tests
bun run server/src/igPlaces/eval/run.ts   # accuracy eval against fixtures
```

## Submitting a real URL through the queue

```bash
curl -X POST https://anthonyl.im/api/korea/places/from-instagram \
  -H "Authorization: Bearer $CLERK_JWT" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.instagram.com/p/ABC123"}'
```

Returns `202` and a job id. Poll the `instagram_jobs` table or `_stats` for state.
```

- [ ] **Step 3: Commit**

```bash
git add server/src/igPlaces/cli.ts server/src/igPlaces/README.md
git commit -m "feat(igPlaces): cli for manual e2e + module README"
```

---

### Task 21: Eval harness (scaffolding + first fixture + score runner)

**Files:**
- Create: `server/src/igPlaces/eval/run.ts`
- Create: `server/src/igPlaces/eval/score.ts`
- Create: `server/src/igPlaces/eval/score.test.ts`
- Create: `server/src/igPlaces/eval/README.md`
- Create: `server/src/igPlaces/eval/fixtures/01-geotagged-cafe-seongsu/input.json`
- Create: `server/src/igPlaces/eval/fixtures/01-geotagged-cafe-seongsu/expected.json`

- [ ] **Step 1: Write failing test for scorer**

```ts
// server/src/igPlaces/eval/score.test.ts
import { test, expect, describe } from 'bun:test';
import { scoreFixture } from './score';
import type { EnrichedPlace } from '../types';

const got: EnrichedPlace = {
  name: '어니언 성수', name_romanized: 'Onion Seongsu', city: 'Seoul', category: 'cafe',
  confidence: 0.95, is_subject: true, supporting_quote: 'q',
  signal_source: 'caption', vote_count: 3, confidence_band: 'high',
  address: 'X', lat: 37.5447, lng: 127.0556, google_place_id: 'GP',
  phone: null, rating: 4.6, business_types: [],
  geocode_source: 'google+kakao', geocode_kakao_id: null, geocode_disagree: false,
};
const expected = { name: '어니언 성수', is_subject: true, category: 'cafe', lat: 37.5447, lng: 127.0556 };

describe('scoreFixture', () => {
  test('100% precision/recall when extraction == expected', () => {
    const r = scoreFixture([got], [expected]);
    expect(r.extPrecision).toBe(1);
    expect(r.extRecall).toBe(1);
    expect(r.catAccuracy).toBe(1);
    expect(r.geoAccuracy).toBe(1);
  });
  test('halfway recall when one of two expected missing', () => {
    const r = scoreFixture([got], [expected, { name: 'Missing Place', is_subject: false, category: 'restaurant', lat: 0, lng: 0 }]);
    expect(r.extRecall).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run tests, watch them fail**

```bash
bun test server/src/igPlaces/eval/score.test.ts
```

Expected: fails.

- [ ] **Step 3: Implement scorer**

```ts
// server/src/igPlaces/eval/score.ts
import { canonicalize, levenshteinNormalized } from '../extractPlaces';
import { haversineMeters } from '../geocode';
import type { EnrichedPlace, IgPlaceCategory } from '../types';

export interface ExpectedPlace {
  name: string;
  is_subject: boolean;
  category: IgPlaceCategory;
  lat: number;
  lng: number;
}

export interface FixtureScore {
  extPrecision: number;
  extRecall: number;
  catAccuracy: number;
  geoAccuracy: number;
  matched: number;
  emitted: number;
  expected: number;
}

function fuzzyEq(a: string, b: string): boolean {
  const ca = canonicalize(a), cb = canonicalize(b);
  if (ca === cb || ca.includes(cb) || cb.includes(ca)) return true;
  return levenshteinNormalized(ca, cb) <= 2;
}

export function scoreFixture(got: EnrichedPlace[], expected: ExpectedPlace[]): FixtureScore {
  let catHits = 0, geoHits = 0, matched = 0;
  const usedExpected = new Set<number>();
  for (const g of got) {
    const idx = expected.findIndex((e, i) =>
      !usedExpected.has(i) && fuzzyEq(g.name, e.name) && g.is_subject === e.is_subject);
    if (idx === -1) continue;
    matched++;
    usedExpected.add(idx);
    const e = expected[idx];
    if (g.category === e.category) catHits++;
    if (g.lat != null && g.lng != null && haversineMeters(g.lat, g.lng, e.lat, e.lng) <= 100) geoHits++;
  }
  return {
    extPrecision: got.length ? matched / got.length : 0,
    extRecall:    expected.length ? matched / expected.length : 0,
    catAccuracy:  matched ? catHits / matched : 0,
    geoAccuracy:  matched ? geoHits / matched : 0,
    matched, emitted: got.length, expected: expected.length,
  };
}
```

- [ ] **Step 4: Run tests, watch them pass**

```bash
bun test server/src/igPlaces/eval/score.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Create first fixture**

`server/src/igPlaces/eval/fixtures/01-geotagged-cafe-seongsu/input.json`:

```json
{
  "shortcode": "ABC123",
  "caption": "성수동에서 가장 좋아하는 카페! 어니언 Onion. 빵도 맛있고 분위기도 좋아요. #seoulcafe #seongsu",
  "mediaItems": [
    { "type": "video", "url": "https://example.invalid/video.mp4", "thumbnail": "https://example.invalid/thumb.jpg" }
  ],
  "locationTag": { "name": "Cafe Onion Seongsu", "lat": 37.5447, "lng": 127.0556 },
  "source": "apify",
  "raw": {}
}
```

`server/src/igPlaces/eval/fixtures/01-geotagged-cafe-seongsu/expected.json`:

```json
{
  "places": [
    {
      "name": "어니언 성수",
      "is_subject": true,
      "category": "cafe",
      "lat": 37.5447,
      "lng": 127.0556
    }
  ]
}
```

- [ ] **Step 6: Write the eval runner**

```ts
// server/src/igPlaces/eval/run.ts
//
// Runs the pipeline against fixtures and prints a precision/recall table.
//
// Usage: bun run server/src/igPlaces/eval/run.ts

import Groq from 'groq-sdk';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../../config';
import type { PostPayload, EnrichedPlace } from '../types';
import { createBundleBuilder } from '../buildBundle';
import { createExtractor } from '../extractPlaces';
import { createGeocoder, realGoogleLookup, realKakaoLookup } from '../geocode';
import { createTranscriber, BIAS_PROMPT } from '../transcribe';
import { createFrameExtractor } from '../extractFrames';
import { createOcr } from '../ocr';
import { scoreFixture, type ExpectedPlace } from './score';

const FIX_DIR = join(import.meta.dir, 'fixtures');

async function loadFixtures(): Promise<{ name: string; input: PostPayload; expected: ExpectedPlace[] }[]> {
  const dirs = (await readdir(FIX_DIR, { withFileTypes: true }))
    .filter(d => d.isDirectory()).map(d => d.name).sort();
  const out: { name: string; input: PostPayload; expected: ExpectedPlace[] }[] = [];
  for (const d of dirs) {
    const input    = JSON.parse(await readFile(join(FIX_DIR, d, 'input.json'), 'utf8')) as PostPayload;
    const exp      = JSON.parse(await readFile(join(FIX_DIR, d, 'expected.json'), 'utf8')) as { places: ExpectedPlace[] };
    out.push({ name: d, input, expected: exp.places });
  }
  return out;
}

async function main() {
  if (!config.groqApiKey) throw new Error('GROQ_API_KEY required');
  const groq = new Groq({ apiKey: config.groqApiKey });

  // Skip video work in eval — fixtures should be captured with transcript/ocr inline if needed.
  const noopTranscribe = async () => '';
  const noopOcr = async () => '';
  const noopDownload = async () => '';
  const noopFrames = async () => [];

  const buildBundle = createBundleBuilder({
    transcribe: noopTranscribe, ocr: noopOcr,
    downloadVideo: noopDownload, extractFrames: noopFrames,
  });
  const extract = createExtractor({ groq });
  const geocode = createGeocoder({
    googleLookup: realGoogleLookup(config.googleMapsApiKey ?? ''),
    kakaoLookup:  config.kakaoRestApiKey ? realKakaoLookup(config.kakaoRestApiKey) : async () => null,
  });

  const fixtures = await loadFixtures();
  const rows: Array<{ name: string; ext_p: number; ext_r: number; cat: number; geo: number }> = [];
  for (const f of fixtures) {
    const bundle = await buildBundle(f.input);
    const voted  = await extract(bundle);
    const enriched: EnrichedPlace[] = await Promise.all(voted.map(v => geocode(v, f.input.locationTag)));
    const s = scoreFixture(enriched, f.expected);
    rows.push({ name: f.name, ext_p: s.extPrecision, ext_r: s.extRecall, cat: s.catAccuracy, geo: s.geoAccuracy });
  }

  console.log('\nfixture'.padEnd(50) + 'ext-P\text-R\tcat\tgeo');
  for (const r of rows) console.log(r.name.padEnd(50) +
    `${r.ext_p.toFixed(2)}\t${r.ext_r.toFixed(2)}\t${r.cat.toFixed(2)}\t${r.geo.toFixed(2)}`);
  const tot = rows.reduce((a, r) => ({
    ext_p: a.ext_p + r.ext_p, ext_r: a.ext_r + r.ext_r,
    cat: a.cat + r.cat, geo: a.geo + r.geo,
  }), { ext_p: 0, ext_r: 0, cat: 0, geo: 0 });
  const n = rows.length || 1;
  console.log('-'.repeat(80));
  console.log('TOTAL'.padEnd(50) +
    `${(tot.ext_p/n).toFixed(2)}\t${(tot.ext_r/n).toFixed(2)}\t${(tot.cat/n).toFixed(2)}\t${(tot.geo/n).toFixed(2)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 7: Write eval README**

```markdown
# IG Place Extractor — accuracy eval harness

## Run

```bash
bun run server/src/igPlaces/eval/run.ts
```

Prints precision/recall/category-accuracy/geo-accuracy per fixture and the TOTAL.

## Regression contract

When changing prompts, models, or reconciliation logic, run the eval before and
after. The TOTAL extraction precision AND recall must not drop more than 5
percentage points vs the previous baseline. If they do, the change should be
held back or accompanied by an explanation in the PR.

## Adding a fixture

1. Find a real IG post that exercises a behavior the harness doesn't yet cover
   (e.g., silent reel with overlay-only text, listicle of 6 cafes, audio-only
   mention, untagged restaurant, Busan side-street POI).
2. Create a new directory `eval/fixtures/NN-short-name/`.
3. Capture the post via `bun run server/src/igPlaces/cli.ts <url>` and copy the
   resolved `PostPayload` into `input.json` (strip any direct media URLs that
   might 404 later; keep caption + locationTag + media types).
4. Hand-label `expected.json` with the places a careful human reader would
   extract.
5. Run `bun run server/src/igPlaces/eval/run.ts` to confirm the fixture scores
   reasonably.
6. Commit input.json + expected.json.

Target ≥ 10 fixtures covering: geotagged, untagged, multi-place listicle,
silent overlay-only, audio-only mention, mixed Korean/English code-switch,
passing mention (is_subject=false), no place at all, carousel of N images,
Busan side-street where Kakao wins.
```

- [ ] **Step 8: Verify scorer + scaffolding work**

```bash
bun test server/src/igPlaces/eval/score.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 9: Commit**

```bash
git add server/src/igPlaces/eval/
git commit -m "feat(igPlaces): accuracy eval harness with scorer and first fixture"
```

---

## Self-review

### Spec coverage

| Spec section | Task |
|---|---|
| DB schema (jobs/posts/places + enums + RLS) | Task 1 |
| Env vars / config | Task 2 |
| URL normalization | Task 4 |
| Shared types | Task 5 |
| Supabase REST helper | Task 6 |
| Queue (SKIP LOCKED + RPC fns) | Task 7 |
| fetchPost (yt-dlp + Apify fallback) | Task 8 |
| Dual-pass Whisper transcription | Task 9 |
| Frame extraction + Google Vision OCR | Task 10 |
| Bundle builder (caption + transcript + ocr + hashtags) | Task 11 |
| Self-consistency 3-vote extraction | Task 12 |
| Dual-source geocoding (Google + Kakao reconciliation, bbox + rating bars) | Task 13 |
| Save posts + places | Task 14 |
| process(job) composer | Task 15 |
| Worker loop + reapStale | Task 16 |
| Clerk JWT middleware | Task 17 |
| POST endpoint + _stats | Task 18 |
| Wire into app.ts + composition root | Task 19 |
| Manual E2E CLI + README | Task 20 |
| Eval harness with first fixture + scorer | Task 21 |

All spec sections are covered by exactly one task.

### Notes on intentional decisions

- **Eval harness ships with only one fixture.** The remaining nine listed in the spec are non-blocking — they get added over time as Anthony submits real URLs and notices edge cases. Task 21 includes the README workflow so adding fixtures is trivial.
- **Graceful shutdown for the worker** is implemented inside `wire.ts` (the composition root has the long-lived state — the loop module itself is pure) rather than as a separate task. The `SIGTERM`/`SIGINT` handlers in `bootIgWorker` cover it.
- **Integration test for the full worker loop** is folded into the manual E2E CLI (Task 20). A `*.int.test.ts` against the real Supabase test project would be ideal but requires test-DB credentials that aren't a clean prerequisite for this PR. If the user wants a separate task for that, add it after this plan completes — it's a natural Task 22.
- **No frontend UI is in scope.** Per the spec's "out of scope" section. The CLAUDE.md `frontend screenshot rule` does not apply.

---

## Plan complete

Plan saved to `docs/superpowers/plans/2026-05-18-instagram-place-extractor.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?

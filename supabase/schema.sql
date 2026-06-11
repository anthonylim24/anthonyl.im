-- ============================================================
-- Breathwork App Schema
-- Run this in the Supabase Dashboard SQL Editor
-- ============================================================

-- Profiles: stores Clerk user info
create table if not exists public.profiles (
  user_id    text primary key,
  email      text,
  name       text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users manage own profile"
  on public.profiles for all to authenticated
  using ((select auth.jwt()->>'sub') = user_id)
  with check ((select auth.jwt()->>'sub') = user_id);

-- Sessions: one row per completed breathing session
create table if not exists public.sessions (
  id               text primary key,
  user_id          text not null,
  technique_id     text not null,
  date             timestamptz not null,
  duration_seconds integer not null,
  rounds           integer not null,
  hold_times       jsonb default '[]',
  custom_phase_durations jsonb,
  max_hold_time    real not null,
  avg_hold_time    real not null,
  created_at       timestamptz default now()
);

alter table if exists public.sessions
  add column if not exists custom_phase_durations jsonb;

alter table public.sessions enable row level security;

create policy "Users manage own sessions"
  on public.sessions for all to authenticated
  using ((select auth.jwt()->>'sub') = user_id)
  with check ((select auth.jwt()->>'sub') = user_id);

-- User state: single row per user combining gamification + settings
create table if not exists public.user_state (
  user_id              text primary key,
  xp                   integer default 0,
  earned_badges        jsonb default '[]',
  selected_theme       text default 'default',
  daily_session_count  integer default 0,
  weekly_session_count integer default 0,
  last_daily_reset     text,
  last_weekly_reset    text,
  personal_bests       jsonb default '{}',
  vo2_max_manual       real,
  vo2_max_history      jsonb default '[]',
  settings             jsonb default '{}',
  updated_at           timestamptz default now()
);

alter table public.user_state enable row level security;

create policy "Users manage own state"
  on public.user_state for all to authenticated
  using ((select auth.jwt()->>'sub') = user_id)
  with check ((select auth.jwt()->>'sub') = user_id);

-- ============================================================
-- Korea entity-about cache
-- Shared read-mostly cache backing the /api/entity/about popover.
-- The server writes new descriptions on first lookup; subsequent
-- visits across the trip planner read straight from this table so
-- we only pay the LLM cost once per unique (type, name, city).
-- ============================================================
create table if not exists public.korea_entity_about (
  key         text primary key,
  description text,
  created_at  timestamptz default now()
);

alter table public.korea_entity_about enable row level security;

-- Only the server (service-role key) writes. Reads are open to the
-- authenticated app so we could front-load descriptions client-side
-- in the future without re-hitting the server.
create policy "Anyone signed in can read entity cache"
  on public.korea_entity_about for select to authenticated
  using (true);

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
create unique index if not exists instagram_places_post_user_name_uq
  on public.instagram_places (post_id, user_id, name);

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

-- ============================================================
-- IG job step tracking (per-stage progress for the live UI)
-- ============================================================

do $$ begin
  create type ig_job_step as enum
    ('queued','fetching','bundling','extracting','geocoding','saving','done');
exception when duplicate_object then null;
end $$;

alter table public.instagram_jobs
  add column if not exists step ig_job_step not null default 'queued';

-- ============================================================
-- IG retry: reset a dead/failed job back to pending so the worker
-- picks it up again. Scoped by user_id so the caller can only
-- retry their own jobs (defense-in-depth on top of RLS, since the
-- server uses the service-role key which bypasses RLS).
-- Returns true if the row was matched + updated, false otherwise.
-- ============================================================

create or replace function public.ig_retry_job(p_id bigint, p_user_id text)
returns boolean language plpgsql security definer as $$
declare matched int;
begin
  update public.instagram_jobs
     set status        = 'pending'::ig_job_status,
         step          = 'queued'::ig_job_step,
         attempts      = 0,
         last_error    = null,
         locked_at     = null,
         locked_by     = null,
         scheduled_for = now(),
         updated_at    = now()
   where id = p_id
     and user_id = p_user_id
     and status in ('dead'::ig_job_status, 'failed'::ig_job_status);
  get diagnostics matched = row_count;
  return matched > 0;
end $$;

-- ============================================================
-- IG job per-step logs + step-start timestamp
-- ============================================================

do $$ begin
  create type ig_log_level as enum ('info','warn','error');
exception when duplicate_object then null;
end $$;

create table if not exists public.instagram_job_logs (
  id         bigserial primary key,
  job_id     bigint not null references public.instagram_jobs(id) on delete cascade,
  step       ig_job_step not null,
  level      ig_log_level not null default 'info',
  message    text not null,
  created_at timestamptz not null default now()
);
create index if not exists instagram_job_logs_job_idx
  on public.instagram_job_logs (job_id, id);

alter table public.instagram_job_logs enable row level security;
create policy "Users read logs of their jobs"
  on public.instagram_job_logs for select to authenticated
  using (exists (
    select 1 from public.instagram_jobs j
     where j.id = job_id and j.user_id = (select auth.jwt()->>'sub')
  ));

create or replace function public.ig_log_job(
  p_job_id bigint, p_step ig_job_step, p_level ig_log_level, p_message text
) returns void language sql security definer as $$
  insert into public.instagram_job_logs (job_id, step, level, message)
  values (p_job_id, p_step, p_level, p_message);
$$;

-- step_started_at: bumped each time step changes; used for ETA on the UI.
alter table public.instagram_jobs
  add column if not exists step_started_at timestamptz;

create or replace function public.ig_set_job_step(
  p_job_id bigint, p_step ig_job_step
) returns void language sql security definer as $$
  update public.instagram_jobs
     set step = p_step, step_started_at = now(), updated_at = now()
   where id = p_job_id;
$$;

-- ============================================================
-- Allow multi-tenant jobs per URL.
-- Was: instagram_jobs.dedupe_key UNIQUE globally
-- Now: UNIQUE (user_id, dedupe_key) — each user gets their own job row.
-- ============================================================
do $$ begin
  alter table public.instagram_jobs drop constraint instagram_jobs_dedupe_key_key;
exception when undefined_object then null;
end $$;

create unique index if not exists instagram_jobs_user_dedupe_key_uq
  on public.instagram_jobs (user_id, dedupe_key);

-- Update enqueue to honor the new per-user uniqueness.
create or replace function public.ig_enqueue_job(
  p_user_id text, p_url text, p_dedupe_key text
) returns table (id bigint, status ig_job_status, inserted boolean)
language sql security definer as $$
  insert into public.instagram_jobs (user_id, url, dedupe_key)
  values (p_user_id, p_url, p_dedupe_key)
  on conflict (user_id, dedupe_key) do update set updated_at = now()
  returning instagram_jobs.id, instagram_jobs.status, (xmax = 0) as inserted;
$$;

-- Atomic re-extract: reset job + delete the user's previous places for it.
create or replace function public.ig_reextract_job(p_id bigint, p_user_id text)
returns boolean language plpgsql security definer as $$
declare matched int;
begin
  -- 1. Clear out the user's previously-extracted places for this post.
  delete from public.instagram_places
   where user_id = p_user_id
     and post_id in (select post_id from public.instagram_jobs where id = p_id);

  -- 2. Wipe the per-job log history so the popovers / log viewer reflect ONLY
  --    the new run. Without this, stale "yt-dlp not installed" / "Google 403"
  --    lines from earlier attempts pollute the live view and make debugging
  --    a fresh attempt confusing.
  delete from public.instagram_job_logs
   where job_id = p_id;

  -- 3. Reset job state. step_started_at is cleared so the UI ETA recomputes
  --    cleanly from the next setStep() call (which sets it to now()).
  update public.instagram_jobs
     set status='pending'::ig_job_status,
         step='queued'::ig_job_step,
         step_started_at=null,
         attempts=0,
         last_error=null,
         locked_at=null, locked_by=null,
         scheduled_for=now(),
         updated_at=now()
   where id = p_id and user_id = p_user_id;
  get diagnostics matched = row_count;
  return matched > 0;
end $$;

-- Cross-user place sharing.
-- Called after enqueue. If another user has a done job for this same
-- dedupe_key with places, copy those places under the calling user and
-- mark the calling user's job as done so the pipeline doesn't re-run.
-- Returns the number of places copied (0 = nothing shared, do the
-- normal pipeline run).
create or replace function public.ig_share_places_from_other_user(
  p_user_id text, p_dedupe_key text
) returns int language plpgsql security definer as $$
declare
  source_post_id bigint;
  copied int := 0;
  this_job_id bigint;
begin
  -- Find a done job for this URL owned by ANY OTHER user.
  select j.post_id into source_post_id
    from public.instagram_jobs j
   where j.dedupe_key = p_dedupe_key
     and j.user_id <> p_user_id
     and j.status = 'done'
     and j.post_id is not null
     and exists (select 1 from public.instagram_places ip where ip.post_id = j.post_id)
   order by j.updated_at desc
   limit 1;

  if source_post_id is null then return 0; end if;

  -- Find the calling user's job (should exist — enqueue just ran).
  select id into this_job_id
    from public.instagram_jobs
   where user_id = p_user_id and dedupe_key = p_dedupe_key
   limit 1;

  if this_job_id is null then return 0; end if;

  -- Copy places from the source user into the calling user, scoped to the
  -- same post. Skip places that this user already has (idempotent).
  insert into public.instagram_places
    (post_id, user_id, name, name_romanized, city, category, address,
     lat, lng, google_place_id, phone, rating, business_types,
     is_subject, confidence, confidence_band, supporting_quote,
     signal_source, vote_count, geocode_source, geocode_kakao_id,
     geocode_disagree, status)
  select source_post_id, p_user_id, name, name_romanized, city, category, address,
         lat, lng, google_place_id, phone, rating, business_types,
         is_subject, confidence, confidence_band, supporting_quote,
         signal_source, vote_count, geocode_source, geocode_kakao_id,
         geocode_disagree, status
    from public.instagram_places
   where post_id = source_post_id
     and user_id <> p_user_id
     and not exists (
       select 1 from public.instagram_places ip2
        where ip2.post_id = source_post_id
          and ip2.user_id = p_user_id
          and ip2.name = instagram_places.name
     );
  get diagnostics copied = row_count;

  -- Mark this user's job as done with the shared post_id.
  update public.instagram_jobs
     set status='done'::ig_job_status,
         step='done'::ig_job_step,
         post_id=source_post_id,
         locked_at=null, locked_by=null, last_error=null,
         updated_at=now()
   where id = this_job_id;

  return copied;
end $$;

-- ============================================================
-- Migration: add 'comment' to ig_signal_source enum
-- ============================================================
-- NOTE: `alter type … add value` cannot run inside a transaction block
-- alongside data DML. Run this statement in the Supabase SQL editor as a
-- standalone one-time step BEFORE deploying the matching server code.
-- See deploy/README.md § "One-time SQL: enable 'comment' signal source".
-- Safe to re-run (the `if not exists` guard is a no-op on subsequent runs).
do $$ begin
  alter type ig_signal_source add value if not exists 'comment';
exception when undefined_object then null; end $$;

-- ============================================================
-- Migration: skip_video column + updated ig_enqueue_job
-- ============================================================
-- Allow the submitter to skip the video pipeline. When true, the worker
-- skips downloadVideo + transcribe + frame extraction + OCR. Cuts job
-- runtime from ~90s to ~10s when the location is already in caption +
-- comments, at the cost of dropping ~15% of extractions whose only
-- signal is audio transcript or burned-in frame text.
alter table public.instagram_jobs
  add column if not exists skip_video boolean not null default false;

-- Update ig_enqueue_job to accept skip_video.
create or replace function public.ig_enqueue_job(
  p_user_id text, p_url text, p_dedupe_key text, p_skip_video boolean default false
) returns table (id bigint, status ig_job_status, inserted boolean)
language sql security definer as $$
  insert into public.instagram_jobs (user_id, url, dedupe_key, skip_video)
  values (p_user_id, p_url, p_dedupe_key, p_skip_video)
  on conflict (user_id, dedupe_key) do update set
    updated_at = now(),
    skip_video = excluded.skip_video    -- honor latest preference on resubmit
  returning instagram_jobs.id, instagram_jobs.status, (xmax = 0) as inserted;
$$;

-- ============================================================
-- IG place busyness enrichment
-- busyness: how crowded this place typically is (fetched post-geocode
--   via Gemini 3.1 Flash Lite with Google Maps grounding; Kakao inferred
--   as fallback when Gemini confidence is low).
-- busyness_source: which system produced the value.
-- busyness_confidence: 0..1 confidence score from the source model.
-- ============================================================

alter table public.instagram_places
  add column if not exists busyness text
    check (busyness in ('quiet', 'moderate', 'busy', 'very_busy'))
    default null;

alter table public.instagram_places
  add column if not exists busyness_source text
    check (busyness_source in ('gemini-grounded', 'kakao', 'inferred'))
    default null;

alter table public.instagram_places
  add column if not exists busyness_confidence real default null;

-- ============================================================
-- IG place → itinerary day assignment
-- Allows a user to assign their extracted IG places to one or
-- more specific days of the Korea trip (day_n: 1-12).
-- ============================================================

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

-- Replace the day set for a place. Empty array = unassign all.
create or replace function public.ig_set_place_days(
  p_user_id text, p_place_id bigint, p_days smallint[]
) returns void language plpgsql security definer as $$
begin
  -- Guard: place must belong to the user.
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

-- ── Multi-trip travel planner ───────────────────────────────────────────
--
-- Trips are stored as whole documents (doc jsonb = the Trip object: metadata,
-- collaborators, days[].items[] with structured locations). All reads/writes
-- go through the server with the service-role key; permission checks (owner /
-- collaborator / shared) are enforced in server/src/routes/trips.ts.

create table if not exists public.trips (
  id          text primary key,
  owner_id    text not null,
  doc         jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists trips_owner_idx on public.trips (owner_id);

alter table public.trips enable row level security;
-- No anon/authenticated policies: service-role only.

create table if not exists public.trip_enhancement_runs (
  id          text primary key,
  trip_id     text not null references public.trips(id) on delete cascade,
  doc         jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists trip_enhancement_runs_trip_idx
  on public.trip_enhancement_runs (trip_id, created_at desc);

alter table public.trip_enhancement_runs enable row level security;

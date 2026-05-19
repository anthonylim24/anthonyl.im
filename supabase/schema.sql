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

create type ig_job_step as enum
  ('queued','fetching','bundling','extracting','geocoding','saving','done');

alter table public.instagram_jobs
  add column if not exists step ig_job_step not null default 'queued';

create or replace function public.ig_set_job_step(
  p_job_id bigint, p_step ig_job_step
) returns void language sql security definer as $$
  update public.instagram_jobs set step = p_step, updated_at = now()
   where id = p_job_id;
$$;

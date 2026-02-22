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
  max_hold_time    real not null,
  avg_hold_time    real not null,
  created_at       timestamptz default now()
);

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

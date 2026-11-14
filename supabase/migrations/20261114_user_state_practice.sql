-- BreathFlow: daily goal and journey progress (the client's practice store),
-- so both follow a signed-in user across devices.
alter table public.user_state
  add column if not exists practice jsonb default '{}'::jsonb;

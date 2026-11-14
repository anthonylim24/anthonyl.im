-- BreathFlow: the optional before / after calm rating (1 = tense, 5 = calm)
-- now follows a signed-in user across devices.
alter table public.sessions
  add column if not exists mood_before smallint check (mood_before between 1 and 5),
  add column if not exists mood_after  smallint check (mood_after between 1 and 5);

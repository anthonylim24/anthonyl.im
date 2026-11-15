-- Instagram import: job lifecycle and cross-user sharing fixes.
--
-- Every function keeps its exact signature and return type, so the server
-- before and after this change works against the database before and after
-- this migration. Mirrored in supabase/schema.sql. The state machine these
-- implement is `transition()` in server/src/igPlaces/types.ts.
--
-- 1. ig_claim_job only claims a job with attempts left.
-- 2. ig_reap_stale buries (dead) a stale running job that has used its
--    attempts, instead of re-queuing it forever; it also buries pending jobs
--    left with no attempts by the old reaper, which claim now skips.
-- 3. ig_set_job_step bumps locked_at, so a long job that is still making
--    progress is not reaped; only a running row is touched.
-- 4. ig_fail_job only acts on a running row (a late failure from a worker
--    that lost its lock must not re-queue someone else's run).
-- 5. ig_reextract_job only resets a finished (done / dead) job, and deletes
--    nothing otherwise.
-- 6. ig_share_places_from_other_user copies from ONE source user (copying
--    from every user duplicated names and hit the unique index), copies
--    only places that user kept, as 'extracted', skips anything that would
--    conflict, and only finishes a job that is still pending.

begin;

create or replace function public.ig_claim_job(p_worker text)
returns setof public.instagram_jobs
language sql security definer set search_path = public, extensions, pg_temp as $$
  with claimed as (
    select id from public.instagram_jobs
     where status = 'pending' and scheduled_for <= now()
       and attempts < max_attempts
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
) returns void
language sql security definer set search_path = public, extensions, pg_temp as $$
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
   where id = p_job_id
     and status = 'running';
$$;

create or replace function public.ig_reap_stale(p_threshold_sec int)
returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  reaped int;
  stranded int;
begin
  update public.instagram_jobs
     set status = case when attempts >= max_attempts
                       then 'dead'::ig_job_status
                       else 'pending'::ig_job_status end,
         locked_at=null, locked_by=null,
         last_error='reaped: stale lock', updated_at=now()
   where status='running' and locked_at < now() - (p_threshold_sec * interval '1 second');
  get diagnostics reaped = row_count;

  update public.instagram_jobs
     set status='dead'::ig_job_status,
         last_error=coalesce(last_error, 'out of attempts'),
         updated_at=now()
   where status='pending' and attempts >= max_attempts;
  get diagnostics stranded = row_count;

  return reaped + stranded;
end $$;

create or replace function public.ig_set_job_step(
  p_job_id bigint, p_step ig_job_step
) returns void
language sql security definer set search_path = public, extensions, pg_temp as $$
  update public.instagram_jobs
     set step = p_step, step_started_at = now(), locked_at = now(), updated_at = now()
   where id = p_job_id
     and status = 'running';
$$;

create or replace function public.ig_reextract_job(p_id bigint, p_user_id text)
returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  job_post_id bigint;
begin
  -- Lock the row and check it is finished before touching anything.
  select post_id into job_post_id
    from public.instagram_jobs
   where id = p_id and user_id = p_user_id
     and status in ('done'::ig_job_status, 'dead'::ig_job_status, 'failed'::ig_job_status)
   for update;
  if not found then return false; end if;

  -- 1. Clear out the user's previously-extracted places for this post.
  if job_post_id is not null then
    delete from public.instagram_places
     where user_id = p_user_id and post_id = job_post_id;
  end if;

  -- 2. Wipe the per-job log history so the log viewer reflects ONLY the new run.
  delete from public.instagram_job_logs where job_id = p_id;

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
   where id = p_id;
  return true;
end $$;

create or replace function public.ig_share_places_from_other_user(
  p_user_id text, p_dedupe_key text
) returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  this_job_id bigint;
  source_user_id text;
  source_post_id bigint;
  shared int := 0;
begin
  -- Only a job still waiting to run can be finished by sharing.
  select id into this_job_id
    from public.instagram_jobs
   where user_id = p_user_id and dedupe_key = p_dedupe_key
     and status = 'pending'::ig_job_status
   for update;
  if not found then return 0; end if;

  -- One source: the most recent other user who finished this post and kept
  -- at least one place from it.
  select j.user_id, j.post_id into source_user_id, source_post_id
    from public.instagram_jobs j
   where j.dedupe_key = p_dedupe_key
     and j.user_id <> p_user_id
     and j.status = 'done'::ig_job_status
     and j.post_id is not null
     and exists (
       select 1 from public.instagram_places ip
        where ip.post_id = j.post_id and ip.user_id = j.user_id and ip.status <> 'rejected'
     )
   order by j.updated_at desc
   limit 1;
  if not found then return 0; end if;

  insert into public.instagram_places
    (post_id, user_id, name, name_romanized, city, category, address,
     lat, lng, google_place_id, phone, rating, business_types,
     is_subject, confidence, confidence_band, supporting_quote,
     signal_source, vote_count, geocode_source, geocode_kakao_id,
     geocode_disagree, busyness, busyness_source, busyness_confidence, status)
  select source_post_id, p_user_id, name, name_romanized, city, category, address,
         lat, lng, google_place_id, phone, rating, business_types,
         is_subject, confidence, confidence_band, supporting_quote,
         signal_source, vote_count, geocode_source, geocode_kakao_id,
         geocode_disagree, busyness, busyness_source, busyness_confidence, 'extracted'
    from public.instagram_places
   where post_id = source_post_id
     and user_id = source_user_id
     and status <> 'rejected'
  on conflict do nothing;

  update public.instagram_jobs
     set status='done'::ig_job_status,
         step='done'::ig_job_step,
         post_id=source_post_id,
         locked_at=null, locked_by=null, last_error=null,
         updated_at=now()
   where id = this_job_id and status = 'pending'::ig_job_status;

  -- What the user now has from this post (copied now or already theirs).
  select count(*) into shared
    from public.instagram_places
   where post_id = source_post_id and user_id = p_user_id and status <> 'rejected';
  return shared;
end $$;

-- create or replace keeps existing grants; restate them so this file is
-- correct on its own (see 20261114_lock_down_security_definer_functions.sql).
revoke execute on function public.ig_claim_job(text) from public, anon, authenticated;
revoke execute on function public.ig_fail_job(bigint, text, boolean) from public, anon, authenticated;
revoke execute on function public.ig_reap_stale(int) from public, anon, authenticated;
revoke execute on function public.ig_set_job_step(bigint, ig_job_step) from public, anon, authenticated;
revoke execute on function public.ig_reextract_job(bigint, text) from public, anon, authenticated;
revoke execute on function public.ig_share_places_from_other_user(text, text) from public, anon, authenticated;
grant execute on function public.ig_claim_job(text) to service_role;
grant execute on function public.ig_fail_job(bigint, text, boolean) to service_role;
grant execute on function public.ig_reap_stale(int) to service_role;
grant execute on function public.ig_set_job_step(bigint, ig_job_step) to service_role;
grant execute on function public.ig_reextract_job(bigint, text) to service_role;
grant execute on function public.ig_share_places_from_other_user(text, text) to service_role;

commit;

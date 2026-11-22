-- Trips AI review: a durable queue on trip_enhancement_runs.
--
-- A review used to run in process memory, so a restart or deploy stranded
-- it and nothing retried. Now a queued run is a row a worker claims with a
-- lease (FOR UPDATE SKIP LOCKED, like ig_claim_job): a lapsed lease is
-- claimed again, a failed attempt is retried with backoff, and a run out of
-- attempts is failed for good.
--
-- Additive only. The server before this change upserts id / trip_id /
-- created_at / doc and keeps working: its rows have queue_state null
-- ("legacy") and the queue never touches them.
--
-- Every function keeps doc->'queue' (RunQueueInfo in
-- server/src/trips/types.ts) in step with the columns, so readers see queue
-- progress on the run document. The reference semantics are
-- MemoryTripStore in server/src/trips/store.ts. Mirrored in
-- supabase/schema.sql.

begin;

alter table public.trip_enhancement_runs
  add column if not exists queue_state  text check (queue_state in ('queued', 'working', 'done')),
  add column if not exists attempts     int not null default 0,
  add column if not exists max_attempts int not null default 3,
  add column if not exists run_after    timestamptz not null default now(),
  add column if not exists locked_by    text,
  add column if not exists locked_until timestamptz,
  add column if not exists last_error   text,
  add column if not exists request      jsonb,
  add column if not exists updated_at   timestamptz not null default now();

-- At most one live review per trip. trip_review_enqueue relies on it.
create unique index if not exists trip_enhancement_runs_live_trip_uq
  on public.trip_enhancement_runs (trip_id) where queue_state in ('queued', 'working');
-- What a claim scans: queued runs coming due, and leases that lapsed.
create index if not exists trip_enhancement_runs_queued_idx
  on public.trip_enhancement_runs (run_after) where queue_state = 'queued';
create index if not exists trip_enhancement_runs_working_idx
  on public.trip_enhancement_runs (locked_until) where queue_state = 'working';

-- doc->'queue' for a row: RunQueueInfo, camelCase. nextAttemptAt only while
-- queued, lastError only once an attempt failed. Timestamps in the same
-- ISO form as JavaScript's toISOString().
create or replace function public.trip_review_queue_info(r public.trip_enhancement_runs)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  return jsonb_build_object('state', r.queue_state, 'attempt', r.attempts, 'maxAttempts', r.max_attempts)
    || case when r.queue_state = 'queued'
            then jsonb_build_object('nextAttemptAt',
                   to_char(r.run_after at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
            else '{}'::jsonb end
    || case when r.last_error is not null
            then jsonb_build_object('lastError', r.last_error)
            else '{}'::jsonb end;
end $$;

-- The one write path for a queued run: the caller changes the row it read,
-- and this stores the queue columns and r.doc with doc->'queue' rebuilt from
-- the new values (an inline SET doc = ... would see the old columns).
create or replace function public.trip_review_save(r public.trip_enhancement_runs)
returns public.trip_enhancement_runs
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  saved public.trip_enhancement_runs;
begin
  update public.trip_enhancement_runs t
     set queue_state  = r.queue_state,
         attempts     = r.attempts,
         max_attempts = r.max_attempts,
         run_after    = r.run_after,
         locked_by    = r.locked_by,
         locked_until = r.locked_until,
         last_error   = r.last_error,
         doc          = r.doc || jsonb_build_object('queue', public.trip_review_queue_info(r)),
         updated_at   = now()
   where t.id = r.id
  returning t.* into saved;
  return saved;
end $$;

-- The run, locked, if this claim still holds it; null otherwise. Every
-- lease check goes through here, so a worker whose lease lapsed and was
-- claimed again (attempts moved on) can no longer write the run.
create or replace function public.trip_review_held(p_id text, p_worker text, p_attempt int)
returns public.trip_enhancement_runs
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  r public.trip_enhancement_runs;
begin
  select t.* into r
    from public.trip_enhancement_runs t
   where t.id = p_id
     and t.queue_state = 'working'
     and t.locked_by = p_worker
     and t.attempts = p_attempt
     for update;
  if not found then return null; end if;
  return r;
end $$;

-- Queue a review. When the trip already has a live (queued or working)
-- review, nothing is inserted and that run comes back instead.
-- Returns {"inserted": bool, "doc": run}.
create or replace function public.trip_review_enqueue(
  p_id text, p_trip_id text, p_doc jsonb, p_request jsonb, p_max_attempts int
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  r public.trip_enhancement_runs;
begin
  -- A live review older than QUEUED_RUN_MAX_MS (types.ts) already reads as
  -- failed to every reader; it must not keep blocking new ones (no worker
  -- ever took it). Fail it for good, as settleStaleRun shows it.
  for r in
    select t.* from public.trip_enhancement_runs t
     where t.trip_id = p_trip_id
       and t.queue_state in ('queued', 'working')
       and t.created_at < now() - interval '30 minutes'
     for update
  loop
    r.queue_state := 'done';
    r.locked_by := null;
    r.locked_until := null;
    r.doc := r.doc || jsonb_build_object(
      'status', 'error',
      'error', coalesce(r.last_error, 'The AI review was interrupted. Nothing in your itinerary changed, so you can run it again.'),
      'outcome', 'no_adds_possible',
      'outcomeReason', 'The AI review failed before it could add places.');
    perform public.trip_review_save(r);
  end loop;

  -- The live run that blocked the insert can finish before the select below
  -- reads it; then the next insert goes through. Bounded so it cannot spin.
  for i in 1..3 loop
    insert into public.trip_enhancement_runs as t
      (id, trip_id, created_at, doc, queue_state, attempts, max_attempts, run_after, request)
    values
      (p_id, p_trip_id, coalesce((p_doc->>'createdAt')::timestamptz, now()), p_doc,
       'queued', 0, p_max_attempts, now(), p_request)
    on conflict (trip_id) where queue_state in ('queued', 'working') do nothing
    returning t.* into r;
    if found then
      r := public.trip_review_save(r);
      return jsonb_build_object('inserted', true, 'doc', r.doc);
    end if;

    select t.* into r
      from public.trip_enhancement_runs t
     where t.trip_id = p_trip_id and t.queue_state in ('queued', 'working');
    if found then
      return jsonb_build_object('inserted', false, 'doc', r.doc);
    end if;
  end loop;
  raise exception 'trip_review_enqueue: trip % kept changing; could not queue a review', p_trip_id;
end $$;

-- Claim one due review for p_worker, leased for p_lease_sec. Returns 0 or 1
-- row. A due review is queued with run_after passed, or working with a lapsed
-- lease (its worker died). A review out of attempts is failed instead.
-- p_run_id claims only that run. Legacy rows (queue_state null) and runs
-- whose doc is no longer 'running' are left alone.
create or replace function public.trip_review_claim(p_worker text, p_lease_sec int, p_run_id text default null)
returns setof public.trip_enhancement_runs
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  r public.trip_enhancement_runs;
begin
  -- Out of attempts: the last one died with its lease. Fail it for good.
  for r in
    select t.* from public.trip_enhancement_runs t
     where (p_run_id is null or t.id = p_run_id)
       and t.queue_state is not null
       and t.doc->>'status' = 'running'
       and t.attempts >= t.max_attempts
       and (t.queue_state = 'queued' or (t.queue_state = 'working' and t.locked_until < now()))
     for update skip locked
  loop
    r.queue_state := 'done';
    r.locked_by := null;
    r.locked_until := null;
    r.doc := r.doc || jsonb_build_object(
      'status', 'error',
      'error', coalesce(r.last_error, 'The AI review stopped before it finished.'),
      'outcome', 'no_adds_possible',
      'outcomeReason', 'The AI review failed before it could add places.');
    perform public.trip_review_save(r);
  end loop;

  select t.* into r
    from public.trip_enhancement_runs t
   where (p_run_id is null or t.id = p_run_id)
     and t.queue_state is not null
     and t.doc->>'status' = 'running'
     and t.attempts < t.max_attempts
     and ((t.queue_state = 'queued' and t.run_after <= now())
          or (t.queue_state = 'working' and t.locked_until < now()))
   order by t.run_after
   limit 1
   for update skip locked;
  if not found then return; end if;

  r.queue_state := 'working';
  r.attempts := r.attempts + 1;
  r.locked_by := p_worker;
  r.locked_until := now() + p_lease_sec * interval '1 second';
  r := public.trip_review_save(r);
  return next r;
end $$;

-- Renew the lease. False when the claim no longer holds the run.
create or replace function public.trip_review_heartbeat(p_id text, p_worker text, p_attempt int, p_lease_sec int)
returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  r public.trip_enhancement_runs;
begin
  r := public.trip_review_held(p_id, p_worker, p_attempt);
  if r.id is null then return false; end if;
  r.locked_until := now() + p_lease_sec * interval '1 second';
  perform public.trip_review_save(r);
  return true;
end $$;

-- Hand a claimed run back without spending its attempt (shutdown).
create or replace function public.trip_review_release(p_id text, p_worker text, p_attempt int)
returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  r public.trip_enhancement_runs;
begin
  r := public.trip_review_held(p_id, p_worker, p_attempt);
  if r.id is null then return; end if;
  r.queue_state := 'queued';
  r.attempts := r.attempts - 1;
  r.run_after := now();
  r.locked_by := null;
  r.locked_until := null;
  perform public.trip_review_save(r);
end $$;

-- End an attempt that failed. With p_retry_in_ms and attempts left the run
-- is queued again after that delay; otherwise it is saved as p_failed_doc.
-- Returns 'requeued', 'failed', or 'lost' (claim no longer held, nothing
-- written).
create or replace function public.trip_review_fail(
  p_id text, p_worker text, p_attempt int, p_error text, p_retry_in_ms int, p_failed_doc jsonb
) returns text
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  r public.trip_enhancement_runs;
begin
  r := public.trip_review_held(p_id, p_worker, p_attempt);
  if r.id is null then return 'lost'; end if;
  r.locked_by := null;
  r.locked_until := null;
  r.last_error := p_error;
  if p_retry_in_ms is not null and r.attempts < r.max_attempts then
    r.queue_state := 'queued';
    r.run_after := now() + p_retry_in_ms * interval '1 millisecond';
    perform public.trip_review_save(r);
    return 'requeued';
  end if;
  r.queue_state := 'done';
  r.doc := p_failed_doc;
  perform public.trip_review_save(r);
  return 'failed';
end $$;

-- Finish a claimed run, in one transaction. With p_trip_doc, the trip is
-- written only if its updated_at is still p_expected_updated_at, and the run
-- and trip are saved together or not at all. Returns 'ok', 'trip_changed'
-- (the trip moved on; nothing written, the claim still holds) or 'lost'.
create or replace function public.trip_review_complete(
  p_id text, p_worker text, p_attempt int, p_run_doc jsonb,
  p_trip_id text, p_trip_doc jsonb, p_expected_updated_at timestamptz, p_trip_updated_at timestamptz
) returns text
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  r public.trip_enhancement_runs;
begin
  r := public.trip_review_held(p_id, p_worker, p_attempt);
  if r.id is null then return 'lost'; end if;
  if p_trip_doc is not null then
    update public.trips
       set doc = p_trip_doc, updated_at = p_trip_updated_at
     where id = p_trip_id and updated_at = p_expected_updated_at;
    if not found then return 'trip_changed'; end if;
  end if;
  r.queue_state := 'done';
  r.locked_by := null;
  r.locked_until := null;
  r.doc := p_run_doc;
  perform public.trip_review_save(r);
  return 'ok';
end $$;

-- Only the server calls these, with the service-role key (see
-- 20261114_lock_down_security_definer_functions.sql). The three helpers are
-- only called from inside the functions above, which run as their owner, so
-- no API role keeps them (Supabase's default privileges would hand them to
-- service_role too).
revoke execute on function public.trip_review_queue_info(public.trip_enhancement_runs) from public, anon, authenticated, service_role;
revoke execute on function public.trip_review_save(public.trip_enhancement_runs) from public, anon, authenticated, service_role;
revoke execute on function public.trip_review_held(text, text, int) from public, anon, authenticated, service_role;
revoke execute on function public.trip_review_enqueue(text, text, jsonb, jsonb, int) from public, anon, authenticated;
revoke execute on function public.trip_review_claim(text, int, text) from public, anon, authenticated;
revoke execute on function public.trip_review_heartbeat(text, text, int, int) from public, anon, authenticated;
revoke execute on function public.trip_review_release(text, text, int) from public, anon, authenticated;
revoke execute on function public.trip_review_fail(text, text, int, text, int, jsonb) from public, anon, authenticated;
revoke execute on function public.trip_review_complete(text, text, int, jsonb, text, jsonb, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.trip_review_enqueue(text, text, jsonb, jsonb, int) to service_role;
grant execute on function public.trip_review_claim(text, int, text) to service_role;
grant execute on function public.trip_review_heartbeat(text, text, int, int) to service_role;
grant execute on function public.trip_review_release(text, text, int) to service_role;
grant execute on function public.trip_review_fail(text, text, int, text, int, jsonb) to service_role;
grant execute on function public.trip_review_complete(text, text, int, jsonb, text, jsonb, timestamptz, timestamptz) to service_role;

commit;

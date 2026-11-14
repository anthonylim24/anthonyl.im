-- The ig_* queue functions run as their owner (SECURITY DEFINER) and are only
-- ever called by the server with the service-role key. Stop the anon and
-- authenticated roles calling them through /rest/v1/rpc, and pin search_path.
-- (Supabase advisors 0011, 0028, 0029.)
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (p.proname like 'ig\_%' or p.proname = 'rls_auto_enable')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    execute format('alter function %s set search_path = public, extensions, pg_temp', f.sig);
  end loop;
end $$;

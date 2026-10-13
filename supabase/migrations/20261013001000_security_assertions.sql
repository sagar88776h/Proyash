-- =============================================================================
-- PRAYASH · 1000 · Security assertions
--
-- Fails the migration if any security invariant is broken, so a future change
-- cannot silently expose data. Re-run safely at any time:
--   select private.assert_security_invariants();
-- =============================================================================

create function private.assert_security_invariants()
returns void
language plpgsql
set search_path = ''
as $$
declare
  r record;
  v_anon_allowed text[] := array['get_project_finance', 'get_public_impact_summary'];
  v_service_only text[] := array[
    'bootstrap_first_admin', 'consume_rate_limit', 'submit_assistance_request', 'assistance_status_lookup',
    'assistance_followup_target', 'assistance_add_followup', 'submit_volunteer_registration',
    'submit_contact_message', 'submit_donation_report', 'attach_donation_report_evidence'
  ];
begin
  -- 1. Every table in the exposed schema has RLS enabled.
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    raise exception 'Security invariant violated: RLS is not enabled on public.%', r.relname;
  end loop;

  -- 2. No views in the exposed schema (they could bypass RLS).
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    raise exception 'Security invariant violated: view public.% must not be exposed', r.relname;
  end loop;

  -- 3. Anonymous visitors can execute only the allow-listed public functions.
  for r in
    select p.oid::regprocedure::text as fn, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'execute')
      and not (p.proname = any (v_anon_allowed))
  loop
    raise exception 'Security invariant violated: anon can execute %', r.fn;
  end loop;

  -- 4. Service-role-only functions are not executable by signed-in users.
  for r in
    select p.oid::regprocedure::text as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (v_service_only)
      and has_function_privilege('authenticated', p.oid, 'execute')
  loop
    raise exception 'Security invariant violated: authenticated can execute service-only %', r.fn;
  end loop;

  -- 5. SECURITY DEFINER functions pin their search_path.
  for r in
    select p.oid::regprocedure::text as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
      )
  loop
    raise exception 'Security invariant violated: % is SECURITY DEFINER without a fixed search_path', r.fn;
  end loop;

  -- 6. Anonymous visitors cannot write to any table.
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (
        has_any_column_privilege('anon', c.oid, 'insert')
        or has_any_column_privilege('anon', c.oid, 'update')
        or has_table_privilege('anon', c.oid, 'delete')
        or has_table_privilege('anon', c.oid, 'truncate')
      )
  loop
    raise exception 'Security invariant violated: anon has write privileges on public.%', r.relname;
  end loop;
end;
$$;

select private.assert_security_invariants();

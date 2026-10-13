-- =============================================================================
-- PRAYASH · 1100 · Multi-factor assurance
--
-- If a user has a verified MFA factor (authenticator app), their roles are
-- honoured only for sessions that completed MFA (JWT claim aal = 'aal2').
-- A stolen password alone therefore cannot reach any protected data.
-- Users without MFA are unaffected (enrolling is strongly recommended for
-- administrators and treasurers; see docs/SECURITY.md).
-- =============================================================================

create or replace function private.current_roles()
returns public.app_role[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(ur.role order by ur.role), '{}'::public.app_role[])
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.user_id = (select auth.uid())
    and p.is_active
    and (
      coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      )
    );
$$;

-- Lets the portal show who has protected their account with MFA.
create function public.admin_list_mfa_status()
returns table (user_id uuid, has_mfa boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_role(array['admin']::public.app_role[]);
  return query
  select p.id, exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
  from public.profiles p;
end;
$$;
revoke all on function public.admin_list_mfa_status() from public, anon, authenticated;
grant execute on function public.admin_list_mfa_status() to authenticated;

select private.assert_security_invariants();

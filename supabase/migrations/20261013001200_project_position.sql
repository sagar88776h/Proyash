-- =============================================================================
-- PRAYASH · 1200 · Project financial position (staff)
-- Allocated funds, restricted income and verified spending for one project,
-- computed from verified ledger entries (reversals included).
-- =============================================================================
create function public.finance_project_position(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_role(array['admin', 'treasurer']::public.app_role[]);
  return jsonb_build_object(
    'allocated', coalesce((select sum(type_delta) from private.ledger_effective where project_id = p_project_id and effective_type = 'allocation'), 0),
    'restricted_income', coalesce((select sum(type_delta) from private.ledger_effective where project_id = p_project_id and effective_type in ('member_contribution', 'public_donation')), 0),
    'expenditure', coalesce((select sum(type_delta) from private.ledger_effective where project_id = p_project_id and effective_type = 'expense'), 0),
    'pending_count', (select count(*) from public.ledger_entries where project_id = p_project_id and status = 'pending')
  );
end;
$$;
revoke all on function public.finance_project_position(uuid) from public, anon, authenticated;
grant execute on function public.finance_project_position(uuid) to authenticated;

select private.assert_security_invariants();

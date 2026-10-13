-- =============================================================================
-- PRAYASH · 0200 · Audit trail
--
-- activity_logs is append-only (no UPDATE/DELETE/TRUNCATE, even for the
-- service role). Rows are written by triggers, never by clients.
--
-- private.audit_row_change(mode, list):
--   mode 'values' → logs old/new values of changed columns; columns in `list`
--                   are replaced with "[not logged]".
--   mode 'fields' → logs only the names of changed columns (for records that
--                   contain personal data); columns in `list` are considered
--                   safe and their values are logged too (e.g. status).
-- =============================================================================

create table public.activity_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  action text not null check (char_length(action) <= 60),
  entity_type text not null check (char_length(entity_type) <= 60),
  entity_id text check (char_length(entity_id) <= 200),
  changes jsonb not null default '{}'::jsonb
);
comment on table public.activity_logs is 'Append-only audit history. actor_id is null for public submissions and system actions.';
comment on column public.activity_logs.actor_id is 'auth.users id of the person who made the change (no FK so history survives).';

create index activity_logs_occurred_at_idx on public.activity_logs (occurred_at desc);
create index activity_logs_entity_idx on public.activity_logs (entity_type, entity_id);
create index activity_logs_actor_idx on public.activity_logs (actor_id, occurred_at desc);

create function private.prevent_modification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = format('%s records cannot be modified or deleted.', tg_table_name),
    hint = 'append_only';
end;
$$;

create trigger activity_logs_no_update_delete
  before update or delete on public.activity_logs
  for each row execute function private.prevent_modification();

create trigger activity_logs_no_truncate
  before truncate on public.activity_logs
  for each statement execute function private.prevent_modification();

create function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := coalesce(tg_argv[0], 'values');
  v_list text[] := case
    when tg_nargs > 1 and tg_argv[1] <> '' then string_to_array(tg_argv[1], ',')
    else '{}'::text[]
  end;
  v_ignored text[] := array['updated_at', 'created_at'];
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  v_changed text[];
  v_changes jsonb;
  v_entity_id text;
begin
  v_entity_id := coalesce(
    v_row ->> 'id',
    v_row ->> 'ledger_entry_id',
    v_row ->> 'project_id' || ':' || (v_row ->> 'volunteer_id'),
    v_row ->> 'user_id' || ':' || (v_row ->> 'role'),
    v_row ->> 'project_id',
    v_row ->> 'key'
  );

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key)
    into v_changed
    from jsonb_each(v_new) as n
    where not (n.key = any (v_ignored))
      and n.value is distinct from (v_old -> n.key);

    if v_changed is null then
      return null; -- nothing meaningful changed
    end if;
  end if;

  if v_mode = 'values' then
    if tg_op = 'INSERT' then
      v_changes := jsonb_build_object('new', (v_new - v_list) - v_ignored);
    elsif tg_op = 'DELETE' then
      v_changes := jsonb_build_object('old', (v_old - v_list) - v_ignored);
    else
      v_changes := jsonb_build_object(
        'fields', to_jsonb(v_changed),
        'old', (
          select jsonb_object_agg(c, case when c = any (v_list) then '"[not logged]"'::jsonb else v_old -> c end)
          from unnest(v_changed) as c
        ),
        'new', (
          select jsonb_object_agg(c, case when c = any (v_list) then '"[not logged]"'::jsonb else v_new -> c end)
          from unnest(v_changed) as c
        )
      );
    end if;
  else
    if tg_op = 'UPDATE' then
      v_changes := jsonb_build_object(
        'fields', to_jsonb(v_changed),
        'old', coalesce((
          select jsonb_object_agg(c, v_old -> c) from unnest(v_changed) as c where c = any (v_list)
        ), '{}'::jsonb),
        'new', coalesce((
          select jsonb_object_agg(c, v_new -> c) from unnest(v_changed) as c where c = any (v_list)
        ), '{}'::jsonb)
      );
    else
      v_changes := jsonb_build_object(
        'safe', coalesce((
          select jsonb_object_agg(c, v_row -> c) from unnest(v_list) as c where v_row ? c
        ), '{}'::jsonb)
      );
    end if;
  end if;

  insert into public.activity_logs (actor_id, action, entity_type, entity_id, changes)
  values ((select auth.uid()), lower(tg_op), tg_table_name, v_entity_id, v_changes);

  return null;
end;
$$;

-- Explicit domain events written from inside RPCs (e.g. "user invited").
create function private.log_event(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_changes jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_logs (actor_id, action, entity_type, entity_id, changes)
  values ((select auth.uid()), p_action, p_entity_type, p_entity_id, coalesce(p_changes, '{}'::jsonb));
$$;
grant execute on function private.log_event(text, text, text, jsonb) to authenticated, service_role;

alter table public.activity_logs enable row level security;
revoke all on public.activity_logs from anon, authenticated;
grant select on public.activity_logs to authenticated;

create policy "Admins read the audit log"
  on public.activity_logs for select to authenticated
  using ((select private.has_role('admin')));

create policy "Treasurers read financial audit entries"
  on public.activity_logs for select to authenticated
  using (
    (select private.has_role('treasurer'))
    and entity_type in (
      'ledger_entries', 'donations', 'expenses', 'ledger_evidence', 'financial_accounts',
      'reconciliations', 'financial_reports', 'financial_report_documents', 'project_budgets'
    )
  );

-- Audit the tables created in 0100.
create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function private.audit_row_change('fields', 'is_active,full_name');

create trigger user_roles_audit
  after insert or update or delete on public.user_roles
  for each row execute function private.audit_row_change('values');
